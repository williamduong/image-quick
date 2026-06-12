import { dirname, extname, resolve } from "node:path";

import { DEFAULT_OPENAI_IMAGE_MODEL } from "../config.js";
import {
  ensureDirForFile,
  readJsonFile,
  sidecarJsonPath,
  writeJsonFile,
  writeTextFile,
} from "../utils/fs.js";
import { downloadToFile } from "../utils/http.js";
import { buildPrompt, type PromptHarness } from "./promptHarness.js";

interface OpenAiImageResponse {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }>;
}

export interface GenerateSpec extends PromptHarness {
  provider?: "openai";
  output: string;
  model?: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  background?: "transparent" | "opaque";
  outputCompression?: number;
  moderation?: "auto" | "low";
  n?: number;
  templateId?: string;
  variantId?: string;
  templateLabel?: string;
  templateVariables?: Record<string, string | number | boolean>;
}

export async function runGenerateSpec(specPath: string): Promise<string> {
  const absoluteSpecPath = resolve(specPath);
  const spec = await readJsonFile<GenerateSpec>(absoluteSpecPath);
  const outputPath = resolve(dirname(absoluteSpecPath), spec.output);
  return runGenerate(spec, outputPath);
}

export async function runGenerate(
  spec: GenerateSpec,
  outputPath: string,
): Promise<string> {
  const prompt = buildPrompt(spec);
  if (!prompt.trim()) {
    throw new Error("Prompt harness did not produce a prompt");
  }

  switch (spec.provider ?? "openai") {
    case "openai":
      await generateWithOpenAi(spec, outputPath, prompt);
      return outputPath;
    default:
      throw new Error(`Unsupported provider: ${spec.provider}`);
  }
}

async function generateWithOpenAi(
  spec: GenerateSpec,
  outputPath: string,
  prompt: string,
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const outputFormat = detectOutputFormat(outputPath);
  const requestBody = {
    model: spec.model ?? DEFAULT_OPENAI_IMAGE_MODEL,
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

  await writeJsonFile(sidecarJsonPath(outputPath, "prompt"), {
    provider: "openai",
    model: requestBody.model,
    templateId: spec.templateId,
    variantId: spec.variantId,
    templateLabel: spec.templateLabel,
    templateVariables: spec.templateVariables,
    prompt,
    revisedPrompt: first.revised_prompt,
    request: requestBody,
    output: outputPath,
    generatedAt: new Date().toISOString(),
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
