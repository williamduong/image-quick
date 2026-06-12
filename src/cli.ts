import "dotenv/config";

import { Command } from "commander";

import { APP_NAME, APP_VERSION, DEFAULT_OPENAI_IMAGE_MODEL } from "./config.js";
import {
  downloadIconifyIcon,
  searchIconify,
} from "./providers/iconify.js";
import {
  downloadOpenverseImage,
  searchOpenverse,
} from "./providers/openverse.js";
import { runEditSpec } from "./layer2/editPipeline.js";
import { runGenerateSpec } from "./layer3/generate.js";
import { writeJsonFile } from "./utils/fs.js";
import { runCommand } from "./utils/process.js";

const program = new Command();

program.name(APP_NAME).description("Three-layer image workflow CLI").version(APP_VERSION);

program
  .command("doctor")
  .description("Check optional local dependencies and env vars")
  .action(async () => {
    const checks = [
      {
        name: "ImageMagick",
        command: "magick",
        args: ["-version"],
      },
      {
        name: "rembg",
        command: "rembg",
        args: ["--help"],
      },
    ];

    const results = await Promise.all(
      checks.map(async (check) => {
        try {
          await runCommand(check.command, check.args);
          return { name: check.name, status: "ok" };
        } catch {
          return { name: check.name, status: "missing" };
        }
      }),
    );

    console.log(JSON.stringify({
      openAiImageModel: DEFAULT_OPENAI_IMAGE_MODEL,
      openAiApiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
      tools: results,
    }, null, 2));
  });

const search = program.command("search").description("Layer 1 asset search");

search
  .command("openverse")
  .requiredOption("-q, --query <query>", "Search query")
  .option("-l, --limit <limit>", "Number of results", "5")
  .option("-o, --out <path>", "Write JSON results to a file")
  .action(async (options: { query: string; limit: string; out?: string }) => {
    const results = await searchOpenverse(options.query, Number(options.limit));
    if (options.out) {
      await writeJsonFile(options.out, results);
    }
    console.log(JSON.stringify(results, null, 2));
  });

search
  .command("iconify")
  .requiredOption("-q, --query <query>", "Search query")
  .option("-l, --limit <limit>", "Number of results", "10")
  .option("-o, --out <path>", "Write JSON results to a file")
  .action(async (options: { query: string; limit: string; out?: string }) => {
    const results = await searchIconify(options.query, Number(options.limit));
    if (options.out) {
      await writeJsonFile(options.out, results);
    }
    console.log(JSON.stringify(results, null, 2));
  });

const fetchCommand = program.command("fetch").description("Layer 1 asset download");

fetchCommand
  .command("openverse")
  .requiredOption("--id <id>", "Openverse image id")
  .requiredOption("-o, --out <path>", "Output image path")
  .action(async (options: { id: string; out: string }) => {
    const image = await downloadOpenverseImage(options.id, options.out);
    console.log(JSON.stringify({
      output: options.out,
      title: image.title,
      license: image.license,
      creator: image.creator,
    }, null, 2));
  });

fetchCommand
  .command("iconify")
  .requiredOption("--icon <icon>", "Icon name such as lucide:mail")
  .requiredOption("-o, --out <path>", "Output .svg or .png path")
  .action(async (options: { icon: string; out: string }) => {
    await downloadIconifyIcon(options.icon, options.out);
    console.log(JSON.stringify({
      output: options.out,
      icon: options.icon,
    }, null, 2));
  });

program
  .command("edit")
  .description("Layer 2 image edits from a JSON spec")
  .requiredOption("-s, --spec <path>", "Path to edit spec JSON")
  .action(async (options: { spec: string }) => {
    const output = await runEditSpec(options.spec);
    console.log(JSON.stringify({ output }, null, 2));
  });

program
  .command("generate")
  .description("Layer 3 AI image generation from a JSON harness")
  .requiredOption("-s, --spec <path>", "Path to generation spec JSON")
  .action(async (options: { spec: string }) => {
    const output = await runGenerateSpec(options.spec);
    console.log(JSON.stringify({ output }, null, 2));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
