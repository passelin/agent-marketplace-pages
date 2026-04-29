import {
  createChoices,
  getChoicesValues,
  setChoicesValues,
  type Choices,
} from "./choices";
import { initResourceActions } from "./resource-actions";
import { initModal } from "./modal";
import { FuzzySearch } from "./search";
import {
  fetchData,
  debounce,
  getQueryParam,
  getQueryParamValues,
  updateQueryParams,
} from "./utils";
import { renderPluginsHtml, type RenderablePlugin } from "./plugins-render";

interface Plugin extends RenderablePlugin {
  searchText?: string;
  title?: string;
}

interface PluginsData {
  items: Plugin[];
  filters: {
    tags: string[];
    categories: string[];
    sourceTypes?: string[];
  };
}

let allItems: Plugin[] = [];
let marketplaceName: string | null = null;
let search = new FuzzySearch<Plugin>();
let tagSelect: Choices;
let categorySelect: Choices;
let sourceSelect: Choices;
let currentFilters = {
  tags: [] as string[],
  categories: [] as string[],
  sourceTypes: [] as string[],
};

function getItemSourceType(item: Plugin): string {
  if ((item as { sourceType?: string }).sourceType) {
    return (item as { sourceType: string }).sourceType;
  }
  if (item.sourceMarketplace) return "remote";
  if (item.external) return "external";
  return "local";
}

function toSourceLabel(sourceType: string): string {
  return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
}

function applyFiltersAndRender(): void {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const countEl = document.getElementById("results-count");
  const query = searchInput?.value || "";

  let results = query ? search.search(query) : [...allItems];

  if (currentFilters.tags.length > 0) {
    results = results.filter((item) =>
      item.tags?.some((tag) => currentFilters.tags.includes(tag))
    );
  }

  if (currentFilters.categories.length > 0) {
    results = results.filter((item) =>
      item.categories?.some((cat) => currentFilters.categories.includes(cat))
    );
  }

  if (currentFilters.sourceTypes.length > 0) {
    results = results.filter((item) =>
      currentFilters.sourceTypes.includes(getItemSourceType(item))
    );
  }

  renderItems(results, query);

  const activeFilters: string[] = [];
  if (currentFilters.tags.length > 0)
    activeFilters.push(`${currentFilters.tags.length} tag${currentFilters.tags.length > 1 ? "s" : ""}`);
  if (currentFilters.categories.length > 0)
    activeFilters.push(`${currentFilters.categories.length} categor${currentFilters.categories.length > 1 ? "ies" : "y"}`);
  if (currentFilters.sourceTypes.length > 0)
    activeFilters.push(`${currentFilters.sourceTypes.length} source${currentFilters.sourceTypes.length > 1 ? "s" : ""}`);

  let countText = `${results.length} of ${allItems.length} plugins`;
  if (activeFilters.length > 0) countText += ` (filtered by ${activeFilters.join(", ")})`;
  if (countEl) countEl.textContent = countText;
}

function renderItems(items: Plugin[], query = ""): void {
  const list = document.getElementById("resource-list");
  if (!list) return;

  list.innerHTML = renderPluginsHtml(items, {
    query,
    highlightTitle: (title, q) => search.highlight(title, q),
    marketplaceName,
  });
}

function syncUrlState(searchInput: HTMLInputElement | null): void {
  updateQueryParams({
    q: searchInput?.value ?? "",
    tag: currentFilters.tags,
    category: currentFilters.categories,
    source: currentFilters.sourceTypes,
  });
}

export async function initPluginsPage(): Promise<void> {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const clearFiltersBtn = document.getElementById("clear-filters");

  const data = await fetchData<PluginsData>("plugins.json");
  const list = document.getElementById("resource-list");

  if (!data || !data.items) {
    if (list) list.innerHTML = '<div class="empty-state"><h3>Failed to load plugins</h3></div>';
    return;
  }

  allItems = data.items;

  const searchItems = allItems.map((item) => ({
    ...item,
    title: item.name,
  }));
  search.setItems(searchItems);

  tagSelect = createChoices("#filter-tag", { placeholderValue: "All Tags" });
  tagSelect.setChoices(
    data.filters.tags.map((t) => ({ value: t, label: t })),
    "value",
    "label",
    true
  );

  categorySelect = createChoices("#filter-category", { placeholderValue: "All Categories" });
  categorySelect.setChoices(
    data.filters.categories.map((c) => ({ value: c, label: c })),
    "value",
    "label",
    true
  );

  const sourceTypes = data.filters.sourceTypes && data.filters.sourceTypes.length > 0
    ? data.filters.sourceTypes
    : [...new Set(allItems.map((item) => getItemSourceType(item)))].sort();
  sourceSelect = createChoices("#filter-source", { placeholderValue: "All Sources" });
  sourceSelect.setChoices(
    sourceTypes.map((s) => ({ value: s, label: toSourceLabel(s) })),
    "value",
    "label",
    true
  );

  const initialQuery = getQueryParam("q");
  const initialTags = getQueryParamValues("tag").filter((t) => data.filters.tags.includes(t));
  const initialCategories = getQueryParamValues("category").filter((c) =>
    data.filters.categories.includes(c)
  );
  const initialSources = getQueryParamValues("source").filter((s) => sourceTypes.includes(s));

  if (searchInput) searchInput.value = initialQuery;
  if (initialTags.length > 0) {
    currentFilters.tags = initialTags;
    setChoicesValues(tagSelect, initialTags);
  }
  if (initialCategories.length > 0) {
    currentFilters.categories = initialCategories;
    setChoicesValues(categorySelect, initialCategories);
  }
  if (initialSources.length > 0) {
    currentFilters.sourceTypes = initialSources;
    setChoicesValues(sourceSelect, initialSources);
  }

  document.getElementById("filter-tag")?.addEventListener("change", () => {
    currentFilters.tags = getChoicesValues(tagSelect);
    applyFiltersAndRender();
    syncUrlState(searchInput);
  });

  document.getElementById("filter-category")?.addEventListener("change", () => {
    currentFilters.categories = getChoicesValues(categorySelect);
    applyFiltersAndRender();
    syncUrlState(searchInput);
  });

  document.getElementById("filter-source")?.addEventListener("change", () => {
    currentFilters.sourceTypes = getChoicesValues(sourceSelect);
    applyFiltersAndRender();
    syncUrlState(searchInput);
  });

  searchInput?.addEventListener(
    "input",
    debounce(() => {
      applyFiltersAndRender();
      syncUrlState(searchInput);
    }, 200)
  );

  clearFiltersBtn?.addEventListener("click", () => {
    currentFilters = { tags: [], categories: [], sourceTypes: [] };
    tagSelect.removeActiveItems();
    categorySelect.removeActiveItems();
    sourceSelect.removeActiveItems();
    if (searchInput) searchInput.value = "";
    applyFiltersAndRender();
    syncUrlState(searchInput);
  });

  const countEl = document.getElementById("results-count");
  if (countEl) countEl.textContent = `${allItems.length} of ${allItems.length} plugins`;

  applyFiltersAndRender();
}

initResourceActions();
initModal();

document.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>(".btn-copy-install");
  if (!btn) return;
  const cmd = btn.dataset.copyCommand;
  if (!cmd) return;
  navigator.clipboard.writeText(cmd).then(() => {
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  });
});

const ICON_CHECK = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1,5 4,8 9,2"/></svg>`;
const ICON_CHEVRON_RESTORE = `<svg width="10" height="10" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true"><path d="M0 0l5 6 5-6z"/></svg>`;

document.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>(".btn-copy-option");
  if (!btn) return;
  const cmd = btn.dataset.copyCommand;
  if (!cmd) return;
  navigator.clipboard.writeText(cmd).then(() => {
    const dropdown = btn.closest<HTMLElement>(".install-dropdown");
    const toggle = dropdown?.parentElement?.querySelector<HTMLButtonElement>(".btn-install-toggle");
    if (dropdown) dropdown.hidden = true;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = ICON_CHECK;
      toggle.classList.add("copied");
      setTimeout(() => { toggle.innerHTML = ICON_CHEVRON_RESTORE; toggle.classList.remove("copied"); }, 2000);
    }
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
});

document.addEventListener("DOMContentLoaded", () => {
  marketplaceName = (document.getElementById("marketplace-config") as HTMLElement | null)
    ?.dataset.marketplaceName ?? null;
  initPluginsPage();
});
