import { initResourceActions } from "./resource-actions";
import { initModal, checkAutoOpen } from "./modal";
import { createChoices, getChoicesValues, setChoicesValues, type Choices } from "./choices";
import { FuzzySearch } from "./search";
import { fetchData, debounce, getQueryParam, getQueryParamValues, updateQueryParams } from "./utils";
import { renderInstructionsHtml, type RenderableInstruction } from "./instructions-render";

interface Instruction extends RenderableInstruction { searchText?: string; }
interface InstructionsData { items: Instruction[]; filters: { extensions: string[] }; }

let allItems: Instruction[] = [];
let search = new FuzzySearch<Instruction>();
let extSelect: Choices;
let currentFilters = { extensions: [] as string[] };

function applyFiltersAndRender(): void {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const countEl = document.getElementById("results-count");
  const query = searchInput?.value || "";
  let results = query ? search.search(query) : [...allItems];

  if (currentFilters.extensions.length > 0) {
    results = results.filter((item) =>
      item.extensions?.some((e) => currentFilters.extensions.includes(e))
    );
  }

  const list = document.getElementById("resource-list");
  if (list) list.innerHTML = renderInstructionsHtml(results, { query, highlightTitle: (t, q) => search.highlight(t, q) });

  let countText = `${results.length} of ${allItems.length} instructions`;
  if (currentFilters.extensions.length > 0) countText += ` (filtered by extension)`;
  if (countEl) countEl.textContent = countText;
}

function syncUrl(searchInput: HTMLInputElement | null): void {
  updateQueryParams({ q: searchInput?.value ?? "", ext: currentFilters.extensions });
}

initResourceActions();
initModal();

document.addEventListener("DOMContentLoaded", async () => {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const clearBtn = document.getElementById("clear-filters");

  const data = await fetchData<InstructionsData>("instructions.json");
  const list = document.getElementById("resource-list");
  if (!data?.items) {
    if (list) list.innerHTML = '<div class="empty-state"><h3>Failed to load instructions</h3></div>';
    return;
  }

  allItems = data.items;
  search.setItems(allItems.map((i) => ({ ...i, title: i.title })));

  extSelect = createChoices("#filter-ext", { placeholderValue: "All Extensions" });
  extSelect.setChoices(
    data.filters.extensions.map((e) => ({ value: e, label: e })), "value", "label", true
  );

  const initialQuery = getQueryParam("q");
  const initialExts = getQueryParamValues("ext").filter((e) => data.filters.extensions.includes(e));
  if (searchInput) searchInput.value = initialQuery;
  if (initialExts.length > 0) { currentFilters.extensions = initialExts; setChoicesValues(extSelect, initialExts); }

  document.getElementById("filter-ext")?.addEventListener("change", () => {
    currentFilters.extensions = getChoicesValues(extSelect);
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  searchInput?.addEventListener("input", debounce(() => { applyFiltersAndRender(); syncUrl(searchInput); }, 200));
  clearBtn?.addEventListener("click", () => {
    currentFilters = { extensions: [] };
    extSelect.removeActiveItems();
    if (searchInput) searchInput.value = "";
    applyFiltersAndRender(); syncUrl(searchInput);
  });

  if (document.getElementById("results-count"))
    document.getElementById("results-count")!.textContent = `${allItems.length} of ${allItems.length} instructions`;
  applyFiltersAndRender();
  checkAutoOpen("instruction");
});
