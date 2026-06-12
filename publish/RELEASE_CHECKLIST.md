# Release Checklist

- Confirm `README.md` matches the current CLI behavior.
- Confirm `.env.example` only contains non-secret placeholders.
- Run `npm run build`.
- Run `npm run smoke`.
- Run `npm publish --dry-run`.
- Verify the package includes the intended shipped folders: `dist/`, `templates/`, `examples/`, `publish/`, plus `README.md` and `LICENSE`.
- Run a smoke test with:
  - `image-quick doctor`
  - `image-quick template list`
  - `image-quick generate --template catalog-product-photo --tier asset-only ...`
- Check that `bin.image-quick` points to `dist/cli.js`.
- Check `package.json` version, repository, homepage, license, and keywords.
- Confirm the auto-generated filename format is still the intended convention.
- Confirm publish examples do not depend on non-shipped local files.
- Publish with the intended npm account.
