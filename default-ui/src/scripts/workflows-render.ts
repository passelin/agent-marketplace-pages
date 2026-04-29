import { escapeHtml, getLastUpdatedHtml, deriveRawUrl, renderLinkButton, renderGitHubButton } from "./utils";

export interface RenderableWorkflow {
  id: string;
  title: string;
  description?: string;
  triggers?: string[];
  path?: string;
  sourceUrl?: string | null;
  lastUpdated?: string | null;
}

export function renderWorkflowsHtml(
  items: RenderableWorkflow[],
  options: { query?: string; highlightTitle?: (t: string, q: string) => string } = {}
): string {
  const { query = "", highlightTitle } = options;

  if (items.length === 0) {
    return `<div class="empty-state"><h3>No workflows found</h3><p>Try a different search term or clear your filters</p></div>`;
  }

  return items.map((item) => {
    const titleHtml = query && highlightTitle ? highlightTitle(item.title, query) : escapeHtml(item.title);
    const triggerChips = (item.triggers || [])
      .map((t) => `<span class="resource-tag resource-tag-trigger">${escapeHtml(t)}</span>`)
      .join("");
    const updatedHtml = getLastUpdatedHtml(item.lastUpdated ?? null);

    const rawUrl = deriveRawUrl(item.sourceUrl);
    const rawUrlAttr = rawUrl ? ` data-raw-url="${escapeHtml(rawUrl)}"` : "";

    return `
      <article class="resource-item" role="listitem" data-resource-type="workflow"${rawUrlAttr} data-title="${escapeHtml(item.title)}">
        <div class="resource-info">
          <div class="resource-title">${titleHtml}</div>
          <div class="resource-description">${escapeHtml(item.description || "No description")}</div>
          <div class="resource-meta">${triggerChips}${updatedHtml}</div>
        </div>
        <div class="resource-actions">
          ${item.sourceUrl ? renderLinkButton(item.sourceUrl) : ""}
          ${item.sourceUrl ? renderGitHubButton(item.sourceUrl) : ""}
        </div>
      </article>`;
  }).join("");
}
