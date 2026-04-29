import { initResourceActions } from "./resource-actions";
import { initModal, checkAutoOpen } from "./modal";
import { createChoices, getChoicesValues, setChoicesValues, type Choices } from "./choices";
import { FuzzySearch } from "./search";
import { fetchData, debounce, getQueryParam, getQueryParamValues, updateQueryParams } from "./utils";
import { renderHooksHtml, type RenderableHook } from "./hooks-render";

interface Hook extends RenderableHook { searchText?: string; }
interface HooksData { items: Hook[]; filters: { events: string[]; tags: string[] }; }

let allItems: Hook[] = [];
let search = new FuzzySearch<Hook>();
let eventSelect: Choices;
let currentFilters = { events: [] as string[] };

function applyFiltersAndRender(): void {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const countEl = document.getElementById("results-count");
  const query = searchInput?.value || "";
  let results = query ? search.search(query) : [...allItems];

  if (currentFilters.events.length > 0) {
    results = results.filter((item) =>
      item.events?.some((e) => currentFilters.events.includes(e))
    );
  }

  const list = document.getElementById("resource-list");
  if (list) list.innerHTML = renderHooksHtml(results, { query, highlightTitle: (t, q) => search.highlight(t, q) });

  let countText = `${results.length} of ${allItems.length} hooks`;
  if (currentFilters.events.length > 0) countText += ` (filtered by event)`;
  if (countEl) countEl.textContent = countText;
}

function syncUrl(searchInput: HTMLInputElement | null): void {
  updateQueryParams({ q: searchInput?.value ?? "", event: currentFilters.events });
}

initResourceActions();
initModal();

document.addEventListener("DOMContentLoaded", async () => {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const clearBtn = document.getElementById("clear-filters");

  const data = await fetchData<HooksData>("hooks.json");
  const list = document.getElementById("resource-list");
  if (!data?.items) {
    if (list) list.innerHTML = '<div class="empty-state"><h3>Failed to load hooks</h3></div>';
    return;
  }

  allItems = data.items;
  search.setItems(allItems.map((i) => ({ ...i, title: i.title })));

  eventSelect = createChoices("#filter-event", { placeholderValue: "All Events" });
  eventSelect.setChoices(
    data.filters.events.map((e) => ({ value: e, label: e })), "value", "label", true
  );

  const initialQuery = getQueryParam("q");
  const initialEvents = getQueryParamValues("event").filter((e) => data.filters.events.includes(e));
  if (searchInput) searchInput.value = initialQuery;
  if (initialEvents.length > 0) { currentFilters.events = initialEvents; setChoicesValues(eventSelect, initialEvents); }

  document.getElementById("filter-event")?.addEventListener("change", () => {
    currentFilters.events = getChoicesValues(eventSelect);
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  searchInput?.addEventListener("input", debounce(() => { applyFiltersAndRender(); syncUrl(searchInput); }, 200));
  clearBtn?.addEventListener("click", () => {
    currentFilters = { events: [] };
    eventSelect.removeActiveItems();
    if (searchInput) searchInput.value = "";
    applyFiltersAndRender(); syncUrl(searchInput);
  });

  if (document.getElementById("results-count"))
    document.getElementById("results-count")!.textContent = `${allItems.length} of ${allItems.length} hooks`;
  applyFiltersAndRender();
  checkAutoOpen("hook");
});
