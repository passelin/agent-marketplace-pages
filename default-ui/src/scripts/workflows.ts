import { initResourceActions } from "./resource-actions";
import { initModal, checkAutoOpen } from "./modal";
import { createChoices, getChoicesValues, setChoicesValues, type Choices } from "./choices";
import { FuzzySearch } from "./search";
import { fetchData, debounce, getQueryParam, getQueryParamValues, updateQueryParams } from "./utils";
import { renderWorkflowsHtml, type RenderableWorkflow } from "./workflows-render";

interface Workflow extends RenderableWorkflow { searchText?: string; }
interface WorkflowsData { items: Workflow[]; filters: { triggers: string[] }; }

let allItems: Workflow[] = [];
let search = new FuzzySearch<Workflow>();
let triggerSelect: Choices;
let currentFilters = { triggers: [] as string[] };

function applyFiltersAndRender(): void {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const countEl = document.getElementById("results-count");
  const query = searchInput?.value || "";
  let results = query ? search.search(query) : [...allItems];

  if (currentFilters.triggers.length > 0) {
    results = results.filter((item) =>
      item.triggers?.some((t) => currentFilters.triggers.includes(t))
    );
  }

  const list = document.getElementById("resource-list");
  if (list) list.innerHTML = renderWorkflowsHtml(results, { query, highlightTitle: (t, q) => search.highlight(t, q) });

  let countText = `${results.length} of ${allItems.length} workflows`;
  if (currentFilters.triggers.length > 0) countText += ` (filtered by trigger)`;
  if (countEl) countEl.textContent = countText;
}

function syncUrl(searchInput: HTMLInputElement | null): void {
  updateQueryParams({ q: searchInput?.value ?? "", trigger: currentFilters.triggers });
}

initResourceActions();
initModal();

document.addEventListener("DOMContentLoaded", async () => {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const clearBtn = document.getElementById("clear-filters");

  const data = await fetchData<WorkflowsData>("workflows.json");
  const list = document.getElementById("resource-list");
  if (!data?.items) {
    if (list) list.innerHTML = '<div class="empty-state"><h3>Failed to load workflows</h3></div>';
    return;
  }

  allItems = data.items;
  search.setItems(allItems.map((i) => ({ ...i, title: i.title })));

  triggerSelect = createChoices("#filter-trigger", { placeholderValue: "All Triggers" });
  triggerSelect.setChoices(
    data.filters.triggers.map((t) => ({ value: t, label: t })), "value", "label", true
  );

  const initialQuery = getQueryParam("q");
  const initialTriggers = getQueryParamValues("trigger").filter((t) => data.filters.triggers.includes(t));
  if (searchInput) searchInput.value = initialQuery;
  if (initialTriggers.length > 0) { currentFilters.triggers = initialTriggers; setChoicesValues(triggerSelect, initialTriggers); }

  document.getElementById("filter-trigger")?.addEventListener("change", () => {
    currentFilters.triggers = getChoicesValues(triggerSelect);
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  searchInput?.addEventListener("input", debounce(() => { applyFiltersAndRender(); syncUrl(searchInput); }, 200));
  clearBtn?.addEventListener("click", () => {
    currentFilters = { triggers: [] };
    triggerSelect.removeActiveItems();
    if (searchInput) searchInput.value = "";
    applyFiltersAndRender(); syncUrl(searchInput);
  });

  if (document.getElementById("results-count"))
    document.getElementById("results-count")!.textContent = `${allItems.length} of ${allItems.length} workflows`;
  applyFiltersAndRender();
  checkAutoOpen("workflow");
});
