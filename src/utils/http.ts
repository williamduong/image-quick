import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import { USER_AGENT } from "../config.js";
import { ensureDirForFile } from "./fs.js";

type FetchInit = RequestInit & {
  headers?: HeadersInit;
};

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
  const response = await fetch(url, withDefaultHeaders(init));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function fetchText(url: string, init: FetchInit = {}): Promise<string> {
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
  const response = await fetch(url, withDefaultHeaders(init));
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  await ensureDirForFile(outputPath);
  await pipeline(response.body, createWriteStream(outputPath));
}
