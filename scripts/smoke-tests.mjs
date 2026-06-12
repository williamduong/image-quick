import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliPath = resolve(repoRoot, "dist", "cli.js");
const remoteImageUrl = "https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg";

const workspace = await mkdtemp(join(tmpdir(), "image-quick-smoke-"));

try {
  await run(["node", cliPath, "doctor"]);
  await run(["node", cliPath, "provider", "list"]);
  await run(["node", cliPath, "template", "list"]);
  await run([
    "node",
    cliPath,
    "edit",
    "--spec",
    resolve(repoRoot, "examples", "edit.sample.json"),
    "--input-url",
    remoteImageUrl,
  ]);
  await run([
    "node",
    cliPath,
    "compose",
    "--spec",
    resolve(repoRoot, "examples", "compose.banner.sample.json"),
  ]);
  await run([
    "node",
    cliPath,
    "generate",
    "--template",
    "catalog-product-photo",
    "--tier",
    "asset-only",
    "--asset-url",
    remoteImageUrl,
    "--out",
    resolve(workspace, "asset-only.png"),
    "--var",
    "productName=Generic Cat Figure",
    "--var",
    "category=Home Goods",
    "--var",
    "productType=Decor",
  ]);
  await run([
    "node",
    cliPath,
    "qa",
    "catalog-product-photo",
    "--image",
    resolve(workspace, "asset-only.png"),
  ]);

  console.log("Smoke tests passed.");
} finally {
  await rm(workspace, { recursive: true, force: true });
}

function run([command, ...args]) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`Command failed: ${command} ${args.join(" ")}`));
    });
  });
}
