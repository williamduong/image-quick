import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function ensureDirForFile(filePath: string): Promise<void> {
  await ensureDir(dirname(filePath));
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await ensureDirForFile(filePath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeTextFile(
  filePath: string,
  value: string | Buffer,
): Promise<void> {
  await ensureDirForFile(filePath);
  await writeFile(filePath, value);
}

export function resolveFrom(baseDir: string, maybeRelative: string): string {
  return resolve(baseDir, maybeRelative);
}

export function replaceExtension(filePath: string, extension: string): string {
  const current = extname(filePath);
  if (!current) {
    return `${filePath}${extension.startsWith(".") ? extension : `.${extension}`}`;
  }

  return filePath.slice(0, -current.length) +
    (extension.startsWith(".") ? extension : `.${extension}`);
}

export function sidecarJsonPath(filePath: string, suffix: string): string {
  return `${filePath}.${suffix}.json`;
}
