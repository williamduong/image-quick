import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import dotenv from "dotenv";

export function loadClosestEnv(): string | undefined {
  const envPath = findClosestEnvFile(process.cwd());
  if (!envPath) {
    return undefined;
  }

  dotenv.config({ path: envPath });
  return envPath;
}

function findClosestEnvFile(startDir: string): string | undefined {
  let current = resolve(startDir);

  while (true) {
    const candidate = resolve(current, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}
