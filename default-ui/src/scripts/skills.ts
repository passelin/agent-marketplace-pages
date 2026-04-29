import {
  createChoices,
  getChoicesValues,
  setChoicesValues,
  type Choices,
} from "./choices";
import { initResourceActions } from "./resource-actions";
import { initModal, checkAutoOpen } from "./modal";
import { FuzzySearch } from "./search";
import { fetchData, debounce, getQueryParam, getQueryParamValues, updateQueryParams } from "./utils";
import { renderSkillsHtml, type RenderableSkill } from "./skills-render";

interface Skill extends RenderableSkill { searchText?: string; }
interface SkillsData {
  items: Skill[];
  filters: { categories?: string[]; sourceTypes?: string[] };
  repoPath?: string | null;
}

let allItems: Skill[] = [];
let repoPath: string | null = null;
let search = new FuzzySearch<Skill>();
let categorySelect: Choices;
let currentFilters = { categories: [] as string[], hasAssets: false };
let currentSort = "name-asc";

function sortItems(items: Skill[]): Skill[] {
  const sorted = [...items];
  if (currentSort === "name-asc") return sorted.sort((a, b) => a.title.localeCompare(b.title));
  if (currentSort === "name-desc") return sorted.sort((a, b) => b.title.localeCompare(a.title));
  if (currentSort === "updated") {
    return sorted.sort((a, b) => {
      const da = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const db = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return db - da;
    });
  }
  return sorted;
}

function applyFiltersAndRender(): void {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const countEl = document.getElementById("results-count");
  const query = searchInput?.value || "";
  let results = query ? search.search(query) : [...allItems];

  if (currentFilters.categories.length > 0) {
    results = results.filter((item) =>
      (item.categories || []).some((c) => currentFilters.categories.includes(c))
    );
  }

  if (currentFilters.hasAssets) {
    results = results.filter((item) => item.hasAssets);
  }

  results = sortItems(results);

  const list = document.getElementById("resource-list");
  if (list) list.innerHTML = renderSkillsHtml(results, { query, highlightTitle: (t, q) => search.highlight(t, q), repoPath });

  const activeCount = currentFilters.categories.length + (currentFilters.hasAssets ? 1 : 0);
  let countText = `${results.length} of ${allItems.length} skills`;
  if (activeCount > 0) countText += ` (filtered)`;
  if (countEl) countEl.textContent = countText;
}

function syncUrl(searchInput: HTMLInputElement | null): void {
  updateQueryParams({
    q: searchInput?.value ?? "",
    category: currentFilters.categories,
    assets: currentFilters.hasAssets || null,
    sort: currentSort === "name-asc" ? null : currentSort,
  });
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

document.addEventListener("DOMContentLoaded", async () => {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const clearBtn = document.getElementById("clear-filters");
  const assetsCheck = document.getElementById("filter-assets") as HTMLInputElement;
  const sortSelect = document.getElementById("filter-sort") as HTMLSelectElement;

  const data = await fetchData<SkillsData>("skills.json");
  const list = document.getElementById("resource-list");
  if (!data?.items) {
    if (list) list.innerHTML = '<div class="empty-state"><h3>Failed to load skills</h3></div>';
    return;
  }

  allItems = data.items;
  repoPath = data.repoPath ?? null;
  search.setItems(allItems.map((i) => ({ ...i, title: i.title })));

  const categories = data.filters.categories ?? [];
  categorySelect = createChoices("#filter-category", { placeholderValue: "All Categories" });
  categorySelect.setChoices(
    categories.map((c) => ({ value: c, label: c })),
    "value", "label", true
  );

  // Restore URL state
  const initialQuery = getQueryParam("q");
  const initialCategories = getQueryParamValues("category").filter((c) => categories.includes(c));
  const initialAssets = getQueryParam("assets") === "1";
  const initialSort = getQueryParam("sort") || "name-asc";

  if (searchInput) searchInput.value = initialQuery;
  if (initialCategories.length > 0) { currentFilters.categories = initialCategories; setChoicesValues(categorySelect, initialCategories); }
  if (initialAssets) { currentFilters.hasAssets = true; if (assetsCheck) assetsCheck.checked = true; }
  if (initialSort) { currentSort = initialSort; if (sortSelect) sortSelect.value = initialSort; }

  document.getElementById("filter-category")?.addEventListener("change", () => {
    currentFilters.categories = getChoicesValues(categorySelect);
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  assetsCheck?.addEventListener("change", () => {
    currentFilters.hasAssets = assetsCheck.checked;
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  sortSelect?.addEventListener("change", () => {
    currentSort = sortSelect.value;
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  searchInput?.addEventListener("input", debounce(() => { applyFiltersAndRender(); syncUrl(searchInput); }, 200));
  clearBtn?.addEventListener("click", () => {
    currentFilters = { categories: [], hasAssets: false };
    currentSort = "name-asc";
    categorySelect.removeActiveItems();
    if (assetsCheck) assetsCheck.checked = false;
    if (sortSelect) sortSelect.value = "name-asc";
    if (searchInput) searchInput.value = "";
    applyFiltersAndRender(); syncUrl(searchInput);
  });

  if (document.getElementById("results-count"))
    document.getElementById("results-count")!.textContent = `${allItems.length} of ${allItems.length} skills`;
  applyFiltersAndRender();
  checkAutoOpen("skill");
});
