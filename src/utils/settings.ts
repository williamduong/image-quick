import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { z } from "zod";

export interface ImageQuickSettings {
  outputDir?: string;
}

const settingsPath = resolve(homedir(), ".image-quick", "settings.json");
const settingsSchema = z
  .object({
    outputDir: z.string().min(1).optional(),
  })
  .strict();

export function getSettingsPath(): string {
  return settingsPath;
}

export async function readSettings(): Promise<ImageQuickSettings> {
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const raw = await readFile(settingsPath, "utf8");
    return settingsSchema.parse(JSON.parse(raw)) as ImageQuickSettings;
  } catch (error) {
    throw new Error(
      `Failed to read settings at ${settingsPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function writeSettings(settings: ImageQuickSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const normalized = settingsSchema.parse(settings);
  await writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export async function updateSettings(
  updater: (current: ImageQuickSettings) => ImageQuickSettings,
): Promise<ImageQuickSettings> {
  const current = await readSettings();
  const next = updater(current);
  if (!next.outputDir) {
    await clearSettings();
    return {};
  }

  await writeSettings(next);
  return next;
}

export async function clearSettings(): Promise<void> {
  await rm(settingsPath, { force: true });
}
