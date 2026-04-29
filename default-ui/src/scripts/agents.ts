import { initResourceActions } from "./resource-actions";
import { initModal, checkAutoOpen } from "./modal";
import { createChoices, getChoicesValues, setChoicesValues, type Choices } from "./choices";
import { FuzzySearch } from "./search";
import { fetchData, debounce, getQueryParam, getQueryParamValues, updateQueryParams } from "./utils";
import { renderAgentsHtml, type RenderableAgent } from "./agents-render";

interface Agent extends RenderableAgent { searchText?: string; }
interface AgentsData {
  items: Agent[];
  filters: { models: (string | string[])[]; tools: string[] };
}

const HANDOFF_TOOLS = new Set(["agent", "runSubagent", "agent/runSubagent", "copilotCodingAgent", "runSubAgent"]);

function agentHasHandoffs(item: Agent): boolean {
  return (item.tools || []).some((t) => HANDOFF_TOOLS.has(t));
}

function getItemModels(item: Agent): string[] {
  if (!item.model) return [];
  return Array.isArray(item.model) ? item.model : [item.model];
}

let allItems: Agent[] = [];
let search = new FuzzySearch<Agent>();
let modelSelect: Choices;
let toolSelect: Choices;
let currentFilters = { models: [] as string[], tools: [] as string[], hasHandoffs: false };
let currentSort = "name-asc";

function sortItems(items: Agent[]): Agent[] {
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

  if (currentFilters.models.length > 0) {
    results = results.filter((item) => {
      const models = getItemModels(item);
      return models.some((m) => currentFilters.models.includes(m));
    });
  }

  if (currentFilters.tools.length > 0) {
    results = results.filter((item) =>
      (item.tools || []).some((t) => currentFilters.tools.includes(t))
    );
  }

  if (currentFilters.hasHandoffs) {
    results = results.filter(agentHasHandoffs);
  }

  results = sortItems(results);

  const list = document.getElementById("resource-list");
  if (list) list.innerHTML = renderAgentsHtml(results, { query, highlightTitle: (t, q) => search.highlight(t, q) });

  const activeCount = currentFilters.models.length + currentFilters.tools.length + (currentFilters.hasHandoffs ? 1 : 0);
  let countText = `${results.length} of ${allItems.length} agents`;
  if (activeCount > 0) countText += ` (filtered)`;
  if (countEl) countEl.textContent = countText;
}

function syncUrl(searchInput: HTMLInputElement | null): void {
  updateQueryParams({
    q: searchInput?.value ?? "",
    model: currentFilters.models,
    tool: currentFilters.tools,
    handoffs: currentFilters.hasHandoffs || null,
    sort: currentSort === "name-asc" ? null : currentSort,
  });
}

initResourceActions();
initModal();

document.addEventListener("DOMContentLoaded", async () => {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const clearBtn = document.getElementById("clear-filters");
  const handoffsCheck = document.getElementById("filter-handoffs") as HTMLInputElement;
  const sortSelect = document.getElementById("filter-sort") as HTMLSelectElement;

  const data = await fetchData<AgentsData>("agents.json");
  const list = document.getElementById("resource-list");
  if (!data?.items) {
    if (list) list.innerHTML = '<div class="empty-state"><h3>Failed to load agents</h3></div>';
    return;
  }

  allItems = data.items;
  search.setItems(allItems.map((i) => ({ ...i, title: i.title })));

  // Normalize models — skip array entries (generator bug), keep only strings
  const models = (data.filters.models as unknown[]).filter((m): m is string => typeof m === "string");
  modelSelect = createChoices("#filter-model", { placeholderValue: "All Models" });
  modelSelect.setChoices(models.map((m) => ({ value: m, label: m })), "value", "label", true);

  toolSelect = createChoices("#filter-tool", { placeholderValue: "All Tools" });
  toolSelect.setChoices(data.filters.tools.map((t) => ({ value: t, label: t })), "value", "label", true);

  // Restore URL state
  const initialQuery = getQueryParam("q");
  const initialModels = getQueryParamValues("model").filter((m) => models.includes(m));
  const initialTools = getQueryParamValues("tool").filter((t) => data.filters.tools.includes(t));
  const initialHandoffs = getQueryParam("handoffs") === "1";
  const initialSort = getQueryParam("sort") || "name-asc";

  if (searchInput) searchInput.value = initialQuery;
  if (initialModels.length > 0) { currentFilters.models = initialModels; setChoicesValues(modelSelect, initialModels); }
  if (initialTools.length > 0) { currentFilters.tools = initialTools; setChoicesValues(toolSelect, initialTools); }
  if (initialHandoffs) { currentFilters.hasHandoffs = true; if (handoffsCheck) handoffsCheck.checked = true; }
  if (initialSort) { currentSort = initialSort; if (sortSelect) sortSelect.value = initialSort; }

  document.getElementById("filter-model")?.addEventListener("change", () => {
    currentFilters.models = getChoicesValues(modelSelect);
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  document.getElementById("filter-tool")?.addEventListener("change", () => {
    currentFilters.tools = getChoicesValues(toolSelect);
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  handoffsCheck?.addEventListener("change", () => {
    currentFilters.hasHandoffs = handoffsCheck.checked;
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  sortSelect?.addEventListener("change", () => {
    currentSort = sortSelect.value;
    applyFiltersAndRender(); syncUrl(searchInput);
  });
  searchInput?.addEventListener("input", debounce(() => { applyFiltersAndRender(); syncUrl(searchInput); }, 200));
  clearBtn?.addEventListener("click", () => {
    currentFilters = { models: [], tools: [], hasHandoffs: false };
    currentSort = "name-asc";
    modelSelect.removeActiveItems();
    toolSelect.removeActiveItems();
    if (handoffsCheck) handoffsCheck.checked = false;
    if (sortSelect) sortSelect.value = "name-asc";
    if (searchInput) searchInput.value = "";
    applyFiltersAndRender(); syncUrl(searchInput);
  });

  if (document.getElementById("results-count"))
    document.getElementById("results-count")!.textContent = `${allItems.length} of ${allItems.length} agents`;
  applyFiltersAndRender();
  checkAutoOpen("agent");
});
