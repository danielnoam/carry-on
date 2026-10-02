// Carry-on: the shell. Version, theme, the library, saving, the reader and
// Settings, and the screens moving between them.
(function () {
  const APP_VERSION = "0.3.0";
  window.CarryOn.version = APP_VERSION;

  const C = window.CarryOn;
  const M = C.motion;
  const THEMES = ["paper", "sepia", "night"];
  const THEME_KEY = "carryon.theme";
  const IMAGES_KEY = "carryon.images";

  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "checked") node.checked = !!v;
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
    const wasHidden = t.hidden;
    t.textContent = text;
    t.hidden = false;
    if (wasHidden) M.arrive(t, 16);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { M.leave(t).then(() => { t.hidden = true; }); }, 3200);
  }

  // ---- Theme ----
  // "system" follows the phone's light or dark setting: Paper or Night.
  const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  const resolveTheme = (choice) => (THEMES.includes(choice) ? choice : darkQuery && darkQuery.matches ? "night" : "paper");

  function paintTheme(choice) {
    document.documentElement.dataset.theme = resolveTheme(choice);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (C.reader) C.reader.applyTheme();
  }

  // A cross-fade between the old and new colours where the WebView can
  // (View Transitions), an instant switch where it can't.
  function setTheme(choice) {
    state.theme = choice;
    store(THEME_KEY, choice);
    if (document.startViewTransition && !M.reduced()) document.startViewTransition(() => paintTheme(choice));
    else paintTheme(choice);
  }

  const state = {
    theme: load(THEME_KEY, "system"),
    // Library index entries: the meta each saved page's meta.json holds.
    pages: [],
    // Saves in flight: { key, url, site, done, total }.
    saving: [],
    open: null,
    settings: false,
  };
  paintTheme(state.theme);
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", () => { if (state.theme === "system") paintTheme("system"); });

  function formatSize(bytes) {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + " MB";
    return Math.max(1, Math.round(bytes / 1e3)) + " KB";
  }
  const totalBytes = () => state.pages.reduce((sum, p) => sum + (p.bytes || 0), 0);
  const pagesLine = (n) => n + (n === 1 ? " page · " : " pages · ") + formatSize(totalBytes());

  function thumbUrl(p) {
    if (!p.thumb) return null;
    if (/^https?:/.test(p.thumb)) return p.thumb;
    const base = C.store.folderUrl(p.id);
    return base ? base + p.thumb : null;
  }

  // ---- Library ----

  function savingStatus(s) {
    return s.total == null ? "Saving · text" : "Saving · " + s.done + " of " + s.total + " image previews";
  }

  function savingCard(s) {
    return el("div", { class: "card saving", role: "group", "aria-label": "Saving " + s.site },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, s.site),
        el("span", { class: "card-title" }, s.url),
        el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
          el("span", { class: "progress-fill" })),
        el("span", { class: "card-status accent" }, savingStatus(s))));
  }

  // Progress lands in the card that's already there, so the bar grows on
  // its spring instead of being redrawn at each image.
  function updateSavingCard(s) {
    const card = $("library").querySelector('[data-key="' + CSS.escape("s:" + s.key) + '"]');
    if (!card) return;
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    card.querySelector(".progress").setAttribute("aria-valuenow", String(pct));
    card.querySelector(".progress-fill").style.transform = "scaleX(" + pct / 100 + ")";
    card.querySelector(".card-status").textContent = savingStatus(s);
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

  // Cards are keyed and kept between renders; only ones that weren't there
  // before arrive on a spring, so a re-render never replays the list.
  let firstRender = true;
  function renderLibrary() {
    const root = $("library");
    const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
    const n = state.pages.length;
    const allOffline = state.pages.every((p) => !p.missing && p.mode !== "links");
    $("libraryMeta").textContent = n ? pagesLine(n) + (allOffline ? " · all readable offline" : "") : "Nothing saved yet";
    const nodes = [];
    const fresh = [];
    const keep = (key, make) => {
      let node = old.get(key);
      if (!node) { node = make(); node.dataset.key = key; fresh.push(node); }
      nodes.push(node);
    };
    for (const s of state.saving) keep("s:" + s.key, () => savingCard(s));
    for (const p of state.pages) keep("p:" + p.id, () => pageCard(p));
    if (!n && !state.saving.length) {
      keep("empty", () => el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, "Pages you take with you"),
        el("p", { class: "empty-text" },
          "Share a page to Carry-on from your browser, or paste its link below. It stays readable with no connection, with a link back to the original.")));
    }
    root.replaceChildren(...nodes);
    for (const s of state.saving) updateSavingCard(s);
    if (!firstRender) fresh.forEach((node) => M.arrive(node));
    firstRender = false;
  }

  // The first link in whatever was pasted or shared ("Read this:
  // https://…"), or the text itself as a link when it looks like one
  // without its https://.
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
          updateSavingCard(job);
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

  // ---- Screens ----
  // The reader and Settings are pushed over the library, which stays laid
  // out underneath (inert, not hidden) so its scroll position survives. Each
  // push is a history entry, so Android's back gesture pops it.

  function cover(screen) {
    $("libraryView").inert = true;
    screen.hidden = false;
    M.under($("libraryView"), true);
    return M.pushIn(screen);
  }

  function uncover(screen) {
    $("libraryView").inert = false;
    M.under($("libraryView"), false);
    return M.popOut(screen).then(() => { screen.hidden = true; });
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
    if (!fromHistory) history.pushState({ view: "reader", page: id }, "");
    const shown = C.reader.open($("readerFrame"), html, p);
    cover($("readerView"));
    await shown;
    $("readerFrame").focus();
  }

  function closeReader() {
    if (!state.open) return;
    state.open = null;
    uncover($("readerView")).then(() => { if (!state.open) C.reader.close(); });
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

  // ---- Settings ----
  // Each group is data: a new setting is a new entry here, not new markup.

  const SETTINGS = [
    {
      title: "Appearance",
      key: THEME_KEY,
      label: "Theme",
      get: () => state.theme,
      set: setTheme,
      options: [
        { value: "system", label: "System", note: "Paper or Night, following your phone", swatch: ["paper", "night"] },
        { value: "paper", label: "Paper", swatch: ["paper"] },
        { value: "sepia", label: "Sepia", note: "Warmer, for long reads", swatch: ["sepia"] },
        { value: "night", label: "Night", note: "For a dim cabin", swatch: ["night"] },
      ],
    },
    {
      title: "Saving",
      key: IMAGES_KEY,
      label: "Images",
      get: () => load(IMAGES_KEY, "previews"),
      set: (v) => { store(IMAGES_KEY, v); toast("New saves use " + v.replace("previews", "previews and links").replace("full", "full images").replace("links", "links only") + "."); },
      footnote: "Applies to pages you save from now on.",
      options: [
        { value: "previews", label: "Previews and links", note: "About 30 KB an image. The full image loads when you're online." },
        { value: "full", label: "Full images", note: "About 150 KB an image. For maps and diagrams." },
        { value: "links", label: "Links only", note: "No images on the phone. They load when you're online." },
      ],
    },
  ];

  function swatch(themes) {
    return el("span", { class: "swatch", "aria-hidden": "true" },
      ...themes.map((t) => el("span", { class: "swatch-half", "data-theme": t }, el("span", { class: "swatch-dot" }))));
  }

  const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function choiceGroup(g) {
    const current = g.get();
    const list = el("div", { class: "group", role: "radiogroup", "aria-label": g.label });
    for (const o of g.options) {
      const check = el("span", { class: "choice-check", "aria-hidden": "true" });
      check.innerHTML = CHECK;
      list.append(el("label", { class: "choice" },
        el("input", { class: "visually-hidden", type: "radio", name: g.key, value: o.value, checked: o.value === current,
          onchange: () => g.set(o.value) }),
        o.swatch ? swatch(o.swatch) : null,
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, o.label),
          o.note ? el("span", { class: "choice-note" }, o.note) : null),
        check));
    }
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, g.title),
      list,
      g.footnote ? el("p", { class: "footnote" }, g.footnote) : null);
  }

  function storageGroup() {
    const n = state.pages.length;
    const list = el("div", { class: "group" });
    if (!n) list.append(el("div", { class: "row" }, el("span", { class: "row-label muted" }, "Nothing saved yet")));
    for (const p of [...state.pages].sort((a, b) => (b.bytes || 0) - (a.bytes || 0))) {
      list.append(el("button", { class: "row", type: "button", onclick: () => toLibrary().then(() => openPage(p.id)) },
        el("span", { class: "row-label" }, p.title),
        el("span", { class: "row-value" }, formatSize(p.bytes || 0))));
    }
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Storage"),
      el("p", { class: "section-lead" }, n ? pagesLine(n).replace(" · ", " using ") : "Pages you save show here with their size."),
      list);
  }

  function aboutGroup() {
    const list = el("div", { class: "group" },
      el("div", { class: "row" }, el("span", { class: "row-label" }, "Version"), el("span", { class: "row-value" }, APP_VERSION)));
    if (C.platform.native) {
      list.append(el("button", { class: "row", type: "button", onclick: () => checkForNewerApp(true) },
        el("span", { class: "row-label accent" }, "Check for updates")));
    }
    const releases = C.platform.releasesUrl() || "https://github.com/danielnoam/carry-on/releases/latest";
    list.append(el("a", { class: "row", href: releases, target: "_blank", rel: "noopener" },
      el("span", { class: "row-label accent" }, "Releases and source"),
      el("span", { class: "row-value", "aria-hidden": "true" }, "↗")));
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "About"),
      list,
      el("p", { class: "footnote" }, "Pages stay on this phone. Carry-on collects nothing."));
  }

  function renderSettings() {
    $("settingsBody").replaceChildren(...SETTINGS.map(choiceGroup), storageGroup(), aboutGroup());
  }

  function openSettings(fromHistory) {
    if (state.settings) return;
    state.settings = true;
    renderSettings();
    if (!fromHistory) history.pushState({ view: "settings" }, "");
    $("settingsBody").scrollTop = 0;
    cover($("settingsView")).then(() => $("settingsBack").focus());
  }

  function closeSettings() {
    if (!state.settings) return;
    state.settings = false;
    uncover($("settingsView"));
  }

  // ---- Wiring ----

  function route(s) {
    const view = s && s.view;
    if (view !== "reader") closeReader();
    if (view !== "settings") closeSettings();
    if (view === "reader" && (!state.open || state.open.id !== s.page)) openPage(s.page, true);
    if (view === "settings") openSettings(true);
  }

  // Back to the library from whatever screen is up, through history so the
  // stack stays honest; resolves once it's there.
  function toLibrary() {
    if (!(history.state && history.state.view)) return Promise.resolve();
    return new Promise((resolve) => {
      addEventListener("popstate", () => resolve(), { once: true });
      history.back();
    });
  }

  $("settingsBtn").addEventListener("click", () => openSettings());
  $("settingsBack").addEventListener("click", () => history.back());

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
  addEventListener("popstate", (e) => route(e.state));
  addEventListener("online", showOffline);
  addEventListener("offline", showOffline);

  // ---- Shared from another app (Android) ----
  // native/share hands over what Chrome's share sheet sent: usually the
  // link, sometimes "Title https://…". Saved straight away.
  async function takeShared() {
    const share = C.platform.plugin("ShareTarget");
    if (!share) return;
    let got;
    try { got = await share.take(); } catch (e) { return; }
    if (!got || !got.text) return;
    const url = linkFrom(got.text);
    if (!url) { toast("That share had no link in it."); return; }
    await toLibrary();
    savePage(url);
  }

  renderLibrary();
  Promise.all([C.platform.ready, C.store.ready]).then(() => C.store.readIndex()).then((pages) => {
    state.pages = Array.isArray(pages) ? pages : [];
    if (history.state && history.state.view) history.replaceState(null, "");
    renderLibrary();
    const share = C.platform.plugin("ShareTarget");
    if (share && share.addListener) share.addListener("shared", takeShared);
    takeShared();
  });

  // ---- The app updating itself (from LifeLog's 0.179.0) ----
  // A newer build is a newer APK on this repo's Releases, tagged
  // app-v<APP_VERSION> by .github/workflows/android.yml. Asked once per
  // launch, unauthenticated: the Releases are public. Settings can ask again.
  function isNewerVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  }

  async function checkForNewerApp(asked) {
    const build = await C.platform.ready;
    if (!C.platform.native || !build || !build.repo) return;
    C.platform.clearOldUpdates(APP_VERSION, isNewerVersion);
    try {
      const res = await C.platform.fetchText("https://api.github.com/repos/" + build.repo + "/releases/latest",
        { headers: { Accept: "application/vnd.github+json" } });
      if (res.status !== 200) throw new Error("HTTP " + res.status);
      const latest = String(JSON.parse(res.text).tag_name || "").replace(/^app-v/, "");
      if (/^\d+\.\d+\.\d+$/.test(latest) && isNewerVersion(latest, APP_VERSION)) {
        offerUpdate(latest);
        if (asked) { toast("Carry-on " + latest + " is out"); history.back(); }
      } else if (asked) toast("You have the latest version");
    } catch (e) {
      if (asked) toast("Couldn't check. Try again when you're online.");
    }
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
    if ($("updateBar").hidden) {
      $("updateBar").hidden = false;
      M.arrive($("updateBar"));
    }
  }

  checkForNewerApp();

  if (!C.platform.native && "serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  C.linkFrom = linkFrom;
  C.isNewerVersion = isNewerVersion;
})();
