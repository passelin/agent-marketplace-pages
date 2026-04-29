import { FuzzySearch } from "./search";
import { fetchData, debounce, escapeHtml } from "./utils";
import { openModalFromData } from "./modal";

interface GlobalSearchItem {
  type: string;
  id: string;
  title: string;
  description?: string;
  rawUrl?: string | null;
  searchText?: string;
  [key: string]: unknown;
}

const TYPE_META: Record<string, { icon: string; label: string; color: string; href: string }> = {
  plugin:      { icon: "🔌", label: "Plugins",      color: "#7c3aed", href: "plugins/" },
  agent:       { icon: "🤖", label: "Agents",       color: "#2563eb", href: "agents/" },
  instruction: { icon: "📋", label: "Instructions", color: "#0891b2", href: "instructions/" },
  skill:       { icon: "⚡", label: "Skills",       color: "#ca8a04", href: "skills/" },
  hook:        { icon: "🪝", label: "Hooks",        color: "#c2410c", href: "hooks/" },
  workflow:    { icon: "⚙️",  label: "Workflows",    color: "#15803d", href: "workflows/" },
};

const TYPE_ORDER = Object.keys(TYPE_META);

const search = new FuzzySearch<GlobalSearchItem>();

function renderResult(item: GlobalSearchItem, query: string, href: string): string {
  const titleHtml = search.highlight(item.title, query);
  const raw = item.description ?? "";
  const desc = raw.length > 110 ? raw.slice(0, 110) + "…" : raw;
  const descHtml = desc ? search.highlight(desc, query) : "";

  if (item.rawUrl) {
    return `<button type="button" class="gs-result" data-raw-url="${escapeHtml(item.rawUrl)}" data-title="${escapeHtml(item.title)}" data-type="${escapeHtml(item.type)}">
      <div class="gs-title">${titleHtml}</div>
      ${descHtml ? `<div class="gs-desc">${descHtml}</div>` : ""}
    </button>`;
  }

  const url = `${href}?q=${encodeURIComponent(item.title)}`;
  return `<a href="${escapeHtml(url)}" class="gs-result">
    <div class="gs-title">${titleHtml}</div>
    ${descHtml ? `<div class="gs-desc">${descHtml}</div>` : ""}
  </a>`;
}

function renderGroup(type: string, items: GlobalSearchItem[], query: string): string {
  const meta = TYPE_META[type] ?? { icon: "📦", label: type, color: "#888", href: "#" };
  return `<div class="gs-group">
    <div class="gs-group-header" style="--type-color:${meta.color}">
      <span class="gs-group-icon">${meta.icon}</span>
      <span class="gs-group-label">${escapeHtml(meta.label)}</span>
      <span class="gs-group-count">${items.length}</span>
    </div>
    ${items.map((item) => renderResult(item, query, meta.href)).join("")}
  </div>`;
}

async function initGlobalSearch(): Promise<void> {
  const input = document.getElementById("global-search-input") as HTMLInputElement | null;
  const resultsEl = document.getElementById("global-search-results");
  const categoriesSection = document.getElementById("categories-section");

  if (!input || !resultsEl) return;

  const data = await fetchData<GlobalSearchItem[]>("search-index.json");
  if (data) search.setItems(data);

  function performSearch(): void {
    const query = input!.value.trim();
    if (query.length < 2) {
      resultsEl!.innerHTML = "";
      resultsEl!.hidden = true;
      if (categoriesSection) categoriesSection.hidden = false;
      return;
    }

    if (categoriesSection) categoriesSection.hidden = true;

    const results = search.search(query, { limit: 60 });
    if (results.length === 0) {
      resultsEl!.innerHTML = '<div class="gs-empty">No results found</div>';
    } else {
      const grouped = new Map<string, GlobalSearchItem[]>();
      for (const item of results) {
        if (!grouped.has(item.type)) grouped.set(item.type, []);
        grouped.get(item.type)!.push(item);
      }
      const order = [...TYPE_ORDER, ...grouped.keys()].filter((v, i, a) => a.indexOf(v) === i);
      resultsEl!.innerHTML = order
        .filter((type) => grouped.has(type))
        .map((type) => renderGroup(type, grouped.get(type)!, query))
        .join("");
    }
    resultsEl!.hidden = false;
  }

  resultsEl.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLElement>(".gs-result[data-raw-url]");
    if (!btn) return;
    e.preventDefault();
    const rawUrl = btn.dataset.rawUrl!;
    const title = btn.dataset.title ?? "";
    const type = btn.dataset.type ?? "";
    resultsEl!.hidden = true;
    input!.value = "";
    if (categoriesSection) categoriesSection.hidden = false;
    openModalFromData(rawUrl, title, type);
  });

  input.addEventListener("input", debounce(performSearch, 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input!.value = ""; performSearch(); input!.blur(); }
  });
}

document.addEventListener("DOMContentLoaded", initGlobalSearch);
