import { escapeHtml, getLastUpdatedHtml, deriveRawBaseUrl, renderLinkButton, renderGitHubButton, renderZipDownloadButton } from "./utils";

export interface RenderableHook {
  id: string;
  title: string;
  description?: string;
  events?: string[];
  tags?: string[];
  files?: string[] | null;
  path?: string;
  sourceUrl?: string | null;
  lastUpdated?: string | null;
}

export function renderHooksHtml(
  items: RenderableHook[],
  options: { query?: string; highlightTitle?: (t: string, q: string) => string } = {}
): string {
  const { query = "", highlightTitle } = options;

  if (items.length === 0) {
    return `<div class="empty-state"><h3>No hooks found</h3><p>Try a different search term or clear your filters</p></div>`;
  }

  return items.map((item) => {
    const titleHtml = query && highlightTitle ? highlightTitle(item.title, query) : escapeHtml(item.title);
    const eventChips = (item.events || [])
      .map((e) => `<span class="resource-tag resource-tag-event">${escapeHtml(e)}</span>`)
      .join("");
    const tagChips = (item.tags || [])
      .map((t) => `<span class="resource-tag">${escapeHtml(t)}</span>`)
      .join("");
    const updatedHtml = getLastUpdatedHtml(item.lastUpdated ?? null);

    const rawBase = deriveRawBaseUrl(item.sourceUrl);
    const rawUrl = rawBase ? `${rawBase}/README.md` : null;
    const rawUrlAttr = rawUrl ? ` data-raw-url="${escapeHtml(rawUrl)}"` : "";
    const zipBtn = rawBase && item.files?.length
      ? renderZipDownloadButton(rawBase, item.files, item.id)
      : "";

    return `
      <article class="resource-item" role="listitem" data-resource-type="hook"${rawUrlAttr} data-title="${escapeHtml(item.title)}">
        <div class="resource-info">
          <div class="resource-title">${titleHtml}</div>
          <div class="resource-description">${escapeHtml(item.description || "No description")}</div>
          <div class="resource-meta">${eventChips}${tagChips}${updatedHtml}</div>
        </div>
        <div class="resource-actions">
          ${zipBtn}
          ${item.sourceUrl ? renderLinkButton(item.sourceUrl) : ""}
          ${item.sourceUrl ? renderGitHubButton(item.sourceUrl) : ""}
        </div>
      </article>`;
  }).join("");
}
