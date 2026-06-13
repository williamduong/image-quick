import { existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const resolvedCommand = resolveCommandPath(command);
    const child = spawn(resolvedCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `Command failed (${resolvedCommand} ${args.join(" ")}): ${stderr || stdout}`,
        ),
      );
    });
  });
}

function resolveCommandPath(command: string): string {
  if (command.includes("\\") || command.includes("/")) {
    return command;
  }

  const envOverride = resolveCommandOverride(command);
  if (envOverride) {
    return envOverride;
  }

  if (command === "magick") {
    const discoveredPath = findExecutableOnPath(
      process.platform === "win32" ? ["magick.exe"] : ["magick", "convert"],
    );
    if (discoveredPath) {
      return discoveredPath;
    }
  }

  if (process.platform !== "win32") {
    return command;
  }

  if (command === "magick") {
    const discovered = findWindowsExecutable("magick.exe", [
      "ImageMagick-",
    ]);
    if (discovered) {
      return discovered;
    }
  }

  return command;
}

function resolveCommandOverride(command: string): string | undefined {
  switch (command) {
    case "magick":
      return readCommandOverride(process.env.IMAGE_QUICK_MAGICK_COMMAND);
    case "rembg":
      return readCommandOverride(process.env.IMAGE_QUICK_REMBG_COMMAND);
    default:
      return undefined;
  }
}

function readCommandOverride(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("\\") || normalized.includes("/")) {
    return existsSync(normalized) ? normalized : undefined;
  }

  return normalized;
}

function findExecutableOnPath(commands: string[]): string | undefined {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return undefined;
  }

  const directories = pathValue.split(delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const command of commands) {
      const fullPath = join(directory, command);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return undefined;
}

function findWindowsExecutable(
  executableName: string,
  directoryPrefixes: string[],
): string | undefined {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean) as string[];

  for (const root of roots) {
    try {
      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (!directoryPrefixes.some((prefix) => entry.name.startsWith(prefix))) {
          continue;
        }

        const fullPath = `${root}\\${entry.name}\\${executableName}`;
        if (existsSync(fullPath)) {
          return fullPath;
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
