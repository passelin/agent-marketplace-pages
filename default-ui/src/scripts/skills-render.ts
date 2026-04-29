import { escapeHtml, getLastUpdatedHtml, deriveRawBaseUrl, renderLinkButton, renderGitHubButton, renderZipDownloadButton } from "./utils";

export interface RenderableSkill {
  id: string;
  title: string;
  description?: string;
  categories?: string[];
  hasAssets?: boolean;
  files?: string[] | null;
  path?: string;
  sourceUrl?: string | null;
  lastUpdated?: string | null;
}

export function renderSkillsHtml(
  items: RenderableSkill[],
  options: { query?: string; highlightTitle?: (t: string, q: string) => string; repoPath?: string | null } = {}
): string {
  const { query = "", highlightTitle, repoPath = null } = options;

  if (items.length === 0) {
    return `<div class="empty-state"><h3>No skills found</h3><p>Try a different search term</p></div>`;
  }

  return items.map((item) => {
    const titleHtml = query && highlightTitle ? highlightTitle(item.title, query) : escapeHtml(item.title);
    const updatedHtml = getLastUpdatedHtml(item.lastUpdated ?? null);
    const installCmd = repoPath ? `npx skills install ${repoPath} --skill ${item.id}` : null;
    const categoryChips = (item.categories || [])
      .map((c) => `<span class="resource-tag">${escapeHtml(c)}</span>`)
      .join("");
    const assetsBadge = item.hasAssets
      ? `<span class="resource-tag resource-tag-assets">Bundled Assets</span>`
      : "";

    const rawBase = deriveRawBaseUrl(item.sourceUrl);
    const rawUrl = rawBase ? `${rawBase}/SKILL.md` : null;
    const rawUrlAttr = rawUrl ? ` data-raw-url="${escapeHtml(rawUrl)}"` : "";
    const zipBtn = rawBase && item.files?.length
      ? renderZipDownloadButton(rawBase, item.files, item.id)
      : "";

    return `
      <article class="resource-item" role="listitem" data-resource-type="skill"${rawUrlAttr} data-title="${escapeHtml(item.title)}">
        <div class="resource-info">
          <div class="resource-title">${titleHtml}</div>
          <div class="resource-description">${escapeHtml(item.description || "No description")}</div>
          <div class="resource-meta">${categoryChips}${assetsBadge}${updatedHtml}</div>
        </div>
        <div class="resource-actions">
          ${installCmd ? `<button class="btn btn-copy-install" data-copy-command="${escapeHtml(installCmd)}" title="${escapeHtml(installCmd)}">Copy Install</button>` : ""}
          ${zipBtn}
          ${item.sourceUrl ? renderLinkButton(item.sourceUrl) : ""}
          ${item.sourceUrl ? renderGitHubButton(item.sourceUrl) : ""}
        </div>
      </article>`;
  }).join("");
}
