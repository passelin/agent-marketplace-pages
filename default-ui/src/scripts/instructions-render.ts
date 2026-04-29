import { escapeHtml, getLastUpdatedHtml, renderInstallSplitButton, renderDownloadButton, renderLinkButton, renderGitHubButton } from "./utils";

export interface RenderableInstruction {
  id: string;
  title: string;
  description?: string;
  applyTo?: string | string[] | null;
  extensions?: string[];
  path?: string;
  sourceUrl?: string | null;
  rawUrl?: string | null;
  lastUpdated?: string | null;
}

export function renderInstructionsHtml(
  items: RenderableInstruction[],
  options: { query?: string; highlightTitle?: (t: string, q: string) => string } = {}
): string {
  const { query = "", highlightTitle } = options;

  if (items.length === 0) {
    return `<div class="empty-state"><h3>No instructions found</h3><p>Try a different search term or clear your filters</p></div>`;
  }

  return items.map((item) => {
    const titleHtml = query && highlightTitle ? highlightTitle(item.title, query) : escapeHtml(item.title);
    const applyToStr = Array.isArray(item.applyTo) ? item.applyTo.join(", ") : (item.applyTo ?? "");
    const applyBadge = applyToStr
      ? `<span class="resource-tag resource-tag-apply" title="Applies to: ${escapeHtml(applyToStr)}">${escapeHtml(applyToStr.length > 30 ? applyToStr.slice(0, 30) + "…" : applyToStr)}</span>`
      : "";
    const extChips = (item.extensions || [])
      .slice(0, 6)
      .map((e) => `<span class="resource-tag">${escapeHtml(e)}</span>`)
      .join("");
    const updatedHtml = getLastUpdatedHtml(item.lastUpdated ?? null);

    const rawUrlAttr = item.rawUrl ? ` data-raw-url="${escapeHtml(item.rawUrl)}"` : "";

    return `
      <article class="resource-item" role="listitem" data-resource-type="instruction"${rawUrlAttr} data-title="${escapeHtml(item.title)}">
        <div class="resource-info">
          <div class="resource-title">${titleHtml}</div>
          <div class="resource-description">${escapeHtml(item.description || "No description")}</div>
          <div class="resource-meta">${applyBadge}${extChips}${updatedHtml}</div>
        </div>
        <div class="resource-actions">
          ${item.rawUrl ? renderInstallSplitButton(item.rawUrl) : ""}
          ${item.rawUrl ? renderDownloadButton(item.rawUrl) : ""}
          ${item.sourceUrl ? renderLinkButton(item.sourceUrl) : ""}
          ${item.sourceUrl ? renderGitHubButton(item.sourceUrl) : ""}
        </div>
      </article>`;
  }).join("");
}
