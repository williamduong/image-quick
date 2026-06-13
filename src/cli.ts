#!/usr/bin/env node

import { resolve } from "node:path";
import readline from "node:readline/promises";

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
import { listAssetSources } from "./providers/sourceRegistry.js";
import { runComposeSpec } from "./layer2/composePipeline.js";
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
  getProviderApiKeyDetails,
  getProviderApiKey,
  isImageProvider,
  listImageProviders,
  listRegisteredModels,
  type ImageProviderId,
} from "./layer3/modelRegistry.js";
import {
  runCatalogProductPhotoAutoFix,
  runCatalogProductPhotoQa,
} from "./qa/catalogProductPhotoQa.js";
import {
  GENERATION_TIERS,
  isGenerationTier,
  type GenerationTier,
} from "./layer3/tiers.js";
import { loadClosestEnv } from "./utils/env.js";
import { readJsonFile, writeJsonFile } from "./utils/fs.js";
import { runCommand } from "./utils/process.js";
import {
  clearStoredProviderApiKey,
  getAuthPath,
  maskSecret,
  readAuthStore,
  setStoredProviderApiKey,
} from "./utils/auth.js";
import {
  getSettingsPath,
  readSettings,
  updateSettings,
} from "./utils/settings.js";

loadClosestEnv();

const program = new Command();

program.name(APP_NAME).description("Tiered image workflow CLI").version(APP_VERSION);

const authCommand = program
  .command("auth")
  .description("Manage local provider API keys in the user config directory");

authCommand
  .command("set")
  .description("Store one provider API key in local user config")
  .argument("<provider>", "Provider id such as openai or google-gemini")
  .argument("[apiKey]", "Optional API key value. If omitted, the CLI prompts for it.")
  .action(async (provider: string, apiKey?: string) => {
    if (!isImageProvider(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const value = apiKey ?? await promptForSecret(`Enter API key for ${provider}: `);
    await setStoredProviderApiKey(provider, value);
    console.log(JSON.stringify({
      path: getAuthPath(),
      provider,
      stored: true,
      keyPreview: maskSecret(value),
      source: "local",
    }, null, 2));
  });

authCommand
  .command("clear")
  .description("Remove one provider API key from local user config")
  .argument("<provider>", "Provider id such as openai or google-gemini")
  .action(async (provider: string) => {
    if (!isImageProvider(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    await clearStoredProviderApiKey(provider);
    console.log(JSON.stringify({
      path: getAuthPath(),
      provider,
      stored: false,
      source: "local",
    }, null, 2));
  });

authCommand
  .command("doctor")
  .description("Inspect local and environment API-key sources without printing secrets")
  .action(async () => {
    const store = await readAuthStore();
    const providers = await Promise.all(
      listImageProviders().map(async (provider) => {
        const keyDetails = await getProviderApiKeyDetails(provider.id);
        return {
          id: provider.id,
          label: provider.label,
          envName: provider.apiKeyEnv,
          localStored: Boolean(store.providers?.[provider.id]),
          envPresent: Boolean(process.env[provider.apiKeyEnv]?.trim()),
          effectiveSource: keyDetails.source,
          effectiveKeyPreview: maskSecret(keyDetails.value),
        };
      }),
    );

    console.log(JSON.stringify({
      path: getAuthPath(),
      providers,
    }, null, 2));
  });

const settingsCommand = program
  .command("settings")
  .description("Manage persistent local CLI settings");

settingsCommand
  .command("show")
  .description("Show current settings and settings file location")
  .action(async () => {
    const settings = await readSettings();
    console.log(JSON.stringify({
      path: getSettingsPath(),
      settings,
    }, null, 2));
  });

settingsCommand
  .command("set")
  .description("Update one setting")
  .argument("<key>", "Setting key")
  .argument("<value>", "Setting value")
  .action(async (key: string, value: string) => {
    switch (key) {
      case "output-dir": {
        const outputDir = resolve(value);
        const settings = await updateSettings((current) => ({
          ...current,
          outputDir,
        }));
        console.log(JSON.stringify({
          path: getSettingsPath(),
          settings,
        }, null, 2));
        return;
      }
      default:
        throw new Error(`Unsupported setting key: ${key}`);
    }
  });

settingsCommand
  .command("clear")
  .description("Clear one setting")
  .argument("<key>", "Setting key")
  .action(async (key: string) => {
    switch (key) {
      case "output-dir": {
        const settings = await updateSettings((current) => ({
          ...current,
          outputDir: undefined,
        }));
        console.log(JSON.stringify({
          path: getSettingsPath(),
          settings,
        }, null, 2));
        return;
      }
      default:
        throw new Error(`Unsupported setting key: ${key}`);
    }
  });

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

    const providers = await Promise.all(
      listImageProviders().map(async (provider) => {
        const keyDetails = await getProviderApiKeyDetails(provider.id);
        return {
          id: provider.id,
          label: provider.label,
          status: provider.status,
          apiKeyEnv: provider.apiKeyEnv,
          apiKeyPresent: Boolean(keyDetails.value),
          apiKeySource: keyDetails.source,
        };
      }),
    );

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

const sourceCommand = program
  .command("source")
  .description("List free asset sources and integration status");

sourceCommand
  .command("list")
  .description("List built-in and recommended asset sources")
  .action(() => {
    console.log(JSON.stringify(listAssetSources(), null, 2));
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
  .command("compose")
  .description("Compose a multi-layer image from a JSON spec")
  .requiredOption("-s, --spec <path>", "Path to compose spec JSON")
  .action(async (options: { spec: string }) => {
    const output = await runComposeSpec(options.spec);
    console.log(JSON.stringify({ output }, null, 2));
  });

const qaCommand = program
  .command("qa")
  .description("Run quality checks for production image presets");

qaCommand
  .command("catalog-product-photo")
  .description("Check a product packshot against catalog QA rules")
  .requiredOption("-i, --image <path>", "Image path")
  .option("-o, --out <path>", "Write QA report JSON to a file")
  .option("--auto-fix", "Auto-fix background framing issues with ImageMagick when QA fails")
  .option("--fixed-out <path>", "Output path for the auto-fixed image")
  .option("--fix-report-out <path>", "Write auto-fix result JSON to a file")
  .option("--include-warn", "Also auto-fix warn-level background/margin issues")
  .option("--force-fix", "Run auto-fix even if the targeted QA checks did not fail")
  .action(async (options: {
    image: string;
    out?: string;
    autoFix?: boolean;
    fixedOut?: string;
    fixReportOut?: string;
    includeWarn?: boolean;
    forceFix?: boolean;
  }) => {
    const report = await runCatalogProductPhotoQa(options.image, options.out);
    if (!options.autoFix) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const autoFix = await runCatalogProductPhotoAutoFix(options.image, {
      outPath: options.fixedOut,
      reportOutPath: options.fixReportOut,
      includeWarn: options.includeWarn,
      force: options.forceFix,
    });
    console.log(JSON.stringify({
      report,
      autoFix,
    }, null, 2));
  });

program
  .command("edit")
  .description("Layer 2 image edits from a JSON spec")
  .requiredOption("-s, --spec <path>", "Path to edit spec JSON")
  .option("--input-url <url>", "Override the base input image with a remote URL")
  .action(async (options: { spec: string; inputUrl?: string }) => {
    const output = await runEditSpec(options.spec, {
      inputUrl: options.inputUrl,
    });
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
  .option("--asset-url <url>", "Direct remote asset URL for asset-only flow")
  .option("--reference-image <path>", "Local reference image to guide AI polish/edit", collectString, [])
  .option("--reference-image-url <url>", "Remote reference image URL to guide AI polish/edit", collectString, [])
  .option("--input-fidelity <level>", "Reference-image fidelity for OpenAI edits: low | high")
  .option("--var <key=value>", "Template variable override", collectKeyValue, [])
  .action(async (options: {
    spec?: string;
    template?: string;
    variant?: string;
    tier?: string;
    provider?: string;
    out?: string;
    input?: string;
    assetUrl?: string;
    referenceImage: string[];
    referenceImageUrl: string[];
    inputFidelity?: string;
    var: Array<[string, string | number | boolean]>;
  }) => {
    const tier = parseTierOption(options.tier);
    const provider = parseProviderOption(options.provider);

    if (options.spec) {
      const output = await runGenerateSpec(options.spec, {
        tier,
        provider,
        assetUrl: options.assetUrl,
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
    const compiled = await compileTemplate({
      templateId: options.template,
      variantId: options.variant,
      tier,
      output: options.out ?? "__image_quick_auto_output__.png",
      overrides: provider ? { provider } : undefined,
      variables: {
        ...fileVariables,
        ...cliVariables,
        ...(options.assetUrl ? { assetUrl: options.assetUrl } : {}),
      },
    });
    if (options.referenceImage.length > 0) {
      compiled.spec.inputImages = options.referenceImage.map((imagePath) => resolve(imagePath));
    }
    if (options.referenceImageUrl.length > 0) {
      compiled.spec.inputImageUrls = [...options.referenceImageUrl];
    }
    if (options.inputFidelity === "low" || options.inputFidelity === "high") {
      compiled.spec.inputFidelity = options.inputFidelity;
    } else if (options.inputFidelity) {
      throw new Error(`Invalid --input-fidelity value "${options.inputFidelity}". Expected low or high.`);
    }
    const outputPath =
      options.out ??
      await buildDefaultOutputPath({
        templateId: options.template,
        variantId: options.variant,
        tier,
        size: compiled.spec.size,
      });
    compiled.spec.output = outputPath;
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

function collectString(
  value: string,
  previous: string[],
): string[] {
  previous.push(value);
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

async function buildDefaultOutputPath(input: {
  templateId: string;
  variantId?: string;
  tier?: GenerationTier;
  size?: string;
}): Promise<string> {
  const settings = await readSettings();
  const outputDir =
    settings.outputDir?.trim() ||
    process.env.IMAGE_QUICK_OUTPUT_DIR?.trim();
  const fileName = [
    slugify(input.templateId),
    buildShortDescriptor(input.variantId, input.tier),
    normalizeSizeToken(input.size),
    formatFileTimestamp(new Date()),
  ]
    .filter(Boolean)
    .join("-") + ".png";
  return outputDir ? `${outputDir}/${fileName}` : fileName;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildShortDescriptor(
  variantId?: string,
  tier?: GenerationTier,
): string | undefined {
  const parts = [
    variantId ? slugify(variantId) : undefined,
    tier ? slugify(tier) : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("-") : undefined;
}

function normalizeSizeToken(size: string | undefined): string | undefined {
  if (!size) {
    return undefined;
  }

  const normalized = size.trim().toLowerCase();
  return /^\d+x\d+$/.test(normalized)
    ? normalized
    : slugify(normalized);
}

function formatFileTimestamp(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}${milliseconds}`;
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

async function promptForSecret(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  }) as readline.Interface & { stdoutMuted?: boolean; _writeToOutput?: (text: string) => void };

  rl.stdoutMuted = true;
  rl._writeToOutput = function writeToOutput(text: string): void {
    if (rl.stdoutMuted) {
      process.stdout.write(text.endsWith("\n") ? text : "*");
      return;
    }

    process.stdout.write(text);
  };

  try {
    const value = await rl.question(prompt);
    console.log();
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("API key cannot be empty");
    }

    return trimmed;
  } finally {
    rl.close();
  }
}
