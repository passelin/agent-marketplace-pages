#!/usr/bin/env node
/**
 * Generates marketplace.json by scanning a directory of plugin folders.
 *
 * Environment variables:
 *   MARKETPLACE_PLUGIN_ROOT      Directory containing plugin subdirectories (default: "plugins")
 *   MARKETPLACE_PLUGIN_JSON_PATH Relative path within each plugin dir to its manifest (default: ".github/plugin/plugin.json")
 *   MARKETPLACE_EXTERNAL_FILE    Path to external plugins JSON array (default: "{pluginRoot}/external.json")
 *   MARKETPLACE_OUTPUT           Output path for marketplace.json (default: ".github/plugin/marketplace.json")
 *   MARKETPLACE_NAME             Marketplace name field (default: repo name from GITHUB_REPOSITORY)
 *   MARKETPLACE_DESCRIPTION      Marketplace description
 *   MARKETPLACE_OWNER_NAME       owner.name field (default: GITHUB_REPOSITORY_OWNER)
 *   MARKETPLACE_OWNER_EMAIL      owner.email field (default: "")
 *   GITHUB_WORKSPACE             Calling repo root (default: cwd)
 */

import fs from "fs";
import path from "path";

const REPO_ROOT = process.env.GITHUB_WORKSPACE || process.cwd();
const PLUGIN_ROOT = process.env.MARKETPLACE_PLUGIN_ROOT || "plugins";
const PLUGIN_JSON_PATH = process.env.MARKETPLACE_PLUGIN_JSON_PATH || ".github/plugin/plugin.json";
const OUTPUT = process.env.MARKETPLACE_OUTPUT || ".github/plugin/marketplace.json";

const EXTERNAL_FILE_DEFAULT = path.join(PLUGIN_ROOT, "external.json");
const EXTERNAL_FILE = process.env.MARKETPLACE_EXTERNAL_FILE || EXTERNAL_FILE_DEFAULT;

const repoName = process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split("/")[1]
  : path.basename(REPO_ROOT);
const MARKETPLACE_NAME = process.env.MARKETPLACE_NAME || repoName;
const MARKETPLACE_DESCRIPTION = process.env.MARKETPLACE_DESCRIPTION || "";
const MARKETPLACE_OWNER_NAME = process.env.MARKETPLACE_OWNER_NAME || process.env.GITHUB_REPOSITORY_OWNER || "";
const MARKETPLACE_OWNER_EMAIL = process.env.MARKETPLACE_OWNER_EMAIL || "";

function validateExternalPlugin(plugin, index) {
  const errors = [];
  const prefix = `external.json[${index}]`;

  if (!plugin.name || typeof plugin.name !== "string")
    errors.push(`${prefix}: "name" is required and must be a string`);
  if (!plugin.description || typeof plugin.description !== "string")
    errors.push(`${prefix}: "description" is required and must be a string`);
  if (!plugin.version || typeof plugin.version !== "string")
    errors.push(`${prefix}: "version" is required and must be a string`);

  if (!plugin.source) {
    errors.push(`${prefix}: "source" is required`);
  } else if (typeof plugin.source === "string") {
    errors.push(`${prefix}: "source" must be an object (local paths not allowed for external plugins)`);
  } else if (typeof plugin.source === "object") {
    if (!plugin.source.source)
      errors.push(`${prefix}: "source.source" is required (e.g. "github", "npm")`);
  }

  return errors;
}

function readRemoteMarketplaces() {
  const remotesPath = path.join(REPO_ROOT, PLUGIN_ROOT, "remotes.json");
  if (!fs.existsSync(remotesPath)) return [];

  try {
    const remotes = JSON.parse(fs.readFileSync(remotesPath, "utf8"));
    if (!Array.isArray(remotes)) {
      console.warn("Warning: remotes.json must be a JSON array");
      return [];
    }
    const valid = [];
    for (let i = 0; i < remotes.length; i++) {
      const r = remotes[i];
      if (!r.name || !r.url) {
        console.warn(`Warning: remotes.json[${i}] missing required "name" or "url" — skipped`);
        continue;
      }
      valid.push({ name: r.name, ...(r.label ? { label: r.label } : {}), url: r.url });
    }
    return valid;
  } catch (error) {
    console.error(`Error reading remotes.json: ${error.message}`);
    return [];
  }
}

function readExternalPlugins() {
  const externalPath = path.join(REPO_ROOT, EXTERNAL_FILE);
  if (!fs.existsSync(externalPath)) return [];

  try {
    const content = fs.readFileSync(externalPath, "utf8");
    const plugins = JSON.parse(content);
    if (!Array.isArray(plugins)) {
      console.warn("Warning: external plugins file must be a JSON array");
      return [];
    }

    let hasErrors = false;
    for (let i = 0; i < plugins.length; i++) {
      const errors = validateExternalPlugin(plugins[i], i);
      if (errors.length > 0) {
        errors.forEach((e) => console.error(`Error: ${e}`));
        hasErrors = true;
      }
    }
    if (hasErrors) {
      console.error("Error: external plugins file contains invalid entries");
      process.exit(1);
    }

    return plugins;
  } catch (error) {
    console.error(`Error reading external plugins file: ${error.message}`);
    return [];
  }
}

function readPluginMetadata(pluginDir) {
  const pluginJsonPath = path.join(pluginDir, PLUGIN_JSON_PATH);

  if (!fs.existsSync(pluginJsonPath)) {
    console.warn(`Warning: No plugin manifest found at ${pluginJsonPath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
  } catch (error) {
    console.error(`Error reading plugin manifest at ${pluginJsonPath}:`, error.message);
    return null;
  }
}

function generateMarketplace() {
  console.log("Generating marketplace.json...\n");

  const pluginsDir = path.join(REPO_ROOT, PLUGIN_ROOT);
  if (!fs.existsSync(pluginsDir)) {
    console.error(`Error: Plugin directory not found: ${pluginsDir}`);
    process.exit(1);
  }

  const pluginDirs = fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  console.log(`Found ${pluginDirs.length} plugin directories`);

  const plugins = [];
  for (const dirName of pluginDirs) {
    const pluginPath = path.join(pluginsDir, dirName);
    const metadata = readPluginMetadata(pluginPath);

    if (metadata) {
      plugins.push({
        name: metadata.name || dirName,
        source: dirName,
        description: metadata.description || "",
        version: metadata.version || "1.0.0",
        ...(metadata.keywords ? { keywords: metadata.keywords } : {}),
        ...(metadata.author ? { author: metadata.author } : {}),
        ...(metadata.license ? { license: metadata.license } : {}),
        ...(metadata.repository ? { repository: metadata.repository } : {}),
        ...(metadata.homepage ? { homepage: metadata.homepage } : {}),
      });
      console.log(`  ✓ ${metadata.name || dirName}`);
    } else {
      console.log(`  ✗ ${dirName} (skipped — no valid manifest)`);
    }
  }

  const remoteMarketplaces = readRemoteMarketplaces();
  if (remoteMarketplaces.length > 0) {
    console.log(`\nFound ${remoteMarketplaces.length} remote marketplace(s)`);
    for (const r of remoteMarketplaces) console.log(`  ✓ ${r.name} (${r.url})`);
  }

  const externalPlugins = readExternalPlugins();
  if (externalPlugins.length > 0) {
    console.log(`\nFound ${externalPlugins.length} external plugins`);
    const localNames = new Set(plugins.map((p) => p.name));

    for (const ext of externalPlugins) {
      if (localNames.has(ext.name)) {
        console.warn(`Warning: external plugin "${ext.name}" conflicts with a local plugin name`);
      }
      plugins.push(ext);
      console.log(`  ✓ ${ext.name} (external)`);
    }
  }

  plugins.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const marketplace = {
    name: MARKETPLACE_NAME,
    metadata: {
      description: MARKETPLACE_DESCRIPTION,
      version: "1.0.0",
      pluginRoot: `./${PLUGIN_ROOT}`,
    },
    owner: {
      name: MARKETPLACE_OWNER_NAME,
      email: "",
    },
    ...(remoteMarketplaces.length > 0 ? { remoteMarketplaces } : {}),
    plugins,
  };

  const outputPath = path.join(REPO_ROOT, OUTPUT);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify(marketplace, null, 2) + "\n");

  const localCount = plugins.length - externalPlugins.length;
  console.log(
    `\n✓ Generated marketplace.json: ${plugins.length} plugins (${localCount} local, ${externalPlugins.length} external)`
  );
  console.log(`  → ${outputPath}`);
}

generateMarketplace();
