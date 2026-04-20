# Contributing

Contributions are welcome — bug reports, feature requests, and pull requests.

## Reporting issues

Open an issue describing:
- What you expected to happen
- What actually happened
- Your workflow file and relevant inputs (redact any secrets)

## Pull requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test locally (see below)
4. Open a pull request with a clear description

## Local development

```bash
# Install root dependencies
npm install

# Install default UI dependencies
npm install --prefix default-ui

# Generate data from a local marketplace.json
GITHUB_WORKSPACE=/path/to/your/repo \
MARKETPLACE_INPUT=.github/plugin/marketplace.json \
MARKETPLACE_DIST_DIR=/tmp/amp-test/data \
node generator/generate.mjs

# Copy data and run the dev server
cp -r /tmp/amp-test/data/. default-ui/public/data/
npm run --prefix default-ui dev
```

## Project structure

| Path | Purpose |
| --- | --- |
| `action.yml` | Composite GitHub Action entry point |
| `generator/generate-marketplace.mjs` | Scans plugin dirs → `marketplace.json` |
| `generator/generate.mjs` | `marketplace.json` → static JSON data files |
| `generator/git-dates.mjs` | Git-based last-modified date helper |
| `default-ui/` | Astro + Starlight plugin browser site |
| `test/fixtures/` | Sample data for local testing |
