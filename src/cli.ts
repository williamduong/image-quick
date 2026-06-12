#!/usr/bin/env node
import "dotenv/config";

import { resolve } from "node:path";

import { Command } from "commander";

import { APP_NAME, APP_VERSION } from "./config.js";
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
import {
  getProviderApiKey,
  isImageProvider,
  listImageProviders,
  listRegisteredModels,
  type ImageProviderId,
} from "./layer3/modelRegistry.js";
import {
  GENERATION_TIERS,
  isGenerationTier,
  type GenerationTier,
} from "./layer3/tiers.js";
import { readJsonFile, writeJsonFile } from "./utils/fs.js";
import { runCommand } from "./utils/process.js";

const program = new Command();

program.name(APP_NAME).description("Tiered image workflow CLI").version(APP_VERSION);

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

    const providers = listImageProviders().map((provider) => ({
      id: provider.id,
      label: provider.label,
      status: provider.status,
      apiKeyEnv: provider.apiKeyEnv,
      apiKeyPresent: Boolean(getProviderApiKey(provider.id)),
    }));

    console.log(JSON.stringify({
      providers,
      tools: results,
    }, null, 2));
  });

program
  .command("provider")
  .description("Inspect supported image providers")
  .command("list")
  .description("List provider registry entries")
  .action(() => {
    console.log(JSON.stringify(listImageProviders(), null, 2));
  });

program
  .command("model")
  .description("Inspect registered image models")
  .command("list")
  .option("--provider <provider>", "Filter by provider")
  .action((options: { provider?: string }) => {
    if (options.provider && !isImageProvider(options.provider)) {
      throw new Error(`Unknown provider: ${options.provider}`);
    }

    const models = listRegisteredModels()
      .filter((entry) => !options.provider || entry.provider === options.provider)
      .map((entry) => ({
        provider: entry.provider,
        id: entry.id,
        label: entry.label,
        commercialTier: entry.commercialTier,
        defaultTier: entry.defaultTier,
        adapter: entry.adapter,
        preferredSize: entry.preferredSize,
      }));
    console.log(JSON.stringify(models, null, 2));
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
  .description("Generate images from a JSON harness or template with optional tier routing")
  .option("-s, --spec <path>", "Path to generation spec JSON")
  .option("-t, --template <id>", "Template id")
  .option("--variant <id>", "Template variant id")
  .option(
    "--tier <tier>",
    `Execution tier: ${GENERATION_TIERS.join(" | ")}`,
  )
  .option("--provider <provider>", "Image provider id from `provider list`")
  .option("-o, --out <path>", "Output image path when using a template")
  .option("--input <path>", "Path to a JSON file with template variables")
  .option("--var <key=value>", "Template variable override", collectKeyValue, [])
  .action(async (options: {
    spec?: string;
    template?: string;
    variant?: string;
    tier?: string;
    provider?: string;
    out?: string;
    input?: string;
    var: Array<[string, string | number | boolean]>;
  }) => {
    const tier = parseTierOption(options.tier);
    const provider = parseProviderOption(options.provider);

    if (options.spec) {
      const output = await runGenerateSpec(options.spec, {
        tier,
        provider,
      });
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
      buildDefaultOutputPath(options.template, options.variant, tier);
    const compiled = await compileTemplate({
      templateId: options.template,
      variantId: options.variant,
      tier,
      output: outputPath,
      overrides: provider ? { provider } : undefined,
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
      tier: compiled.tier,
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

function buildDefaultOutputPath(
  templateId: string,
  variantId?: string,
  tier?: GenerationTier,
): string {
  const outputDir = process.env.IMAGE_QUICK_OUTPUT_DIR?.trim() || "out";
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("T", "-")
    .replace("Z", "");
  const variantPart = variantId ? `-${slugify(variantId)}` : "";
  const tierPart = tier ? `-${slugify(tier)}` : "";
  return `${outputDir}/${slugify(templateId)}${variantPart}${tierPart}-${stamp}.png`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parseTierOption(value: string | undefined): GenerationTier | undefined {
  if (!value) {
    return undefined;
  }

  if (!isGenerationTier(value)) {
    throw new Error(
      `Invalid --tier value "${value}". Expected one of: ${GENERATION_TIERS.join(", ")}`,
    );
  }

  return value;
}

function parseProviderOption(value: string | undefined): ImageProviderId | undefined {
  if (!value) {
    return undefined;
  }

  if (!isImageProvider(value)) {
    throw new Error(`Invalid --provider value "${value}"`);
  }

  return value;
}
