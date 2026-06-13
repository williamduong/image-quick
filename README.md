# image-quick

`image-quick` is a TypeScript CLI for a tiered image workflow:

1. Pull open-license assets such as photos and icons.
2. Make light, repeatable edits through a JSON pipeline.
3. Compose production graphics from multiple transparent layers.
4. Generate with cheaper or stronger AI tiers from the same template.

The goal is to keep one practical toolchain for sourcing, adapting, and generating visuals without losing license metadata or prompt history.

## What it does

- Layer 1 pulls:
  - Openverse images filtered to `CC BY`, `CC BY-SA`, `CC0`, and `PDM`
  - Iconify icons with collection-level license metadata
- Layer 2 edits:
  - Fast in-process transforms with `sharp` / `libvips`
  - Optional background removal through `rembg`
  - Optional escape hatch into raw `ImageMagick`
- Layer 2.5 composes:
  - Multi-layer canvas assembly for banners, product cards, and infographics
  - Transparent cutout layers over a fixed background
  - Text, shape, and image layers in one spec
- Layer 3 generates:
  - Provider/model selection from a hardcoded registry in code
  - OpenAI and Google Gemini adapters wired into the CLI today
  - Tier routing: `asset-only`, `ai-mini`, `ai-standard`, `ai-premium`

Every fetched, edited, or generated file gets a sidecar JSON file so provenance is preserved:

- `*.license.json`
- `*.edit.json`
- `*.prompt.json`
- `*.qa.json` when you run quality checks
- `*.autofix.json` when you run auto-fix

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

Cross-platform install notes:

- Windows:
  - install Node.js 22+
  - install ImageMagick so `magick.exe` is available, or set `IMAGE_QUICK_MAGICK_COMMAND`
  - install `rembg` and ensure `rembg.exe` is on `PATH`, or set `IMAGE_QUICK_REMBG_COMMAND`
- macOS:
  - install Node.js 22+
  - install ImageMagick with Homebrew
  - install `rembg` with `pipx` or Python `pip`
- Linux:
  - install Node.js 22+
  - install ImageMagick from your distro package manager
  - install `rembg` with `pipx` or Python `pip`

On macOS and Linux, `image-quick` will try `magick` first and fall back to `convert` when that is the only ImageMagick binary on the machine.

If installed from npm, the intended CLI flow is:

```bash
npm install -g image-quick
image-quick doctor
```

For local provider-key storage without relying on `.env`, you can use:

```bash
image-quick auth set openai
image-quick auth doctor
```

This stores keys in the user config directory, for example `~/.image-quick/auth.json` on macOS/Linux or `%USERPROFILE%\\.image-quick\\auth.json` on Windows.

## Quick Start

Installed globally from npm:

```bash
image-quick doctor
image-quick auth doctor
image-quick template list
image-quick provider list
image-quick source list
```

If your goal is industrial-style visual production rather than one-off art, use this rule of thumb:

- use `search` / `fetch` when you need free licensed source material
- use `edit` when you already have one main image and need repeatable cleanup
- use `compose` when the visual should be built from multiple layers
- use `generate` when you want AI to create a new asset or a productized template output
- use `qa` when you need automatic catalog-style quality checks before publishing

Generate from a bundled template:

```bash
image-quick generate \
  --template product-image \
  --variant ecommerce \
  --var productName="Air Bottle" \
  --var keyBenefit="keeps water cold for 24 hours"
```

Asset-only workflow with no AI key:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier asset-only \
  --input examples/catalog-product-photo.variables.json
```

Layered industrial graphic workflow:

```bash
image-quick compose --spec examples/compose.banner.sample.json
```

By default, template-based generation writes images into the directory where you run the command unless you pass `--out` explicitly. You can also override the default directory with `IMAGE_QUICK_OUTPUT_DIR`.

For a persistent machine-level default output directory, use:

```bash
image-quick settings set output-dir ./my-default-output
image-quick settings show
```

If no setting is saved and no `IMAGE_QUICK_OUTPUT_DIR` env var is set, the CLI writes the generated file directly into your current working directory.

Output resolution order:

- `--out` for one specific run
- saved `settings output-dir`
- `IMAGE_QUICK_OUTPUT_DIR`
- current working directory

Provider API key resolution order:

- local `image-quick auth set <provider>` store in the user config directory
- environment variables such as `OPENAI_API_KEY`

The local auth store is safer than keeping secrets in the project tree, but it is still a plain local file rather than an encrypted system vault.

Create local environment configuration:

```bash
cp .env.example .env
```

Windows PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

Store one provider key in the local user config directory:

```bash
image-quick auth set openai
image-quick auth set google-gemini
image-quick auth doctor
```

Clear one stored provider key:

```bash
image-quick auth clear openai
```

Check that optional tools are available:

```bash
npm run doctor
```

Inspect the provider and model registry that the CLI uses:

```bash
npx tsx src/cli.ts provider list
npx tsx src/cli.ts model list
npx tsx src/cli.ts source list
```

The same commands after global install are:

```bash
image-quick provider list
image-quick model list
image-quick auth doctor
image-quick settings show
image-quick source list
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

## Industrial Use Cases

These are the most practical patterns for bulk or operational image work.

### 1. Supermarket / Ecommerce Product Photos

Use this when you need one product on a clean background, consistent across many SKUs.

No AI:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier asset-only \
  --input examples/catalog-product-photo.variables.json
```

Cheaper AI:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier ai-mini \
  --provider openai \
  --input examples/catalog-product-photo.variables.json
```

Direct remote product source:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier asset-only \
  --asset-url https://example.com/product-packshot.png \
  --var productName="Sample Product" \
  --var category="Retail" \
  --var productType="Packaging"
```

When to use:

- product listings
- supermarket catalog pages
- marketplace packshots
- consistent retail cutouts

Quality check the result:

```bash
image-quick qa catalog-product-photo --image ./catalog-product-photo-ai-standard.png
```

Auto-fix white-background framing issues when the relevant QA checks fail:

```bash
image-quick qa catalog-product-photo \
  --image ./catalog-product-photo-ai-mini.png \
  --auto-fix \
  --fixed-out ./catalog-product-photo-ai-mini-autofix.png
```

If you also want to normalize warn-level framing issues, add `--include-warn`.

What the QA checks automatically:

- PNG output
- 2048x2048 square canvas
- sRGB-friendly color space
- opaque background
- white border cleanliness
- subject detection, scale, and safe margin
- sidecar metadata presence

What it does not fully prove:

- exact brand/logo correctness
- exact packaging text fidelity
- exact semantic SKU match from free-source search results
- legal review for trademarks
- whether the product is the real retail SKU without human review

What auto-fix currently targets:

- dirty or non-uniform white border area
- subject margins that are too tight for batch catalog use

What auto-fix currently does:

- trims the outer border with ImageMagick
- resizes the detected subject region into a 1536x1536 fit box
- centers it on a fresh 2048x2048 white canvas
- writes updated sidecars for the derived image

### 2. Layered Banner Production

Use this when the output should be assembled from background, cutout subject, badges, and text blocks.

```bash
image-quick compose --spec examples/compose.banner.sample.json
```

Typical layer stack:

- background color or background image
- transparent product / subject cutout
- badge or promo card
- headline and supporting text

When to use:

- homepage hero banners
- campaign banners
- product announcement graphics
- seasonal promo visuals

### 3. Infographics and Information Cards

Use this when the visual is mostly layout and hierarchy, not artistic generation.

```bash
image-quick compose --spec examples/compose.infographic.sample.json
```

Typical layer stack:

- neutral background
- main panel card
- icons and illustration accents
- text blocks
- labels, stats, and callouts

When to use:

- internal reports turned into social cards
- explainer graphics
- KPI cards
- feature comparison visuals

### 4. Reusable Product Marketing Visuals

Use this when you want a named template and fill content slots repeatedly.

```bash
image-quick generate \
  --template product-image \
  --variant ecommerce \
  --var productName="Air Bottle" \
  --var keyBenefit="keeps water cold for 24 hours" \
  --var productCategory="insulated bottle" \
  --var badgeText="New" \
  --var cta="Shop now"
```

When to use:

- PDP hero art
- campaign landing sections
- product tile visuals
- ad creative drafts

### 5. Social Posts and Thumbnails

Use templates when you need fast repeated output with small content changes.

```bash
image-quick generate \
  --template social-post \
  --var headline="New Store Opening" \
  --var campaignGoal="local launch awareness" \
  --var subheadline="District 7 this weekend" \
  --var cta="See details"
```

```bash
image-quick generate \
  --template thumbnail \
  --var title="How We Built A Layered Banner System" \
  --var hook="industrial image workflow"
```

When to use:

- recurring announcements
- YouTube thumbnails
- tutorial covers
- launch posts

### 6. Free Asset Sourcing Before Editing

Use this when you want to stay low-cost and only adapt licensed material.

Search photos:

```bash
image-quick search openverse --query "red apple isolated" --limit 5
```

Search icons:

```bash
image-quick search iconify --query "shopping cart" --limit 10
```

List source registry:

```bash
image-quick source list
```

When to use:

- low-budget workflows
- pre-AI source collection
- manual art direction
- asset library building

Search Openverse:

```bash
npx tsx src/cli.ts search openverse --query "cat" --limit 5
```

List built-in and recommended free asset sources:

```bash
npx tsx src/cli.ts source list
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

Good fit for:

- recolor one source image
- add headline/footer to one base image
- create a quick cutout poster from one asset

Compose a layered banner or infographic:

```bash
npx tsx src/cli.ts compose --spec examples/compose.banner.sample.json
```

Good fit for:

- banners
- product cards
- multi-block layouts
- industrial design outputs where each element should stay replaceable

Run an edit pipeline with a remote input image:

```bash
npx tsx src/cli.ts edit \
  --spec examples/edit.sample.json \
  --input-url https://example.com/image.jpg
```

Remote URL inputs currently accept `http` and `https` only.

Run a background-removal pipeline:

```bash
npx tsx src/cli.ts edit --spec examples/edit.rembg.sample.json
```

Run an ImageMagick-backed edit:

```bash
npx tsx src/cli.ts edit --spec examples/edit.imagemagick.sample.json
```

Run a layered infographic composition:

```bash
npx tsx src/cli.ts compose --spec examples/compose.infographic.sample.json
```

Generate an image from a prompt harness:

```bash
npx tsx src/cli.ts generate --spec examples/generate.sample.json
```

The equivalent global command is:

```bash
image-quick generate --spec examples/generate.sample.json
```

Good fit for:

- AI-first hero visuals
- prompt experiments
- custom generation jobs before turning them into templates

Use a cleaned local cutout as a reference image for AI polish:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier ai-standard \
  --reference-image ./my-product-cutout.png \
  --input-fidelity high \
  --var productName="Coca-Cola Original Taste 500ml Can" \
  --var category="Beverage" \
  --var productType="Soft Drink" \
  --var brand="Coca-Cola" \
  --var packaging="Aluminum Can" \
  --var primaryColor="Red"
```

This is the practical flow when:

- you already have a real product photo or cutout
- you want AI to polish it instead of inventing the product from scratch
- you need better control for branded packaging and trademark-sensitive visuals

Or use a remote reference image directly inside a spec:

```bash
image-quick generate --spec examples/generate.product-polish.sample.json
```

Run catalog QA on a finished packshot:

```bash
npx tsx src/cli.ts qa catalog-product-photo --image out/catalog-product-photo.png
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

Force asset-only mode to start from a direct external image URL:

```bash
npx tsx src/cli.ts generate \
  --template catalog-product-photo \
  --tier asset-only \
  --asset-url https://example.com/product.png \
  --var productName="Sample Product" \
  --var category="Retail" \
  --var productType="Packaging"
```

Pick a specific provider while keeping the same tier abstraction:

```bash
npx tsx src/cli.ts generate \
  --template catalog-product-photo \
  --tier ai-premium \
  --provider google-gemini \
  --input examples/catalog-product-photo.variables.json
```

If `--out` is omitted and no default output directory is configured, the CLI creates a timestamped filename directly in the directory where you are running the command, for example:

```text
product-image-ecommerce-1024x1024-20260613-013050123.png
```

If you saved a default output directory with `settings set output-dir`, the same auto-generated filename is written there instead. If you pass `--out`, that temporary path wins over everything else for that one command.

Default auto-naming convention:

- `template-type` first
- optional short descriptor from `variant` and/or `tier`
- optional image size token such as `1024x1024`
- timestamp at the end

Examples:

- `catalog-product-photo-ai-standard-2048x2048-20260613-013050123.png`
- `product-image-ecommerce-1024x1024-20260613-013050123.png`

## Asset Sources

Yes: when you run `search openverse`, `fetch openverse`, `search iconify`, or `fetch iconify`, the CLI is already using the integrated APIs for those sources.

Current source strategy:

- integrated API sources
  - `openverse` for free/open photos and illustrations
  - `iconify` for free/open icon sets
- curated manual sources
  - `wikimedia-commons`
  - `svg-repo`

Use this to inspect them:

```bash
image-quick source list
```

Why keep both:

- API-integrated sources are best for automation and agent workflows.
- Curated link sources are still useful when a human wants to browse visually, compare options, or manually verify licensing before download.

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

## Layered Compose

Use `compose --spec` when the output is operational design rather than one-piece art.

Typical pattern:

- background layer at the bottom
- one or more transparent product/object cutouts
- badge, card, or highlight layers
- text layers on top

Current compose layer types:

- `image`
- `text`
- `rect`

Each `image` layer can come from:

- `input` for a local file
- `inputUrl` for a remote file

And each image layer can reuse edit operations such as:

- `removeBackground`
- `resize`
- `rotate`
- `modulate`
- `tint`
- `blur`
- `sharpen`

This is the intended building block for future agent workflows that detect complex requirements and split them into reusable layers before assembling the final image.

Recommended industrial design pattern:

1. Prepare or fetch source assets.
2. Remove background on the subject layers that need transparency.
3. Build the final layout with `compose`.
4. Only use full AI generation for layers or final scenes that cannot be sourced or templated cheaply.

## Prompt harness

The generation spec supports:

- `prompt` or `promptTemplate`
- `variables`
- structured `fragments`
- optional `inputImages` / `inputImageUrls` for reference-image polishing

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

You can also pass `--asset-url` to bypass Openverse search completely and start from a direct remote image URL. In that case the tool keeps provenance metadata, but license information is marked as unknown and should be verified manually.
For safety, direct remote asset URLs currently accept `http` and `https` only.

Reference-image polish notes:

- `--reference-image` sends a local PNG, JPEG, or WebP as an edit/reference image for OpenAI
- `inputImageUrls` inside a spec can point to a remote image when you want a shipped example that works without local sample files
- this is best for branded products where exact logo and pack shape matter
- for OpenAI edit mode, the CLI currently uses `gpt-image-1-mini` or `gpt-image-1.5`; if you ask for an unsupported edit model, it falls back to `gpt-image-1.5`

Registry location:

- [src/layer3/modelRegistry.ts](src/layer3/modelRegistry.ts)

That file is the single place to maintain provider labels, API-key env names, model ids, and cheap/mid/premium defaults. `.env` is now only for secrets and local machine overrides.

## Product QA Workflow

For industrial product-image work, the intended loop is:

1. Generate or compose the packshot.
2. Run `qa catalog-product-photo` on the output.
3. If needed, rerun with `--auto-fix` for white-background framing cleanup.
4. Review remaining warnings for semantic or metadata gaps.
5. Only then publish or feed the asset into the next batch stage.

Recommended example cases from low to high:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier asset-only \
  --input examples/catalog-product-photo.variables.json

image-quick generate \
  --template catalog-product-photo \
  --tier ai-mini \
  --input examples/catalog-product-photo.chips.variables.json

image-quick generate \
  --template catalog-product-photo \
  --tier ai-standard \
  --input examples/catalog-product-photo.milk.variables.json

image-quick generate \
  --template catalog-product-photo \
  --tier ai-premium \
  --input examples/catalog-product-photo.soda.variables.json
```

Then check each output:

```bash
image-quick qa catalog-product-photo --image ./catalog-product-photo-asset-only.png
image-quick qa catalog-product-photo --image ./catalog-product-photo-ai-mini.png
image-quick qa catalog-product-photo --image ./catalog-product-photo-ai-standard.png
image-quick qa catalog-product-photo --image ./catalog-product-photo-ai-premium.png
```

And for warn/fail framing issues:

```bash
image-quick qa catalog-product-photo \
  --image ./catalog-product-photo-ai-mini.png \
  --auto-fix \
  --include-warn \
  --fixed-out ./catalog-product-photo-ai-mini-autofix.png
```

On Windows, if `magick` or `rembg` are installed but not on `PATH`, you can also point the CLI at them with:

- `IMAGE_QUICK_MAGICK_COMMAND`
- `IMAGE_QUICK_REMBG_COMMAND`

## Publish Prep

Local publish notes live in [publish/README.md](publish/README.md) and [publish/RELEASE_CHECKLIST.md](publish/RELEASE_CHECKLIST.md).

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
