import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import type { ImageProviderId } from "../layer3/modelRegistry.js";

export interface ImageQuickAuthStore {
  providers?: Partial<Record<ImageProviderId, string>>;
}

const configRoot = resolve(homedir(), ".image-quick");
const authPath = resolve(configRoot, "auth.json");
const authSchema = z
  .object({
    providers: z.record(z.string(), z.string().min(1)).optional(),
  })
  .strict();

export function getAuthPath(): string {
  return authPath;
}

export async function readAuthStore(): Promise<ImageQuickAuthStore> {
  if (!existsSync(authPath)) {
    return {};
  }

  try {
    const raw = await readFile(authPath, "utf8");
    return authSchema.parse(JSON.parse(raw)) as ImageQuickAuthStore;
  } catch (error) {
    throw new Error(
      `Failed to read auth store at ${authPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function writeAuthStore(store: ImageQuickAuthStore): Promise<void> {
  await mkdir(dirname(authPath), { recursive: true });
  const normalized = authSchema.parse(store);
  await writeFile(authPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function getStoredProviderApiKey(
  providerId: ImageProviderId,
): Promise<string | undefined> {
  const store = await readAuthStore();
  const value = store.providers?.[providerId]?.trim();
  return value ? value : undefined;
}

export async function setStoredProviderApiKey(
  providerId: ImageProviderId,
  apiKey: string,
): Promise<ImageQuickAuthStore> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API key cannot be empty");
  }

  const current = await readAuthStore();
  const next: ImageQuickAuthStore = {
    providers: {
      ...(current.providers ?? {}),
      [providerId]: trimmed,
    },
  };
  await writeAuthStore(next);
  return next;
}

export async function clearStoredProviderApiKey(
  providerId: ImageProviderId,
): Promise<ImageQuickAuthStore> {
  const current = await readAuthStore();
  const providers = {
    ...(current.providers ?? {}),
  };
  delete providers[providerId];

  if (Object.keys(providers).length === 0) {
    await clearAuthStore();
    return {};
  }

  const next: ImageQuickAuthStore = { providers };
  await writeAuthStore(next);
  return next;
}

export async function clearAuthStore(): Promise<void> {
  await rm(authPath, { force: true });
}

export function maskSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}***`;
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}
