import {
  createChoices,
  getChoicesValues,
  setChoicesValues,
  type Choices,
} from "./choices";
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
  };
}

let allItems: Plugin[] = [];
let search = new FuzzySearch<Plugin>();
let tagSelect: Choices;
let categorySelect: Choices;
let currentFilters = {
  tags: [] as string[],
  categories: [] as string[],
};

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

  renderItems(results, query);

  const activeFilters: string[] = [];
  if (currentFilters.tags.length > 0)
    activeFilters.push(`${currentFilters.tags.length} tag${currentFilters.tags.length > 1 ? "s" : ""}`);
  if (currentFilters.categories.length > 0)
    activeFilters.push(`${currentFilters.categories.length} categor${currentFilters.categories.length > 1 ? "ies" : "y"}`);

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
  });
}

function syncUrlState(searchInput: HTMLInputElement | null): void {
  updateQueryParams({
    q: searchInput?.value ?? "",
    tag: currentFilters.tags,
    category: currentFilters.categories,
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

  const initialQuery = getQueryParam("q");
  const initialTags = getQueryParamValues("tag").filter((t) => data.filters.tags.includes(t));
  const initialCategories = getQueryParamValues("category").filter((c) =>
    data.filters.categories.includes(c)
  );

  if (searchInput) searchInput.value = initialQuery;
  if (initialTags.length > 0) {
    currentFilters.tags = initialTags;
    setChoicesValues(tagSelect, initialTags);
  }
  if (initialCategories.length > 0) {
    currentFilters.categories = initialCategories;
    setChoicesValues(categorySelect, initialCategories);
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

  searchInput?.addEventListener(
    "input",
    debounce(() => {
      applyFiltersAndRender();
      syncUrlState(searchInput);
    }, 200)
  );

  clearFiltersBtn?.addEventListener("click", () => {
    currentFilters = { tags: [], categories: [] };
    tagSelect.removeActiveItems();
    categorySelect.removeActiveItems();
    if (searchInput) searchInput.value = "";
    applyFiltersAndRender();
    syncUrlState(searchInput);
  });

  const countEl = document.getElementById("results-count");
  if (countEl) countEl.textContent = `${allItems.length} of ${allItems.length} plugins`;

  applyFiltersAndRender();
}

document.addEventListener("DOMContentLoaded", initPluginsPage);
