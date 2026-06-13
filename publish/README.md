# Publish Notes

This folder is for maintainers preparing the npm release.

The publishable package is staged into `.release/npm/`. The repo root is a private development workspace and should not be published directly.

Suggested workflow:

1. Run `npm run smoke`
2. Run `npm run release:prepare`
3. Run `npm run release:pack`
4. Run `npm run release:check`
5. Check [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
6. Publish from `.release/npm/` or run `npm run release:publish`

Short checklist:

- `npm run release:check`
- inspect `.release/npm/package.json`
- confirm `.release/npm/README.md` is the end-user-facing README
- confirm the npm account and package version are the intended ones
- publish from the staged package only

Useful commands:

```bash
npm run build
npm run smoke
npm run release:prepare
npm run release:pack
npm run release:check
npm run release:publish
```
