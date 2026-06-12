import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import { USER_AGENT } from "../config.js";
import { ensureDirForFile, writeTextFile } from "./fs.js";

type FetchInit = RequestInit & {
  headers?: HeadersInit;
};

const DEFAULT_MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

function withDefaultHeaders(init: FetchInit = {}): FetchInit {
  return {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      ...(init.headers ?? {}),
    },
  };
}

export async function fetchJson<T>(url: string, init: FetchInit = {}): Promise<T> {
  assertSafeRemoteUrl(url);
  const response = await fetch(url, withDefaultHeaders(init));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function fetchText(url: string, init: FetchInit = {}): Promise<string> {
  assertSafeRemoteUrl(url);
  const response = await fetch(url, withDefaultHeaders(init));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

export async function downloadToFile(
  url: string,
  outputPath: string,
  init: FetchInit = {},
): Promise<void> {
  assertSafeRemoteUrl(url);
  const response = await fetch(url, withDefaultHeaders(init));
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  assertContentLengthWithinLimit(url, response.headers.get("content-length"));

  await ensureDirForFile(outputPath);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > DEFAULT_MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `Download exceeded ${DEFAULT_MAX_DOWNLOAD_BYTES} bytes for ${url}`,
    );
  }

  await writeTextFile(outputPath, buffer);
}

export async function downloadToTempFile(
  url: string,
  prefix: string,
  fallbackExtension: string = ".bin",
): Promise<{ tempDir: string; filePath: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  const filePath = join(tempDir, `input${inferExtensionFromUrl(url, fallbackExtension)}`);
  await downloadToFile(url, filePath);
  return { tempDir, filePath };
}

function inferExtensionFromUrl(url: string, fallbackExtension: string): string {
  try {
    const parsed = new URL(url);
    const extension = extname(parsed.pathname).toLowerCase();
    if (extension) {
      return extension;
    }
  } catch {
    return fallbackExtension;
  }

  return fallbackExtension;
}

function assertSafeRemoteUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid remote URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Only http and https URLs are supported, received protocol: ${parsed.protocol}`,
    );
  }
}

function assertContentLengthWithinLimit(
  url: string,
  contentLengthHeader: string | null,
): void {
  if (!contentLengthHeader) {
    return;
  }

  const contentLength = Number(contentLengthHeader);
  if (Number.isNaN(contentLength)) {
    return;
  }

  if (contentLength > DEFAULT_MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `Refusing to download ${url}: content-length ${contentLength} exceeds ${DEFAULT_MAX_DOWNLOAD_BYTES} bytes`,
    );
  }
}
