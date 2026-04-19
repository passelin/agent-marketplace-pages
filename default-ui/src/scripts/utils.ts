import { getEmbeddedData as getEmbeddedPageData } from "./embedded-data";

export function getBasePath(): string {
  if (typeof document !== "undefined") {
    return document.body.dataset.basePath || "/";
  }
  return "/";
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
