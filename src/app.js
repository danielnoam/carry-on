// Carry-on: the shell. Version, theme, the library, saving and the reader.
(function () {
  const APP_VERSION = "0.2.0";
  window.CarryOn.version = APP_VERSION;

  const C = window.CarryOn;
  const THEMES = ["paper", "sepia", "night"];
  const THEME_KEY = "carryon.theme";
  const IMAGES_KEY = "carryon.images";

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
    if (C.reader) C.reader.applyTheme();
    return theme;
  }

  function defaultTheme() {
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper";
  }

  const state = {
    theme: applyTheme(load(THEME_KEY, defaultTheme())),
    // Library index entries: the meta each saved page's meta.json holds.
    pages: [],
    // Saves in flight: { key, url, site, done, total }.
    saving: [],
    open: null,
  };

  function formatSize(bytes) {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + " MB";
    return Math.max(1, Math.round(bytes / 1e3)) + " KB";
  }

  function thumbUrl(p) {
    if (!p.thumb) return null;
    if (/^https?:/.test(p.thumb)) return p.thumb;
    const base = C.store.folderUrl(p.id);
    return base ? base + p.thumb : null;
  }

  function savingCard(s) {
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const status = s.total == null ? "Saving · text" : "Saving · " + s.done + " of " + s.total + " image previews";
    return el("div", { class: "card saving", role: "group", "aria-label": "Saving " + s.site },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, s.site),
        el("span", { class: "card-title" }, s.url),
        el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) },
          el("span", { class: "progress-fill", style: "width: " + pct + "%" })),
        el("span", { class: "card-status accent" }, status)));
  }

  function pageCard(p) {
    const thumb = thumbUrl(p);
    const facts = [p.minutes + " min", formatSize(p.bytes || 0)].join(" · ") + " · ";
    const status = p.missing
      ? el("span", { class: "warn" }, "Text saved · " + p.missing + (p.missing === 1 ? " preview" : " previews") + " missing")
      : p.mode === "links"
        ? el("span", null, "Text offline · images online")
        : el("span", { class: "ok" }, "Offline ready");
    return el("button", { class: "card", type: "button", onclick: () => openPage(p.id) },
      thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : null,
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, p.site),
        el("span", { class: "card-title" }, p.title),
        el("span", { class: "card-status" }, facts, status)));
  }

  function renderLibrary() {
    const root = $("library");
    root.replaceChildren();
    const n = state.pages.length;
    const total = state.pages.reduce((sum, p) => sum + (p.bytes || 0), 0);
    const allOffline = state.pages.every((p) => !p.missing && p.mode !== "links");
    $("libraryMeta").textContent = n
      ? n + (n === 1 ? " page · " : " pages · ") + formatSize(total) + (allOffline ? " · all readable offline" : "")
      : "Nothing saved yet";
    for (const s of state.saving) root.append(savingCard(s));
    for (const p of state.pages) root.append(pageCard(p));
    if (!n && !state.saving.length) {
      root.append(el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, "Pages you take with you"),
        el("p", { class: "empty-text" },
          "Share a page to Carry-on, or paste its link below. It stays readable with no connection, with a link back to the original.")));
    }
  }

  // The first link in whatever was pasted ("Read this: https://…"), or the
  // text itself as a link when it looks like one without its https://.
  function linkFrom(text) {
    const t = String(text).trim();
    const m = t.match(/https?:\/\/[^\s<>"]+/i);
    if (m) return m[0].replace(/[).,;!?]+$/, "");
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return "https://" + t;
    return null;
  }

  const sameUrl = (a, b) => a && b && a.split("#")[0].replace(/\/$/, "") === b.split("#")[0].replace(/\/$/, "");

  async function savePage(url) {
    const existing = state.pages.find((p) => sameUrl(p.url, url) || sameUrl(p.requested, url));
    if (existing) { toast("Already in your library"); openPage(existing.id); return; }
    if (state.saving.some((s) => sameUrl(s.url, url))) return;
    const job = { key: url, url, site: C.save.siteName(url), done: 0, total: null };
    state.saving.unshift(job);
    renderLibrary();
    try {
      const meta = await C.save.save(url, {
        mode: load(IMAGES_KEY, "previews"),
        onProgress: (p) => {
          if (p.stage === "images") { job.done = p.done; job.total = p.total; }
          renderLibrary();
        },
      });
      meta.requested = url;
      state.pages.unshift(meta);
      await C.store.writeIndex(state.pages);
      toast(meta.missing ? "Saved. Some previews are missing." : "Saved for offline reading");
    } catch (e) {
      toast(e instanceof C.save.SaveError ? e.message : "Couldn't save this page. Try again.");
      if (!(e instanceof C.save.SaveError)) console.error(e);
    } finally {
      state.saving = state.saving.filter((s) => s !== job);
      renderLibrary();
    }
  }

  function showOffline() {
    $("offlinePill").hidden = navigator.onLine;
  }

  async function openPage(id, fromHistory) {
    const p = state.pages.find((x) => x.id === id);
    if (!p) return;
    let html;
    try { html = await C.store.readPage(id); } catch (e) { html = null; }
    if (!html) { toast("This page's file is missing. Delete it and save it again."); return; }
    state.open = p;
    $("readerOriginal").href = p.url;
    showOffline();
    $("libraryView").hidden = true;
    $("readerView").hidden = false;
    if (!fromHistory) history.pushState({ page: id }, "");
    await C.reader.open($("readerFrame"), html, p);
    $("readerFrame").focus();
  }

  function closeReader() {
    if (!state.open) return;
    state.open = null;
    C.reader.close();
    $("readerView").hidden = true;
    $("libraryView").hidden = false;
  }

  async function deleteOpen() {
    const p = state.open;
    if (!p || !confirm("Delete “" + p.title + "” from this phone?")) return;
    await C.store.removePage(p.id);
    state.pages = state.pages.filter((x) => x.id !== p.id);
    await C.store.writeIndex(state.pages);
    history.back();
    renderLibrary();
    toast("Deleted");
  }

  $("themeBtn").addEventListener("click", () => {
    state.theme = applyTheme(THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]);
    store(THEME_KEY, state.theme);
    toast("Theme: " + state.theme[0].toUpperCase() + state.theme.slice(1));
  });

  $("saveForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = linkFrom($("saveUrl").value);
    if (!url) { toast("That doesn't look like a link. Paste the page's address."); return; }
    $("saveUrl").value = "";
    $("saveUrl").blur();
    savePage(url);
  });

  $("readerBack").addEventListener("click", () => history.back());
  $("readerDelete").addEventListener("click", deleteOpen);
  addEventListener("popstate", (e) => {
    if (e.state && e.state.page) openPage(e.state.page, true);
    else closeReader();
  });
  addEventListener("online", showOffline);
  addEventListener("offline", showOffline);

  renderLibrary();
  Promise.all([C.platform.ready, C.store.ready]).then(() => C.store.readIndex()).then((pages) => {
    state.pages = Array.isArray(pages) ? pages : [];
    renderLibrary();
    if (history.state && history.state.page) history.replaceState(null, "");
  });

  // ---- The app updating itself (from LifeLog's 0.179.0) ----
  // A newer build is a newer APK on this repo's Releases, tagged
  // app-v<APP_VERSION> by .github/workflows/android.yml. Asked once per
  // launch, unauthenticated: the Releases are public.
  function isNewerVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  }

  async function checkForNewerApp() {
    const build = await C.platform.ready;
    if (!C.platform.native || !build || !build.repo) return;
    C.platform.clearOldUpdates(APP_VERSION, isNewerVersion);
    try {
      const res = await C.platform.fetchText("https://api.github.com/repos/" + build.repo + "/releases/latest",
        { headers: { Accept: "application/vnd.github+json" } });
      if (res.status !== 200) return;
      const latest = String(JSON.parse(res.text).tag_name || "").replace(/^app-v/, "");
      if (/^\d+\.\d+\.\d+$/.test(latest) && isNewerVersion(latest, APP_VERSION)) offerUpdate(latest);
    } catch (e) { /* offline: ask again next launch */ }
  }

  // "Update" downloads the APK with its progress on the button, then opens
  // Android's installer; if that's dismissed, "Install" reopens it from the
  // same file. iOS installs nothing an app hands it: a sideloaded build is
  // updated from AltStore or SideStore, so there the bar opens the release.
  function offerUpdate(version) {
    const text = $("updateText");
    const btn = $("updateBtn");
    let apk = null;
    const say = (msg, label, busy) => {
      text.textContent = msg;
      btn.textContent = label;
      btn.disabled = !!busy;
    };
    const install = async () => {
      say("Opening the installer…", "Install", true);
      try {
        await C.platform.openInstaller(apk);
        say("Carry-on " + version + " is ready to install", "Install");
      } catch (e) {
        say("Couldn't open the installer", "Try again");
      }
    };
    btn.onclick = async () => {
      if (apk) return install();
      say("Downloading Carry-on " + version + "…", "0%", true);
      try {
        apk = await C.platform.downloadUpdate(version, (f) => { btn.textContent = Math.round(f * 100) + "%"; });
      } catch (e) {
        say("The download didn't finish", "Retry");
        return;
      }
      if (!apk) {
        say("Carry-on " + version + " is out", "Download");
        C.platform.openOutside(C.platform.apkUrl());
        return;
      }
      install();
    };
    if (C.platform.ios) {
      btn.onclick = () => C.platform.openOutside(C.platform.releasesUrl());
      say("Carry-on " + version + " is out", "Get it");
    } else {
      say("Carry-on " + version + " is out", "Update");
    }
    $("updateBar").hidden = false;
  }

  checkForNewerApp();

  if (!C.platform.native && "serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  C.linkFrom = linkFrom;
  C.isNewerVersion = isNewerVersion;
})();
