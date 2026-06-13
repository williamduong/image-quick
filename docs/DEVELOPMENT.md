# Development Guide

This document is for people working from the git repo rather than installing `image-quick` from npm.

License for both the repo workspace and the published package: MIT.

## Mindset

The repo has two intentionally different surfaces:

- Dev surface:
  - source code
  - test and smoke scripts
  - release tooling
  - architecture and maintenance docs
- Release surface:
  - compiled CLI in `dist/`
  - bundled templates and examples
  - short npm README for end users
  - no repo-internal setup or release instructions

The root package is a private development workspace. The publishable npm package is staged into `.release/npm/`.

## Local Setup

```bash
npm install
npm run build
npm run smoke
```

Check local optional tooling:

```bash
npm run doctor
```

Run the CLI against source during development:

```bash
npm run dev -- doctor
npm run dev -- template list
npm run dev -- generate --template product-image --variant ecommerce --var productName="Air Bottle"
```

## Repo Layout

- `src/` - TypeScript sources
- `src/providers/` - source adapters for open-license assets
- `src/layer2/` - edit and composition pipelines
- `src/layer3/` - provider registry, prompt harness, and generation
- `templates/` - committed template definitions and variants
- `examples/` - sample JSON specs and variable files
- `scripts/` - smoke tests and release helpers
- `publish/` - maintainer-facing release docs and npm README source
- `.release/npm/` - generated staging package, ignored by git

## Release Flow

Build the staged npm package:

```bash
npm run release:prepare
```

Validate the staged package end-to-end:

```bash
npm run release:pack
npm run release:check
```

Publish from the staged package only:

```bash
npm run release:publish
```

Or publish manually after inspection:

```bash
cd .release/npm
npm publish --access public
```

## Release Docs

- End-user npm README source: [../publish/npm/README.md](../publish/npm/README.md)
- Maintainer release notes: [../publish/README.md](../publish/README.md)
- Release checklist: [../publish/RELEASE_CHECKLIST.md](../publish/RELEASE_CHECKLIST.md)

## Cross-Platform Notes

- Windows can use `IMAGE_QUICK_MAGICK_COMMAND` and `IMAGE_QUICK_REMBG_COMMAND` if tools are not on `PATH`.
- macOS and Linux try `magick` first and fall back to `convert` for ImageMagick.
- Local auth and settings live under the user home directory, not inside the repo.
