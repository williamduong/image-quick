# image-quick

CLI three-layer image workflow:

1. Pull open-licensed assets.
2. Make safe, non-destructive edits.
3. Generate new images from an AI prompt harness.

## Why this stack

- Layer 1:
  - `Openverse` for open-licensed images.
  - `Iconify` for open-source icon sets with collection license metadata.
- Layer 2:
  - `sharp` / `libvips` for fast in-process image transforms.
  - Optional `rembg` bridge for background removal.
  - Optional `ImageMagick` bridge for classic CLI-heavy edits and effects.
- Layer 3:
  - OpenAI Images API adapter with a reusable prompt harness.

This repo keeps a metadata sidecar next to downloaded or generated files so license and prompt context do not get lost.

## Install

```bash
npm install
cp .env.example .env
```

Set `OPENAI_API_KEY` only if you want layer 3.

Optional local tools for layer 2:

- ImageMagick: `magick`
- rembg: `rembg`

Check availability:

```bash
npm run doctor
```

## Layer 1: pull free-license assets

Search openly licensed images:

```bash
npx tsx src/cli.ts search openverse --query "cat" --limit 5
```

Download one result:

```bash
npx tsx src/cli.ts fetch openverse --id 1c5442f6-6bb6-4ab7-b603-f598e7579dd2 --out out/openverse-cat.jpg
```

Search icons:

```bash
npx tsx src/cli.ts search iconify --query "mail" --limit 10
```

Download an icon as SVG or PNG:

```bash
npx tsx src/cli.ts fetch iconify --icon lucide:mail --out out/mail.svg
npx tsx src/cli.ts fetch iconify --icon lucide:mail --out out/mail.png
```

Notes:

- Openverse is filtered to `CC BY`, `CC BY-SA`, `CC0`, and `PDM`.
- Iconify collections are open source, but licenses vary by icon set. The tool stores the collection license in `*.license.json`.
- You should still review the final license metadata before publishing commercially sensitive work.

## Layer 2: edit assets

Run a basic poster edit:

```bash
npx tsx src/cli.ts edit --spec examples/edit.sample.json
```

Add an icon overlay:

```bash
npx tsx src/cli.ts edit --spec examples/edit.with-icon.sample.json
```

Remove background with `rembg`:

```bash
npx tsx src/cli.ts edit --spec examples/edit.rembg.sample.json
```

Call raw ImageMagick:

```bash
npx tsx src/cli.ts edit --spec examples/edit.imagemagick.sample.json
```

Supported built-in operations:

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

For `imagemagick`, use `{{input}}` and `{{output}}` placeholders in the `args` array.

## Layer 3: generate images with a prompt harness

```bash
npx tsx src/cli.ts generate --spec examples/generate.sample.json
```

The harness supports:

- `prompt` or `promptTemplate`
- `variables`
- structured `fragments` such as `subject`, `style`, `composition`, `constraints`, and `negative`

The tool stores a `*.prompt.json` sidecar with the final compiled prompt and request payload.

## Suggested production shape

If you want to turn this into a full product, the next practical step is:

1. Wrap the CLI in a small API service.
2. Store asset metadata in SQLite or Postgres.
3. Add job queues for heavy edit/generation steps.
4. Add moderation, upload, and template libraries.

## References

- Openverse: https://openverse.org/
- Openverse API: https://api.openverse.org/
- Iconify API: https://iconify.design/docs/api/
- ImageMagick CLI: https://imagemagick.org/command-line-options/
- rembg: https://github.com/danielgatis/rembg
- OpenAI image generation: https://developers.openai.com/api/docs/guides/image-generation
