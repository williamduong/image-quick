# image-quick

This repository is the development workspace for the `image-quick` CLI.

If you want the end-user install and usage guide that ships to npm, read [publish/npm/README.md](publish/npm/README.md).

License: MIT. See [LICENSE](LICENSE).

## Dev vs Release Surfaces

The project intentionally keeps two separate surfaces:

- Dev surface in this repo:
  - source code
  - smoke tests
  - release tooling
  - maintainer docs
- Release surface in `.release/npm/`:
  - compiled CLI
  - bundled templates and examples
  - npm-facing README for end users
  - publish-ready package manifest

The root package is marked `private` so accidental `npm publish` from the repo root is blocked.

## Setup From Git

```bash
npm install
npm run build
npm run smoke
```

Optional local dependency check:

```bash
npm run doctor
```

Run the CLI from source during development:

```bash
npm run dev -- doctor
npm run dev -- template list
npm run dev -- provider list
```

## Development Docs

- Developer guide: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Release notes: [publish/README.md](publish/README.md)
- Release checklist: [publish/RELEASE_CHECKLIST.md](publish/RELEASE_CHECKLIST.md)
- npm README source: [publish/npm/README.md](publish/npm/README.md)

## Project Layout

- `src/` - TypeScript CLI sources
- `templates/` - generation templates and variants
- `examples/` - example specs and variables
- `scripts/` - smoke tests and release helpers
- `publish/` - maintainer-facing publish docs and npm README source
- `.release/npm/` - generated staging package, ignored by git

## Release Flow

Prepare the staged npm package:

```bash
npm run release:prepare
```

Validate the staged package:

```bash
npm run release:pack
npm run release:check
```

Publish from the staged package only:

```bash
npm run release:publish
```

Or inspect and publish manually:

```bash
cd .release/npm
npm publish --access public
```
