import { access, copyFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";

import sharp from "sharp";

import { readJsonFile, sidecarJsonPath, writeJsonFile } from "../utils/fs.js";
import { runCommand } from "../utils/process.js";

type CheckStatus = "pass" | "warn" | "fail";

interface QualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

type AutoFixTriggerId = "background-whiteness" | "safe-margin";

interface PromptSidecar {
  tier?: string;
  provider?: string;
  templateId?: string;
  model?: string;
  templateVariables?: Record<string, string | number | boolean>;
  selectedAsset?: {
    title?: string;
    source?: string;
    foreignLandingUrl?: string;
    originalUrl?: string;
  };
}

export interface CatalogProductPhotoQaReport {
  preset: "catalog-product-photo";
  image: string;
  status: CheckStatus;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    score: number;
  };
  metadata: {
    width: number;
    height: number;
    format?: string;
    space?: string;
    hasAlpha: boolean;
    tier?: string;
    provider?: string;
    templateId?: string;
    model?: string;
  };
  checks: QualityCheck[];
  generatedAt: string;
}

export interface CatalogProductPhotoAutoFixResult {
  attempted: boolean;
  applied: boolean;
  skippedReason?: string;
  input: string;
  output?: string;
  triggers: AutoFixTriggerId[];
  before: CatalogProductPhotoQaReport;
  after?: CatalogProductPhotoQaReport;
  command?: {
    name: string;
    args: string[];
  };
  generatedAt: string;
}

export async function runCatalogProductPhotoQa(
  imagePath: string,
  outPath?: string,
): Promise<CatalogProductPhotoQaReport> {
  const resolvedImagePath = resolve(imagePath);
  const promptSidecarPath = sidecarJsonPath(resolvedImagePath, "prompt");
  const licenseSidecarPath = sidecarJsonPath(resolvedImagePath, "license");
  const promptSidecar = await tryReadJson<PromptSidecar>(promptSidecarPath);

  const image = sharp(resolvedImagePath, { failOn: "none" }).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    throw new Error(`Cannot read image dimensions for ${resolvedImagePath}`);
  }

  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = 4;
  const checks: QualityCheck[] = [];

  checks.push(checkFormat(metadata.format));
  checks.push(checkDimensions(width, height));
  checks.push(checkColorSpace(metadata.space));
  checks.push(checkBackgroundOpacity(data));

  const borderStats = analyzeBorder(data, width, height, channels);
  checks.push(checkBackgroundWhiteness(borderStats));

  const subjectStats = analyzeSubjectBounds(data, width, height, channels);
  checks.push(checkSubjectPresence(subjectStats));
  checks.push(checkSubjectScale(subjectStats));
  checks.push(checkSafeMargin(subjectStats));
  if (promptSidecar?.tier === "asset-only") {
    checks.push(checkAssetOnlySourceHint(promptSidecar));
  }
  checks.push(await checkSidecars(promptSidecarPath, licenseSidecarPath, promptSidecar?.tier));

  const summary = summarizeChecks(checks);
  const report: CatalogProductPhotoQaReport = {
    preset: "catalog-product-photo",
    image: resolvedImagePath,
    status: summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass",
    summary,
    metadata: {
      width,
      height,
      format: metadata.format,
      space: metadata.space,
      hasAlpha: Boolean(metadata.hasAlpha),
      tier: promptSidecar?.tier,
      provider: promptSidecar?.provider,
      templateId: promptSidecar?.templateId,
      model: promptSidecar?.model,
    },
    checks,
    generatedAt: new Date().toISOString(),
  };

  if (outPath) {
    await writeJsonFile(resolve(outPath), report);
  }

  return report;
}

export async function runCatalogProductPhotoAutoFix(
  imagePath: string,
  options?: {
    outPath?: string;
    reportOutPath?: string;
    includeWarn?: boolean;
    force?: boolean;
  },
): Promise<CatalogProductPhotoAutoFixResult> {
  const resolvedImagePath = resolve(imagePath);
  const before = await runCatalogProductPhotoQa(resolvedImagePath);
  const triggers = collectAutoFixTriggers(before, options?.includeWarn ?? false);

  if (!options?.force && triggers.length === 0) {
    const skipped = {
      attempted: true,
      applied: false,
      skippedReason: "No background-whiteness or safe-margin failures required auto-fix.",
      input: resolvedImagePath,
      triggers,
      before,
      generatedAt: new Date().toISOString(),
    } satisfies CatalogProductPhotoAutoFixResult;

    if (options?.reportOutPath) {
      await writeJsonFile(resolve(options.reportOutPath), skipped);
    }

    return skipped;
  }

  const outputPath = resolve(
    options?.outPath ?? buildAutoFixOutputPath(resolvedImagePath),
  );
  const args = [
    resolvedImagePath,
    "-fuzz",
    "6%",
    "-trim",
    "+repage",
    "-resize",
    "1536x1536",
    "-gravity",
    "center",
    "-background",
    "#FFFFFF",
    "-extent",
    "2048x2048",
    "-alpha",
    "off",
    "-colorspace",
    "sRGB",
    outputPath,
  ];

  await runCommand("magick", args);
  await cloneCatalogSidecars(resolvedImagePath, outputPath, triggers);
  const after = await runCatalogProductPhotoQa(outputPath);

  const result: CatalogProductPhotoAutoFixResult = {
    attempted: true,
    applied: true,
    input: resolvedImagePath,
    output: outputPath,
    triggers,
    before,
    after,
    command: {
      name: "magick",
      args,
    },
    generatedAt: new Date().toISOString(),
  };

  if (options?.reportOutPath) {
    await writeJsonFile(resolve(options.reportOutPath), result);
  }

  return result;
}

function checkFormat(format: string | undefined): QualityCheck {
  if (format === "png") {
    return {
      id: "format",
      label: "PNG format",
      status: "pass",
      message: "Image is encoded as PNG.",
      details: { format },
    };
  }

  return {
    id: "format",
    label: "PNG format",
    status: "fail",
    message: "Catalog product photos should be exported as PNG.",
    details: { format },
  };
}

function checkDimensions(width: number, height: number): QualityCheck {
  if (width === 2048 && height === 2048) {
    return {
      id: "dimensions",
      label: "2048 square canvas",
      status: "pass",
      message: "Image matches the expected 2048x2048 output.",
      details: { width, height },
    };
  }

  const isSquare = width === height;
  return {
    id: "dimensions",
    label: "2048 square canvas",
    status: isSquare ? "warn" : "fail",
    message: isSquare
      ? "Image is square but does not match the expected 2048x2048 canvas."
      : "Catalog product photos should be a 1:1 square at 2048x2048.",
    details: { width, height },
  };
}

function checkColorSpace(space: string | undefined): QualityCheck {
  if (!space || space === "srgb") {
    return {
      id: "color-space",
      label: "sRGB-compatible color space",
      status: "pass",
      message: "Image is already in or compatible with sRGB output.",
      details: { space: space ?? "unknown" },
    };
  }

  if (space === "rgb") {
    return {
      id: "color-space",
      label: "sRGB-compatible color space",
      status: "warn",
      message: "Image uses RGB metadata; verify the final export is truly sRGB.",
      details: { space },
    };
  }

  return {
    id: "color-space",
    label: "sRGB-compatible color space",
    status: "fail",
    message: "Catalog output should not ship in a non-RGB production color space.",
    details: { space },
  };
}

function checkBackgroundOpacity(data: Buffer): QualityCheck {
  let transparentPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) {
      transparentPixels += 1;
    }
  }

  if (transparentPixels === 0) {
    return {
      id: "background-opacity",
      label: "Opaque background",
      status: "pass",
      message: "Image background is fully opaque.",
      details: { transparentPixels },
    };
  }

  const ratio = transparentPixels / (data.length / 4);
  return {
    id: "background-opacity",
    label: "Opaque background",
    status: ratio < 0.01 ? "warn" : "fail",
    message: ratio < 0.01
      ? "A very small number of transparent pixels remain; flatten before publishing."
      : "This catalog output still contains transparency instead of a pure white opaque background.",
    details: {
      transparentPixels,
      transparentRatio: round(ratio),
    },
  };
}

function checkBackgroundWhiteness(stats: BorderStats): QualityCheck {
  const details = {
    sampledPixels: stats.totalPixels,
    nearWhiteRatio: round(stats.nearWhiteRatio),
    averageLuma: round(stats.averageLuma),
  };

  if (stats.nearWhiteRatio >= 0.97 && stats.averageLuma >= 248) {
    return {
      id: "background-whiteness",
      label: "White border background",
      status: "pass",
      message: "Border region is consistently close to pure white.",
      details,
    };
  }

  if (stats.nearWhiteRatio >= 0.9 && stats.averageLuma >= 240) {
    return {
      id: "background-whiteness",
      label: "White border background",
      status: "warn",
      message: "Border region is mostly white but still shows contamination or gray cast.",
      details,
    };
  }

  return {
    id: "background-whiteness",
    label: "White border background",
    status: "fail",
    message: "Border region is not clean enough for a pure white catalog background.",
    details,
  };
}

function checkSubjectPresence(stats: SubjectStats): QualityCheck {
  if (stats.found) {
    return {
      id: "subject-detected",
      label: "Subject detected",
      status: "pass",
      message: "A non-white foreground subject was detected.",
      details: {
        nonWhitePixelRatio: round(stats.nonWhitePixelRatio),
      },
    };
  }

  return {
    id: "subject-detected",
    label: "Subject detected",
    status: "fail",
    message: "QA could not detect a clear subject against the white background.",
    details: {
      nonWhitePixelRatio: round(stats.nonWhitePixelRatio),
    },
  };
}

function checkSubjectScale(stats: SubjectStats): QualityCheck {
  if (!stats.found) {
    return {
      id: "subject-scale",
      label: "Subject scale",
      status: "fail",
      message: "Cannot evaluate subject scale because no subject was detected.",
    };
  }

  const details = {
    bboxWidthRatio: round(stats.bboxWidthRatio),
    bboxHeightRatio: round(stats.bboxHeightRatio),
    bboxAreaRatio: round(stats.bboxAreaRatio),
    maxDimensionRatio: round(stats.maxDimensionRatio),
  };

  if (stats.maxDimensionRatio >= 0.55 && stats.maxDimensionRatio <= 0.85) {
    return {
      id: "subject-scale",
      label: "Subject occupies frame correctly",
      status: "pass",
      message: "Subject scale is within a practical packshot range.",
      details,
    };
  }

  if (stats.maxDimensionRatio >= 0.45 && stats.maxDimensionRatio <= 0.92) {
    return {
      id: "subject-scale",
      label: "Subject occupies frame correctly",
      status: "warn",
      message: "Subject scale is usable but looser than the preferred packshot range.",
      details,
    };
  }

  return {
    id: "subject-scale",
    label: "Subject occupies frame correctly",
    status: "fail",
    message: "Subject is too small or too large for consistent catalog framing.",
    details,
  };
}

function checkSafeMargin(stats: SubjectStats): QualityCheck {
  if (!stats.found) {
    return {
      id: "safe-margin",
      label: "Safe margin",
      status: "fail",
      message: "Cannot evaluate margins because no subject was detected.",
    };
  }

  const details = {
    top: round(stats.marginTopRatio),
    right: round(stats.marginRightRatio),
    bottom: round(stats.marginBottomRatio),
    left: round(stats.marginLeftRatio),
    minMarginRatio: round(stats.minMarginRatio),
  };

  if (stats.minMarginRatio >= 0.08) {
    return {
      id: "safe-margin",
      label: "Safe margin",
      status: "pass",
      message: "Subject leaves enough breathing room around the frame.",
      details,
    };
  }

  if (stats.minMarginRatio >= 0.04) {
    return {
      id: "safe-margin",
      label: "Safe margin",
      status: "warn",
      message: "Margins are tight; acceptable for some SKUs but not ideal for batch consistency.",
      details,
    };
  }

  return {
    id: "safe-margin",
    label: "Safe margin",
    status: "fail",
    message: "Subject is too close to the edge for a clean catalog layout.",
    details,
  };
}

function checkAssetOnlySourceHint(promptSidecar: PromptSidecar): QualityCheck {
  const productName = asText(promptSidecar.templateVariables?.productName);
  const productType = asText(promptSidecar.templateVariables?.productType);
  const category = asText(promptSidecar.templateVariables?.category);
  const sourceTitle = promptSidecar.selectedAsset?.title?.trim();
  const sourceText = [
    promptSidecar.selectedAsset?.title,
    promptSidecar.selectedAsset?.originalUrl,
    promptSidecar.selectedAsset?.foreignLandingUrl,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const expectedTokens = uniqueMeaningfulTokens([
    productName,
    productType,
    category,
  ].filter(Boolean).join(" "));
  const matchedTokens = expectedTokens.filter((token) => sourceText.includes(token));

  if (!sourceTitle || expectedTokens.length === 0) {
    return {
      id: "asset-source-hint",
      label: "Asset source relevance hint",
      status: "warn",
      message: "Asset-only mode should still be reviewed manually because source metadata is incomplete.",
      details: {
        sourceTitle: sourceTitle ?? null,
        expectedTokens,
      },
    };
  }

  if (matchedTokens.length > 0) {
    return {
      id: "asset-source-hint",
      label: "Asset source relevance hint",
      status: "pass",
      message: "Source metadata has at least some token overlap with the requested product.",
      details: {
        sourceTitle,
        matchedTokens,
        expectedTokens,
      },
    };
  }

  return {
    id: "asset-source-hint",
    label: "Asset source relevance hint",
    status: "warn",
    message: "Source metadata does not clearly match the requested product. Manual semantic review is required.",
    details: {
      sourceTitle,
      expectedTokens,
      source: promptSidecar.selectedAsset?.source,
    },
  };
}

async function checkSidecars(
  promptSidecarPath: string,
  licenseSidecarPath: string,
  tier?: string,
): Promise<QualityCheck> {
  const promptExists = await pathExists(promptSidecarPath);
  const licenseExists = await pathExists(licenseSidecarPath);

  if (promptExists && (tier !== "asset-only" || licenseExists)) {
    return {
      id: "metadata-sidecars",
      label: "Metadata sidecars",
      status: "pass",
      message: tier === "asset-only"
        ? "Prompt and license provenance sidecars are present."
        : "Prompt provenance sidecar is present.",
      details: {
        promptSidecarPath,
        licenseSidecarPath: tier === "asset-only" ? licenseSidecarPath : undefined,
      },
    };
  }

  if (promptExists || licenseExists) {
    return {
      id: "metadata-sidecars",
      label: "Metadata sidecars",
      status: "warn",
      message: "Some provenance metadata exists, but the expected sidecar set is incomplete.",
      details: {
        promptExists,
        licenseExists,
        tier,
      },
    };
  }

  return {
    id: "metadata-sidecars",
    label: "Metadata sidecars",
    status: "warn",
    message: "No provenance sidecars were found next to this output.",
    details: {
      promptExists,
      licenseExists,
      tier,
    },
  };
}

function collectAutoFixTriggers(
  report: CatalogProductPhotoQaReport,
  includeWarn: boolean,
): AutoFixTriggerId[] {
  const triggerIds = new Set<AutoFixTriggerId>();

  for (const check of report.checks) {
    let triggerId: AutoFixTriggerId | undefined;
    if (check.id === "background-whiteness" || check.id === "safe-margin") {
      triggerId = check.id;
    }

    if (!triggerId) {
      continue;
    }

    if (check.status === "fail" || (includeWarn && check.status === "warn")) {
      triggerIds.add(triggerId);
    }
  }

  return [...triggerIds];
}

function buildAutoFixOutputPath(imagePath: string): string {
  const extension = extname(imagePath) || ".png";
  return resolve(
    dirname(imagePath),
    `${basename(imagePath, extension)}-autofix${extension}`,
  );
}

async function cloneCatalogSidecars(
  sourceImagePath: string,
  targetImagePath: string,
  triggers: AutoFixTriggerId[],
): Promise<void> {
  const promptSource = sidecarJsonPath(sourceImagePath, "prompt");
  const promptTarget = sidecarJsonPath(targetImagePath, "prompt");
  const editTarget = sidecarJsonPath(targetImagePath, "edit");
  const licenseSource = sidecarJsonPath(sourceImagePath, "license");
  const licenseTarget = sidecarJsonPath(targetImagePath, "license");

  const promptPayload = await tryReadJson<Record<string, unknown>>(promptSource);
  if (promptPayload) {
    await writeJsonFile(promptTarget, {
      ...promptPayload,
      output: targetImagePath,
      postProcessedFrom: sourceImagePath,
      postProcess: {
        type: "catalog-product-photo-autofix",
        triggers,
        appliedAt: new Date().toISOString(),
      },
    });
  }

  if (await pathExists(licenseSource)) {
    await copyFile(licenseSource, licenseTarget);
  }

  await writeJsonFile(editTarget, {
    input: sourceImagePath,
    output: targetImagePath,
    type: "catalog-product-photo-autofix",
    engine: "ImageMagick",
    triggers,
    operations: [
      "trim border background",
      "resize subject into 1536x1536 fit box",
      "center on 2048x2048 white canvas",
      "force opaque sRGB output",
    ],
    generatedAt: new Date().toISOString(),
  });
}

interface BorderStats {
  totalPixels: number;
  nearWhiteRatio: number;
  averageLuma: number;
}

function analyzeBorder(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): BorderStats {
  const borderThickness = Math.max(8, Math.round(Math.min(width, height) * 0.05));
  let totalPixels = 0;
  let nearWhitePixels = 0;
  let lumaSum = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder =
        x < borderThickness ||
        y < borderThickness ||
        x >= width - borderThickness ||
        y >= height - borderThickness;
      if (!isBorder) {
        continue;
      }

      const index = (y * width + x) * channels;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const isNearWhite = red >= 245 && green >= 245 && blue >= 245 && alpha >= 250;

      totalPixels += 1;
      lumaSum += luma;
      if (isNearWhite) {
        nearWhitePixels += 1;
      }
    }
  }

  return {
    totalPixels,
    nearWhiteRatio: totalPixels === 0 ? 0 : nearWhitePixels / totalPixels,
    averageLuma: totalPixels === 0 ? 0 : lumaSum / totalPixels,
  };
}

interface SubjectStats {
  found: boolean;
  nonWhitePixelRatio: number;
  bboxWidthRatio: number;
  bboxHeightRatio: number;
  bboxAreaRatio: number;
  maxDimensionRatio: number;
  marginTopRatio: number;
  marginRightRatio: number;
  marginBottomRatio: number;
  marginLeftRatio: number;
  minMarginRatio: number;
}

function analyzeSubjectBounds(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): SubjectStats {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let nonWhitePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const distanceFromWhite = Math.max(255 - red, 255 - green, 255 - blue);
      const isSubject = alpha < 250 || distanceFromWhite > 18;

      if (!isSubject) {
        continue;
      }

      nonWhitePixels += 1;
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  const found = maxX >= minX && maxY >= minY;
  if (!found) {
    return {
      found: false,
      nonWhitePixelRatio: 0,
      bboxWidthRatio: 0,
      bboxHeightRatio: 0,
      bboxAreaRatio: 0,
      maxDimensionRatio: 0,
      marginTopRatio: 0,
      marginRightRatio: 0,
      marginBottomRatio: 0,
      marginLeftRatio: 0,
      minMarginRatio: 0,
    };
  }

  const bboxWidth = maxX - minX + 1;
  const bboxHeight = maxY - minY + 1;
  const marginTopRatio = minY / height;
  const marginLeftRatio = minX / width;
  const marginRightRatio = (width - maxX - 1) / width;
  const marginBottomRatio = (height - maxY - 1) / height;

  return {
    found: true,
    nonWhitePixelRatio: nonWhitePixels / (width * height),
    bboxWidthRatio: bboxWidth / width,
    bboxHeightRatio: bboxHeight / height,
    bboxAreaRatio: (bboxWidth * bboxHeight) / (width * height),
    maxDimensionRatio: Math.max(bboxWidth / width, bboxHeight / height),
    marginTopRatio,
    marginRightRatio,
    marginBottomRatio,
    marginLeftRatio,
    minMarginRatio: Math.min(
      marginTopRatio,
      marginRightRatio,
      marginBottomRatio,
      marginLeftRatio,
    ),
  };
}

function summarizeChecks(checks: QualityCheck[]): {
  pass: number;
  warn: number;
  fail: number;
  score: number;
} {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  let score = 0;

  for (const check of checks) {
    switch (check.status) {
      case "pass":
        pass += 1;
        score += 1;
        break;
      case "warn":
        warn += 1;
        score += 0.5;
        break;
      case "fail":
        fail += 1;
        break;
    }
  }

  return {
    pass,
    warn,
    fail,
    score: round((score / checks.length) * 100),
  };
}

async function tryReadJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return undefined;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function asText(value: string | number | boolean | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return String(value);
}

function uniqueMeaningfulTokens(value: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "with",
    "for",
    "from",
    "gallon",
    "generic",
  ]);

  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  )];
}
