import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export interface ImageQuickSettings {
  outputDir?: string;
}

const settingsPath = resolve(homedir(), ".image-quick", "settings.json");

export function getSettingsPath(): string {
  return settingsPath;
}

export async function readSettings(): Promise<ImageQuickSettings> {
  if (!existsSync(settingsPath)) {
    return {};
  }

  const raw = await readFile(settingsPath, "utf8");
  return JSON.parse(raw) as ImageQuickSettings;
}

export async function writeSettings(settings: ImageQuickSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export async function updateSettings(
  updater: (current: ImageQuickSettings) => ImageQuickSettings,
): Promise<ImageQuickSettings> {
  const current = await readSettings();
  const next = updater(current);
  await writeSettings(next);
  return next;
}

export async function clearSettings(): Promise<void> {
  await rm(settingsPath, { force: true });
}
