import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import type { EditSpec } from "../layer2/editPipeline.js";
import { runEdit } from "../layer2/editPipeline.js";
import {
  downloadOpenverseImage,
  searchOpenverse,
  type OpenverseImage,
} from "../providers/openverse.js";
import {
  ensureDirForFile,
  readJsonFile,
  sidecarJsonPath,
  writeJsonFile,
  writeTextFile,
} from "../utils/fs.js";
import { downloadToFile, downloadToTempFile } from "../utils/http.js";
import {
  buildPrompt,
  renderTemplateString,
  type PromptHarness,
} from "./promptHarness.js";
import type { AssetWorkflowConfig } from "./templates.js";
import {
  parseImageSize,
  resolveAiTierPlan,
  type GenerateBackground,
  type GenerateModeration,
  type GenerateProvider,
  type GenerateQuality,
  type GenerationTier,
} from "./tiers.js";
import {
  getProviderApiKey,
  getProviderDefinition,
  resolveModelSelection,
  type ImageProviderId,
} from "./modelRegistry.js";

interface OpenAiImageResponse {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }>;
}

interface OpenAiGenerationResult {
  provider: "openai";
  model: string;
  request: {
    model: string;
    prompt: string;
    size: string;
    quality: GenerateQuality;
    background?: GenerateBackground;
    output_format: "png" | "jpeg" | "webp";
    output_compression?: number;
    moderation: GenerateModeration;
    n: number;
  };
  revisedPrompt?: string;
}

interface GoogleGeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface GoogleGeminiGenerationResult {
  provider: "google-gemini";
  model: string;
  request: {
    contents: Array<{
      parts: Array<{ text: string }>;
    }>;
    generationConfig: {
      responseModalities: readonly ["IMAGE"];
      imageConfig: {
        aspectRatio: string;
        imageSize: "1K" | "2K" | "4K";
      };
    };
  };
}

type ProviderGenerationResult = OpenAiGenerationResult | GoogleGeminiGenerationResult;

export interface GenerateSpec extends PromptHarness {
  provider?: GenerateProvider;
  output: string;
  model?: string;
  size?: string;
  quality?: GenerateQuality;
  background?: GenerateBackground;
  outputCompression?: number;
  moderation?: GenerateModeration;
  n?: number;
  tier?: GenerationTier;
  assetUrl?: string;
  assetWorkflow?: AssetWorkflowConfig;
  templateId?: string;
  variantId?: string;
  templateLabel?: string;
  templateVariables?: Record<string, string | number | boolean>;
}

export async function runGenerateSpec(
  specPath: string,
  overrides?: Partial<Pick<GenerateSpec, "tier" | "provider" | "assetUrl">>,
): Promise<string> {
  const absoluteSpecPath = resolve(specPath);
  const spec = await readJsonFile<GenerateSpec>(absoluteSpecPath);
  const outputPath = resolve(dirname(absoluteSpecPath), spec.output);
  return runGenerate(
    {
      ...spec,
      ...overrides,
    },
    outputPath,
  );
}

export async function runGenerate(
  spec: GenerateSpec,
  outputPath: string,
): Promise<string> {
  const prompt = buildPrompt(spec);
  if (!prompt.trim()) {
    throw new Error("Prompt harness did not produce a prompt");
  }

  if (spec.tier === "asset-only") {
    await generateWithAssets(spec, outputPath, prompt);
    return outputPath;
  }

  if (spec.tier === "ai-mini" || spec.tier === "ai-standard" || spec.tier === "ai-premium") {
    await generateWithTieredProvider(spec, outputPath, prompt);
    return outputPath;
  }

  await generateWithProviderAndWriteMetadata(spec, outputPath, prompt);
  return outputPath;
}

async function generateWithTieredProvider(
  spec: GenerateSpec,
  outputPath: string,
  prompt: string,
): Promise<void> {
  const plan = resolveAiTierPlan({
    tier: spec.tier as Exclude<GenerationTier, "asset-only">,
    provider: spec.provider,
    model: spec.model,
    size: spec.size,
    quality: spec.quality,
  });
  const nativeOutputPath = plan.requiresUpscale
    ? join(
        await mkdtemp(join(tmpdir(), "image-quick-ai-tier-")),
        `native${extname(outputPath) || ".png"}`,
      )
    : outputPath;

  try {
    const result = await generateWithProvider(
      {
        ...spec,
        provider: plan.provider,
        model: plan.model,
        quality: plan.quality,
        size: plan.nativeSize,
      },
      nativeOutputPath,
      prompt,
    );

    if (plan.requiresUpscale) {
      await upscaleGeneratedImage(nativeOutputPath, outputPath, plan.requestedSize);
    }

    await writeGenerationMetadata(outputPath, {
      provider: result.provider,
      tier: spec.tier,
      providerLabel: getProviderDefinition(plan.provider).label,
      model: result.model,
      templateId: spec.templateId,
      variantId: spec.variantId,
      templateLabel: spec.templateLabel,
      templateVariables: spec.templateVariables,
      prompt,
      revisedPrompt: "revisedPrompt" in result ? result.revisedPrompt : undefined,
      request: result.request,
      nativeSize: plan.nativeSize,
      requestedSize: plan.requestedSize,
      output: outputPath,
      generatedAt: new Date().toISOString(),
    });
  } finally {
    if (nativeOutputPath !== outputPath) {
      await rm(dirname(nativeOutputPath), { recursive: true, force: true });
    }
  }
}

async function generateWithProviderAndWriteMetadata(
  spec: GenerateSpec,
  outputPath: string,
  prompt: string,
): Promise<void> {
  const result = await generateWithProvider(spec, outputPath, prompt);
  const providerId = resolveGenerationProvider(spec);
  await writeGenerationMetadata(outputPath, {
    provider: result.provider,
    tier: spec.tier,
    providerLabel: getProviderDefinition(providerId).label,
    model: result.model,
    templateId: spec.templateId,
    variantId: spec.variantId,
    templateLabel: spec.templateLabel,
    templateVariables: spec.templateVariables,
    prompt,
    revisedPrompt: "revisedPrompt" in result ? result.revisedPrompt : undefined,
    request: result.request,
    output: outputPath,
    generatedAt: new Date().toISOString(),
  });
}

async function generateWithProvider(
  spec: GenerateSpec,
  outputPath: string,
  prompt: string,
): Promise<ProviderGenerationResult> {
  const resolvedProvider = resolveGenerationProvider(spec);
  switch (resolvedProvider) {
    case "openai":
      return generateWithOpenAi(spec, outputPath, prompt);
    case "google-gemini":
      return generateWithGoogleGemini(spec, outputPath, prompt);
    default:
      throw new Error(
        `Provider ${resolvedProvider} is registered but not implemented yet. Add an adapter before using it for generation.`,
      );
  }
}

async function generateWithOpenAi(
  spec: GenerateSpec,
  outputPath: string,
  prompt: string,
): Promise<OpenAiGenerationResult> {
  const apiKey = getProviderApiKey("openai");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const outputFormat = detectOutputFormat(outputPath);
  const requestBody = {
    model: spec.model ?? "gpt-image-1.5",
    prompt,
    size: spec.size ?? "1024x1024",
    quality: spec.quality ?? "medium",
    background: spec.background,
    output_format: outputFormat,
    output_compression: spec.outputCompression,
    moderation: spec.moderation ?? "auto",
    n: spec.n ?? 1,
  };

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json()) as OpenAiImageResponse & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI error ${response.status}`);
  }

  const first = payload.data?.[0];
  if (!first) {
    throw new Error("No image returned from OpenAI");
  }

  await ensureDirForFile(outputPath);
  if (first.b64_json) {
    await writeTextFile(outputPath, Buffer.from(first.b64_json, "base64"));
  } else if (first.url) {
    await downloadToFile(first.url, outputPath);
  } else {
    throw new Error("OpenAI response did not contain image data");
  }

  return {
    provider: "openai",
    model: requestBody.model,
    request: requestBody,
    revisedPrompt: first.revised_prompt,
  };
}

async function generateWithGoogleGemini(
  spec: GenerateSpec,
  outputPath: string,
  prompt: string,
): Promise<GoogleGeminiGenerationResult> {
  const apiKey = getProviderApiKey("google-gemini");
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is missing");
  }

  const model = spec.model ?? resolveModelSelection({
    provider: "google-gemini",
    tier: "ai-standard",
  }).model.id;
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"] as const,
      imageConfig: {
        aspectRatio: toGoogleAspectRatio(spec.size),
        imageSize: toGoogleImageSize(spec.size, model),
      },
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
  );

  const payload = (await response.json()) as GoogleGeminiImageResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Google Gemini error ${response.status}`);
  }

  const imagePart = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
  const imageBytes = imagePart?.inlineData?.data;
  if (!imageBytes) {
    throw new Error("Google Gemini response did not contain image data");
  }

  await ensureDirForFile(outputPath);
  await writeTextFile(outputPath, Buffer.from(imageBytes, "base64"));

  return {
    provider: "google-gemini",
    model,
    request: requestBody,
  };
}

async function generateWithAssets(
  spec: GenerateSpec,
  outputPath: string,
  prompt: string,
): Promise<void> {
  const workflow = spec.assetWorkflow;
  if (!workflow) {
    throw new Error("This template does not define an asset-only workflow");
  }

  if (workflow.provider !== "openverse") {
    throw new Error(`Unsupported asset workflow provider: ${workflow.provider}`);
  }

  const variables = resolveGenerationVariables(spec);
  const pinnedOpenverseId = asString(variables.openverseId)?.trim();
  const assetUrl = spec.assetUrl?.trim() || asString(variables.assetUrl)?.trim();
  let selected: OpenverseImage | undefined;
  let resolvedQuery = "";
  let attemptedQueries: string[] = [];

  if (assetUrl) {
    resolvedQuery = "direct-asset-url";
  } else if (pinnedOpenverseId) {
    selected = {
      id: pinnedOpenverseId,
      title: "Pinned Openverse asset",
      url: "",
      thumbnail: "",
      creator: null,
      creator_url: null,
      license: "",
      license_version: null,
      license_url: null,
      provider: "openverse",
      source: "openverse",
      attribution: "",
      foreign_landing_url: null,
      width: null,
      height: null,
    };
    resolvedQuery = "pinned-openverse-id";
  } else {
    const queries = buildAssetQueries(workflow, variables);
    if (queries.length === 0) {
      throw new Error("Asset-only workflow did not produce a search query");
    }

    attemptedQueries = queries;
    const resultIndex = workflow.resultIndex ?? 0;
    for (const query of queries) {
      const results = await searchOpenverse(query, Math.max(resultIndex + 1, 5));
      selected = results[resultIndex];
      if (selected) {
        resolvedQuery = query;
        break;
      }
    }

    if (!selected) {
      throw new Error(`No Openverse asset found for queries: ${queries.join(" | ")}`);
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), "image-quick-asset-"));
  const sourceExtension = selected ? extensionFromOpenverseAsset(selected) : ".png";
  const sourcePath = join(tempDir, `source${sourceExtension}`);

  try {
    const asset = assetUrl
      ? await downloadExternalAsset(assetUrl, sourcePath)
      : await downloadOpenverseImage(selected!.id, sourcePath);
    const editSpec: EditSpec = {
      input: sourcePath,
      output: outputPath,
      format: workflow.edit.format ?? detectOutputFormat(outputPath),
      quality: workflow.edit.quality,
      operations: workflow.edit.operations,
    };
    await runEdit(editSpec);
    await writeFinalLicenseMetadata(outputPath, asset, resolvedQuery, assetUrl);
    await writeGenerationMetadata(outputPath, {
      provider: "asset-only",
      tier: "asset-only",
      templateId: spec.templateId,
      variantId: spec.variantId,
      templateLabel: spec.templateLabel,
      templateVariables: spec.templateVariables,
      prompt,
      searchQuery: resolvedQuery,
      attemptedQueries,
      assetUrl,
      openverseId: pinnedOpenverseId,
      selectedAsset: {
        id: asset.id,
        title: asset.title,
        creator: asset.creator,
        license: asset.license,
        licenseUrl: asset.license_url,
        source: asset.source,
        foreignLandingUrl: asset.foreign_landing_url,
        originalUrl: asset.url,
      },
      assetWorkflow: workflow,
      output: outputPath,
      generatedAt: new Date().toISOString(),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function upscaleGeneratedImage(
  inputPath: string,
  outputPath: string,
  requestedSize?: string,
): Promise<void> {
  const target = parseImageSize(requestedSize);
  if (!target) {
    throw new Error(`Cannot upscale to invalid requested size: ${requestedSize}`);
  }

  const editSpec: EditSpec = {
    input: inputPath,
    output: outputPath,
    format: detectOutputFormat(outputPath),
    operations: [
      {
        op: "resize",
        width: target.width,
        height: target.height,
        fit: "fill",
      },
    ],
  };

  await runEdit(editSpec);
}

async function writeGenerationMetadata(
  outputPath: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await writeJsonFile(sidecarJsonPath(outputPath, "prompt"), metadata);
}

async function writeFinalLicenseMetadata(
  outputPath: string,
  asset: OpenverseImage,
  query: string,
  assetUrl?: string,
): Promise<void> {
  if (asset.source === "external-url") {
    await writeJsonFile(sidecarJsonPath(outputPath, "license"), {
      provider: "external-url",
      title: asset.title,
      sourceUrl: assetUrl ?? asset.url,
      searchQuery: query,
      note: "License metadata is unknown for direct external URLs. Verify rights before reuse.",
      derivedAt: new Date().toISOString(),
    });
    return;
  }

  await writeJsonFile(sidecarJsonPath(outputPath, "license"), {
    provider: "openverse",
    id: asset.id,
    title: asset.title,
    creator: asset.creator,
    creatorUrl: asset.creator_url,
    attribution: asset.attribution,
    license: asset.license,
    licenseVersion: asset.license_version,
    licenseUrl: asset.license_url,
    source: asset.source,
    sourceLandingUrl: asset.foreign_landing_url,
    originalUrl: asset.url,
    searchQuery: query,
    derivedAt: new Date().toISOString(),
  });
}

function detectOutputFormat(outputPath: string): "png" | "jpeg" | "webp" {
  const extension = extname(outputPath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "jpeg";
  }

  if (extension === ".webp") {
    return "webp";
  }

  return "png";
}

function extensionFromOpenverseAsset(asset: OpenverseImage): string {
  try {
    const url = new URL(asset.url);
    const extension = extname(url.pathname).toLowerCase();
    if (extension === ".jpg" || extension === ".jpeg" || extension === ".png" || extension === ".webp") {
      return extension;
    }
  } catch {
    return ".png";
  }

  return ".png";
}

function resolveGenerationVariables(
  spec: GenerateSpec,
): Record<string, string | number | boolean> {
  return {
    ...(spec.variables ?? {}),
    ...(spec.templateVariables ?? {}),
    ...(spec.assetUrl ? { assetUrl: spec.assetUrl } : {}),
  };
}

function resolveGenerationProvider(spec: GenerateSpec): ImageProviderId {
  if (spec.provider) {
    return spec.provider;
  }

  if (spec.model) {
    return resolveModelSelection({ model: spec.model }).provider.id;
  }

  return "openai";
}

function toGoogleAspectRatio(size: string | undefined): string {
  const parsed = parseImageSize(size);
  if (!parsed) {
    return "1:1";
  }

  const ratio = parsed.width / parsed.height;
  if (Math.abs(ratio - 1) < 0.1) {
    return "1:1";
  }

  if (ratio >= 1.6) {
    return "16:9";
  }

  if (ratio >= 1.2) {
    return "4:3";
  }

  if (ratio <= 0.625) {
    return "9:16";
  }

  return "3:4";
}

function toGoogleImageSize(
  size: string | undefined,
  model: string,
): "1K" | "2K" | "4K" {
  if (model === "gemini-2.5-flash-image") {
    return "1K";
  }

  if (model === "gemini-3-pro-image") {
    const parsed = parseImageSize(size);
    if (parsed && Math.max(parsed.width, parsed.height) >= 3000) {
      return "4K";
    }
  }

  const parsed = parseImageSize(size);
  if (parsed && Math.max(parsed.width, parsed.height) > 1024) {
    return "2K";
  }

  return "1K";
}

function buildAssetQueries(
  workflow: AssetWorkflowConfig,
  variables: Record<string, string | number | boolean>,
): string[] {
  const queries = new Set<string>();
  const push = (value: string | undefined): void => {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (normalized) {
      queries.add(normalized);
    }
  };

  const assetQuery = asString(variables.assetQuery);
  const productName = asString(variables.productName);
  const productType = asString(variables.productType);
  const primaryColor = asString(variables.primaryColor);
  const category = asString(variables.category);

  push(assetQuery);
  push(renderTemplateString(workflow.queryTemplate, variables));
  push([productName, productType, "isolated"].filter(Boolean).join(" "));
  push([productName, primaryColor, "isolated"].filter(Boolean).join(" "));

  if (!assetQuery) {
    push([primaryColor, productType, "isolated on white"].filter(Boolean).join(" "));
    push([category, productType, "isolated"].filter(Boolean).join(" "));
  }

  return [...queries];
}

function asString(value: string | number | boolean | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return String(value);
}

async function downloadExternalAsset(
  assetUrl: string,
  outputPath: string,
): Promise<OpenverseImage> {
  const tempDownload = await downloadToTempFile(
    assetUrl,
    "image-quick-asset-url-",
    extname(outputPath) || ".png",
  );

  try {
    await ensureDirForFile(outputPath);
    await writeTextFile(outputPath, await readFile(tempDownload.filePath));
  } finally {
    await rm(tempDownload.tempDir, { recursive: true, force: true });
  }

  return {
    id: assetUrl,
    title: "External asset URL",
    url: assetUrl,
    thumbnail: assetUrl,
    creator: null,
    creator_url: null,
    license: "unknown",
    license_version: null,
    license_url: null,
    provider: "external-url",
    source: "external-url",
    attribution: "",
    foreign_landing_url: assetUrl,
    width: null,
    height: null,
  };
}
