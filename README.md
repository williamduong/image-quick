# image-quick

`image-quick` is a TypeScript CLI for a tiered image workflow:

1. Pull open-license assets such as photos and icons.
2. Make light, repeatable edits through a JSON pipeline.
3. Generate with cheaper or stronger AI tiers from the same template.

The goal is to keep one practical toolchain for sourcing, adapting, and generating visuals without losing license metadata or prompt history.

## What it does

- Layer 1 pulls:
  - Openverse images filtered to `CC BY`, `CC BY-SA`, `CC0`, and `PDM`
  - Iconify icons with collection-level license metadata
- Layer 2 edits:
  - Fast in-process transforms with `sharp` / `libvips`
  - Optional background removal through `rembg`
  - Optional escape hatch into raw `ImageMagick`
- Layer 3 generates:
  - Provider/model selection from a hardcoded registry in code
  - OpenAI and Google Gemini adapters wired into the CLI today
  - Tier routing: `asset-only`, `ai-mini`, `ai-standard`, `ai-premium`

Every fetched, edited, or generated file gets a sidecar JSON file so provenance is preserved:

- `*.license.json`
- `*.edit.json`
- `*.prompt.json`

## Requirements

- Node.js 22+
- npm 11+
- Optional for layer 2:
  - `magick` from ImageMagick
  - `rembg`
- Optional for layer 3:
  - Provider API keys such as `OPENAI_API_KEY` or `GOOGLE_API_KEY`

## Setup

Install dependencies:

```bash
npm install
```

If installed from npm, the intended CLI flow is:

```bash
npm install -g image-quick
image-quick doctor
```

By default, template-based generation writes images into `./out/` unless you pass `--out` explicitly. You can also override the base directory with `IMAGE_QUICK_OUTPUT_DIR`.

Create local environment configuration:

```bash
cp .env.example .env
```

Check that optional tools are available:

```bash
npm run doctor
```

Inspect the provider and model registry that the CLI uses:

```bash
npx tsx src/cli.ts provider list
npx tsx src/cli.ts model list
```

## Project layout

- [src/cli.ts](src/cli.ts) - CLI entrypoint
- [src/providers](src/providers) - layer 1 source adapters
- [src/layer2](src/layer2) - edit pipeline
- [src/layer3](src/layer3) - prompt harness and image generation
- [templates](templates) - committed generation templates and variants
- [examples](examples) - committed example specs
- `out/` - local generated outputs, ignored by git
- `sample/` - local scratch/demo workspace, ignored by git

## Commands

Search Openverse:

```bash
npx tsx src/cli.ts search openverse --query "cat" --limit 5
```

Fetch one Openverse asset:

```bash
npx tsx src/cli.ts fetch openverse --id 1c5442f6-6bb6-4ab7-b603-f598e7579dd2 --out out/openverse-cat.jpg
```

Search Iconify:

```bash
npx tsx src/cli.ts search iconify --query "mail" --limit 10
```

Fetch one icon:

```bash
npx tsx src/cli.ts fetch iconify --icon lucide:mail --out out/mail.png
```

Run an edit pipeline:

```bash
npx tsx src/cli.ts edit --spec examples/edit.sample.json
```

Run a background-removal pipeline:

```bash
npx tsx src/cli.ts edit --spec examples/edit.rembg.sample.json
```

Run an ImageMagick-backed edit:

```bash
npx tsx src/cli.ts edit --spec examples/edit.imagemagick.sample.json
```

Generate an image from a prompt harness:

```bash
npx tsx src/cli.ts generate --spec examples/generate.sample.json
```

List available templates:

```bash
npx tsx src/cli.ts template list
```

Inspect one template:

```bash
npx tsx src/cli.ts template show product-image
```

Generate from a named template:

```bash
npx tsx src/cli.ts generate \
  --template product-image \
  --variant ecommerce \
  --var productName="Air Bottle" \
  --var keyBenefit="keeps water cold for 24 hours" \
  --var productCategory="insulated bottle" \
  --var badgeText="New" \
  --var cta="Shop now"
```

Generate from the same template with a chosen quality/cost tier:

```bash
npx tsx src/cli.ts generate \
  --template catalog-product-photo \
  --tier asset-only \
  --input examples/catalog-product-photo.variables.json
```

```bash
npx tsx src/cli.ts generate \
  --template catalog-product-photo \
  --tier ai-mini \
  --input examples/catalog-product-photo.variables.json
```

Pick a specific provider while keeping the same tier abstraction:

```bash
npx tsx src/cli.ts generate \
  --template catalog-product-photo \
  --tier ai-premium \
  --provider google-gemini \
  --input examples/catalog-product-photo.variables.json
```

If `--out` is omitted, the CLI creates a timestamped filename under `out/`, for example:

```text
out/product-image-ecommerce-2026-06-12-130500123.png
```

## Edit pipeline

Built-in edit operations:

- `resize`
- `extract`
- `rotate`
- `extend`
- `flatten`
- `modulate`
- `tint`
- `blur`
- `sharpen`
- `flip`
- `flop`
- `grayscale`
- `composite`
- `text`
- `removeBackground`
- `imagemagick`

For `imagemagick`, use `{{input}}` and `{{output}}` placeholders inside the `args` array.

## Prompt harness

The generation spec supports:

- `prompt` or `promptTemplate`
- `variables`
- structured `fragments`

The template system adds a more production-friendly flow:

- `template` holds reusable visual rules and defaults
- `variant` adjusts a template for one channel or use case
- `tier` changes the rendering strategy without changing the business template
- runtime `--var key=value` fills content slots without exposing every low-level rule
- each run stores the resolved prompt and request payload in `*.prompt.json`
- bundled starter templates ship with the npm package so users can test immediately after install

Bundled starter templates:

- `logo`
- `icon`
- `product-image`
- `blog-image`
- `social-post`
- `thumbnail`
- `catalog-product-photo`

Tier behavior:

- `asset-only`: no API key required; fetches open-license assets and normalizes them through the edit pipeline
- `ai-mini`: cheapest AI path for the chosen provider
- `ai-standard`: mid-tier AI path for the chosen provider
- `ai-premium`: strongest AI path for the chosen provider

Current hardcoded registry:

- `openai`
  - `ai-mini` -> `gpt-image-1-mini`
  - `ai-standard` -> `gpt-image-1.5`
  - `ai-premium` -> `gpt-image-2`
- `google-gemini`
  - `ai-mini` -> `gemini-2.5-flash-image`
  - `ai-standard` -> `gemini-3.1-flash-image`
  - `ai-premium` -> `gemini-3-pro-image`
- `fal`
  - Registry only for now, with starter mappings such as `fal-ai/flux/schnell`, `fal-ai/flux/dev`, `fal-ai/flux-pro/v1.1`
- `stability`
  - Registry only for now, with starter mappings such as `stable-image/core`, `stable-image/sd3.5-medium`, `stable-image/ultra`
- `replicate`
  - Registry only for now, with starter mappings such as `black-forest-labs/flux-1.1-pro`, `google/imagen-4-ultra`, `ideogram-ai/ideogram-v3-turbo`

For deterministic asset-only runs in production, you can pass an `openverseId` variable to pin a specific source asset and skip search entirely.

Registry location:

- [src/layer3/modelRegistry.ts](src/layer3/modelRegistry.ts)

That file is the single place to maintain provider labels, API-key env names, model ids, and cheap/mid/premium defaults. `.env` is now only for secrets and local machine overrides.

On Windows, if `magick` or `rembg` are installed but not on `PATH`, you can also point the CLI at them with:

- `IMAGE_QUICK_MAGICK_COMMAND`
- `IMAGE_QUICK_REMBG_COMMAND`

Useful fragments include:

- `subject`
- `style`
- `composition`
- `lighting`
- `color`
- `background`
- `constraints`
- `negative`

## Git hygiene

This repo intentionally ignores local artifacts:

- `.env`
- `dist/`
- `node_modules/`
- `out/`
- `sample/`

That keeps generated assets, test runs, and secrets out of commits while the reusable specs remain in [examples](examples).

## Next steps

If you want to turn this into a fuller product, the natural next steps are:

1. Add a small API wrapper around the CLI.
2. Persist assets and metadata in SQLite or Postgres.
3. Queue heavy edit/generation work in background jobs.
4. Add moderation, upload targets, and reusable templates.

## References

- Openverse: https://openverse.org/
- Openverse API: https://api.openverse.org/
- Iconify API: https://iconify.design/docs/api/
- ImageMagick CLI: https://imagemagick.org/command-line-options/
- rembg: https://github.com/danielgatis/rembg
- OpenAI image generation: https://developers.openai.com/api/docs/guides/image-generation
- Google Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- fal image generation API: https://fal.ai/docs/model-api-reference/image-generation-api/overview
- Stability AI API: https://platform.stability.ai/docs/api-reference
- Replicate official models: https://replicate.com/docs/topics/models/official-models
