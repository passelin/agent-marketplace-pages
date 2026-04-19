# Marketplace UI Generator

A reusable GitHub Action that generates and deploys a static plugin marketplace browser site to GitHub Pages for any GitHub Copilot CLI plugin marketplace repository.

## How it works

The action runs a two-step pipeline:

1. **Generate data** — reads `marketplace.json` and produces optimized JSON files (plugins, categories, search index, manifest)
2. **Build & deploy** — builds an Astro + Starlight site from those files and pushes it to the `gh-pages` branch

`marketplace.json` is the source of truth that GitHub Copilot CLI reads to discover plugins. It must be committed to your repository's default branch.

---

## Recommended setup: two workflows

### Workflow 1 — Keep `marketplace.json` up to date

Runs whenever plugin files change on main. Generates `marketplace.json` from your plugin directory structure and commits it back to the repo so Copilot can always read it.

```yaml
# .github/workflows/update-marketplace.yml
name: Update marketplace.json

on:
  push:
    branches: [main]
    paths:
      - 'plugins/**'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: your-org/marketplace-ui-generator@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          plugin-root: plugins
          marketplace-json: .github/plugin/marketplace.json
          site-title: My Plugin Marketplace
          dry-run: 'true'   # generate + commit marketplace.json, but skip site deploy
```

> **Note:** Set `dry-run: 'true'` here so only `marketplace.json` is updated — site deployment is handled by Workflow 2.

### Workflow 2 — Deploy the site on release

Runs when you publish a GitHub release. Reads the already-committed `marketplace.json` and deploys the full site to GitHub Pages.

```yaml
# .github/workflows/deploy-marketplace.yml
name: Deploy marketplace site

on:
  release:
    types: [published]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: your-org/marketplace-ui-generator@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          marketplace-json: .github/plugin/marketplace.json
          site-title: My Plugin Marketplace
          base-path: /my-repo/
```

---

## Plugin directory structure

When using `plugin-root`, the action scans subdirectories and reads a manifest from each one.

```
plugins/
├── my-plugin/
│   └── .github/plugin/plugin.json   ← default path, configurable via plugin-json-path
├── another-plugin/
│   └── .github/plugin/plugin.json
└── external.json                     ← optional list of externally-hosted plugins
```

Each `plugin.json`:

```json
{
  "name": "my-plugin",
  "description": "Does something useful",
  "version": "1.0.0",
  "keywords": ["azure", "devops"]
}
```

`external.json` — an array of externally-hosted plugins:

```json
[
  {
    "name": "external-plugin",
    "description": "Hosted elsewhere",
    "version": "2.0.0",
    "source": {
      "source": "https://github.com/other-org/external-plugin",
      "installSource": "https://github.com/other-org/external-plugin"
    }
  }
]
```

---

## Inputs

| Input | Default | Description |
|---|---|---|
| `plugin-root` | `""` | Directory of plugin subdirectories. If set, `marketplace.json` is generated and committed back to the repo. |
| `plugin-json-path` | `.github/plugin/plugin.json` | Relative path inside each plugin dir to its manifest |
| `marketplace-json` | `.github/plugin/marketplace.json` | Path to `marketplace.json` (input when pre-committed, output when `plugin-root` is set) |
| `marketplace-name` | repo name | Name written into generated `marketplace.json` |
| `marketplace-description` | `""` | Description written into generated `marketplace.json` |
| `site-title` | marketplace name | Browser tab title for the site |
| `site-description` | `""` | Meta description for the site |
| `base-path` | `/` | Base URL path (e.g. `/my-repo/` for GitHub Pages project sites) |
| `deploy-branch` | `gh-pages` | Branch the built site is pushed to |
| `custom-ui-dir` | `ui` | Path to a custom UI with its own `package.json` + build script |
| `github-token` | `github.token` | Token for pushing to `deploy-branch` — needs `contents: write` |
| `dry-run` | `false` | Build without deploying. When `plugin-root` is set, `marketplace.json` is still committed. |

---

## Custom UI

If your repo contains a directory with a `package.json` that has a `build` script (default: `ui/`), the action uses it instead of the built-in Astro UI. The generated data files are copied into `{custom-ui-dir}/public/data/` before the build.

Set `custom-ui-dir` to point at your directory:

```yaml
- uses: your-org/marketplace-ui-generator@v1
  with:
    custom-ui-dir: my-custom-site
```

---

## GitHub Pages setup

Enable GitHub Pages in your repository settings:

- **Source**: Deploy from a branch
- **Branch**: `gh-pages` (or whatever `deploy-branch` is set to), `/ (root)`

The first deployment creates the branch automatically.
