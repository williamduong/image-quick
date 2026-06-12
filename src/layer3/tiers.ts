import {
  resolveModelSelection,
  type ImageProviderId,
  type ProviderModelDefinition,
} from "./modelRegistry.js";

export const GENERATION_TIERS = [
  "asset-only",
  "ai-mini",
  "ai-standard",
  "ai-premium",
] as const;

export type GenerationTier = (typeof GENERATION_TIERS)[number];
export type AiGenerationTier = Exclude<GenerationTier, "asset-only">;
export type GenerateProvider = ImageProviderId;
export type GenerateQuality = "low" | "medium" | "high" | "auto";
export type GenerateBackground = "transparent" | "opaque";
export type GenerateModeration = "auto" | "low";

export interface TierDefaults {
  provider?: GenerateProvider;
  model?: string;
  size?: string;
  quality?: GenerateQuality;
  background?: GenerateBackground;
  outputCompression?: number;
  moderation?: GenerateModeration;
  n?: number;
}

export interface ResolvedAiTierPlan {
  tier: AiGenerationTier;
  provider: ImageProviderId;
  model: string;
  modelDefinition: ProviderModelDefinition;
  quality: GenerateQuality;
  nativeSize: string;
  requestedSize?: string;
  requiresUpscale: boolean;
}

const OPENAI_LEGACY_SIZES = new Set([
  "1024x1024",
  "1536x1024",
  "1024x1536",
]);

export function isGenerationTier(value: string): value is GenerationTier {
  return GENERATION_TIERS.includes(value as GenerationTier);
}

export function resolveAiTierPlan(input: {
  tier: AiGenerationTier;
  provider?: ImageProviderId;
  model?: string;
  size?: string;
  quality?: GenerateQuality;
}): ResolvedAiTierPlan {
  const selection = resolveModelSelection({
    provider: input.provider,
    model: input.model,
    tier: input.tier,
  });
  const nativeSize = resolveNativeSizeForModel(selection.model, input.size);
  const requestedSize = input.size?.trim() || nativeSize;

  return {
    tier: input.tier,
    provider: selection.provider.id,
    model: selection.model.id,
    modelDefinition: selection.model,
    quality: input.quality ?? selection.model.recommendedQuality,
    nativeSize,
    requestedSize,
    requiresUpscale: nativeSize !== requestedSize,
  };
}

export function parseImageSize(
  value: string | undefined,
): { width: number; height: number } | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) {
    return undefined;
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function resolveNativeSizeForModel(
  model: ProviderModelDefinition,
  requestedSize?: string,
): string {
  const normalizedRequested = requestedSize?.trim();
  if (!normalizedRequested) {
    return model.preferredSize;
  }

  if (model.provider === "openai") {
    return resolveOpenAiNativeSize(model, normalizedRequested);
  }

  if (model.provider === "google-gemini") {
    return resolveGoogleNativeSize(model, normalizedRequested);
  }

  return model.preferredSize;
}

function resolveOpenAiNativeSize(
  model: ProviderModelDefinition,
  requestedSize: string,
): string {
  if (model.id === "gpt-image-2") {
    return requestedSize;
  }

  if (OPENAI_LEGACY_SIZES.has(requestedSize)) {
    return requestedSize;
  }

  const parsed = parseImageSize(requestedSize);
  if (!parsed) {
    return "1024x1024";
  }

  if (parsed.width === parsed.height) {
    return "1024x1024";
  }

  return parsed.width > parsed.height ? "1536x1024" : "1024x1536";
}

function resolveGoogleNativeSize(
  model: ProviderModelDefinition,
  requestedSize: string,
): string {
  if (model.id === "gemini-2.5-flash-image") {
    return "1024x1024";
  }

  const parsed = parseImageSize(requestedSize);
  if (!parsed) {
    return "2048x2048";
  }

  const square = parsed.width === parsed.height;
  if (square) {
    return parsed.width > 2048 || parsed.height > 2048
      ? "2048x2048"
      : "1024x1024";
  }

  const landscape = parsed.width > parsed.height;
  const ratio = landscape ? parsed.width / parsed.height : parsed.height / parsed.width;
  if (ratio >= 1.7) {
    return landscape ? "2048x1152" : "1152x2048";
  }

  return landscape ? "1536x1152" : "1152x1536";
}
