import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import sharp, { type Gravity, type OverlayOptions } from "sharp";

import {
  applyEditOperations,
  type EditOperation,
} from "./editPipeline.js";
import {
  ensureDirForFile,
  readJsonFile,
  resolveFrom,
  sidecarJsonPath,
  writeJsonFile,
} from "../utils/fs.js";
import { downloadToTempFile } from "../utils/http.js";
import { escapeXml } from "../utils/svg.js";

interface BaseLayer {
  id?: string;
  left?: number;
  top?: number;
  gravity?: Gravity;
  opacity?: number;
  blend?: OverlayOptions["blend"];
}

interface ImageLayer extends BaseLayer {
  type: "image";
  input?: string;
  inputUrl?: string;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  tint?: string;
  operations?: EditOperation[];
}

interface TextLayer extends BaseLayer {
  type: "text";
  value: string;
  width?: number;
  height?: number;
  padding?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  background?: string;
  align?: "left" | "center" | "right";
  radius?: number;
}

interface RectLayer extends BaseLayer {
  type: "rect";
  width: number;
  height: number;
  fill: string;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
}

type ComposeLayer = ImageLayer | TextLayer | RectLayer;

interface BackgroundSpec {
  color?: string;
  input?: string;
  inputUrl?: string;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  gravity?: Gravity;
  operations?: EditOperation[];
}

export interface ComposeSpec {
  width: number;
  height: number;
  output: string;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
  background?: BackgroundSpec;
  layers: ComposeLayer[];
}

interface TempAsset {
  tempDir: string;
  filePath: string;
  sourceUrl: string;
}

export async function runComposeSpec(specPath: string): Promise<string> {
  const absoluteSpecPath = resolve(specPath);
  const specDir = dirname(absoluteSpecPath);
  const spec = await readJsonFile<ComposeSpec>(absoluteSpecPath);
  return runCompose(spec, specDir);
}

export async function runCompose(
  spec: ComposeSpec,
  baseDir: string = process.cwd(),
): Promise<string> {
  const outputPath = resolveFrom(baseDir, spec.output);
  const tempAssets: TempAsset[] = [];

  try {
    const background = await createBackground(spec, baseDir, tempAssets);
    const overlays = await Promise.all(
      spec.layers.map(async (layer) => createLayerOverlay(layer, spec, baseDir, tempAssets)),
    );

    const result = background.composite(overlays);
    await ensureDirForFile(outputPath);
    await saveComposedOutput(result, spec, outputPath);

    await writeJsonFile(sidecarJsonPath(outputPath, "compose"), {
      ...spec,
      output: outputPath,
      generatedAt: new Date().toISOString(),
    });

    return outputPath;
  } finally {
    await Promise.all(
      tempAssets.map((asset) => rm(asset.tempDir, { recursive: true, force: true })),
    );
  }
}

async function createBackground(
  spec: ComposeSpec,
  baseDir: string,
  tempAssets: TempAsset[],
) {
  const base = sharp({
    create: {
      width: spec.width,
      height: spec.height,
      channels: 4,
      background: spec.background?.color ?? "#ffffff",
    },
  });

  if (!spec.background?.input && !spec.background?.inputUrl) {
    return base.png();
  }

  const backgroundBuffer = await loadImageSource(
    spec.background.input,
    spec.background.inputUrl,
    baseDir,
    tempAssets,
  );
  let background = sharp(backgroundBuffer, { failOn: "none" });
  if (spec.background.operations?.length) {
    background = await applyEditOperations(
      background,
      spec.background.operations,
      baseDir,
    );
  }

  background = background.resize({
    width: spec.width,
    height: spec.height,
    fit: spec.background.fit ?? "cover",
  });

  const overlay = await background.png().toBuffer();
  return base.composite([
    {
      input: overlay,
      gravity: spec.background.gravity ?? "center",
    },
  ]).png();
}

async function createLayerOverlay(
  layer: ComposeLayer,
  spec: ComposeSpec,
  baseDir: string,
  tempAssets: TempAsset[],
): Promise<OverlayOptions> {
  switch (layer.type) {
    case "image":
      return createImageLayer(layer, baseDir, tempAssets);
    case "text":
      return createTextLayer(layer, spec.width, spec.height);
    case "rect":
      return createRectLayer(layer, spec.width, spec.height);
    default:
      throw new Error(`Unsupported compose layer type: ${(layer as { type: string }).type}`);
  }
}

async function createImageLayer(
  layer: ImageLayer,
  baseDir: string,
  tempAssets: TempAsset[],
): Promise<OverlayOptions> {
  const sourceBuffer = await loadImageSource(
    layer.input,
    layer.inputUrl,
    baseDir,
    tempAssets,
  );

  let overlay = sharp(sourceBuffer, { failOn: "none" });
  if (layer.operations?.length) {
    overlay = await applyEditOperations(overlay, layer.operations, baseDir);
  }

  if (layer.width || layer.height) {
    overlay = overlay.resize({
      width: layer.width,
      height: layer.height,
      fit: layer.fit ?? "contain",
    });
  }

  if (layer.opacity !== undefined) {
    overlay = overlay.ensureAlpha(clamp(layer.opacity, 0, 1));
  }

  if (layer.tint) {
    overlay = overlay.tint(layer.tint);
  }

  return {
    input: await overlay.png().toBuffer(),
    left: layer.left,
    top: layer.top,
    gravity: layer.gravity,
    blend: layer.blend,
  };
}

async function createTextLayer(
  layer: TextLayer,
  canvasWidth: number,
  canvasHeight: number,
): Promise<OverlayOptions> {
  const boxWidth = layer.width ?? canvasWidth;
  const boxHeight = layer.height ?? Math.max((layer.fontSize ?? 56) * 2, 120);
  const position = computeLayerPosition(
    canvasWidth,
    canvasHeight,
    boxWidth,
    boxHeight,
    layer,
  );
  const fontSize = layer.fontSize ?? 56;
  const padding = layer.padding ?? 24;
  const radius = layer.radius ?? 12;
  const lines = layer.value.split(/\r?\n/);
  const lineHeight = Math.round(fontSize * 1.2);
  const textHeight = lines.length * lineHeight;
  const align = layer.align ?? gravityToAlign(layer.gravity ?? "center");
  const textAnchor =
    align === "center" ? "middle" : align === "right" ? "end" : "start";
  const textX =
    align === "center"
      ? boxWidth / 2
      : align === "right"
        ? boxWidth - padding
        : padding;
  const firstLineY = (boxHeight - textHeight) / 2 + lineHeight / 2;
  const tspans = lines
    .map((line, index) =>
      `<tspan x="${textX}" y="${firstLineY + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${boxHeight}" viewBox="0 0 ${boxWidth} ${boxHeight}">
  ${layer.background
    ? `<rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="${radius}" ry="${radius}" fill="${escapeXml(layer.background)}" />`
    : ""}
  <text
    fill="${escapeXml(layer.color ?? "#111111")}"
    font-family="${escapeXml(layer.fontFamily ?? "Arial, sans-serif")}"
    font-size="${fontSize}"
    font-weight="${escapeXml(layer.fontWeight ?? "700")}"
    text-anchor="${textAnchor}"
    dominant-baseline="middle"
  >
    ${tspans}
  </text>
</svg>`;

  return {
    input: Buffer.from(svg, "utf8"),
    left: position.left,
    top: position.top,
    blend: layer.blend,
  };
}

async function createRectLayer(
  layer: RectLayer,
  canvasWidth: number,
  canvasHeight: number,
): Promise<OverlayOptions> {
  const position = computeLayerPosition(
    canvasWidth,
    canvasHeight,
    layer.width,
    layer.height,
    layer,
  );
  const radius = layer.radius ?? 0;
  const strokeWidth = layer.strokeWidth ?? 0;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layer.width}" height="${layer.height}" viewBox="0 0 ${layer.width} ${layer.height}">
  <rect
    x="${strokeWidth / 2}"
    y="${strokeWidth / 2}"
    width="${layer.width - strokeWidth}"
    height="${layer.height - strokeWidth}"
    rx="${radius}"
    ry="${radius}"
    fill="${escapeXml(layer.fill)}"
    ${layer.stroke ? `stroke="${escapeXml(layer.stroke)}"` : ""}
    ${layer.stroke ? `stroke-width="${strokeWidth}"` : ""}
  />
</svg>`;

  return {
    input: Buffer.from(svg, "utf8"),
    left: position.left,
    top: position.top,
    blend: layer.blend,
  };
}

async function loadImageSource(
  input: string | undefined,
  inputUrl: string | undefined,
  baseDir: string,
  tempAssets: TempAsset[],
): Promise<Buffer> {
  if (inputUrl?.trim()) {
    const tempAsset = await downloadToTempFile(
      inputUrl.trim(),
      "image-quick-compose-asset-",
      ".png",
    );
    tempAssets.push({
      ...tempAsset,
      sourceUrl: inputUrl.trim(),
    });
    return readFile(tempAsset.filePath);
  }

  if (!input) {
    throw new Error("Compose image layer is missing both input and inputUrl");
  }

  return readFile(resolveFrom(baseDir, input));
}

async function saveComposedOutput(
  image: sharp.Sharp,
  spec: ComposeSpec,
  outputPath: string,
): Promise<void> {
  const format = spec.format ?? detectFormatFromPath(outputPath);
  switch (format) {
    case "jpeg":
      await image.jpeg({ quality: spec.quality ?? 92 }).toFile(outputPath);
      return;
    case "webp":
      await image.webp({ quality: spec.quality ?? 92 }).toFile(outputPath);
      return;
    case "png":
    default:
      await image.png({ quality: spec.quality ?? 100 }).toFile(outputPath);
  }
}

function detectFormatFromPath(outputPath: string): "png" | "jpeg" | "webp" {
  const extension = extname(outputPath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "jpeg";
  }

  if (extension === ".webp") {
    return "webp";
  }

  return "png";
}

function computeLayerPosition(
  canvasWidth: number,
  canvasHeight: number,
  layerWidth: number,
  layerHeight: number,
  layer: BaseLayer,
): { left: number; top: number } {
  if (layer.left !== undefined || layer.top !== undefined) {
    return {
      left: layer.left ?? 0,
      top: layer.top ?? 0,
    };
  }

  switch (layer.gravity ?? "center") {
    case "north":
      return { left: (canvasWidth - layerWidth) / 2, top: 0 };
    case "northeast":
      return { left: canvasWidth - layerWidth, top: 0 };
    case "east":
      return { left: canvasWidth - layerWidth, top: (canvasHeight - layerHeight) / 2 };
    case "southeast":
      return { left: canvasWidth - layerWidth, top: canvasHeight - layerHeight };
    case "south":
      return { left: (canvasWidth - layerWidth) / 2, top: canvasHeight - layerHeight };
    case "southwest":
      return { left: 0, top: canvasHeight - layerHeight };
    case "west":
      return { left: 0, top: (canvasHeight - layerHeight) / 2 };
    case "northwest":
      return { left: 0, top: 0 };
    case "center":
    default:
      return {
        left: (canvasWidth - layerWidth) / 2,
        top: (canvasHeight - layerHeight) / 2,
      };
  }
}

function gravityToAlign(gravity: Gravity): "left" | "center" | "right" {
  const gravityText = String(gravity);
  if (gravityText.includes("west")) {
    return "left";
  }

  if (gravityText.includes("east")) {
    return "right";
  }

  return "center";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
