import { escapeHtml, sanitizeUrl, getLastUpdatedHtml } from "./utils";

const ICON_CHEVRON = `<svg width="10" height="10" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true"><path d="M0 0l5 6 5-6z"/></svg>`;

function renderPluginInstallButton(name: string, marketplaceName: string): string {
  const copilotCmd = `copilot plugin install ${name}@${marketplaceName}`;
  const claudeCmd = `/plugin install ${name}@${marketplaceName}`;
  return `<div class="install-split" role="group">` +
    `<button type="button" class="btn btn-secondary btn-install-main btn-copy-install" data-copy-command="${escapeHtml(copilotCmd)}" title="${escapeHtml(copilotCmd)}">Copy Install</button>` +
    `<button type="button" class="btn btn-secondary btn-install-toggle" aria-label="More install options" aria-expanded="false" aria-haspopup="menu">${ICON_CHEVRON}</button>` +
    `<div class="install-dropdown" role="menu" hidden>` +
      `<button type="button" class="install-option btn-copy-option" data-copy-command="${escapeHtml(copilotCmd)}" role="menuitem">GitHub Copilot</button>` +
      `<button type="button" class="install-option btn-copy-option" data-copy-command="${escapeHtml(claudeCmd)}" role="menuitem">Claude Code</button>` +
    `</div>` +
  `</div>`;
}

interface PluginAuthor {
  name: string;
  url?: string;
}

interface PluginSource {
  source: string;
  repo?: string;
  path?: string;
}

interface SourceMarketplace {
  name: string;
  label?: string;
  url?: string;
}

export interface PluginResource {
  type: string;
  id: string;
  title: string;
  rawUrl?: string | null;
}

export interface RenderablePlugin {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  categories?: string[];
  external?: boolean;
  sourceType?: string;
  repository?: string | null;
  homepage?: string | null;
  author?: PluginAuthor | null;
  license?: string | null;
  source?: PluginSource | null;
  sourceMarketplace?: SourceMarketplace | null;
  pluginUrl?: string | null;
  lastUpdated?: string | null;
  resources?: PluginResource[] | null;
}

export function renderPluginsHtml(
  items: RenderablePlugin[],
  options: {
    query?: string;
    highlightTitle?: (title: string, query: string) => string;
    marketplaceName?: string | null;
  } = {}
): string {
  const { query = "", highlightTitle, marketplaceName = null } = options;

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
      const actionLabel = isExternal ? "View Source" : "GitHub";
      const showAction = actionUrl !== "#";
      const installBtn = marketplaceName ? renderPluginInstallButton(item.name, marketplaceName) : "";

      const externalBadge = isExternal
        ? `<span class="resource-tag resource-tag-external">External</span>`
        : "";

      const sourceMarketplaceLabel = item.sourceMarketplace
        ? item.sourceMarketplace.label || item.sourceMarketplace.name
        : null;
      const sourceMarketplaceBadge = sourceMarketplaceLabel
        ? item.sourceMarketplace!.url
          ? `<span class="resource-tag resource-tag-remote">From: <a href="${sanitizeUrl(item.sourceMarketplace!.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceMarketplaceLabel)}</a></span>`
          : `<span class="resource-tag resource-tag-remote">From: ${escapeHtml(sourceMarketplaceLabel)}</span>`
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
        <article class="resource-item${isExternal ? " resource-item-external" : ""}" role="listitem" data-resource-type="plugin" data-title="${escapeHtml(item.name)}" data-plugin-info="${escapeHtml(JSON.stringify({ description: item.description, version: item.version, author: item.author, license: item.license, tags: item.tags }))}"${item.resources?.length ? ` data-plugin-resources="${escapeHtml(JSON.stringify(item.resources))}"` : ""}>
          <div class="resource-info">
            <div class="resource-title">${titleHtml}</div>
            <div class="resource-description">${escapeHtml(item.description || "No description")}</div>
            <div class="resource-meta">
              ${externalBadge}
              ${sourceMarketplaceBadge}
              ${authorTag}
              ${tagChips}
              ${extraTags}
              ${updatedHtml}
            </div>
          </div>
          <div class="resource-actions">
            ${installBtn}
            ${showAction ? `<a href="${actionUrl}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer" title="${actionLabel}">${actionLabel}</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}
