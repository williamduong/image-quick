export interface AssetSource {
  id: string;
  label: string;
  category: "photo" | "icon" | "vector" | "mixed";
  integratedSearch: boolean;
  integratedDownload: boolean;
  siteUrl: string;
  apiDocsUrl?: string;
  licenseNote: string;
  notes?: string[];
}

const assetSources: AssetSource[] = [
  {
    id: "openverse",
    label: "Openverse",
    category: "mixed",
    integratedSearch: true,
    integratedDownload: true,
    siteUrl: "https://openverse.org/",
    apiDocsUrl: "https://api.openverse.org/",
    licenseNote: "Searches openly licensed or public domain media; always verify the final asset license on the source record.",
    notes: [
      "Best default source for free photos and illustrations.",
      "Already wired into `search openverse` and `fetch openverse`.",
    ],
  },
  {
    id: "iconify",
    label: "Iconify",
    category: "icon",
    integratedSearch: true,
    integratedDownload: true,
    siteUrl: "https://icon-sets.iconify.design/",
    apiDocsUrl: "https://iconify.design/docs/api/",
    licenseNote: "Aggregates open source icon sets; check the icon set license shown by Iconify for redistribution requirements.",
    notes: [
      "Best default source for free UI and product icons.",
      "Already wired into `search iconify` and `fetch iconify`.",
    ],
  },
  {
    id: "wikimedia-commons",
    label: "Wikimedia Commons",
    category: "mixed",
    integratedSearch: false,
    integratedDownload: false,
    siteUrl: "https://commons.wikimedia.org/wiki/Main_Page",
    apiDocsUrl: "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
    licenseNote: "Most content is reusable, but attribution and non-copyright restrictions may still apply.",
    notes: [
      "Very strong source for documentary photos, diagrams, and historical material.",
    ],
  },
  {
    id: "svg-repo",
    label: "SVG Repo",
    category: "vector",
    integratedSearch: false,
    integratedDownload: false,
    siteUrl: "https://www.svgrepo.com/",
    apiDocsUrl: "https://www.svgrepo.com/page/licensing/",
    licenseNote: "Open-licensed vectors from multiple sources; verify the license on each asset page.",
    notes: [
      "Useful for free vectors, clip art, and icon-style assets.",
    ],
  },
];

export function listAssetSources(): AssetSource[] {
  return [...assetSources];
}
