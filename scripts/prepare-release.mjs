import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stageRoot = resolve(repoRoot, ".release", "npm");

const rootPackage = JSON.parse(
  await readFile(resolve(repoRoot, "package.json"), "utf8"),
);

const releasePackage = {
  name: rootPackage.name,
  version: rootPackage.version,
  description:
    "CLI for production-friendly image sourcing, editing, layered composition, and AI image generation.",
  license: rootPackage.license,
  author: rootPackage.author,
  keywords: rootPackage.keywords,
  type: rootPackage.type,
  bin: rootPackage.bin,
  files: [
    "dist",
    "templates",
    "examples",
    "README.md",
    "LICENSE",
  ],
  engines: rootPackage.engines,
  dependencies: rootPackage.dependencies,
  repository: rootPackage.repository,
  bugs: rootPackage.bugs,
  homepage: "https://github.com/williamduong/image-quick/blob/main/publish/npm/README.md",
  publishConfig: {
    access: "public",
    tag: "latest",
  },
};

await rm(stageRoot, { recursive: true, force: true });
await mkdir(stageRoot, { recursive: true });

for (const entry of ["dist", "templates", "examples"]) {
  await cp(resolve(repoRoot, entry), resolve(stageRoot, entry), {
    recursive: true,
  });
}

await cp(
  resolve(repoRoot, "publish", "npm", "README.md"),
  resolve(stageRoot, "README.md"),
);
await cp(resolve(repoRoot, "LICENSE"), resolve(stageRoot, "LICENSE"));

await writeFile(
  resolve(stageRoot, "package.json"),
  `${JSON.stringify(releasePackage, null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      stageRoot,
      packageName: releasePackage.name,
      version: releasePackage.version,
      files: releasePackage.files,
    },
    null,
    2,
  ),
);
