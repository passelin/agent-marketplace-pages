# Building a Custom UI

The action ships with a default Astro + Starlight UI. If you want a different look or stack, you can replace it with any static site generator — React, Angular, Vue, SvelteKit, plain HTML, whatever you like.

## How it works

1. The action generates five JSON files from your `marketplace.json`.
2. It copies those files into `{your-ui-dir}/public/data/`.
3. It runs `npm run build` in your UI directory.
4. It deploys `{your-ui-dir}/dist/` to GitHub Pages.

## Minimum requirements

Your UI directory must have:

- A `package.json` with a `build` script.
- A `public/data/` directory that will receive the generated JSON (created automatically by the action before building).
- A `dist/` directory produced by your build script (this is what gets deployed).

```
my-ui/
├── package.json          # must have "build" script
├── public/
│   └── data/             # populated by the action at build time
│       ├── plugins.json
│       ├── manifest.json
│       ├── categories.json
│       ├── search-index.json
│       └── marketplace.json
└── dist/                 # output of npm run build — deployed to Pages
```

## Wiring it up

Point `custom-ui-dir` at your directory:

```yaml
- uses: passelin/agent-marketplace-pages@v1
  with:
    custom-ui-dir: my-ui
```

The action detects the directory at runtime, so the default UI is used as a fallback if the directory is missing or has no `package.json`.

## Environment variables

These are set during `npm run build`. Read them in your build config to avoid hardcoding values.

| Variable                       | Description                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| `MARKETPLACE_SITE_TITLE`       | Value of the `site-title` action input                          |
| `MARKETPLACE_SITE_DESCRIPTION` | Value of the `site-description` action input                    |
| `MARKETPLACE_BASE_PATH`        | Base URL path, e.g. `/my-repo/` for a GitHub Pages project site |
| `MARKETPLACE_SITE_URL`         | Full URL, e.g. `https://org.github.io/repo/`                    |

`MARKETPLACE_BASE_PATH` is important for GitHub Pages project sites — your site will be at `https://org.github.io/repo/`, not the root. Pass it to your bundler's `base` option.

## Data contract

### `manifest.json` — marketplace metadata

```json
{
  "_schema": "marketplace-ui/1.0",
  "generated": "2024-01-15T10:30:00.000Z",
  "marketplaceName": "My Marketplace",
  "description": "A description of this marketplace",
  "counts": {
    "total": 42,
    "local": 35,
    "external": 5,
    "remote": 2
  }
}
```

- `local` — plugins defined directly in this repository
- `external` — plugins from a different GitHub repo, listed in this marketplace's `marketplace.json`
- `remote` — plugins pulled in from a separate remote marketplace at build time

### `plugins.json` — full plugin list

```json
{
  "_schema": "marketplace-ui/1.0",
  "generated": "2024-01-15T10:30:00.000Z",
  "items": [
    {
      "id": "my-plugin",
      "name": "My Plugin",
      "description": "Does something useful",
      "version": "1.2.0",
      "tags": ["typescript", "testing"],
      "categories": ["JavaScript / TypeScript", "Testing"],
      "external": false,
      "repository": "https://github.com/org/repo",
      "homepage": "https://example.com",
      "author": { "name": "Author Name", "url": "https://example.com" },
      "license": "MIT",
      "source": null,
      "sourceMarketplace": null,
      "pluginUrl": "https://github.com/org/repo/tree/main/plugins/my-plugin",
      "lastUpdated": "2024-01-10T00:00:00.000Z",
      "searchText": "my plugin does something useful typescript testing ..."
    }
  ],
  "filters": {
    "tags": ["docker", "testing", "typescript"],
    "categories": ["DevOps", "JavaScript / TypeScript", "Testing"]
  }
}
```

**`source`** is `null` for local plugins. For plugins sourced from another GitHub repo it's:

```json
{ "source": "github", "repo": "owner/repo", "path": "optional/subdir" }
```

**`sourceMarketplace`** is `null` unless the plugin came from a remote marketplace:

```json
{ "name": "Remote Marketplace", "label": "Display Label", "url": "https://..." }
```

**`categories`** are derived automatically from the plugin's name, description, and tags. The built-in categories are: Cloud, Git & GitHub, Testing, .NET, Python, Java, Go, JavaScript / TypeScript, Rust, MCP, Security, Data, DevOps, Design — anything that doesn't match falls into "Other".

### `categories.json` — category list with counts

```json
{
  "_schema": "marketplace-ui/1.0",
  "items": [
    {
      "id": "javascript---typescript",
      "label": "JavaScript / TypeScript",
      "count": 14
    },
    { "id": "testing", "label": "Testing", "count": 7 }
  ]
}
```

Useful for rendering a category filter without scanning all plugins.

### `search-index.json` — lightweight index for client-side search

```json
[
  {
    "id": "my-plugin",
    "title": "My Plugin",
    "description": "Does something useful",
    "tags": ["typescript", "testing"],
    "categories": ["JavaScript / TypeScript", "Testing"],
    "external": false,
    "searchText": "my plugin does something useful typescript testing ..."
  }
]
```

A stripped-down version of `plugins.json` — no URLs, authors, or dates. Load this instead of `plugins.json` when you only need to search, then fetch the full record on demand.

### `marketplace.json` — source passthrough

The original `marketplace.json` from the repository, copied as-is. Useful if you need fields the generator doesn't expose (e.g. `metadata.owner`).

## Loading the data

The files live at `/data/*.json` in your deployed site (or wherever your static server serves `public/`). Fetch them at runtime:

```js
const [manifest, plugins] = await Promise.all([
  fetch("/data/manifest.json").then((r) => r.json()),
  fetch("/data/plugins.json").then((r) => r.json()),
]);
```

Or import them at build time if your framework supports it (Astro, Next.js, Vite, etc.):

```js
import plugins from "../public/data/plugins.json";
```

Build-time import eliminates the runtime fetch and is generally preferable if your framework supports it — the default UI uses this approach.

## Minimal example (plain HTML + Vite)

```
my-ui/
├── package.json
├── vite.config.js
├── index.html
├── src/
│   └── main.js
└── public/
    └── data/   ← populated by the action
```

**`package.json`**

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

**`vite.config.js`**

```js
export default {
  base: process.env.MARKETPLACE_BASE_PATH || "/",
};
```

**`src/main.js`**

```js
const [manifest, { items }] = await Promise.all([
  fetch("data/manifest.json").then((r) => r.json()),
  fetch("data/plugins.json").then((r) => r.json()),
]);

document.querySelector("#title").textContent = manifest.marketplaceName;
document.querySelector("#count").textContent =
  `${manifest.counts.total} plugins`;

const list = document.querySelector("#plugins");
for (const plugin of items) {
  const li = document.createElement("li");
  li.innerHTML = `<a href="${plugin.pluginUrl}">${plugin.name}</a> — ${plugin.description}`;
  list.appendChild(li);
}
```

## Tips

- **Always respect `MARKETPLACE_BASE_PATH`**. On a GitHub Pages project site the base is `/repo-name/`, so absolute asset paths and fetch URLs must include it. Most bundlers (Vite, webpack, Astro) have a `base` config option for this.
- **Prefer build-time imports over runtime fetch** when possible. They are faster and eliminate a round-trip on first load.
- **Use `search-index.json` for filtering**, then look up full plugin records in `plugins.json` by `id` when you need to render a detail view.
- **`searchText` is pre-built** — it concatenates name, description, tags, categories, and author into a single lowercase string ready for substring or fuzzy matching. No need to build your own.
- **Test locally** by running the generator yourself (`node generator/generate.mjs`) with `MARKETPLACE_INPUT` pointing at your `marketplace.json`, then running your UI's dev server.
