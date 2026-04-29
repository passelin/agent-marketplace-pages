import { marked } from "marked";
import { getTypeMeta } from "./resource-types";

let modalEl: HTMLElement | null = null;
let rawContent: string | null = null;
let isRendered = false;

function buildModal(): HTMLElement {
  const el = document.createElement("div");
  el.id = "resource-modal";
  el.className = "modal-backdrop";
  el.setAttribute("hidden", "");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "modal-title");
  el.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-title-row">
          <h2 class="modal-title" id="modal-title"></h2>
          <span class="modal-type-badge" id="modal-type-badge" hidden></span>
        </div>
        <div class="modal-header-end">
          <button class="btn btn-secondary btn-small" id="modal-render-toggle">Render</button>
          <button class="modal-close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="modal-actions" id="modal-actions"></div>
      <div class="modal-body" id="modal-body">
        <span class="modal-loading">Loading…</span>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => { if (e.target === el) closeModal(); });
  el.querySelector(".modal-close")!.addEventListener("click", closeModal);
  el.querySelector("#modal-render-toggle")!.addEventListener("click", toggleView);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl && !modalEl.hasAttribute("hidden")) closeModal();
  });

  return el;
}

function getModal(): HTMLElement {
  if (!modalEl) modalEl = buildModal();
  return modalEl;
}

function applyTypeToModal(type: string): void {
  const modal = getModal();
  const meta = getTypeMeta(type);
  const header = modal.querySelector<HTMLElement>(".modal-header")!;
  const badge = modal.querySelector<HTMLElement>("#modal-type-badge")!;

  header.style.setProperty("--modal-type-color", meta.color);

  if (type) {
    badge.textContent = `${meta.icon} ${meta.label}`;
    badge.style.setProperty("--badge-color", meta.color);
    badge.removeAttribute("hidden");
  } else {
    badge.setAttribute("hidden", "");
  }
}

function openModalWithData(rawUrl: string, title: string, type: string, actionsHtml?: string): void {
  const modal = getModal();

  rawContent = null;
  isRendered = false;

  const titleEl = modal.querySelector<HTMLElement>("#modal-title")!;
  const actionsEl = modal.querySelector<HTMLElement>("#modal-actions")!;
  const bodyEl = modal.querySelector<HTMLElement>("#modal-body")!;
  const toggleBtn = modal.querySelector<HTMLButtonElement>("#modal-render-toggle")!;

  titleEl.textContent = title;
  toggleBtn.textContent = "Render";
  toggleBtn.removeAttribute("hidden");
  actionsEl.innerHTML = actionsHtml ?? "";
  applyTypeToModal(type);

  modal.removeAttribute("hidden");
  document.body.classList.add("modal-open");

  bodyEl.innerHTML = `<span class="modal-loading">Loading…</span>`;
  fetch(rawUrl)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    })
    .then((text) => {
      rawContent = text;
      showRaw(bodyEl);
    })
    .catch(() => {
      bodyEl.innerHTML = `<p class="modal-error">Failed to load file.</p>`;
    });
}

const PLUGIN_TYPE_ORDER = ["agent", "instruction", "skill", "hook", "workflow"] as const;

interface PluginResource {
  type: string;
  id: string;
  title: string;
  rawUrl?: string | null;
}

interface PluginInfo {
  description?: string;
  version?: string;
  author?: { name: string; url?: string } | null;
  license?: string | null;
  tags?: string[];
}

function renderPluginInfoSection(info: PluginInfo): string {
  const parts: string[] = [];

  if (info.description) {
    parts.push(`<p class="plugin-modal-description">${escapeForHtml(info.description)}</p>`);
  }

  const meta: string[] = [];
  if (info.version) {
    meta.push(`<span class="plugin-modal-meta-item"><span class="plugin-modal-meta-label">Version</span> ${escapeForHtml(info.version)}</span>`);
  }
  if (info.author?.name) {
    const name = escapeForHtml(info.author.name);
    const authorHtml = info.author.url
      ? `<a href="${escapeForHtml(info.author.url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
      : name;
    meta.push(`<span class="plugin-modal-meta-item"><span class="plugin-modal-meta-label">Author</span> ${authorHtml}</span>`);
  }
  if (info.license) {
    meta.push(`<span class="plugin-modal-meta-item"><span class="plugin-modal-meta-label">License</span> ${escapeForHtml(info.license)}</span>`);
  }
  if (meta.length) {
    parts.push(`<div class="plugin-modal-meta">${meta.join("")}</div>`);
  }

  if (info.tags?.length) {
    const chips = info.tags
      .map((t) => `<span class="plugin-modal-tag">${escapeForHtml(t)}</span>`)
      .join("");
    parts.push(`<div class="plugin-modal-tags">${chips}</div>`);
  }

  return parts.length ? `<div class="plugin-modal-info">${parts.join("")}</div>` : "";
}

function openPluginModal(article: HTMLElement): void {
  const modal = getModal();
  const title = article.dataset.title ?? "";
  const resourcesJson = article.dataset.pluginResources ?? "[]";
  const infoJson = article.dataset.pluginInfo ?? "{}";

  let resources: PluginResource[] = [];
  let info: PluginInfo = {};
  try { resources = JSON.parse(resourcesJson); } catch { /* empty */ }
  try { info = JSON.parse(infoJson); } catch { /* empty */ }

  const titleEl = modal.querySelector<HTMLElement>("#modal-title")!;
  const actionsEl = modal.querySelector<HTMLElement>("#modal-actions")!;
  const bodyEl = modal.querySelector<HTMLElement>("#modal-body")!;
  const toggleBtn = modal.querySelector<HTMLButtonElement>("#modal-render-toggle")!;

  titleEl.textContent = title;
  toggleBtn.setAttribute("hidden", "");
  actionsEl.innerHTML = article.querySelector(".resource-actions")?.innerHTML ?? "";
  applyTypeToModal("plugin");

  modal.removeAttribute("hidden");
  document.body.classList.add("modal-open");

  const infoHtml = renderPluginInfoSection(info);

  let resourcesHtml = "";
  if (resources.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const r of resources) {
      if (!grouped.has(r.type)) grouped.set(r.type, []);
      grouped.get(r.type)!.push(r.title);
    }
    const order = [...PLUGIN_TYPE_ORDER, ...grouped.keys()].filter((v, i, a) => a.indexOf(v) === i);
    const groupedFull = new Map<string, PluginResource[]>();
    for (const r of resources) {
      if (!groupedFull.has(r.type)) groupedFull.set(r.type, []);
      groupedFull.get(r.type)!.push(r);
    }
    const sections = order
      .filter((type) => groupedFull.has(type))
      .map((type) => {
        const meta = getTypeMeta(type);
        const items = groupedFull.get(type)!;
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const chips = items
          .map((r) => {
            if (r.rawUrl) {
              const href = `${base}/${meta.href}?open=${encodeURIComponent(r.rawUrl)}&title=${encodeURIComponent(r.title)}`;
              return `<a href="${escapeForHtml(href)}" class="plugin-resource-chip plugin-resource-chip-link" style="--chip-color:${meta.color}">${escapeForHtml(r.title)}</a>`;
            }
            return `<span class="plugin-resource-chip" style="--chip-color:${meta.color}">${escapeForHtml(r.title)}</span>`;
          })
          .join("");
        return `
          <div class="plugin-resource-group">
            <div class="plugin-resource-group-header" style="--chip-color:${meta.color}">
              <span>${meta.icon}</span>
              <span>${meta.labelPlural}</span>
              <span class="plugin-resource-count">${items.length}</span>
            </div>
            <div class="plugin-resource-chips">${chips}</div>
          </div>`;
      })
      .join("");
    resourcesHtml = `<div class="plugin-resources">${sections}</div>`;
  }

  bodyEl.innerHTML = infoHtml + resourcesHtml || `<p class="modal-plugin-empty">No details available.</p>`;
}

export function openModal(article: HTMLElement): void {
  const rawUrl = article.dataset.rawUrl;
  if (!rawUrl) return;
  openModalWithData(
    rawUrl,
    article.dataset.title ?? "",
    article.dataset.resourceType ?? "",
    article.querySelector(".resource-actions")?.innerHTML,
  );
}

export function openModalFromData(rawUrl: string, title: string, type: string): void {
  openModalWithData(rawUrl, title, type);
}

function closeModal(): void {
  modalEl?.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
}

function escapeForHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showRaw(bodyEl: HTMLElement): void {
  if (rawContent === null) return;
  bodyEl.innerHTML = `<pre class="modal-raw"><code>${escapeForHtml(rawContent)}</code></pre>`;
}

function showRendered(bodyEl: HTMLElement): void {
  if (rawContent === null) return;
  const result = marked.parse(rawContent);
  const html = typeof result === "string" ? result : "";
  bodyEl.innerHTML = `<div class="modal-rendered">${html}</div>`;
  if (typeof result !== "string") {
    (result as Promise<string>).then((h) => {
      bodyEl.innerHTML = `<div class="modal-rendered">${h}</div>`;
    });
  }
}

function toggleView(): void {
  if (!modalEl || rawContent === null) return;
  const bodyEl = modalEl.querySelector<HTMLElement>("#modal-body")!;
  const toggleBtn = modalEl.querySelector<HTMLButtonElement>("#modal-render-toggle")!;
  isRendered = !isRendered;
  if (isRendered) {
    showRendered(bodyEl);
    toggleBtn.textContent = "Raw";
  } else {
    showRaw(bodyEl);
    toggleBtn.textContent = "Render";
  }
}

export function initModal(): void {
  document.addEventListener("click", (e) => {
    const target = e.target as Element;
    if (target.closest("a, button, .resource-actions")) return;
    const article = target.closest<HTMLElement>(".resource-item");
    if (!article) return;
    if (article.dataset.rawUrl) {
      openModal(article);
    } else if (article.dataset.resourceType === "plugin") {
      openPluginModal(article);
    }
  });
}

export function checkAutoOpen(type: string): void {
  const params = new URLSearchParams(location.search);
  const rawUrl = params.get("open");
  const title = params.get("title") ?? "";
  if (!rawUrl) return;
  const clean = new URL(location.href);
  clean.searchParams.delete("open");
  clean.searchParams.delete("title");
  history.replaceState(null, "", clean.toString());
  openModalWithData(rawUrl, title, type);
}
