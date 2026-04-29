# Agent Marketplace Pages

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Agent%20Marketplace%20Pages-blue?logo=github)](https://github.com/marketplace/actions/agent-marketplace-pages)

A reusable GitHub Action that generates and deploys a static agent marketplace browser site to GitHub Pages — works with [GitHub Copilot CLI](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference) plugin repos and [Claude Code](https://code.claude.com/docs/en/plugin-marketplaces) agent repos.

## How it works

The action runs a two-step pipeline:

1. **Generate data** — scans your repository and produces optimized JSON files (resources, categories, search index, manifest)
2. **Build & deploy** — builds an Astro + Starlight site from those files and pushes it to the `gh-pages` branch

There are two generator modes, selected automatically based on your repo structure:

| Mode | Trigger | What it generates |
| --- | --- | --- |
| **Repo-resources** | `agents/`, `skills/`, `instructions/`, `hooks/`, or `workflows/` directory exists at repo root | Full multi-type marketplace: agents, instructions, skills, hooks, workflows, and plugins |
| **Plugin-only** | None of the above directories exist | Plugin-only marketplace from `marketplace.json` |

You can override auto-detection with `repo-resources: 'true'` or `repo-resources: 'false'`.

---

## Repo-resources mode

If your repository contains any of the standard resource directories at its root, the action automatically scans them all:

```text
your-repo/
├── agents/
│   └── my-agent/
│       ├── agent.md         ← description, system prompt, model, tools
│       └── README.md
├── instructions/
│   └── coding-standards.md
├── skills/
│   └── my-skill/
│       ├── SKILL.md
│       └── README.md
├── hooks/
│   └── my-hook/
│       ├── hook.json
│       └── README.md
├── workflows/
│   └── my-workflow.yml
└── plugins/                 ← optional; scanned alongside other resource types
    └── my-plugin/
        └── .github/plugin/plugin.json
```

The generated site has a page for each resource type with search, filters, and a detail modal that lets users copy install commands or view raw file content.

### Recommended workflow (repo-resources)

```yaml
# .github/workflows/deploy-marketplace.yml
name: Deploy marketplace site

on:
  push:
    branches: [main]
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

      - uses: passelin/agent-marketplace-pages@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          marketplace-name: My Agent Marketplace
          base-path: /my-repo/
```

---

## Plugin-only mode

Use this mode when your repo's only resource type is plugins defined in `marketplace.json`.

### Recommended setup: two workflows

**Workflow 1 — Keep `marketplace.json` up to date**

Runs whenever plugin files change on main. Generates `marketplace.json` from your plugin directory structure and commits it back to the repo.

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

      - uses: passelin/agent-marketplace-pages@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          plugin-root: plugins
          marketplace-json: .github/plugin/marketplace.json
          marketplace-name: My Plugin Marketplace
          dry-run: 'true'   # generate + commit marketplace.json, skip site deploy
```

#### Workflow 2 — Deploy the site on release

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

      - uses: passelin/agent-marketplace-pages@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          marketplace-json: .github/plugin/marketplace.json
          site-title: My Plugin Marketplace
          base-path: /my-repo/
```

### Plugin directory structure

When using `plugin-root`, the action scans subdirectories and reads a manifest from each one.

```text
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

### Remote marketplaces

Pull in plugins from other marketplace repos via `remoteMarketplaces` in `marketplace.json`:

```json
{
  "remoteMarketplaces": [
    { "name": "awesome-copilot", "label": "GitHub Copilot Extensions", "repo": "github/awesome-copilot" },
    { "name": "my-team", "url": "https://raw.githubusercontent.com/acme/plugins/main/.github/plugin/marketplace.json" }
  ]
}
```

Use `repo` for GitHub repos — the generator tries `.github/plugin/marketplace.json` then `.claude-plugin/marketplace.json` automatically. Use `url` for an exact path; if it returns 404 the other standard path is tried as a fallback.

Plugins from remote marketplaces appear in the site with a "From: X" badge linking back to the source. If a plugin name conflicts with a local one, the local plugin wins.

### Plugin install command

The install command on the plugins page uses the repository path as the `@` target:

```sh
copilot plugin install <plugin-name>@owner/repo
```

This matches what GitHub Copilot CLI expects. The repo path is derived automatically from the repository's git remote.

---

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `plugin-root` | `""` | Directory of plugin subdirectories. If set, `marketplace.json` is generated and committed back to the repo. |
| `plugin-json-path` | `.github/plugin/plugin.json` | Relative path inside each plugin dir to its manifest |
| `marketplace-json` | `.github/plugin/marketplace.json` | Path to `marketplace.json` (input when pre-committed, output when `plugin-root` is set) |
| `marketplace-name` | repo name | Display name for the marketplace; used as the site title and in `marketplace.json` |
| `marketplace-description` | `""` | Marketplace description |
| `marketplace-owner-name` | repo owner | `owner.name` field in generated `marketplace.json` |
| `marketplace-owner-email` | `""` | `owner.email` field in generated `marketplace.json` |
| `site-title` | marketplace name | Browser tab / nav title (falls back to `marketplace-name` when not set) |
| `site-description` | `""` | Meta description for the site |
| `base-path` | `/` | Base URL path (e.g. `/my-repo/` for GitHub Pages project sites) |
| `deploy-branch` | `gh-pages` | Branch the built site is pushed to |
| `custom-ui-dir` | `ui` | Path to a custom UI with its own `package.json` + build script |
| `github-token` | `github.token` | Token for pushing to `deploy-branch` — needs `contents: write` |
| `repo-resources` | `auto` | `auto` detects resource directories; `true` always uses repo-resources mode; `false` always uses plugin-only mode |
| `remotes-file` | `""` | Path to a remotes.json listing external repos to pull skills from (repo-resources mode only). Defaults to `plugins/remotes.json` if that file exists. |
| `dry-run` | `false` | Build without deploying. When `plugin-root` is set, `marketplace.json` is still committed. |

---

## Custom UI

If your repo contains a directory with a `package.json` that has a `build` script (default: `ui/`), the action uses it instead of the built-in Astro UI. The generated data files are copied into `{custom-ui-dir}/public/data/` before the build.

```yaml
- uses: passelin/agent-marketplace-pages@v1
  with:
    custom-ui-dir: my-custom-site
```

For the full data contract, environment variables, and a worked example, see [docs/custom-ui.md](docs/custom-ui.md).

---

## GitHub Pages setup

Enable GitHub Pages in your repository settings:

- **Source**: Deploy from a branch
- **Branch**: `gh-pages` (or whatever `deploy-branch` is set to), `/ (root)`

The first deployment creates the branch automatically.
