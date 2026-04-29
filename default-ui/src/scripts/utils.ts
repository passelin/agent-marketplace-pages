import { getEmbeddedData as getEmbeddedPageData } from "./embedded-data";

export function getBasePath(): string {
  return import.meta.env.BASE_URL ?? "/";
}

export async function fetchData<T = unknown>(filename: string): Promise<T | null> {
  const embeddedData = getEmbeddedPageData<T>(filename);
  if (embeddedData !== null) return embeddedData;

  try {
    const basePath = getBasePath();
    const response = await fetch(`${basePath}data/${filename}`);
    if (!response.ok) throw new Error(`Failed to fetch ${filename}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${filename}:`, error);
    return null;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

type QueryParamValue = string | string[] | boolean | null | undefined;

export function getQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() ?? "";
}

export function getQueryParamValues(name: string): string[] {
  if (typeof window === "undefined") return [];
  const values = new URLSearchParams(window.location.search)
    .getAll(name)
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

export function updateQueryParams(updates: Record<string, QueryParamValue>): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  for (const [key, value] of Object.entries(updates)) {
    url.searchParams.delete(key);

    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = item.trim();
        if (normalized) url.searchParams.append(key, normalized);
      }
      continue;
    }

    if (typeof value === "boolean") {
      if (value) url.searchParams.set(key, "1");
      continue;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) url.searchParams.set(key, normalized);
    }
  }

  const search = url.searchParams.toString();
  const nextUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    history.replaceState(null, "", nextUrl);
  }
}

export function showToast(message: string, type: "success" | "error" = "success"): void {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function escapeHtml(text: string | string[]): string {
  if (Array.isArray(text)) return text.map(escapeHtml).join(", ");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // Invalid URL
  }
  return "#";
}

export function formatRelativeTime(isoDate: string | null | undefined): string {
  if (!isoDate) return "Unknown";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "Unknown";

  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  if (diffYears === 1) return "1 year ago";
  return `${diffYears} years ago`;
}

export function getLastUpdatedHtml(isoDate: string | null | undefined): string {
  const rel = formatRelativeTime(isoDate);
  if (rel === "Unknown") return `<span class="last-updated">Updated: Unknown</span>`;

  const full = isoDate
    ? new Date(isoDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";
  return `<span class="last-updated" title="${escapeHtml(full)}">Updated ${rel}</span>`;
}

export function deriveRawUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl);
    if (u.hostname !== "github.com") return null;
  } catch { return null; }
  return sourceUrl
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace("/blob/", "/");
}

export function deriveRawBaseUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl);
    if (u.hostname !== "github.com") return null;
  } catch { return null; }
  return sourceUrl
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace("/tree/", "/");
}

let _jsZipPromise: Promise<typeof import("jszip")> | null = null;
export async function loadJSZip() {
  _jsZipPromise ??= import("jszip");
  const mod = await _jsZipPromise;
  return (mod as unknown as { default: typeof mod }).default ?? mod;
}

// ── Action button helpers ─────────────────────────────────────────────────────

const ICON_DOWNLOAD = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.47 10.78a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 0 0-1.06-1.06L8.75 8.44V1.75a.75.75 0 0 0-1.5 0v6.69L4.78 5.97a.75.75 0 0 0-1.06 1.06l3.75 3.75ZM3.75 13a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"/></svg>`;
const ICON_LINK    = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/></svg>`;
const ICON_CHEVRON = `<svg width="10" height="10" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true"><path d="M0 0l5 6 5-6z"/></svg>`;

export function renderLinkButton(url: string): string {
  return `<button type="button" class="btn btn-icon btn-copy-link" data-copy-url="${escapeHtml(url)}" title="Copy link" aria-label="Copy link">${ICON_LINK}</button>`;
}

export function renderGitHubButton(url: string): string {
  return `<a href="${escapeHtml(url)}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">GitHub</a>`;
}

export function renderZipDownloadButton(rawBase: string, files: string[], name: string): string {
  return `<button type="button" class="btn btn-icon btn-download-zip" data-raw-base="${escapeHtml(rawBase)}" data-zip-files="${escapeHtml(JSON.stringify(files))}" data-zip-name="${escapeHtml(name)}" title="Download zip" aria-label="Download as zip">${ICON_DOWNLOAD}</button>`;
}

export function renderDownloadButton(rawUrl: string): string {
  const filename = rawUrl.split("/").pop() ?? "download";
  return `<button type="button" class="btn btn-icon btn-download" data-download-url="${escapeHtml(rawUrl)}" data-filename="${escapeHtml(filename)}" title="Download" aria-label="Download">${ICON_DOWNLOAD}</button>`;
}

export function renderInstallSplitButton(rawUrl: string, uriScheme = "chat-instructions"): string {
  const encoded = encodeURIComponent(rawUrl);
  const vscodeUrl  = `vscode:${uriScheme}/install?url=${encoded}`;
  const insidersUrl = `vscode-insiders:${uriScheme}/install?url=${encoded}`;
  return `<div class="install-split" role="group">` +
    `<a href="${vscodeUrl}" class="btn btn-primary btn-install-main" title="Install in VS Code">Install</a>` +
    `<button type="button" class="btn btn-primary btn-install-toggle" aria-label="More install options" aria-expanded="false" aria-haspopup="menu">${ICON_CHEVRON}</button>` +
    `<div class="install-dropdown" role="menu" hidden>` +
      `<a href="${vscodeUrl}" class="install-option" role="menuitem">VS Code</a>` +
      `<a href="${insidersUrl}" class="install-option" role="menuitem">VS Code Insiders</a>` +
    `</div>` +
  `</div>`;
}
