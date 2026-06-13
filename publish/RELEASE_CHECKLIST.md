# Release Checklist

- Confirm root `README.md` is still maintainer/dev-facing.
- Confirm `publish/npm/README.md` matches the end-user CLI behavior.
- Confirm `.env.example` only contains non-secret placeholders.
- Run `npm run smoke`.
- Run `npm run release:prepare`.
- Run `npm run release:pack`.
- Run `npm run release:check`.
- Verify `.release/npm/` includes the intended shipped files: `dist/`, `templates/`, `examples/`, `README.md`, `LICENSE`, and the staged `package.json`.
- Run a smoke test with:
  - `image-quick doctor`
  - `image-quick template list`
  - `image-quick generate --template catalog-product-photo --tier asset-only ...`
- Check that `.release/npm/package.json` has `bin.image-quick` pointing to `dist/cli.js`.
- Check that `.release/npm/package.json` has the intended version, repository, homepage, license, keywords, and publish config.
- Confirm the auto-generated filename format is still the intended convention.
- Confirm the npm README examples do not depend on repo-only files or source-only commands.
- Publish with the intended npm account from `.release/npm/`.
