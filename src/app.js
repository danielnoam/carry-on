// Carry-on: the shell. Version, theme, and the library view.
(function () {
  const APP_VERSION = "0.1.0";

  const THEMES = ["paper", "sepia", "night"];
  const THEME_KEY = "carryon.theme";
  const LIBRARY_KEY = "carryon.library";

  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  // Browser storage can be missing or throw (private windows, cleared data);
  // the app has to render without it.
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not kept */ }
  }

  let toastTimer = null;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function applyTheme(name) {
    const theme = THEMES.includes(name) ? name : "paper";
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    return theme;
  }

  function defaultTheme() {
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper";
  }

  const state = {
    theme: applyTheme(load(THEME_KEY, defaultTheme())),
    // [{ id, url, title, site, savedAt, bytes }] once saving exists.
    pages: load(LIBRARY_KEY, []),
  };

  function formatSize(bytes) {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + " MB";
    return Math.max(1, Math.round(bytes / 1e3)) + " KB";
  }

  function renderLibrary() {
    const root = $("library");
    root.replaceChildren();
    const n = state.pages.length;
    const total = state.pages.reduce((sum, p) => sum + (p.bytes || 0), 0);
    $("libraryMeta").textContent = n
      ? n + (n === 1 ? " page · " : " pages · ") + formatSize(total)
      : "Nothing saved yet";
    if (!n) {
      root.append(el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, "Pages you take with you"),
        el("p", { class: "empty-text" },
          "Share a page to Carry-on, or paste its link below. It stays readable with no connection, with a link back to the original.")));
    }
  }

  $("themeBtn").addEventListener("click", () => {
    state.theme = applyTheme(THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]);
    store(THEME_KEY, state.theme);
    toast("Theme: " + state.theme[0].toUpperCase() + state.theme.slice(1));
  });

  $("saveForm").addEventListener("submit", (e) => {
    e.preventDefault();
    toast("Saving pages comes in the next version.");
  });

  renderLibrary();

  if (!window.CarryOn.platform.native && "serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  window.CarryOn.version = APP_VERSION;
})();
