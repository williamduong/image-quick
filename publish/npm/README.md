# image-quick

Production-friendly CLI for sourcing, editing, composing, and generating images.

License: MIT.

## Getting Started

Install globally:

```bash
npm install -g image-quick
image-quick doctor
image-quick template list
```

Set an API key only if you want AI generation:

```bash
image-quick auth set openai
image-quick auth doctor
```

`image-quick` stores local provider keys in your user config directory and prefers that store over environment variables.

## Choose a Tier

- `asset-only`: no AI key required, uses fetch + edit pipeline
- `ai-mini`: cheaper AI generation
- `ai-standard`: balanced quality/cost
- `ai-premium`: strongest available tier

## Common Flows

Generate a simple product image:

```bash
image-quick generate \
  --template product-image \
  --variant ecommerce \
  --var productName="Air Bottle" \
  --var keyBenefit="keeps water cold for 24 hours"
```

Create a catalog-style product photo without AI:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier asset-only \
  --asset-url https://example.com/product-packshot.png \
  --var productName="Sample Product" \
  --var category="Retail" \
  --var productType="Packaging"
```

Create a catalog-style product photo with AI:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier ai-standard \
  --provider openai \
  --var productName="Sample Product" \
  --var category="Retail" \
  --var productType="Packaging"
```

Polish a real product reference with AI:

```bash
image-quick generate \
  --template catalog-product-photo \
  --tier ai-standard \
  --provider openai \
  --reference-image ./product-cutout.png \
  --input-fidelity high \
  --var productName="Sample Product" \
  --var category="Retail" \
  --var productType="Packaging"
```

Run QA on a generated product photo:

```bash
image-quick qa catalog-product-photo --image ./catalog-product-photo.png
```

Auto-fix framing or white-background issues:

```bash
image-quick qa catalog-product-photo \
  --image ./catalog-product-photo.png \
  --auto-fix \
  --include-warn \
  --fixed-out ./catalog-product-photo-fixed.png
```

Compose a layered graphic from your own JSON spec:

```bash
image-quick compose --spec ./banner.compose.json
```

Edit one image from a remote URL:

```bash
image-quick edit --spec ./product.edit.json --input-url https://example.com/source.png
```

## Output Behavior

Output location resolves in this order:

1. `--out`
2. saved `image-quick settings set output-dir ...`
3. `IMAGE_QUICK_OUTPUT_DIR`
4. your current working directory

Set a persistent default output directory:

```bash
image-quick settings set output-dir ./generated-images
image-quick settings show
```

## Providers

Implemented for generation today:

- `openai`
- `google-gemini`

Already in the provider registry for future expansion:

- `fal`
- `stability`
- `replicate`

Inspect what your local install sees:

```bash
image-quick provider list
image-quick auth doctor
```

## Optional Tools

These are optional but useful for edit-heavy workflows:

- ImageMagick
- `rembg`

If they are missing, check:

```bash
image-quick doctor
```

## More

- Templates: `image-quick template list`
- Template details: `image-quick template show catalog-product-photo`
- Source registry: `image-quick source list`
- GitHub repo and dev docs: https://github.com/williamduong/image-quick
