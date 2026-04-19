import { escapeHtml, sanitizeUrl, getLastUpdatedHtml } from "./utils";

interface PluginAuthor {
  name: string;
  url?: string;
}

interface PluginSource {
  source: string;
  repo?: string;
  path?: string;
}

export interface RenderablePlugin {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  categories?: string[];
  external?: boolean;
  repository?: string | null;
  homepage?: string | null;
  author?: PluginAuthor | null;
  license?: string | null;
  source?: PluginSource | null;
  pluginUrl?: string | null;
  lastUpdated?: string | null;
}

export function renderPluginsHtml(
  items: RenderablePlugin[],
  options: {
    query?: string;
    highlightTitle?: (title: string, query: string) => string;
  } = {}
): string {
  const { query = "", highlightTitle } = options;

  if (items.length === 0) {
    return `
      <div class="empty-state">
        <h3>No plugins found</h3>
        <p>Try a different search term or adjust your filters</p>
      </div>
    `;
  }

  return items
    .map((item) => {
      const isExternal = item.external === true;
      const actionUrl = sanitizeUrl(item.pluginUrl);
      const actionLabel = isExternal ? "View Source" : "View on GitHub";
      const showAction = actionUrl !== "#";

      const externalBadge = isExternal
        ? `<span class="resource-tag resource-tag-external">External</span>`
        : "";

      const authorTag =
        isExternal && item.author?.name
          ? `<span class="resource-tag">by ${escapeHtml(item.author.name)}</span>`
          : "";

      const titleHtml =
        query && highlightTitle ? highlightTitle(item.name, query) : escapeHtml(item.name);

      const tagChips = (item.tags || [])
        .slice(0, 4)
        .map((tag) => `<span class="resource-tag">${escapeHtml(tag)}</span>`)
        .join("");

      const extraTags =
        item.tags && item.tags.length > 4
          ? `<span class="resource-tag">+${item.tags.length - 4} more</span>`
          : "";

      const updatedHtml = getLastUpdatedHtml(item.lastUpdated || null);

      return `
        <article class="resource-item${isExternal ? " resource-item-external" : ""}" role="listitem">
          <div class="resource-info">
            <div class="resource-title">${titleHtml}</div>
            <div class="resource-description">${escapeHtml(item.description || "No description")}</div>
            <div class="resource-meta">
              ${externalBadge}
              ${authorTag}
              ${tagChips}
              ${extraTags}
              ${updatedHtml}
            </div>
          </div>
          <div class="resource-actions">
            ${showAction ? `<a href="${actionUrl}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer" title="${actionLabel}">${actionLabel}</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}
