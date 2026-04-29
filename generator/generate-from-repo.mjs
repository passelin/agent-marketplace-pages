#!/usr/bin/env node
/**
 * Generates static JSON data files for the marketplace UI by reading directly
 * from a repository with the awesome-copilot file structure:
 *   agents/*.agent.md, instructions/*.instructions.md,
 *   skills/<name>/SKILL.md, hooks/<name>/README.md + hooks.json,
 *   workflows/*.md, plugins/<name>/.github/plugin/plugin.json
 *
 * Environment variables:
 *   MARKETPLACE_REPO         Path to the repository to scan (required)
 *   MARKETPLACE_DIST_DIR     Output directory for generated JSON files (default: "dist/data")
 *   MARKETPLACE_NAME         Marketplace display name (falls back to README h1, then directory name)
 *   MARKETPLACE_DESCRIPTION  Marketplace description (falls back to first README paragraph)
 *   MARKETPLACE_REMOTES_FILE JSON file listing remote repos to merge for skills
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const REPO_ROOT = process.env.MARKETPLACE_REPO;
if (!REPO_ROOT || !fs.existsSync(REPO_ROOT)) {
  console.error(`Error: MARKETPLACE_REPO must point to an existing directory (got: ${REPO_ROOT})`);
  process.exit(1);
}

const DIST_DIR = process.env.MARKETPLACE_DIST_DIR || "dist/data";
const OUTPUT_DIR = path.isAbsolute(DIST_DIR) ? DIST_DIR : path.join(process.cwd(), DIST_DIR);
const SCHEMA_VERSION = "marketplace-ui/1.0";

// Populated in main() once git helpers are defined; used by all generators
let REPO_URL = null;
let FILE_DATES = new Map();

function listFilesRecursive(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, base));
    } else {
      results.push(rel);
    }
  }
  return results;
}

// ─── Git helpers ─────────────────────────────────────────────────────────────

/** Returns the GitHub base URL (no trailing slash) or null if not a GitHub remote. */
function getGithubRepoUrl(repoRoot) {
  try {
    let remote = execSync("git remote get-url origin", { cwd: repoRoot, stdio: "pipe" }).toString().trim();
    if (remote.startsWith("git@github.com:")) {
      remote = "https://github.com/" + remote.slice("git@github.com:".length);
    }
    remote = remote.replace(/\.git$/, "");
    if (remote.startsWith("https://github.com/")) return remote;
  } catch { /* not a git repo or no remote */ }
  return null;
}

/**
 * Runs one `git log` pass and returns a Map<repoRelativePath, isoDateString>
 * giving the most recent commit date for each tracked file.
 */
function buildFileDateMap(repoRoot) {
  const map = new Map();
  try {
    const out = execSync("git log --format=%cI --name-only HEAD", {
      cwd: repoRoot,
      stdio: "pipe",
      maxBuffer: 100 * 1024 * 1024,
    }).toString();
    let date = null;
    for (const raw of out.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
        date = line;
      } else if (date && !map.has(line)) {
        map.set(line, date);
      }
    }
  } catch { /* shallow clone or not a git repo — dates stay unknown */ }
  return map;
}

// ─── Frontmatter parser ──────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  return parseYamlSubset(match[1]);
}

function parseYamlSubset(yaml) {
  const result = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const keyMatch = line.match(/^([\w-]+)\s*:\s*(.*)/);
    if (!keyMatch) { i++; continue; }

    const key = keyMatch[1];
    const rawValue = keyMatch[2].trim();

    if (rawValue === "" || rawValue === "|" || rawValue === ">") {
      // Block scalar or nested mapping — skip body lines
      i++;
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].startsWith("\t"))) i++;
      result[key] = null;
    } else if (rawValue.startsWith("[")) {
      result[key] = parseInlineArray(rawValue);
      i++;
    } else {
      result[key] = stripQuotes(rawValue);
      i++;
    }
  }

  return result;
}

function stripQuotes(s) {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseInlineArray(str) {
  // Handles: ['a', 'b'] or ["a","b"] or [a, b]
  const inner = str.replace(/^\[/, "").replace(/\].*$/, "");
  if (!inner.trim()) return [];

  const items = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of inner) {
    if (!inQuote && (ch === "'" || ch === '"')) {
      inQuote = true;
      quoteChar = ch;
    } else if (inQuote && ch === quoteChar) {
      inQuote = false;
      items.push(current);
      current = "";
    } else if (!inQuote && ch === ",") {
      const t = current.trim();
      if (t) items.push(t);
      current = "";
    } else if (inQuote) {
      current += ch;
    }
  }
  const t = current.trim();
  if (t) items.push(t);
  return items;
}

function readFrontmatter(filePath) {
  try {
    return parseFrontmatter(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function extractDescriptionFromMarkdown(content) {
  if (!content) return "";

  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const lines = withoutFrontmatter.split(/\r?\n/);
  let inCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (line.startsWith("#")) continue;

    // Basic markdown cleanup for short card descriptions.
    return line
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function toTitleCase(s) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function blobUrlToRaw(sourceUrl) {
  if (!sourceUrl) return null;
  return sourceUrl
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace("/blob/", "/");
}

function treeUrlToRawBase(sourceUrl) {
  if (!sourceUrl) return null;
  return sourceUrl
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace("/tree/", "/");
}

// ─── Agents ──────────────────────────────────────────────────────────────────

function generateAgents() {
  const dir = path.join(REPO_ROOT, "agents");
  if (!fs.existsSync(dir)) return { items: [], filters: { models: [], tools: [] } };

  const allModels = new Set();
  const allTools = new Set();

  const items = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".agent.md"))
    .map((file) => {
      const fm = readFrontmatter(path.join(dir, file));
      const id = file.replace(/\.agent\.md$/, "");
      const title = fm.name || toTitleCase(id);
      const tools = Array.isArray(fm.tools) ? fm.tools : [];
      const model = fm.model || null;

      if (model) allModels.add(model);
      tools.forEach((t) => allTools.add(t));

      const relPath = `agents/${file}`;
      return {
        id,
        title,
        description: fm.description || "",
        model,
        tools,
        path: relPath,
        sourceUrl: REPO_URL ? `${REPO_URL}/blob/main/${relPath}` : null,
        lastUpdated: FILE_DATES.get(relPath) ?? null,
        searchText: `${title} ${fm.description || ""} ${tools.join(" ")} ${model || ""}`.toLowerCase(),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    items,
    filters: { models: [...allModels].sort(), tools: [...allTools].sort() },
  };
}

// ─── Instructions ────────────────────────────────────────────────────────────

function extractExtensions(applyTo) {
  if (!applyTo) return [];
  const exts = new Set();
  const patterns = typeof applyTo === "string"
    ? applyTo.split(",").map((s) => s.trim())
    : [];
  for (const p of patterns) {
    const m = p.match(/\*\.(\w+)$/);
    if (m) { exts.add(`.${m[1]}`); continue; }
    const brace = p.match(/\*\.\{([^}]+)\}$/);
    if (brace) brace[1].split(",").forEach((e) => exts.add(`.${e.trim()}`));
  }
  return [...exts].sort();
}

function generateInstructions() {
  const dir = path.join(REPO_ROOT, "instructions");
  if (!fs.existsSync(dir)) return { items: [], filters: { extensions: [] } };

  const allExtensions = new Set();

  const items = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".instructions.md"))
    .map((file) => {
      const fm = readFrontmatter(path.join(dir, file));
      const id = file.replace(/\.instructions\.md$/, "");
      const title = fm.name || toTitleCase(id);
      const applyTo = fm.applyTo || null;
      const extensions = extractExtensions(applyTo);
      extensions.forEach((e) => allExtensions.add(e));

      const relPath = `instructions/${file}`;
      const repoPath = REPO_URL ? REPO_URL.replace("https://github.com/", "") : null;
      return {
        id,
        title,
        description: fm.description || "",
        applyTo,
        extensions,
        path: relPath,
        sourceUrl: REPO_URL ? `${REPO_URL}/blob/main/${relPath}` : null,
        rawUrl: repoPath ? `https://raw.githubusercontent.com/${repoPath}/main/${relPath}` : null,
        lastUpdated: FILE_DATES.get(relPath) ?? null,
        searchText: `${title} ${fm.description || ""} ${applyTo || ""}`.toLowerCase(),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    items,
    filters: { extensions: [...allExtensions].sort() },
  };
}

// ─── Skills ──────────────────────────────────────────────────────────────────

function readRemoteRepositories() {
  const remotesPath = process.env.MARKETPLACE_REMOTES_FILE
    ? (path.isAbsolute(process.env.MARKETPLACE_REMOTES_FILE)
      ? process.env.MARKETPLACE_REMOTES_FILE
      : path.join(process.cwd(), process.env.MARKETPLACE_REMOTES_FILE))
    : path.join(REPO_ROOT, "plugins", "remotes.json");
  if (!fs.existsSync(remotesPath)) return [];

  try {
    const remotes = JSON.parse(fs.readFileSync(remotesPath, "utf8"));
    if (!Array.isArray(remotes)) return [];
    return remotes
      .filter((r) => r && typeof r === "object" && typeof r.repo === "string" && r.repo.includes("/"))
      .map((r) => ({ name: r.name || r.repo, repo: r.repo }));
  } catch {
    return [];
  }
}

async function fetchRemoteRepoSkills(repo, name, seenIds) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/skills`;
  const sourceBase = `https://github.com/${repo}/tree/main/skills`;

  try {
    const response = await fetch(apiUrl, { headers: { "Accept": "application/vnd.github+json" } });
    if (!response.ok) return [];

    const entries = await response.json();
    if (!Array.isArray(entries)) return [];

    const skills = [];
    for (const entry of entries) {
      if (!entry || entry.type !== "dir" || !entry.name) continue;

      const rawSkillUrl = `https://raw.githubusercontent.com/${repo}/main/skills/${entry.name}/SKILL.md`;
      try {
        const skillRes = await fetch(rawSkillUrl);
        if (!skillRes.ok) continue;
        const content = await skillRes.text();
        const fm = parseFrontmatter(content);
        const title = fm.name ? toTitleCase(fm.name) : toTitleCase(entry.name);
        const description = fm.description || extractDescriptionFromMarkdown(content);

        let id = entry.name;
        if (seenIds.has(id)) {
          id = `${repo.replace(/[^a-zA-Z0-9-]/g, "-")}-${entry.name}`.toLowerCase();
        }
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        skills.push({
          id,
          title,
          description,
          sourceType: "remote",
          path: `skills/${entry.name}`,
          sourceUrl: `${sourceBase}/${entry.name}`,
          lastUpdated: null,
          searchText: `${title} ${description} ${name} ${repo}`.toLowerCase(),
        });
      } catch {
        // Skip inaccessible or malformed remote skill entries.
      }
    }

    return skills;
  } catch {
    return [];
  }
}

async function generateSkills() {
  const dir = path.join(REPO_ROOT, "skills");
  if (!fs.existsSync(dir)) return { items: [], filters: {} };

  const seenIds = new Set();

  const allCategories = new Set();

  const localItems = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((entry) => {
      const skillDir = path.join(dir, entry.name);
      const skillMd = path.join(skillDir, "SKILL.md");
      const content = fs.existsSync(skillMd) ? fs.readFileSync(skillMd, "utf8") : "";
      const fm = content ? parseFrontmatter(content) : {};
      const title = fm.name ? toTitleCase(fm.name) : toTitleCase(entry.name);
      const description = fm.description || extractDescriptionFromMarkdown(content);

      const dirFiles = fs.readdirSync(skillDir);
      const hasAssets = dirFiles.some((f) => f !== "SKILL.md" && !f.startsWith("."));
      const files = listFilesRecursive(skillDir);

      const categories = deriveCategories(title, description, []);
      categories.forEach((c) => allCategories.add(c));

      seenIds.add(entry.name);

      const relPath = `skills/${entry.name}`;
      return {
        id: entry.name,
        title,
        description,
        categories,
        hasAssets,
        files,
        sourceType: "local",
        path: relPath,
        sourceUrl: REPO_URL ? `${REPO_URL}/tree/main/${relPath}` : null,
        lastUpdated: FILE_DATES.get(`${relPath}/SKILL.md`) ?? null,
        searchText: `${title} ${description}`.toLowerCase(),
      };
    })
    .filter((s) => s.description);

  const remoteItems = [];
  const remotes = readRemoteRepositories();
  for (const remote of remotes) {
    const remoteSkills = await fetchRemoteRepoSkills(remote.repo, remote.name, seenIds);
    remoteItems.push(...remoteSkills);
  }

  const items = [...localItems, ...remoteItems].sort((a, b) => a.title.localeCompare(b.title));
  const sourceTypes = [...new Set(items.map((i) => i.sourceType))].sort();

  const repoPath = REPO_URL ? REPO_URL.replace("https://github.com/", "") : null;
  return { items, filters: { sourceTypes, categories: [...allCategories].sort() }, repoPath };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function generateHooks() {
  const dir = path.join(REPO_ROOT, "hooks");
  if (!fs.existsSync(dir)) return { items: [], filters: { events: [], tags: [] } };

  const allEvents = new Set();
  const allTags = new Set();

  const items = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((entry) => {
      const readmePath = path.join(dir, entry.name, "README.md");
      const hooksJsonPath = path.join(dir, entry.name, "hooks.json");

      const fm = fs.existsSync(readmePath) ? readFrontmatter(readmePath) : {};

      let events = [];
      if (fs.existsSync(hooksJsonPath)) {
        try {
          const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
          events = Object.keys(hooksJson.hooks || {});
        } catch { /* skip */ }
      }

      const tags = Array.isArray(fm.tags) ? fm.tags : [];
      events.forEach((e) => allEvents.add(e));
      tags.forEach((t) => allTags.add(t));

      const relPath = `hooks/${entry.name}`;
      const hookDir = path.join(dir, entry.name);
      return {
        id: entry.name,
        title: fm.name || toTitleCase(entry.name),
        description: fm.description || "",
        events,
        tags,
        files: listFilesRecursive(hookDir),
        path: relPath,
        sourceUrl: REPO_URL ? `${REPO_URL}/tree/main/${relPath}` : null,
        lastUpdated: FILE_DATES.get(`${relPath}/README.md`) ?? FILE_DATES.get(`${relPath}/hooks.json`) ?? null,
        searchText: `${fm.name || entry.name} ${fm.description || ""} ${events.join(" ")} ${tags.join(" ")}`.toLowerCase(),
      };
    })
    .filter((h) => h.description)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    items,
    filters: { events: [...allEvents].sort(), tags: [...allTags].sort() },
  };
}

// ─── Workflows ───────────────────────────────────────────────────────────────

function extractTriggers(content) {
  const triggers = [];
  const lines = content.split(/\r?\n/);
  let inOn = false;
  let topIndent = null;

  for (const line of lines) {
    if (/^on\s*:/.test(line)) { inOn = true; topIndent = null; continue; }
    if (inOn) {
      if (/^\S/.test(line)) { inOn = false; continue; }
      const m = line.match(/^( +)(\w+)\s*:/);
      if (m) {
        if (topIndent === null) topIndent = m[1].length;
        if (m[1].length === topIndent) triggers.push(m[2]);
      }
    }
  }
  return triggers;
}

function generateWorkflows() {
  const dir = path.join(REPO_ROOT, "workflows");
  if (!fs.existsSync(dir)) return { items: [], filters: { triggers: [] } };

  const allTriggers = new Set();

  const items = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const fm = parseFrontmatter(content);
      const id = file.replace(/\.md$/, "");
      const triggers = extractTriggers(content.match(/^---[\s\S]*?---/)?.[0] || "");
      triggers.forEach((t) => allTriggers.add(t));

      const relPath = `workflows/${file}`;
      return {
        id,
        title: fm.name || toTitleCase(id),
        description: fm.description || "",
        triggers,
        path: relPath,
        sourceUrl: REPO_URL ? `${REPO_URL}/blob/main/${relPath}` : null,
        lastUpdated: FILE_DATES.get(relPath) ?? null,
        searchText: `${fm.name || id} ${fm.description || ""} ${triggers.join(" ")}`.toLowerCase(),
      };
    })
    .filter((w) => w.description)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    items,
    filters: { triggers: [...allTriggers].sort() },
  };
}

// ─── Plugins ─────────────────────────────────────────────────────────────────

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
    if (tokens.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack))) {
      matched.push(category);
    }
  }
  return matched.length > 0 ? matched : ["Other"];
}

function scanPluginResources(pluginDir, pluginRelPath) {
  const rawBase = REPO_URL
    ? `${REPO_URL.replace("https://github.com/", "https://raw.githubusercontent.com/")}/main/${pluginRelPath}`
    : null;
  const resources = [];

  const skillsDir = path.join(pluginDir, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
      const fm = fs.existsSync(skillMd) ? readFrontmatter(skillMd) : {};
      resources.push({ type: "skill", id: entry.name, title: fm.name ? toTitleCase(fm.name) : toTitleCase(entry.name), rawUrl: rawBase ? `${rawBase}/skills/${entry.name}/SKILL.md` : null });
    }
  }

  const agentsDir = path.join(pluginDir, "agents");
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (!file.endsWith(".md")) continue;
      const id = file.replace(/\.(agent\.)?md$/, "");
      const fm = readFrontmatter(path.join(agentsDir, file));
      resources.push({ type: "agent", id, title: fm.name ? toTitleCase(fm.name) : toTitleCase(id), rawUrl: rawBase ? `${rawBase}/agents/${file}` : null });
    }
  }

  const instructionsDir = path.join(pluginDir, "instructions");
  if (fs.existsSync(instructionsDir)) {
    for (const file of fs.readdirSync(instructionsDir)) {
      if (!file.endsWith(".md")) continue;
      const id = file.replace(/\.(instructions\.)?md$/, "");
      const fm = readFrontmatter(path.join(instructionsDir, file));
      resources.push({ type: "instruction", id, title: fm.name ? toTitleCase(fm.name) : toTitleCase(id), rawUrl: rawBase ? `${rawBase}/instructions/${file}` : null });
    }
  }

  const hooksDir = path.join(pluginDir, "hooks");
  if (fs.existsSync(hooksDir)) {
    for (const entry of fs.readdirSync(hooksDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const readmePath = path.join(hooksDir, entry.name, "README.md");
      const fm = fs.existsSync(readmePath) ? readFrontmatter(readmePath) : {};
      resources.push({ type: "hook", id: entry.name, title: fm.name ? toTitleCase(fm.name) : toTitleCase(entry.name), rawUrl: rawBase ? `${rawBase}/hooks/${entry.name}/README.md` : null });
    }
  }

  const workflowsDir = path.join(pluginDir, "workflows");
  if (fs.existsSync(workflowsDir)) {
    for (const file of fs.readdirSync(workflowsDir)) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const id = file.replace(/\.(yml|yaml)$/, "");
      const fm = readFrontmatter(path.join(workflowsDir, file));
      resources.push({ type: "workflow", id, title: fm.name ? toTitleCase(fm.name) : toTitleCase(id), rawUrl: rawBase ? `${rawBase}/workflows/${file}` : null });
    }
  }

  return resources;
}

function makePluginItem(data, name, { external = false, pluginUrl = null } = {}) {
  const tags = data.keywords || data.tags || [];
  const categories = deriveCategories(data.name || name, data.description || "", tags);
  const url = pluginUrl || data.repository || data.homepage || null;
  return {
    id: slugify(data.name || name),
    name: data.name || name,
    description: data.description || "",
    version: data.version || "",
    tags,
    categories,
    external,
    sourceType: external ? "external" : "local",
    repository: data.repository || null,
    homepage: data.homepage || null,
    author: data.author || null,
    license: data.license || null,
    pluginUrl: url,
    searchText: `${data.name || name} ${data.description || ""} ${tags.join(" ")} ${categories.join(" ")}`.toLowerCase(),
  };
}

function generatePlugins() {
  const dir = path.join(REPO_ROOT, "plugins");
  if (!fs.existsSync(dir)) return { items: [], filters: { tags: [], categories: [] } };

  const allTags = new Set();
  const allCategories = new Set();
  const seenIds = new Set();

  // Local plugins from subdirectories
  const localItems = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((entry) => {
      const jsonPath = path.join(dir, entry.name, ".github", "plugin", "plugin.json");
      if (!fs.existsSync(jsonPath)) return null;
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        const item = makePluginItem(data, entry.name);
        item.resources = scanPluginResources(path.join(dir, entry.name), `plugins/${entry.name}`);
        seenIds.add(item.id);
        item.tags.forEach((t) => allTags.add(t));
        item.categories.forEach((c) => allCategories.add(c));
        return item;
      } catch { return null; }
    })
    .filter(Boolean);

  // External plugins from external.json
  const externalPath = path.join(dir, "external.json");
  const externalItems = [];
  if (fs.existsSync(externalPath)) {
    try {
      const externals = JSON.parse(fs.readFileSync(externalPath, "utf8"));
      for (const ext of Array.isArray(externals) ? externals : []) {
        if (!ext.name) continue;
        const id = slugify(ext.name);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        let pluginUrl = ext.repository || ext.homepage || null;
        if (ext.source?.source === "github" && ext.source.repo) {
          const base = `https://github.com/${ext.source.repo}`;
          pluginUrl = ext.source.path ? `${base}/tree/main/${ext.source.path}` : base;
        }

        const item = makePluginItem(ext, ext.name, { external: true, pluginUrl });
        item.tags.forEach((t) => allTags.add(t));
        item.categories.forEach((c) => allCategories.add(c));
        externalItems.push(item);
      }
    } catch { /* skip malformed external.json */ }
  }

  const items = [...localItems, ...externalItems].sort((a, b) => a.name.localeCompare(b.name));
  const sourceTypes = [...new Set(items.map((i) => i.sourceType))].sort();

  return {
    items,
    filters: { tags: [...allTags].sort(), categories: [...allCategories].sort(), sourceTypes },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Name/description: env vars take precedence, then fall back to README
  let marketplaceName = process.env.MARKETPLACE_NAME || "";
  let description = process.env.MARKETPLACE_DESCRIPTION || "";

  const readmePath = path.join(REPO_ROOT, "README.md");
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, "utf8");
    if (!marketplaceName) {
      const h1 = readme.match(/^#\s+(.+)/m);
      if (h1) marketplaceName = h1[1].trim();
    }
    if (!description) {
      // First non-empty paragraph after the H1
      const afterH1 = readme.replace(/^#\s+.+/m, "").trim();
      const para = afterH1.match(/^([^#\n].+)/m);
      if (para) description = para[1].trim();
    }
  }

  if (!marketplaceName) marketplaceName = path.basename(REPO_ROOT);

  REPO_URL = getGithubRepoUrl(REPO_ROOT);
  FILE_DATES = buildFileDateMap(REPO_ROOT);
  if (REPO_URL) console.log(`  repo:         ${REPO_URL}`);

  console.log(`Scanning ${REPO_ROOT}...\n`);

  const agents      = generateAgents();
  const instructions = generateInstructions();
  const skills      = await generateSkills();
  const hooks       = generateHooks();
  const workflows   = generateWorkflows();
  const plugins     = generatePlugins();

  console.log(`  agents:       ${agents.items.length}`);
  console.log(`  instructions: ${instructions.items.length}`);
  console.log(`  skills:       ${skills.items.length}`);
  console.log(`  hooks:        ${hooks.items.length}`);
  console.log(`  workflows:    ${workflows.items.length}`);
  console.log(`  plugins:      ${plugins.items.length}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const write = (name, data) =>
    fs.writeFileSync(path.join(OUTPUT_DIR, name), JSON.stringify(data, null, 2));

  write("agents.json",       agents);
  write("instructions.json", instructions);
  write("skills.json",       skills);
  write("hooks.json",        hooks);
  write("workflows.json",    workflows);
  write("plugins.json",      plugins);

  const searchIndex = [
    ...agents.items.map(i => ({ type: "agent",       id: i.id, title: i.title,            description: i.description, rawUrl: blobUrlToRaw(i.sourceUrl),                               searchText: i.searchText })),
    ...instructions.items.map(i => ({ type: "instruction", id: i.id, title: i.title,      description: i.description, rawUrl: i.rawUrl ?? null,                                        searchText: i.searchText })),
    ...skills.items.map(i => ({ type: "skill",       id: i.id, title: i.title,            description: i.description, rawUrl: i.sourceUrl ? `${treeUrlToRawBase(i.sourceUrl)}/SKILL.md` : null,   searchText: i.searchText })),
    ...hooks.items.map(i => ({ type: "hook",         id: i.id, title: i.title,            description: i.description, rawUrl: i.sourceUrl ? `${treeUrlToRawBase(i.sourceUrl)}/README.md` : null,  searchText: i.searchText })),
    ...workflows.items.map(i => ({ type: "workflow",  id: i.id, title: i.title,           description: i.description, rawUrl: blobUrlToRaw(i.sourceUrl),                               searchText: i.searchText })),
    ...plugins.items.map(i => ({ type: "plugin",     id: i.id, title: i.name || i.title, description: i.description, rawUrl: null,                                                    searchText: i.searchText })),
  ];
  write("search-index.json", searchIndex);

  const total =
    agents.items.length + instructions.items.length + skills.items.length +
    hooks.items.length + workflows.items.length + plugins.items.length;

  const githubRepo = REPO_URL ? REPO_URL.replace("https://github.com/", "") : null;

  write("manifest.json", {
    _schema: SCHEMA_VERSION,
    generated: new Date().toISOString(),
    marketplaceName,
    githubRepo,
    description,
    counts: {
      agents:       agents.items.length,
      instructions: instructions.items.length,
      skills:       skills.items.length,
      hooks:        hooks.items.length,
      workflows:    workflows.items.length,
      plugins:      plugins.items.length,
      total,
    },
  });

  console.log(`\n✓ Written to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
