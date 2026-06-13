import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stageRoot = resolve(repoRoot, ".release", "npm");
const args = process.argv.slice(2);
const npmExecPath = process.env.npm_execpath;

if (args.length === 0) {
  throw new Error("Expected npm arguments for the staged release package.");
}

await new Promise((resolvePromise, rejectPromise) => {
  const command = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;

  const child = spawn(command, commandArgs, {
    cwd: stageRoot,
    stdio: "inherit",
    shell: false,
  });

  child.on("error", rejectPromise);
  child.on("close", (code) => {
    if (code === 0) {
      resolvePromise();
      return;
    }

    rejectPromise(
      new Error(`Release npm command failed: ${command} ${commandArgs.join(" ")}`),
    );
  });
});
