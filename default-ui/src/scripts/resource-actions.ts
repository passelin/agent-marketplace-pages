import { loadJSZip } from "./utils";

export function initResourceActions(): void {
  // Copy-link buttons (.btn-copy-link[data-copy-url])
  document.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>(".btn-copy-link");
    if (!btn) return;
    const url = btn.dataset.copyUrl;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add("copied");
      const prev = btn.title;
      btn.title = "Copied!";
      setTimeout(() => { btn.classList.remove("copied"); btn.title = prev; }, 1500);
    });
  });

  // Zip download buttons (.btn-download-zip)
  document.addEventListener("click", async (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>(".btn-download-zip");
    if (!btn) return;
    e.stopPropagation();
    const rawBase = btn.dataset.rawBase;
    const filesJson = btn.dataset.zipFiles;
    const name = btn.dataset.zipName ?? "download";
    if (!rawBase || !filesJson) return;
    let files: string[];
    try { files = JSON.parse(filesJson); } catch { return; }
    btn.disabled = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const JSZip = await loadJSZip() as any;
      const zip = new JSZip();
      const folder = zip.folder(name)!;
      const results = await Promise.all(
        files.map(async (f) => {
          try {
            const r = await fetch(`${rawBase}/${f}`);
            return r.ok ? { name: f, content: await r.text() } : null;
          } catch { return null; }
        })
      );
      for (const r of results) { if (r) folder.file(r.name, r.content); }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${name}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zip download failed:", err);
    } finally {
      btn.disabled = false;
    }
  });

  // Download buttons (.btn-download[data-download-url]) — fetch→blob to force download
  document.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>(".btn-download");
    if (!btn) return;
    const url = btn.dataset.downloadUrl;
    const filename = btn.dataset.filename ?? "download";
    if (!url) return;
    btn.disabled = true;
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .finally(() => { btn.disabled = false; });
  });

  // Install dropdown toggle (.btn-install-toggle)
  document.addEventListener("click", (e) => {
    const toggle = (e.target as Element).closest<HTMLButtonElement>(".btn-install-toggle");
    if (toggle) {
      const dropdown = toggle.parentElement?.querySelector<HTMLElement>(".install-dropdown");
      if (dropdown) {
        const opening = dropdown.hidden;
        closeAllDropdowns();
        if (opening) {
          dropdown.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
        }
      }
      e.stopPropagation();
      return;
    }
    // Close when clicking outside
    if (!(e.target as Element).closest(".install-split")) {
      closeAllDropdowns();
    }
  });
}

function closeAllDropdowns(): void {
  document.querySelectorAll<HTMLElement>(".install-dropdown").forEach((d) => { d.hidden = true; });
  document.querySelectorAll<HTMLButtonElement>(".btn-install-toggle").forEach((b) => { b.setAttribute("aria-expanded", "false"); });
}
