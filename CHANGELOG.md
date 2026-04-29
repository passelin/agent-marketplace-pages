# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.7] — 2026-04-29

### Documentation

- Rewrote README to cover repo-resources mode, all new inputs, and the `owner/repo` install command format.

---

## [1.1.6] — 2026-04-29

### Fixed

- Homepage global search was broken on GitHub Pages project sites (any `base-path` other than `/`). `getBasePath()` was reading a `data-base-path` body attribute that was never set, so every `fetch()` fell back to `/data/…` and returned 404. Now uses `import.meta.env.BASE_URL`, which Vite bakes in at build time.

---

## [1.1.5] — 2026-04-29

### Fixed

- Plugin install command now shows `owner/repo` as the `@` target instead of the marketplace display name. Both generators write `githubRepo` to `manifest.json`; `plugins.astro` prefers it and falls back to the display name only when the repo URL is unavailable.

---

## [1.1.4] — 2026-04-29

### Fixed

- Starlight nav title and homepage `<h1>` could show different values when `site-title` was set but `marketplace-name` was not. The Build UI step now uses `site-title || marketplace-name` for `MARKETPLACE_SITE_TITLE`, keeping both in sync.

---

## [1.1.3] — 2026-04-29

### Fixed

- `generate-from-repo.mjs` was ignoring the `MARKETPLACE_NAME` and `MARKETPLACE_DESCRIPTION` environment variables, always reading the marketplace name from the repository's README `<h1>`. Environment variables are now checked first; README parsing is only used as a fallback.

---

## [1.1.2] — 2026-04-29

### Added

- **Auto-detection of generator mode.** The action now detects whether the repository contains any of the standard resource directories (`agents/`, `instructions/`, `skills/`, `hooks/`, `workflows/`) and automatically runs `generate-from-repo.mjs` instead of `generate.mjs`. Override with `repo-resources: 'true'` or `repo-resources: 'false'`.
- New `repo-resources` input (`auto` | `true` | `false`, default `auto`).
- New `remotes-file` input — path to a JSON file listing external repositories to pull skills from in repo-resources mode (defaults to `plugins/remotes.json` if that file exists).

---

## [1.1.1] — 2026-04-29

### Fixed

- Astro build failed for plugin-only repositories after upgrading to v1.1.0 because the new resource-type pages expected `agents.json`, `instructions.json`, `skills.json`, `hooks.json`, and `workflows.json` to exist. `generate.mjs` now writes empty stub files for any of these that are missing.

---

## [1.1.0] — 2026-04-29

### Added

- **Multi-resource-type UI.** The marketplace site now has dedicated pages for agents, instructions, skills, hooks, and workflows in addition to plugins. Each page has its own search, filters, and result count.
- **Horizontal resource-type navigation** on every page, showing only types with at least one item. The active type is highlighted with its type color.
- **Global search** on the homepage searches across all resource types simultaneously. Results are grouped by type and open a detail modal directly without navigating away.
- **Detail modal** with per-type color accent on the header border and a type badge. Supports viewing raw file content and copying install commands.
- **Plugin modal** shows plugin metadata (description, version, author, license, keywords) and the bundled resources as color-coded chip links. Clicking a chip navigates to that resource type's page and auto-opens its detail modal.
- `generate-from-repo.mjs` — new generator that scans the repository directory structure for all resource types and produces the full set of data files.

---

## [1.0.0] — 2026-04-20

Initial public release.

### Added

- Astro + Starlight UI with plugin browsing, search, tag/category/source filters, and a detail modal with install-command copy.
- `generate.mjs` — generates `plugins.json`, `categories.json`, `search-index.json`, and `manifest.json` from `marketplace.json`.
- `generate-marketplace.mjs` — generates `marketplace.json` from a plugin directory structure when `plugin-root` is set, then commits it back to the repository.
- Plugin install command supports both GitHub Copilot CLI (`copilot plugin install`) and Claude Code (`/plugin install`).
- Remote marketplace aggregation via `remoteMarketplaces` in `marketplace.json` — pulls plugins from other repos at build time. Uses `repo` shorthand (tries both standard paths) or an explicit `url` with automatic fallback.
- Outputs `marketplace.json` to both `.github/plugin/` and `.claude-plugin/` so both Copilot CLI and Claude Code can discover it.
- `marketplace-owner-name` and `marketplace-owner-email` inputs for the `owner` field in generated `marketplace.json`.
- `custom-ui-dir` input — use your own Astro/Vite site instead of the built-in UI.
- `dry-run` input — generate and commit `marketplace.json` without deploying the site.
- `deploy-branch` input (default `gh-pages`).
- `base-path` input for GitHub Pages project sites served under a sub-path.
