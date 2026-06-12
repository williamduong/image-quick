# image-quick

`image-quick` is a TypeScript CLI for a three-layer image workflow:

1. Pull open-license assets such as photos and icons.
2. Make light, repeatable edits through a JSON pipeline.
3. Generate original images from an AI prompt harness.

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
  - OpenAI Images API requests built from a reusable prompt harness

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
  - `OPENAI_API_KEY`

## Setup

Install dependencies:

```bash
npm install
```

Create local environment configuration:

```bash
cp .env.example .env
```

Check that optional tools are available:

```bash
npm run doctor
```

## Project layout

- [src/cli.ts](src/cli.ts) - CLI entrypoint
- [src/providers](src/providers) - layer 1 source adapters
- [src/layer2](src/layer2) - edit pipeline
- [src/layer3](src/layer3) - prompt harness and image generation
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
