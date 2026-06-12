import type {
  GenerateBackground,
  GenerateModeration,
  GenerateQuality,
  GenerationTier,
} from "./tiers.js";

export const IMAGE_PROVIDERS = [
  "openai",
  "google-gemini",
  "fal",
  "stability",
  "replicate",
] as const;

export type ImageProviderId = (typeof IMAGE_PROVIDERS)[number];
export type ImplementedImageProviderId = "openai" | "google-gemini";
export type CommercialTier = "budget" | "midrange" | "premium";
export type ProviderAdapter = "openai-images" | "google-gemini-image" | "registry-only";

export interface ProviderDefinition {
  id: ImageProviderId;
  label: string;
  apiKeyEnv: string;
  docsUrl: string;
  status: "implemented" | "registry-only";
  description: string;
}

export interface ProviderModelDefinition {
  id: string;
  provider: ImageProviderId;
  label: string;
  commercialTier: CommercialTier;
  defaultTier: Exclude<GenerationTier, "asset-only">;
  adapter: ProviderAdapter;
  recommendedQuality: GenerateQuality;
  preferredSize: string;
  maxNativeSize?: string;
  background?: GenerateBackground;
  moderation?: GenerateModeration;
  notes?: string[];
}

export interface ResolvedModelSelection {
  provider: ProviderDefinition;
  model: ProviderModelDefinition;
}

const providers: ProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    docsUrl: "https://developers.openai.com/api/docs/guides/image-generation",
    status: "implemented",
    description: "GPT Image models for controllable generation and editing.",
  },
  {
    id: "google-gemini",
    label: "Google Gemini",
    apiKeyEnv: "GOOGLE_API_KEY",
    docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    status: "implemented",
    description: "Gemini image-generation models optimized from high-volume output to professional asset production.",
  },
  {
    id: "fal",
    label: "fal",
    apiKeyEnv: "FAL_KEY",
    docsUrl: "https://fal.ai/docs/model-api-reference/image-generation-api/overview",
    status: "registry-only",
    description: "Hosted media-model platform with FLUX and other production image endpoints.",
  },
  {
    id: "stability",
    label: "Stability AI",
    apiKeyEnv: "STABILITY_API_KEY",
    docsUrl: "https://platform.stability.ai/docs/api-reference",
    status: "registry-only",
    description: "Stable Image API family balancing affordable and premium text-to-image output.",
  },
  {
    id: "replicate",
    label: "Replicate",
    apiKeyEnv: "REPLICATE_API_TOKEN",
    docsUrl: "https://replicate.com/docs/topics/models/official-models",
    status: "registry-only",
    description: "Marketplace-style model API with official image models and predictable pricing.",
  },
];

const models: ProviderModelDefinition[] = [
  {
    id: "gpt-image-1-mini",
    provider: "openai",
    label: "GPT Image 1 Mini",
    commercialTier: "budget",
    defaultTier: "ai-mini",
    adapter: "openai-images",
    recommendedQuality: "low",
    preferredSize: "1024x1024",
    maxNativeSize: "1536x1024",
    background: "opaque",
    moderation: "auto",
    notes: [
      "Cost-efficient OpenAI image model suited to high-volume generation.",
    ],
  },
  {
    id: "gpt-image-1.5",
    provider: "openai",
    label: "GPT Image 1.5",
    commercialTier: "midrange",
    defaultTier: "ai-standard",
    adapter: "openai-images",
    recommendedQuality: "medium",
    preferredSize: "1024x1024",
    maxNativeSize: "1536x1024",
    background: "opaque",
    moderation: "auto",
    notes: [
      "Previous OpenAI image model with better prompt adherence than GPT Image 1 Mini.",
    ],
  },
  {
    id: "gpt-image-2",
    provider: "openai",
    label: "GPT Image 2",
    commercialTier: "premium",
    defaultTier: "ai-premium",
    adapter: "openai-images",
    recommendedQuality: "high",
    preferredSize: "1536x1536",
    maxNativeSize: "3840x2160",
    background: "opaque",
    moderation: "auto",
    notes: [
      "State-of-the-art OpenAI image model with flexible resolutions.",
    ],
  },
  {
    id: "gemini-2.5-flash-image",
    provider: "google-gemini",
    label: "Gemini 2.5 Flash Image",
    commercialTier: "budget",
    defaultTier: "ai-mini",
    adapter: "google-gemini-image",
    recommendedQuality: "low",
    preferredSize: "1024x1024",
    maxNativeSize: "1024x1024",
    notes: [
      "High-volume, low-latency Google image generation path.",
    ],
  },
  {
    id: "gemini-3.1-flash-image",
    provider: "google-gemini",
    label: "Gemini 3.1 Flash Image",
    commercialTier: "midrange",
    defaultTier: "ai-standard",
    adapter: "google-gemini-image",
    recommendedQuality: "medium",
    preferredSize: "2048x2048",
    maxNativeSize: "2048x2048",
    notes: [
      "High-efficiency counterpart to Gemini 3 Pro Image, optimized for speed and high-volume use.",
    ],
  },
  {
    id: "gemini-3-pro-image",
    provider: "google-gemini",
    label: "Gemini 3 Pro Image",
    commercialTier: "premium",
    defaultTier: "ai-premium",
    adapter: "google-gemini-image",
    recommendedQuality: "high",
    preferredSize: "2048x2048",
    maxNativeSize: "4096x4096",
    notes: [
      "Professional Google image model for complex instructions, high-fidelity text, and up to 4K output.",
    ],
  },
  {
    id: "fal-ai/flux/schnell",
    provider: "fal",
    label: "FLUX Schnell",
    commercialTier: "budget",
    defaultTier: "ai-mini",
    adapter: "registry-only",
    recommendedQuality: "low",
    preferredSize: "1024x1024",
    notes: [
      "Fast FLUX endpoint on fal for inexpensive text-to-image generation.",
    ],
  },
  {
    id: "fal-ai/flux/dev",
    provider: "fal",
    label: "FLUX Dev",
    commercialTier: "midrange",
    defaultTier: "ai-standard",
    adapter: "registry-only",
    recommendedQuality: "medium",
    preferredSize: "1024x1024",
  },
  {
    id: "fal-ai/flux-pro/v1.1",
    provider: "fal",
    label: "FLUX Pro 1.1",
    commercialTier: "premium",
    defaultTier: "ai-premium",
    adapter: "registry-only",
    recommendedQuality: "high",
    preferredSize: "2048x2048",
  },
  {
    id: "stable-image/core",
    provider: "stability",
    label: "Stable Image Core",
    commercialTier: "budget",
    defaultTier: "ai-mini",
    adapter: "registry-only",
    recommendedQuality: "low",
    preferredSize: "1024x1024",
  },
  {
    id: "stable-image/sd3.5-medium",
    provider: "stability",
    label: "Stable Diffusion 3.5 Medium",
    commercialTier: "midrange",
    defaultTier: "ai-standard",
    adapter: "registry-only",
    recommendedQuality: "medium",
    preferredSize: "1024x1024",
  },
  {
    id: "stable-image/ultra",
    provider: "stability",
    label: "Stable Image Ultra",
    commercialTier: "premium",
    defaultTier: "ai-premium",
    adapter: "registry-only",
    recommendedQuality: "high",
    preferredSize: "2048x2048",
  },
  {
    id: "black-forest-labs/flux-1.1-pro",
    provider: "replicate",
    label: "FLUX 1.1 Pro",
    commercialTier: "premium",
    defaultTier: "ai-premium",
    adapter: "registry-only",
    recommendedQuality: "high",
    preferredSize: "1024x1024",
  },
  {
    id: "google/imagen-4-ultra",
    provider: "replicate",
    label: "Imagen 4 Ultra",
    commercialTier: "premium",
    defaultTier: "ai-premium",
    adapter: "registry-only",
    recommendedQuality: "high",
    preferredSize: "2048x2048",
  },
  {
    id: "ideogram-ai/ideogram-v3-turbo",
    provider: "replicate",
    label: "Ideogram V3 Turbo",
    commercialTier: "midrange",
    defaultTier: "ai-standard",
    adapter: "registry-only",
    recommendedQuality: "medium",
    preferredSize: "1024x1024",
  },
];

export function listImageProviders(): ProviderDefinition[] {
  return [...providers];
}

export function listRegisteredModels(): ProviderModelDefinition[] {
  return [...models];
}

export function isImageProvider(value: string): value is ImageProviderId {
  return IMAGE_PROVIDERS.includes(value as ImageProviderId);
}

export function getProviderDefinition(providerId: ImageProviderId): ProviderDefinition {
  const provider = providers.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

export function getModelDefinition(modelId: string): ProviderModelDefinition {
  const model = models.find((entry) => entry.id === modelId);
  if (!model) {
    throw new Error(`Unknown image model: ${modelId}`);
  }

  return model;
}

export function resolveModelSelection(input: {
  provider?: ImageProviderId;
  model?: string;
  tier?: Exclude<GenerationTier, "asset-only">;
}): ResolvedModelSelection {
  if (input.model) {
    const model = getModelDefinition(input.model);
    if (input.provider && model.provider !== input.provider) {
      throw new Error(
        `Model ${input.model} belongs to provider ${model.provider}, not ${input.provider}`,
      );
    }

    return {
      provider: getProviderDefinition(model.provider),
      model,
    };
  }

  const providerId = input.provider ?? "openai";
  const tier = input.tier ?? "ai-standard";
  const model = models.find((entry) =>
    entry.provider === providerId && entry.defaultTier === tier
  );
  if (!model) {
    throw new Error(`No default model registered for ${providerId} at tier ${tier}`);
  }

  return {
    provider: getProviderDefinition(providerId),
    model,
  };
}

export function getProviderApiKey(providerId: ImageProviderId): string | undefined {
  const provider = getProviderDefinition(providerId);
  const value = process.env[provider.apiKeyEnv];
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
