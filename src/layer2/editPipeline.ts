import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import sharp, { type Gravity, type OverlayOptions, type Sharp } from "sharp";

import {
  ensureDirForFile,
  readJsonFile,
  resolveFrom,
  sidecarJsonPath,
  writeJsonFile,
} from "../utils/fs.js";
import { downloadToTempFile } from "../utils/http.js";
import { runCommand } from "../utils/process.js";
import { escapeXml } from "../utils/svg.js";

type Fit = "cover" | "contain" | "fill" | "inside" | "outside";
type Blend =
  | "clear"
  | "source"
  | "over"
  | "in"
  | "out"
  | "atop"
  | "dest"
  | "dest-over"
  | "dest-in"
  | "dest-out"
  | "dest-atop"
  | "xor"
  | "add"
  | "saturate"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "colour-dodge"
  | "color-dodge"
  | "colour-burn"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion";

interface BaseOp {
  op: string;
}

interface ResizeOp extends BaseOp {
  op: "resize";
  width?: number;
  height?: number;
  fit?: Fit;
}

interface ExtractOp extends BaseOp {
  op: "extract";
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RotateOp extends BaseOp {
  op: "rotate";
  angle: number;
  background?: string;
}

interface ExtendOp extends BaseOp {
  op: "extend";
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  background?: string;
}

interface FlattenOp extends BaseOp {
  op: "flatten";
  background: string;
}

interface ModulateOp extends BaseOp {
  op: "modulate";
  brightness?: number;
  saturation?: number;
  hue?: number;
}

interface TintOp extends BaseOp {
  op: "tint";
  color: string;
}

interface BlurOp extends BaseOp {
  op: "blur";
  sigma?: number;
}

interface SharpenOp extends BaseOp {
  op: "sharpen";
  sigma?: number;
}

interface CompositeOp extends BaseOp {
  op: "composite";
  input: string;
  left?: number;
  top?: number;
  gravity?: Gravity;
  blend?: Blend;
  opacity?: number;
  width?: number;
  height?: number;
  tint?: string;
}

interface TextOp extends BaseOp {
  op: "text";
  value: string;
  left?: number;
  top?: number;
  gravity?: Gravity;
  width?: number;
  height?: number;
  padding?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  background?: string;
  align?: "left" | "center" | "right";
}

interface RemoveBackgroundOp extends BaseOp {
  op: "removeBackground";
  command?: string;
}

interface ImageMagickOp extends BaseOp {
  op: "imagemagick";
  command?: string;
  args: string[];
}

interface FlipOp extends BaseOp {
  op: "flip";
}

interface FlopOp extends BaseOp {
  op: "flop";
}

interface GrayscaleOp extends BaseOp {
  op: "grayscale";
}

export type EditOperation =
  | ResizeOp
  | ExtractOp
  | RotateOp
  | ExtendOp
  | FlattenOp
  | ModulateOp
  | TintOp
  | BlurOp
  | SharpenOp
  | CompositeOp
  | TextOp
  | RemoveBackgroundOp
  | ImageMagickOp
  | FlipOp
  | FlopOp
  | GrayscaleOp;

export interface EditSpec {
  input: string;
  output: string;
  operations: EditOperation[];
  format?: "png" | "jpeg" | "webp";
  quality?: number;
  inputUrl?: string;
}

export async function runEditSpec(
  specPath: string,
  overrides?: Partial<Pick<EditSpec, "inputUrl">>,
): Promise<string> {
  const absoluteSpecPath = resolve(specPath);
  const specDir = dirname(absoluteSpecPath);
  const spec = await readJsonFile<EditSpec>(absoluteSpecPath);
  return runEdit(
    {
      ...spec,
      ...overrides,
    },
    specDir,
  );
}

export async function runEdit(
  spec: EditSpec,
  baseDir: string = process.cwd(),
): Promise<string> {
  const outputPath = resolveFrom(baseDir, spec.output);
  const remoteInput = spec.inputUrl?.trim();
  const inputPath = remoteInput
    ? undefined
    : resolveFrom(baseDir, spec.input);
  const tempDownload = remoteInput
    ? await downloadToTempFile(remoteInput, "image-quick-edit-input-", ".png")
    : undefined;

  try {
    const effectiveInputPath = tempDownload?.filePath ?? inputPath;
    if (!effectiveInputPath) {
      throw new Error("Edit input is missing");
    }

    const inputBuffer = await readFile(effectiveInputPath);
    let current = sharp(inputBuffer, { failOn: "none" });
    current = await applyEditOperations(current, spec.operations, baseDir);

    await ensureDirForFile(outputPath);
    await saveSharpOutput(current, spec, outputPath);
    await writeJsonFile(sidecarJsonPath(outputPath, "edit"), {
      ...spec,
      input: effectiveInputPath,
      inputUrl: remoteInput,
      output: outputPath,
      generatedAt: new Date().toISOString(),
    });

    return outputPath;
  } finally {
    if (tempDownload) {
      await rm(tempDownload.tempDir, { recursive: true, force: true });
    }
  }
}

export async function applyEditOperations(
  current: Sharp,
  operations: EditOperation[],
  baseDir: string = process.cwd(),
): Promise<Sharp> {
  let next = current;
  for (const operation of operations) {
    next = await applyOperation(next, operation, baseDir);
  }

  return next;
}

async function applyOperation(
  current: Sharp,
  operation: EditOperation,
  specDir: string,
): Promise<Sharp> {
  switch (operation.op) {
    case "resize":
      return current.resize({
        width: operation.width,
        height: operation.height,
        fit: operation.fit,
      });
    case "extract":
      return current.extract({
        left: operation.left,
        top: operation.top,
        width: operation.width,
        height: operation.height,
      });
    case "rotate":
      return current.rotate(operation.angle, {
        background: operation.background ?? "rgba(0,0,0,0)",
      });
    case "extend":
      return current.extend({
        top: operation.top ?? 0,
        bottom: operation.bottom ?? 0,
        left: operation.left ?? 0,
        right: operation.right ?? 0,
        background: operation.background ?? "rgba(0,0,0,0)",
      });
    case "flatten":
      return current.flatten({ background: operation.background });
    case "modulate":
      return current.modulate({
        brightness: operation.brightness ?? 1,
        saturation: operation.saturation ?? 1,
        hue: operation.hue ?? 0,
      });
    case "tint":
      return current.tint(operation.color);
    case "blur":
      return current.blur(operation.sigma);
    case "sharpen":
      return current.sharpen(operation.sigma);
    case "flip":
      return current.flip();
    case "flop":
      return current.flop();
    case "grayscale":
      return current.grayscale();
    case "composite":
      return compositeImage(current, operation, specDir);
    case "text":
      return compositeText(current, operation);
    case "removeBackground":
      return runRembg(current, operation.command ?? "rembg");
    case "imagemagick":
      return runImageMagick(current, operation.command ?? "magick", operation.args);
    default:
      throw new Error(`Unsupported operation: ${(operation as BaseOp).op}`);
  }
}

async function compositeImage(
  current: Sharp,
  operation: CompositeOp,
  specDir: string,
): Promise<Sharp> {
  const inputPath = resolveFrom(specDir, operation.input);
  let overlayBuffer: Buffer = Buffer.from(await readFile(inputPath));

  if (
    operation.width ||
    operation.height ||
    operation.opacity !== undefined ||
    operation.tint
  ) {
    let overlay = sharp(overlayBuffer, { failOn: "none" });

    if (operation.width || operation.height) {
      overlay = overlay.resize({
        width: operation.width,
        height: operation.height,
        fit: "contain",
      });
    }

    if (operation.opacity !== undefined) {
      overlay = overlay.ensureAlpha(clamp(operation.opacity, 0, 1));
    }

    if (operation.tint) {
      overlay = overlay.tint(operation.tint);
    }

    overlayBuffer = Buffer.from(await overlay.png().toBuffer());
  }

  const descriptor: OverlayOptions = {
    input: overlayBuffer,
    left: operation.left,
    top: operation.top,
    gravity: operation.gravity,
    blend: operation.blend,
  };

  return current.composite([descriptor]);
}

async function compositeText(current: Sharp, operation: TextOp): Promise<Sharp> {
  const metadata = await current.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Cannot determine image dimensions for text composition");
  }

  const overlay = buildTextOverlaySvg(metadata.width, metadata.height, operation);
  const overlayBuffer = Buffer.from(overlay, "utf8") as unknown as Buffer;
  return current.composite([{ input: overlayBuffer }]);
}

function buildTextOverlaySvg(
  imageWidth: number,
  imageHeight: number,
  operation: TextOp,
): string {
  const fontSize = operation.fontSize ?? 64;
  const padding = operation.padding ?? 24;
  const lines = operation.value.split(/\r?\n/);
  const lineHeight = Math.round(fontSize * 1.2);
  const textHeight = lines.length * lineHeight;
  const boxWidth = operation.width ?? imageWidth;
  const boxHeight = operation.height ?? Math.max(textHeight + padding * 2, fontSize);

  const position = computeBoxPosition(imageWidth, imageHeight, boxWidth, boxHeight, {
    left: operation.left,
    top: operation.top,
    gravity: operation.gravity ?? "south",
  });

  const align = operation.align ?? gravityToAlign(operation.gravity ?? "south");
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
    .map((line, index) => {
      const y = firstLineY + index * lineHeight;
      return `<tspan x="${textX}" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const backgroundRect = operation.background
    ? `<rect x="${position.left}" y="${position.top}" width="${boxWidth}" height="${boxHeight}" fill="${escapeXml(operation.background)}" rx="8" ry="8" />`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  ${backgroundRect}
  <g transform="translate(${position.left}, ${position.top})">
    <text
      fill="${escapeXml(operation.color ?? "#111111")}"
      font-family="${escapeXml(operation.fontFamily ?? "Arial, sans-serif")}"
      font-size="${fontSize}"
      font-weight="${escapeXml(operation.fontWeight ?? "700")}"
      text-anchor="${textAnchor}"
      dominant-baseline="middle"
    >
      ${tspans}
    </text>
  </g>
</svg>`;
}

function computeBoxPosition(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
  options: {
    left?: number;
    top?: number;
    gravity: Gravity;
  },
): { left: number; top: number } {
  if (options.left !== undefined || options.top !== undefined) {
    return {
      left: options.left ?? 0,
      top: options.top ?? 0,
    };
  }

  switch (options.gravity) {
    case "north":
      return { left: (imageWidth - boxWidth) / 2, top: 0 };
    case "northeast":
      return { left: imageWidth - boxWidth, top: 0 };
    case "east":
      return { left: imageWidth - boxWidth, top: (imageHeight - boxHeight) / 2 };
    case "southeast":
      return { left: imageWidth - boxWidth, top: imageHeight - boxHeight };
    case "south":
      return { left: (imageWidth - boxWidth) / 2, top: imageHeight - boxHeight };
    case "southwest":
      return { left: 0, top: imageHeight - boxHeight };
    case "west":
      return { left: 0, top: (imageHeight - boxHeight) / 2 };
    case "northwest":
      return { left: 0, top: 0 };
    case "center":
    default:
      return {
        left: (imageWidth - boxWidth) / 2,
        top: (imageHeight - boxHeight) / 2,
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

async function runRembg(current: Sharp, command: string): Promise<Sharp> {
  const tempDir = await mkdtemp(join(tmpdir(), "image-quick-rembg-"));
  const inputPath = join(tempDir, "input.png");
  const outputPath = join(tempDir, "output.png");

  try {
    await current.png().toFile(inputPath);
    await runCommand(command, ["i", inputPath, outputPath]);
    const outputBuffer = await readFile(outputPath);
    return sharp(outputBuffer, { failOn: "none" });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runImageMagick(
  current: Sharp,
  command: string,
  args: string[],
): Promise<Sharp> {
  const tempDir = await mkdtemp(join(tmpdir(), "image-quick-magick-"));
  const inputPath = join(tempDir, "input.png");
  const outputPath = join(tempDir, "output.png");

  try {
    await current.png().toFile(inputPath);
    const finalArgs = args.map((value) =>
      value
        .replaceAll("{{input}}", inputPath)
        .replaceAll("{{output}}", outputPath)
    );
    await runCommand(command, finalArgs);
    const outputBuffer = await readFile(outputPath);
    return sharp(outputBuffer, { failOn: "none" });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function saveSharpOutput(
  image: Sharp,
  spec: EditSpec,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
