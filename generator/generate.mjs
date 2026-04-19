#!/usr/bin/env node
/**
 * Generates static JSON data files for the marketplace UI from marketplace.json.
 *
 * Environment variables:
 *   MARKETPLACE_INPUT      Path to marketplace.json (default: ".github/plugin/marketplace.json")
 *   MARKETPLACE_DIST_DIR   Output directory for generated JSON files (default: "dist/data")
 *   GITHUB_WORKSPACE       Calling repo root (default: cwd)
 *   GITHUB_REPOSITORY      Used to construct plugin URLs (e.g. "owner/repo")
 */

import fs from "fs";
import path from "path";
import { getGitFileDates } from "./git-dates.mjs";

const REPO_ROOT = process.env.GITHUB_WORKSPACE || process.cwd();
const MARKETPLACE_INPUT = process.env.MARKETPLACE_INPUT || ".github/plugin/marketplace.json";
const DIST_DIR = process.env.MARKETPLACE_DIST_DIR || "dist/data";
const SCHEMA_VERSION = "marketplace-ui/1.0";

const CATEGORY_KEYWORDS = [
  { tokens: ["azure", "cloud", "aws", "gcp"], category: "Cloud" },
  { tokens: ["github", "git", "pull request", "issue", "pr"], category: "Git & GitHub" },
  { tokens: ["test", "qa", "playwright", "jest", "vitest", "cypress"], category: "Testing" },
  { tokens: ["dotnet", "csharp", "c#", ".net", "nuget", "aspnet"], category: ".NET" },
  { tokens: ["python", "pip", "django", "flask", "fastapi"], category: "Python" },
  { tokens: ["java", "spring", "maven", "gradle", "kotlin"], category: "Java" },
  { tokens: ["go", "golang"], category: "Go" },
  { tokens: ["typescript", "javascript", "node", "npm", "bun", "deno", "react", "vue", "svelte"], category: "JavaScript / TypeScript" },
  { tokens: ["rust", "cargo"], category: "Rust" },
  { tokens: ["mcp", "model context protocol"], category: "MCP" },
  { tokens: ["security", "auth", "oauth", "sso", "saml", "jwt"], category: "Security" },
  { tokens: ["database", "sql", "postgres", "mysql", "mongo", "redis"], category: "Data" },
  { tokens: ["devops", "ci", "cd", "deploy", "docker", "kubernetes", "k8s", "helm"], category: "DevOps" },
  { tokens: ["design", "ui", "figma", "tailwind", "css"], category: "Design" },
];

function deriveCategories(name, description, tags) {
  const haystack = `${name} ${description} ${(tags || []).join(" ")}`.toLowerCase();
  const matched = [];

  for (const { tokens, category } of CATEGORY_KEYWORDS) {
    if (tokens.some((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`).test(haystack);
    })) {
      matched.push(category);
    }
  }

  return matched.length > 0 ? matched : ["Other"];
}

function getPluginUrl(plugin, pluginRoot) {
  const isExternal = plugin.source && typeof plugin.source === "object";

  if (isExternal) {
    if (plugin.source.source === "github" && plugin.source.repo) {
      const base = `https://github.com/${plugin.source.repo}`;
      return plugin.source.path ? `${base}/tree/main/${plugin.source.path}` : base;
    }
    return plugin.repository || plugin.homepage || null;
  }

  // Local plugin: construct GitHub URL from GITHUB_REPOSITORY if available
  if (process.env.GITHUB_REPOSITORY && typeof plugin.source === "string") {
    const repoUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}`;
    return `${repoUrl}/tree/main/${pluginRoot}/${plugin.source}`;
  }

  return plugin.repository || plugin.homepage || null;
}

function getRemotePluginUrl(plugin, remoteData, remoteUrl) {
  if (plugin.source && typeof plugin.source === "object") {
    if (plugin.source.source === "github" && plugin.source.repo) {
      const base = `https://github.com/${plugin.source.repo}`;
      return plugin.source.path ? `${base}/tree/main/${plugin.source.path}` : base;
    }
    return plugin.repository || plugin.homepage || null;
  }
  if (plugin.repository) return plugin.repository;
  if (plugin.homepage) return plugin.homepage;
  // Local plugin in remote repo — derive GitHub URL from the raw content URL
  if (typeof plugin.source === "string") {
    const match = remoteUrl.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\//);
    if (match) {
      const pluginRoot = (remoteData.metadata?.pluginRoot || "plugins").replace(/^\.\//, "");
      return `https://github.com/${match[1]}/tree/main/${pluginRoot}/${plugin.source}`;
    }
  }
  return null;
}

const MARKETPLACE_PATHS = [".github/plugin/marketplace.json", ".claude-plugin/marketplace.json"];

function candidateUrls(remote) {
  if (remote.repo) {
    const base = `https://raw.githubusercontent.com/${remote.repo}/main`;
    return MARKETPLACE_PATHS.map((p) => `${base}/${p}`);
  }
  // Direct URL: try it first, then swap between the two known paths as fallback
  const urls = [remote.url];
  for (const known of MARKETPLACE_PATHS) {
    if (remote.url.includes(known)) {
      const other = MARKETPLACE_PATHS.find((p) => p !== known);
      urls.push(remote.url.replace(known, other));
      break;
    }
  }
  return urls;
}

async function fetchRemotePlugins(remote) {
  const urls = candidateUrls(remote);
  let lastStatus;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) { lastStatus = response.status; continue; }
      const data = await response.json();
      if (!Array.isArray(data.plugins)) {
        console.warn(`Warning: Remote marketplace "${remote.name}" has no plugins array`);
        return [];
      }
      console.log(`  ✓ ${remote.name}: ${data.plugins.length} plugins (${url})`);
      return data.plugins.map((plugin) => ({ ...plugin, _remoteData: data, _remote: { ...remote, url } }));
    } catch (error) {
      lastStatus = error.message;
    }
  }
  console.warn(`Warning: Failed to fetch remote marketplace "${remote.name}": ${lastStatus}`);
  return [];
}

async function generateData() {
  const inputPath = path.isAbsolute(MARKETPLACE_INPUT) ? MARKETPLACE_INPUT : path.join(REPO_ROOT, MARKETPLACE_INPUT);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: marketplace.json not found at ${inputPath}`);
    process.exit(1);
  }

  let marketplace;
  try {
    marketplace = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch (error) {
    console.error(`Error parsing marketplace.json: ${error.message}`);
    process.exit(1);
  }

  if (!marketplace.name) {
    console.error("Error: marketplace.json must have a 'name' field");
    process.exit(1);
  }
  if (!Array.isArray(marketplace.plugins)) {
    console.error("Error: marketplace.json must have a 'plugins' array");
    process.exit(1);
  }

  const pluginRoot = (marketplace.metadata?.pluginRoot || "plugins").replace(/^\.\//, "");
  const generated = new Date().toISOString();

  // Get git dates for local plugins
  const localPluginDirs = marketplace.plugins
    .filter((p) => typeof p.source === "string")
    .map((p) => `${pluginRoot}/${p.source}`);

  let gitDates = new Map();
  if (localPluginDirs.length > 0) {
    gitDates = getGitFileDates(localPluginDirs, REPO_ROOT);
  }

  const items = marketplace.plugins.map((plugin) => {
    const isExternal = plugin.source && typeof plugin.source === "object";
    const tags = plugin.keywords || plugin.tags || [];
    const categories = deriveCategories(plugin.name, plugin.description || "", tags);
    const pluginUrl = getPluginUrl(plugin, pluginRoot);

    // Find the most recent git date for this plugin's directory
    let lastUpdated = null;
    if (!isExternal && typeof plugin.source === "string") {
      const dirPrefix = `${pluginRoot}/${plugin.source}/`;
      for (const [filePath, date] of gitDates) {
        if (filePath.startsWith(dirPrefix) || filePath === `${pluginRoot}/${plugin.source}`) {
          if (!lastUpdated || date > lastUpdated) lastUpdated = date;
        }
      }
    }

    const searchText = [
      plugin.name,
      plugin.description || "",
      ...tags,
      ...categories,
      plugin.author?.name || "",
      isExternal ? "external" : "local",
    ]
      .join(" ")
      .toLowerCase()
      .trim();

    return {
      id: plugin.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      name: plugin.name,
      description: plugin.description || "",
      version: plugin.version || "",
      tags,
      categories,
      external: isExternal,
      repository: plugin.repository || null,
      homepage: plugin.homepage || null,
      author: plugin.author || null,
      license: plugin.license || null,
      source: isExternal ? plugin.source : null,
      sourceMarketplace: null,
      pluginUrl,
      lastUpdated,
      searchText,
    };
  });

  // Fetch and merge remote marketplace plugins
  const remoteMarketplaces = marketplace.remoteMarketplaces || [];
  if (remoteMarketplaces.length > 0) {
    console.log(`\nFetching ${remoteMarketplaces.length} remote marketplace(s)...`);
    const localIds = new Set(items.map((i) => i.id));

    for (const remote of remoteMarketplaces) {
      if (!remote.name || !remote.url) {
        console.warn(`Warning: Skipping remote marketplace with missing name or url`);
        continue;
      }
      const remotePlugins = await fetchRemotePlugins(remote);

      for (const plugin of remotePlugins) {
        const { _remoteData, _remote, ...cleanPlugin } = plugin;
        const id = cleanPlugin.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (localIds.has(id)) {
          console.warn(`  ⚠ "${cleanPlugin.name}" from "${remote.name}" skipped — conflicts with local plugin`);
          continue;
        }
        localIds.add(id);

        const tags = cleanPlugin.keywords || cleanPlugin.tags || [];
        const categories = deriveCategories(cleanPlugin.name, cleanPlugin.description || "", tags);
        const pluginUrl = getRemotePluginUrl(cleanPlugin, _remoteData, remote.url);
        const sourceMarketplace = { name: remote.name, label: remote.label || remote.name, url: remote.url };

        const searchText = [
          cleanPlugin.name,
          cleanPlugin.description || "",
          ...tags,
          ...categories,
          cleanPlugin.author?.name || "",
          "external",
          remote.name,
          remote.label || "",
        ]
          .join(" ")
          .toLowerCase()
          .trim();

        items.push({
          id,
          name: cleanPlugin.name,
          description: cleanPlugin.description || "",
          version: cleanPlugin.version || "",
          tags,
          categories,
          external: true,
          repository: cleanPlugin.repository || null,
          homepage: cleanPlugin.homepage || null,
          author: cleanPlugin.author || null,
          license: cleanPlugin.license || null,
          source: typeof cleanPlugin.source === "object" ? cleanPlugin.source : null,
          sourceMarketplace,
          pluginUrl,
          lastUpdated: null,
          searchText,
        });
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  // Build filters
  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort();
  const allCategories = [...new Set(items.flatMap((i) => i.categories))].sort();

  // Build category counts
  const categoryCounts = {};
  for (const item of items) {
    for (const cat of item.categories) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  const localCount = items.filter((i) => !i.external).length;
  const externalCount = items.filter((i) => i.external && !i.sourceMarketplace).length;
  const remoteCount = items.filter((i) => i.sourceMarketplace !== null).length;

  const outputDir = path.isAbsolute(DIST_DIR) ? DIST_DIR : path.join(REPO_ROOT, DIST_DIR);
  fs.mkdirSync(outputDir, { recursive: true });

  // plugins.json
  fs.writeFileSync(
    path.join(outputDir, "plugins.json"),
    JSON.stringify(
      {
        _schema: SCHEMA_VERSION,
        generated,
        items,
        filters: { tags: allTags, categories: allCategories },
      },
      null,
      2
    )
  );

  // categories.json
  fs.writeFileSync(
    path.join(outputDir, "categories.json"),
    JSON.stringify(
      {
        _schema: SCHEMA_VERSION,
        items: allCategories.map((cat) => ({
          id: cat.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          label: cat,
          count: categoryCounts[cat] || 0,
        })),
      },
      null,
      2
    )
  );

  // search-index.json
  fs.writeFileSync(
    path.join(outputDir, "search-index.json"),
    JSON.stringify(
      items.map((item) => ({
        id: item.id,
        title: item.name,
        description: item.description,
        tags: item.tags,
        categories: item.categories,
        external: item.external,
        searchText: item.searchText,
      })),
      null,
      2
    )
  );

  // manifest.json
  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(
      {
        _schema: SCHEMA_VERSION,
        generated,
        marketplaceName: marketplace.name,
        description: marketplace.metadata?.description || "",
        counts: { total: items.length, local: localCount, external: externalCount, remote: remoteCount },
      },
      null,
      2
    )
  );

  // marketplace.json — pass-through
  fs.copyFileSync(inputPath, path.join(outputDir, "marketplace.json"));

  console.log(`✓ Generated data files in ${outputDir}`);
  console.log(`  plugins.json    — ${items.length} plugins`);
  console.log(`  categories.json — ${allCategories.length} categories`);
  console.log(`  search-index.json`);
  console.log(`  manifest.json`);
  console.log(`  marketplace.json`);
}

generateData().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
