# Publish Notes

This folder is for npm-release preparation files.

These notes are now shipped inside the npm package so users can inspect release guidance after install.

Suggested workflow:

1. Run `npm run build`
2. Run `npm run smoke`
3. Run `npm publish --dry-run`
4. Check [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
5. Run `npm publish`

Short checklist:

- `npm run publish:check`
- confirm the tarball contents look correct
- confirm the npm account and package version are the intended ones
- publish

Useful commands:

```bash
npm run build
npm run smoke
npm pack --dry-run
npm publish --dry-run
npm run publish:check
npm publish
```
