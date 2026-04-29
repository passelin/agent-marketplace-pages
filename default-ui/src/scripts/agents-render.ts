import { escapeHtml, sanitizeUrl, getLastUpdatedHtml, deriveRawUrl, renderLinkButton, renderGitHubButton, renderDownloadButton, renderInstallSplitButton } from "./utils";

export interface RenderableAgent {
  id: string;
  title: string;
  description?: string;
  model?: string | string[] | null;
  tools?: string[];
  path?: string;
  sourceUrl?: string | null;
  repository?: string | null;
  lastUpdated?: string | null;
}


export function renderAgentsHtml(
  items: RenderableAgent[],
  options: { query?: string; highlightTitle?: (t: string, q: string) => string } = {}
): string {
  const { query = "", highlightTitle } = options;

  if (items.length === 0) {
    return `<div class="empty-state"><h3>No agents found</h3><p>Try a different search term or clear your filters</p></div>`;
  }

  return items.map((item) => {
    const titleHtml = query && highlightTitle ? highlightTitle(item.title, query) : escapeHtml(item.title);
    const models = Array.isArray(item.model) ? item.model : item.model ? [item.model] : [];
    const modelBadges = models
      .map((m) => `<span class="resource-tag resource-tag-model">${escapeHtml(m)}</span>`)
      .join("");
    const toolChips = (item.tools || [])
      .slice(0, 5)
      .map((t) => `<span class="resource-tag">${escapeHtml(t)}</span>`)
      .join("");
    const extraTools =
      item.tools && item.tools.length > 5
        ? `<span class="resource-tag">+${item.tools.length - 5} more</span>`
        : "";
    const updatedHtml = getLastUpdatedHtml(item.lastUpdated ?? null);
    const rawUrl = deriveRawUrl(item.sourceUrl);
    const githubUrl = item.sourceUrl ?? sanitizeUrl(item.repository ?? null);
    const showGithub = !!item.sourceUrl || sanitizeUrl(item.repository ?? null) !== "#";

    const rawUrlAttr = rawUrl ? ` data-raw-url="${escapeHtml(rawUrl)}"` : "";

    return `
      <article class="resource-item" role="listitem" data-resource-type="agent"${rawUrlAttr} data-title="${escapeHtml(item.title)}">
        <div class="resource-info">
          <div class="resource-title">${titleHtml}</div>
          <div class="resource-description">${escapeHtml(item.description || "No description")}</div>
          <div class="resource-meta">
            ${modelBadges}${toolChips}${extraTools}${updatedHtml}
          </div>
        </div>
        <div class="resource-actions">
          ${rawUrl ? renderInstallSplitButton(rawUrl, "chat-agent") : ""}
          ${rawUrl ? renderDownloadButton(rawUrl) : ""}
          ${item.sourceUrl ? renderLinkButton(item.sourceUrl) : ""}
          ${showGithub ? renderGitHubButton(githubUrl!) : ""}
        </div>
      </article>`;
  }).join("");
}
