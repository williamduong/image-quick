import { downloadToFile, fetchJson } from "../utils/http.js";
import { sidecarJsonPath, writeJsonFile } from "../utils/fs.js";

export interface OpenverseImage {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  creator: string | null;
  creator_url: string | null;
  license: string;
  license_version: string | null;
  license_url: string | null;
  provider: string;
  source: string;
  attribution: string;
  foreign_landing_url: string | null;
  width: number | null;
  height: number | null;
}

interface OpenverseSearchResponse {
  results: OpenverseImage[];
}

const OPENVERSE_LICENSE_FILTER = "by,by-sa,cc0,pdm";

export async function searchOpenverse(
  query: string,
  limit: number,
): Promise<OpenverseImage[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("license", OPENVERSE_LICENSE_FILTER);

  const response = await fetchJson<OpenverseSearchResponse>(url.toString());
  return response.results;
}

export async function getOpenverseImage(id: string): Promise<OpenverseImage> {
  return fetchJson<OpenverseImage>(`https://api.openverse.org/v1/images/${id}/`);
}

export async function downloadOpenverseImage(
  id: string,
  outputPath: string,
): Promise<OpenverseImage> {
  const image = await getOpenverseImage(id);
  await downloadToFile(image.url, outputPath);
  await writeJsonFile(sidecarJsonPath(outputPath, "license"), {
    provider: "openverse",
    id: image.id,
    title: image.title,
    creator: image.creator,
    creatorUrl: image.creator_url,
    attribution: image.attribution,
    license: image.license,
    licenseVersion: image.license_version,
    licenseUrl: image.license_url,
    source: image.source,
    sourceLandingUrl: image.foreign_landing_url,
    originalUrl: image.url,
    downloadedAt: new Date().toISOString(),
  });
  return image;
}
