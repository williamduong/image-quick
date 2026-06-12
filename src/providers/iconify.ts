import sharp from "sharp";

import { fetchJson, fetchText } from "../utils/http.js";
import {
  ensureDirForFile,
  replaceExtension,
  sidecarJsonPath,
  writeJsonFile,
  writeTextFile,
} from "../utils/fs.js";

export interface IconifyCollectionInfo {
  name: string;
  total: number;
  author?: {
    name?: string;
    url?: string;
  };
  license?: {
    title?: string;
    spdx?: string;
    url?: string;
  };
  palette?: boolean;
}

export interface IconifySearchResponse {
  icons: string[];
  total: number;
  limit: number;
  start: number;
  collections: Record<string, IconifyCollectionInfo>;
}

export async function searchIconify(
  query: string,
  limit: number,
): Promise<IconifySearchResponse> {
  const url = new URL("https://api.iconify.design/search");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  const response = await fetchJson<IconifySearchResponse>(url.toString());
  const icons = response.icons.slice(0, limit);
  const prefixes = new Set(icons.map((icon) => icon.split(":")[0]));
  const collections = Object.fromEntries(
    Object.entries(response.collections).filter(([prefix]) => prefixes.has(prefix)),
  );

  return {
    ...response,
    icons,
    limit,
    collections,
  };
}

export async function getIconifyCollection(
  prefix: string,
): Promise<IconifyCollectionInfo | null> {
  const url = new URL("https://api.iconify.design/collections");
  url.searchParams.set("prefixes", prefix);
  const response = await fetchJson<Record<string, IconifyCollectionInfo>>(
    url.toString(),
  );
  return response[prefix] ?? null;
}

export async function downloadIconifyIcon(
  iconName: string,
  outputPath: string,
): Promise<void> {
  const [prefix] = iconName.split(":");
  if (!prefix || !iconName.includes(":")) {
    throw new Error("Icon name must look like prefix:name, for example lucide:mail");
  }

  const svg = await fetchText(`https://api.iconify.design/${iconName}.svg`, {
    headers: {
      Accept: "image/svg+xml, text/plain, */*",
    },
  });
  const normalizedSvg = normalizeSvgForRaster(svg);
  const collection = await getIconifyCollection(prefix);

  if (outputPath.toLowerCase().endsWith(".svg")) {
    await writeTextFile(outputPath, normalizedSvg);
  } else {
    const normalizedOutput = replaceExtension(outputPath, ".png");
    await ensureDirForFile(normalizedOutput);
    await sharp(Buffer.from(normalizedSvg), { density: 512 })
      .resize(512, 512, { fit: "contain" })
      .png()
      .toFile(normalizedOutput);
    outputPath = normalizedOutput;
  }

  await writeJsonFile(sidecarJsonPath(outputPath, "license"), {
    provider: "iconify",
    icon: iconName,
    collection: prefix,
    collectionInfo: collection,
    sourceUrl: `https://api.iconify.design/${iconName}.svg`,
    downloadedAt: new Date().toISOString(),
  });
}

function normalizeSvgForRaster(svg: string): string {
  return svg
    .replace('width="1em"', 'width="512"')
    .replace('height="1em"', 'height="512"');
}
