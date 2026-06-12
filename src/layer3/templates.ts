import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { GenerateSpec } from "./generate.js";
import {
  mergePromptHarness,
  resolvePromptHarness,
  type PromptHarness,
} from "./promptHarness.js";
import { readJsonFile } from "../utils/fs.js";

const primitiveValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const promptFragmentsSchema = z
  .object({
    subject: z.string().optional(),
    style: z.string().optional(),
    composition: z.string().optional(),
    lighting: z.string().optional(),
    color: z.string().optional(),
    background: z.string().optional(),
    text: z.string().optional(),
    additional: z.array(z.string()).optional(),
    constraints: z.array(z.string()).optional(),
    negative: z.array(z.string()).optional(),
  })
  .strict();

const promptHarnessSchema = z
  .object({
    prompt: z.string().optional(),
    promptTemplate: z.string().optional(),
    variables: z.record(z.string(), primitiveValueSchema).optional(),
    fragments: promptFragmentsSchema.optional(),
  })
  .strict();

const generateDefaultsSchema = z
  .object({
    provider: z.literal("openai").optional(),
    model: z.string().optional(),
    size: z.string().optional(),
    quality: z.enum(["low", "medium", "high", "auto"]).optional(),
    background: z.enum(["transparent", "opaque"]).optional(),
    outputCompression: z.number().int().min(0).max(100).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    n: z.number().int().positive().optional(),
  })
  .strict();

const slotDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    example: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();

const policiesSchema = z
  .object({
    allowUserVariables: z.array(z.string()).optional(),
    denyUserVariables: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict()
  .optional();

const slotMapSchema = z.record(z.string(), primitiveValueSchema);

const imageTemplateSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    defaults: generateDefaultsSchema.default({}),
    slotDefaults: slotMapSchema.optional(),
    slots: z
      .object({
        required: z.array(slotDefinitionSchema).default([]),
        optional: z.array(slotDefinitionSchema).default([]),
      })
      .strict(),
    prompt: promptHarnessSchema,
    policies: policiesSchema,
  })
  .strict();

const imageTemplateVariantSchema = z
  .object({
    id: z.string().min(1),
    templateId: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    defaults: generateDefaultsSchema.optional(),
    slotDefaults: slotMapSchema.optional(),
    prompt: promptHarnessSchema.optional(),
    policies: policiesSchema,
  })
  .strict();

export type ImageTemplate = z.infer<typeof imageTemplateSchema>;
export type ImageTemplateVariant = z.infer<typeof imageTemplateVariantSchema>;

export interface TemplateSummary {
  id: string;
  label: string;
  description: string;
}

export interface CompiledTemplateResult {
  spec: GenerateSpec;
  template: ImageTemplate;
  variant?: ImageTemplateVariant;
  resolvedPromptHarness: PromptHarness;
  variables: Record<string, string | number | boolean>;
}

interface CompileOptions {
  templateId: string;
  variantId?: string;
  output: string;
  variables?: Record<string, string | number | boolean>;
  overrides?: Partial<Pick<
    GenerateSpec,
    | "provider"
    | "model"
    | "size"
    | "quality"
    | "background"
    | "outputCompression"
    | "moderation"
    | "n"
  >>;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const bundledTemplatesRoot = resolve(moduleDir, "..", "..", "templates");
const projectTemplatesRoot = resolve(process.cwd(), "templates");
const templatesRoot = existsSync(projectTemplatesRoot)
  ? projectTemplatesRoot
  : bundledTemplatesRoot;

export async function listTemplates(): Promise<TemplateSummary[]> {
  const entries = await readdir(templatesRoot, { withFileTypes: true });
  const templateFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".template.json"))
    .map((entry) => entry.name);

  const templates = await Promise.all(
    templateFiles.map(async (fileName) => {
      const filePath = resolve(templatesRoot, fileName);
      const template = imageTemplateSchema.parse(await readJsonFile(filePath));
      return {
        id: template.id,
        label: template.label,
        description: template.description,
      } satisfies TemplateSummary;
    }),
  );

  return templates.sort((left, right) => left.id.localeCompare(right.id));
}

export async function loadTemplate(templateId: string): Promise<ImageTemplate> {
  const filePath = resolve(templatesRoot, `${templateId}.template.json`);
  return imageTemplateSchema.parse(await readJsonFile(filePath));
}

export async function loadVariant(
  templateId: string,
  variantId: string,
): Promise<ImageTemplateVariant> {
  const filePath = resolve(templatesRoot, "variants", templateId, `${variantId}.json`);
  const variant = imageTemplateVariantSchema.parse(await readJsonFile(filePath));

  if (variant.templateId !== templateId) {
    throw new Error(
      `Variant ${variantId} does not belong to template ${templateId}`,
    );
  }

  return variant;
}

export async function listVariants(
  templateId: string,
): Promise<ImageTemplateVariant[]> {
  const variantDir = resolve(templatesRoot, "variants", templateId);

  try {
    const entries = await readdir(variantDir, { withFileTypes: true });
    const variantFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);

    return Promise.all(
      variantFiles.map(async (fileName) => {
        const filePath = resolve(variantDir, fileName);
        return imageTemplateVariantSchema.parse(await readJsonFile(filePath));
      }),
    );
  } catch {
    return [];
  }
}

export async function compileTemplate(
  options: CompileOptions,
): Promise<CompiledTemplateResult> {
  const template = await loadTemplate(options.templateId);
  const variant = options.variantId
    ? await loadVariant(options.templateId, options.variantId)
    : undefined;

  const variables = {
    ...(template.slotDefaults ?? {}),
    ...(variant?.slotDefaults ?? {}),
    ...(options.variables ?? {}),
  };

  validateVariables(template, variant, variables);

  const mergedPrompt = variant?.prompt
    ? mergePromptHarness(template.prompt, variant.prompt)
    : template.prompt;
  const mergedPromptVariables = {
    ...(mergedPrompt.variables ?? {}),
    ...variables,
  };
  const resolvedPromptHarness = resolvePromptHarness(
    mergedPrompt,
    mergedPromptVariables,
  );

  const spec: GenerateSpec = {
    ...template.defaults,
    ...(variant?.defaults ?? {}),
    ...(options.overrides ?? {}),
    output: options.output,
    ...resolvedPromptHarness,
    templateId: template.id,
    variantId: variant?.id,
    templateLabel: template.label,
    templateVariables: variables,
  };

  return {
    spec,
    template,
    variant,
    resolvedPromptHarness,
    variables,
  };
}

function validateVariables(
  template: ImageTemplate,
  variant: ImageTemplateVariant | undefined,
  variables: Record<string, string | number | boolean>,
): void {
  const requiredSlots = template.slots.required.map((slot) => slot.name);
  const missing = requiredSlots.filter((slot) => variables[slot] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required template variables: ${missing.join(", ")}`);
  }

  const denyList = new Set([
    ...(template.policies?.denyUserVariables ?? []),
    ...(variant?.policies?.denyUserVariables ?? []),
  ]);
  const forbidden = Object.keys(variables).filter((key) => denyList.has(key));
  if (forbidden.length > 0) {
    throw new Error(`Template variables are not allowed: ${forbidden.join(", ")}`);
  }
}
