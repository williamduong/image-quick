#!/usr/bin/env node
import "dotenv/config";

import { resolve } from "node:path";

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
import { runGenerate, runGenerateSpec } from "./layer3/generate.js";
import {
  compileTemplate,
  listTemplates,
  listVariants,
  loadTemplate,
  loadVariant,
} from "./layer3/templates.js";
import { readJsonFile, writeJsonFile } from "./utils/fs.js";
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

const templateCommand = program
  .command("template")
  .description("Manage generation templates");

templateCommand
  .command("list")
  .description("List available templates")
  .action(async () => {
    const templates = await listTemplates();
    console.log(JSON.stringify(templates, null, 2));
  });

templateCommand
  .command("show")
  .description("Show one template and its variants")
  .argument("<templateId>", "Template id")
  .option("--variant <variantId>", "Optional variant id")
  .action(async (templateId: string, options: { variant?: string }) => {
    const template = await loadTemplate(templateId);
    const variants = await listVariants(templateId);
    const variant = options.variant
      ? await loadVariant(templateId, options.variant)
      : undefined;

    console.log(JSON.stringify({
      template,
      variants,
      variant,
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
  .description("Layer 3 AI image generation from a JSON harness or template")
  .option("-s, --spec <path>", "Path to generation spec JSON")
  .option("-t, --template <id>", "Template id")
  .option("--variant <id>", "Template variant id")
  .option("-o, --out <path>", "Output image path when using a template")
  .option("--input <path>", "Path to a JSON file with template variables")
  .option("--var <key=value>", "Template variable override", collectKeyValue, [])
  .action(async (options: {
    spec?: string;
    template?: string;
    variant?: string;
    out?: string;
    input?: string;
    var: Array<[string, string | number | boolean]>;
  }) => {
    if (options.spec) {
      const output = await runGenerateSpec(options.spec);
      console.log(JSON.stringify({ output }, null, 2));
      return;
    }

    if (!options.template) {
      throw new Error("Use either --spec or --template");
    }

    const fileVariables = options.input
      ? await readJsonFile<Record<string, string | number | boolean>>(options.input)
      : {};
    const cliVariables = Object.fromEntries(options.var);
    const outputPath =
      options.out ??
      buildDefaultOutputPath(options.template, options.variant);
    const compiled = await compileTemplate({
      templateId: options.template,
      variantId: options.variant,
      output: outputPath,
      variables: {
        ...fileVariables,
        ...cliVariables,
      },
    });
    const output = await runGenerate(compiled.spec, resolve(outputPath));
    console.log(JSON.stringify({
      output,
      template: compiled.template.id,
      variant: compiled.variant?.id,
      variables: compiled.variables,
    }, null, 2));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function collectKeyValue(
  value: string,
  previous: Array<[string, string | number | boolean]>,
): Array<[string, string | number | boolean]> {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error(`Expected key=value but received: ${value}`);
  }

  const key = value.slice(0, separatorIndex).trim();
  const raw = value.slice(separatorIndex + 1).trim();
  previous.push([key, parseMaybePrimitive(raw)]);
  return previous;
}

function parseMaybePrimitive(value: string): string | number | boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  const numeric = Number(value);
  if (value.length > 0 && !Number.isNaN(numeric)) {
    return numeric;
  }

  return value;
}

function buildDefaultOutputPath(templateId: string, variantId?: string): string {
  const outputDir = process.env.IMAGE_QUICK_OUTPUT_DIR?.trim() || "out";
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("T", "-")
    .replace("Z", "");
  const variantPart = variantId ? `-${slugify(variantId)}` : "";
  return `${outputDir}/${slugify(templateId)}${variantPart}-${stamp}.png`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
