// Carry-on: the shell. Version, theme, the library, saving, the reader and
// Settings, and the screens moving between them.
(function () {
  const APP_VERSION = "0.29.0";
  window.CarryOn.version = APP_VERSION;

  const C = window.CarryOn;
  const M = C.motion;
  // Each theme is a token set in src/styles.css; "system" (Auto) picks
  // the light or dark one chosen for it from the phone's setting.
  const THEMES = [
    { value: "paper", label: "Paper", dark: false },
    { value: "sepia", label: "Sepia", dark: false, note: "Warmer, for long reads" },
    { value: "slate", label: "Slate", dark: false, note: "Cool grey" },
    { value: "solarized", label: "Solarized", dark: false },
    { value: "contrast", label: "High contrast", short: "Contrast", dark: false, note: "Black on white, for bright sun" },
    { value: "night", label: "Night", dark: true, note: "For a dim cabin" },
    { value: "black", label: "Black", dark: true, note: "True black, easy on OLED batteries" },
    { value: "dusk", label: "Dusk", dark: true, note: "Warm and soft, for bedtime" },
    { value: "solarized-dark", label: "Solarized Dark", short: "Solarized", dark: true },
  ];
  const themeOf = (v) => THEMES.find((t) => t.value === v);
  const THEME_KEY = "carryon.theme";
  const AUTO_KEY = "carryon.themeAuto";
  const IMAGES_KEY = "carryon.images";
  const READING_KEY = "carryon.reading";
  const FILTER_KEY = "carryon.filter";
  const SEEN_KEY = "carryon.seenVersion";
  const SORT_KEY = "carryon.sort";
  const CONTINUE_KEY = "carryon.continue";
  const LAYOUT_KEY = "carryon.layout";
  // The library's three looks (0.28.0); Settings, Appearance picks one.
  const LAYOUTS = [
    { value: "shelf", label: "Shelf", note: "Collections as a row of covers, pages listed under them" },
    { value: "list", label: "One list", note: "Collections and pages together, grouped by date or site" },
    { value: "grid", label: "Grid", note: "Covers three across, pages as picture cards" },
  ];
  const NEW_KEY = "carryon.newChapters";
  const DAILY_KEY = "carryon.checkDaily";
  const EXPORT_KEY = "carryon.exportKind";
  const RATE_KEY = "carryon.aloudRate";
  const VOICE_KEY = "carryon.aloudVoice";

  const $ = (id) => document.getElementById(id);
  const libTools = $("libTools");

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

  // replaceChildren, skipping the nulls an optional part leaves.
  const fill = (node, ...children) => node.replaceChildren(...children.filter((c) => c != null));

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
    const shown = text;
    toastTimer = setTimeout(() => { M.leave(t).then(() => { if (t.textContent === shown) t.hidden = true; }); }, 3200);
  }

  // ---- Theme ----
  // "system" follows the phone's light or dark setting, with the light and
  // dark theme picked for it (Paper and Night unless changed).
  const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function autoThemes() {
    const a = load(AUTO_KEY, {});
    const ok = (v, dark) => themeOf(v) && themeOf(v).dark === dark;
    return { light: ok(a.light, false) ? a.light : "paper", dark: ok(a.dark, true) ? a.dark : "night" };
  }
  const resolveTheme = (choice) => (themeOf(choice) ? choice : autoThemes()[darkQuery && darkQuery.matches ? "dark" : "light"]);
  const themeName = (choice) => (themeOf(choice) ? themeOf(choice).label : "Auto");

  function setAutoTheme(change) {
    store(AUTO_KEY, { ...autoThemes(), ...change });
    if (state.theme === "system") paintTheme("system");
    document.querySelectorAll(".swatch.auto").forEach((sw) => sw.replaceWith(swatch(autoSwatch(), "auto")));
  }
  const autoSwatch = () => { const a = autoThemes(); return [a.light, a.dark]; };

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
    // What finished this session, newest first, for Downloads: { key, at,
    // run } for a run of saves, { key, at, page } for one page.
    finished: [],
    // Whether the Downloads screen is up.
    downloads: false,
    open: null,
    settings: false,
    sheet: false,
    // Whether a tapped image is up full screen over the reader.
    image: false,
    batch: false,
    news: false,
    // The folder whose screen is up (its name), under the reader if a page is open.
    folder: null,
    // Which pages the library shows: "all", "unread", "finished" or "#tag".
    filter: load(FILTER_KEY, "all"),
    // What's typed in the library's search field.
    query: "",
    // The library's order: "saved", "read", "length" or "site".
    sort: load(SORT_KEY, "saved"),
    // Picking pages to change together: the ids picked, or null.
    select: null,
    // The library's sheet: { kind: "page" | "tags" | "folder", page }, or null.
    menu: null,
    // Settings' screen up over its menu: "appearance", "saving", "storage", "updates" or "about".
    section: null,
  };
  paintTheme(state.theme);

  // ---- Reading ----
  // Text size, line spacing, margins and fonts for saved pages, set from
  // the reader's Aa sheet or Settings. They're tokens on the app's :root,
  // which src/reader.js copies into the page like the theme's colours.
  const SIZE_MIN = 14, SIZE_MAX = 32;
  const SPACING_MIN = 1.2, SPACING_MAX = 2.2;
  // Every Latin font is followed by a Hebrew one (src/fonts.css), which
  // gives a Hebrew page its letters: the one picked, or else the one
  // matching the Latin font's style.
  const FONTS = [
    { value: "serif", label: "Source Serif", family: '"Source Serif 4"', kind: "serif" },
    { value: "literata", label: "Literata", family: '"Literata"', kind: "serif" },
    { value: "lora", label: "Lora", family: '"Lora"', kind: "serif" },
    { value: "merriweather", label: "Merriweather", family: '"Merriweather"', kind: "serif" },
    { value: "garamond", label: "EB Garamond", family: '"EB Garamond"', kind: "serif" },
    { value: "sans", label: "Instrument Sans", family: '"Instrument Sans"', kind: "sans" },
    { value: "inter", label: "Inter", family: '"Inter"', kind: "sans" },
    { value: "atkinson", label: "Atkinson", family: '"Atkinson Hyperlegible"', kind: "sans" },
    { value: "dyslexic", label: "OpenDyslexic", family: '"OpenDyslexic"', kind: "sans" },
    { value: "system", label: "System", family: 'system-ui, -apple-system, "Segoe UI", Roboto', kind: "system" },
  ];
  const HEBREW = [
    { value: "auto", label: "Auto" },
    { value: "frank", label: "Frank Ruhl", family: '"Frank Ruhl Libre"' },
    { value: "david", label: "David", family: '"David Libre"' },
    { value: "assistant", label: "Assistant", family: '"Assistant"' },
    { value: "heebo", label: "Heebo", family: '"Heebo"' },
  ];
  const MARGINS = { narrow: ["var(--s-3)", "44rem"], normal: ["20px", "38rem"], wide: ["var(--s-7)", "32rem"] };
  const READING_DEFAULT = { size: 19, spacing: 1.6, font: "serif", hebrew: "auto", margins: "normal", layout: "scroll" };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Before 0.24.0 size was a step of five and spacing a word.
  function readingPrefs() {
    const r = { ...READING_DEFAULT, ...load(READING_KEY, {}) };
    if (Number.isInteger(r.size) && r.size >= 0 && r.size < 5) r.size = [16, 18, 19, 21, 24][r.size];
    if (typeof r.spacing === "string") r.spacing = { tight: 1.4, normal: 1.6, loose: 1.8 }[r.spacing];
    r.size = Number.isFinite(r.size) ? clamp(Math.round(r.size), SIZE_MIN, SIZE_MAX) : READING_DEFAULT.size;
    r.spacing = Number.isFinite(r.spacing) ? clamp(Math.round(r.spacing * 20) / 20, SPACING_MIN, SPACING_MAX) : READING_DEFAULT.spacing;
    if (!FONTS.some((f) => f.value === r.font)) r.font = READING_DEFAULT.font;
    if (!HEBREW.some((f) => f.value === r.hebrew)) r.hebrew = READING_DEFAULT.hebrew;
    if (!MARGINS[r.margins]) r.margins = READING_DEFAULT.margins;
    if (r.layout !== "pages") r.layout = "scroll";
    return r;
  }

  function fontStack(r) {
    const f = FONTS.find((x) => x.value === r.font);
    const picked = HEBREW.find((x) => x.value === r.hebrew).family;
    const hebrew = picked || { serif: '"Frank Ruhl Libre"', sans: '"Heebo"' }[f.kind];
    return [f.family, hebrew, f.kind === "serif" ? "Georgia, serif" : "sans-serif"].filter(Boolean).join(", ");
  }

  function paintReading() {
    const r = readingPrefs();
    const root = document.documentElement.style;
    root.setProperty("--reader-fs", r.size + "px");
    root.setProperty("--reader-lh", Math.round(r.size * r.spacing) + "px");
    root.setProperty("--reader-font", fontStack(r));
    root.setProperty("--reader-pad", MARGINS[r.margins][0]);
    root.setProperty("--reader-measure", MARGINS[r.margins][1]);
    if (C.reader) C.reader.applyTheme();
  }

  function setReading(change) {
    const was = readingPrefs().layout;
    store(READING_KEY, { ...readingPrefs(), ...change });
    paintReading();
    if (C.reader && readingPrefs().layout !== was) C.reader.setPaged(readingPrefs().layout === "pages");
    document.querySelectorAll(".reading-controls").forEach(syncReadingControls);
  }
  paintReading();
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", () => { if (state.theme === "system") paintTheme("system"); });

  function formatSize(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1) + " GB";
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + " MB";
    return Math.max(1, Math.round(bytes / 1e3)) + " KB";
  }
  const sizeOf = (pages) => pages.reduce((sum, p) => sum + (p.bytes || 0), 0);
  const totalBytes = () => sizeOf(state.pages);
  const countLine = (n) => n + (n === 1 ? " page" : " pages");
  // Where the pages are kept, for the words that say so.
  const HERE = C.platform.native ? "this phone" : "this browser";
  const ON_HERE = (C.platform.native ? "on " : "in ") + HERE;
  const pagesLine = (n) => countLine(n) + " · " + formatSize(totalBytes());

  // A browser's card pictures, read once from IndexedDB (0.27.12).
  const webThumbs = new Map();
  async function loadThumbs() {
    if (C.platform.native) return;
    const got = await C.store.readThumbs();
    webThumbs.clear();
    got.forEach((url, id) => webThumbs.set(id, url));
  }

  function thumbUrl(p) {
    if (!p.thumb) return null;
    if (/^https?:/.test(p.thumb)) return p.thumb;
    if (webThumbs.has(p.id)) return webThumbs.get(p.id);
    const base = C.store.pageDirUrl(p.id);
    return base ? base + p.thumb : null;
  }

  // The site's icon, for a card with no picture (0.27.6): kept beside the
  // page, or its link; a page saved before then tries the site's
  // /favicon.ico while online.
  function iconUrl(p) {
    if (p.icon && /^https?:/.test(p.icon)) return navigator.onLine ? p.icon : null;
    if (p.icon) { const base = C.store.pageDirUrl(p.id); return base ? base + p.icon : null; }
    if (!navigator.onLine) return null;
    try { return new URL("/favicon.ico", p.url).href; } catch (e) { return null; }
  }

  // A collection's cover (0.27.6), read from its story page: kept in
  // _covers/, or its link.
  function coverUrl(list) {
    const c = (list.find((p) => p.cover) || {}).cover;
    if (!c) return null;
    if (/^https?:/.test(c)) return navigator.onLine ? c : null;
    const base = C.store.pageDirUrl("_covers");
    return base ? base + c : null;
  }

  // ---- Library ----

  // What a save is doing, with the seconds it has taken once that's long
  // enough to wonder, so a slow site doesn't look stuck.
  function savingStatus(s) {
    if (s.waiting) return "Waiting" + (s.folder ? " · into " + s.folder : "");
    const secs = s.started ? Math.floor((Date.now() - s.started) / 1000) : 0;
    const took = secs >= 5 ? " · " + secs + " s" : "";
    if (s.total == null) return (s.drawing ? "Letting the page draw itself" : "Getting the page") + took;
    if (!s.total) return "Writing it to the phone" + took;
    return "Saving " + s.done + " of " + s.total + (s.total === 1 ? " image" : " images") + took;
  }

  // The bar: sweeping while the page itself downloads (no size known yet),
  // then a tenth for the text and the rest by images saved.
  const savingShare = (s) => (s.total == null ? null : s.total ? 0.1 + 0.9 * (s.done / s.total) : 1);

  // A save that failed stays in the list with the reason until it's retried
  // or removed: a toast alone is gone before anyone looks back at the phone.
  function failedCard(s) {
    return el("div", { class: "card saving failed wide", role: "group", "aria-label": "Couldn't save " + s.site },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, s.site),
        el("span", { class: "card-title", dir: "auto" }, s.url),
        el("span", { class: "card-status" }, el("span", { class: "warn" }, s.error)),
        el("span", { class: "card-actions" },
          el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, "Try again"),
          el("button", { class: "btn-quiet", type: "button", onclick: () => dropFailed(s) }, "Remove"))));
  }

  // A run of saves into one folder (Save next 10, Save several, a
  // contents page) is one card from start to end, the same height
  // throughout, so the library doesn't jump as each page comes and goes.
  // Pause waits after the page in progress; Stop lets the rest go.
  // Pages that fail wait on their own cards until the run ends.
  const runs = new Set();
  let runIds = 0;
  const runFor = (folder) => [...runs].find((r) => r.folder && folder && sameTag(r.folder, folder));
  function startRun(folder, site, total, again) {
    const r = { id: ++runIds, folder, site, total, again: !!again, saved: 0, failed: 0, paused: false, stopped: false, current: null, wake: null };
    runs.add(r);
    return r;
  }
  async function gate(r) {
    while (r.paused && !r.stopped) await new Promise((go) => { r.wake = go; });
    return !r.stopped;
  }
  function runChanged() {
    renderLibrary();
    if (state.folder) renderFolder();
    if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build());
  }
  function pauseRun(r, on) {
    r.paused = on;
    if (!on && r.wake) { r.wake(); r.wake = null; }
    runChanged();
  }
  function stopRun(r) {
    if (!r) return;
    r.stopped = true;
    r.paused = false;
    if (r.wake) { r.wake(); r.wake = null; }
    state.saving = state.saving.filter((x) => !(x.run === r && x.waiting && !x.error));
    runChanged();
  }
  function endRun(r) {
    if (!r) return;
    runs.delete(r);
    r.done = true;
    r.at = Date.now();
    if (r.saved || failedOf(r).length) finish({ key: "r:" + r.id, run: r });
    renderDownloads();
  }

  // Downloads keeps the last 30 finished, for this session.
  function finish(entry) {
    state.finished = [{ ...entry, at: Date.now() }, ...state.finished.filter((x) => x.key !== entry.key)].slice(0, 30);
  }

  // A run's pages that couldn't be saved, waiting on Try again.
  const failedOf = (r) => state.saving.filter((s) => s.run === r && s.error);
  function runStatus(r) {
    const done = r.total ? r.saved + " of " + r.total + " saved" : r.saved + " saved";
    const failed = r.failed ? ", " + r.failed + " failed" : "";
    if (r.stopped) return done + failed + " · Stopping";
    if (r.paused) return (r.current ? "Pausing after this page · " : "Paused · ") + done + failed;
    return done + failed + " · " + (r.current && !r.current.waiting ? savingStatus(r.current) : "Next in a moment");
  }
  function runCard(r) {
    return el("div", { class: "card saving run wide", role: "group", "aria-label": (r.again ? "Saving again in " : "Saving into ") + (r.folder || "the library") },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, r.site, r.again ? " · Saving again" : null),
        el("span", { class: "card-title", dir: "auto" }, r.folder || "Saving several"),
        el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
          el("span", { class: "progress-fill" })),
        el("span", { class: "card-status accent" },
          el("span", { class: "spinner", "aria-hidden": "true" }),
          el("span", { class: "status-text" }, runStatus(r))),
        el("span", { class: "card-actions" },
          el("button", { class: "btn-small run-pause", type: "button", onclick: () => pauseRun(r, !r.paused) }, r.paused ? "Resume" : "Pause"),
          el("button", { class: "btn-quiet danger", type: "button", onclick: () => stopRun(r) }, "Stop")),
        failedList(r)));
  }
  // A run's bar is the whole run when its length is known, else the page
  // in progress.
  function runShare(r) {
    const page = r.current && !r.current.waiting ? savingShare(r.current) : 0;
    if (!r.total || (page == null && !r.saved && !r.failed)) return page;
    return Math.min(1, (r.saved + r.failed + (page || 0)) / r.total);
  }
  function updateRunCard(r) {
    paintDownloads();
    const card = $("downloads").querySelector('[data-key="r:' + r.id + '"]');
    if (!card) return;
    const share = runShare(r);
    const bar = card.querySelector(".progress");
    bar.classList.toggle("busy", share == null);
    if (share == null) bar.removeAttribute("aria-valuenow");
    else bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    card.querySelector(".progress-fill").style.transform = "scaleX(" + (share || 0) + ")";
    card.querySelector(".spinner").hidden = r.paused && !r.current;
    card.querySelector(".status-text").textContent = runStatus(r);
  }

  function dropFailed(s) {
    state.saving = state.saving.filter((x) => x !== s);
    renderLibrary();
  }

  // A run's failed pages sit in its card, in Downloads, each with its own
  // Try again, and Try all again over two or more.
  function failedList(r) {
    const list = failedOf(r);
    if (!list.length) return null;
    return el("span", { class: "failed-list" },
      el("span", { class: "failed-head" },
        el("span", { class: "warn" }, list.length === 1 ? "1 page couldn't be saved" : list.length + " pages couldn't be saved"),
        list.length > 1 ? el("button", { class: "btn-text", type: "button", onclick: () => retryAll(list) }, "Try all again") : null),
      ...list.map((s) => el("span", { class: "failed-row" },
        el("span", { class: "failed-text" },
          el("span", { class: "failed-url", dir: "auto" }, s.again ? s.again.title : s.url),
          el("span", { class: "failed-why" }, s.error)),
        el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, "Try again"),
        dropBtn(s))));
  }
  function dropBtn(s) {
    const b = el("button", { class: "icon-btn failed-drop", type: "button", "aria-label": "Remove", onclick: () => dropFailed(s) });
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    return b;
  }

  // Saves a failed page again where it was headed: its collection, its
  // place there, its tags, or the page it was replacing.
  async function retryJob(s) {
    Object.assign(s, { error: null, contents: null, done: 0, total: null, drawing: false, waiting: false });
    renderLibrary();
    const meta = await runJob(s);
    if (meta) {
      if (s.run) { s.run.saved++; s.run.failed = Math.max(0, s.run.failed - 1); }
      toast("Saved for offline reading");
      renderDownloads();
    } else if (s.contents) contentsFound(s);
    if (state.folder) renderFolder();
    return meta;
  }

  async function retryAll(list) {
    let n = 0;
    for (const s of list) {
      if (!s.error || !state.saving.includes(s)) continue;
      if (n++) await new Promise((done) => setTimeout(done, PACE_MS));
      await retryJob(s);
    }
  }

  // ---- Downloads ----
  // Its own screen, from the bar's Downloads button: what's downloading
  // (a run of saves is one card, its failed pages inside it), single pages
  // that couldn't be saved, and what finished this session. Kept up to
  // date while hidden, so it's ready the moment it opens.
  function renderDownloads() {
    const root = $("downloads");
    const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
    const nodes = [], fresh = [];
    const keep = (key, make, sig) => {
      let node = old.get(key);
      if (!node) { node = make(); node.dataset.key = key; fresh.push(node); }
      else if (sig != null && node.dataset.sig !== sig) { node = make(); node.dataset.key = key; }
      if (sig != null) node.dataset.sig = sig;
      nodes.push(node);
    };
    const going = state.saving.filter((s) => !s.error && !(s.run && !s.run.done));
    if (runs.size || going.length) keep("h:going", () => sectionHead("Downloading"));
    for (const r of runs) keep("r:" + r.id, () => runCard(r), [r.paused, r.stopped, failedOf(r).length].join());
    for (const s of going) keep("s:" + s.key, () => savingCard(s));
    const shown = new Set(state.finished.map((e) => e.run).filter(Boolean));
    const lone = state.saving.filter((s) => s.error && (!s.run || (s.run.done && !shown.has(s.run))));
    if (lone.length) keep("h:failed", () => sectionHead("Couldn't be saved"));
    for (const s of lone) keep("f:" + s.key, () => failedCard(s));
    const done = state.finished.filter((e) => e.run || state.pages.some((p) => p.id === e.page));
    if (done.length) keep("h:done", () => sectionHead("Done", el("button", { class: "btn-text", type: "button", onclick: clearFinished }, "Clear")));
    for (const e of done) {
      if (e.run) keep(e.key, () => doneRunCard(e), [e.run.saved, failedOf(e.run).length, whenText(e.at), !!(e.run.folder && folderPages(e.run.folder).length)].join());
      else {
        const p = state.pages.find((x) => x.id === e.page);
        keep(e.key, () => donePageCard(p, e), [p.title, p.missing, whenText(e.at)].join());
      }
    }
    if (!nodes.length) {
      keep("empty", () => el("div", { class: "empty wide" },
        el("h2", { class: "empty-title" }, "Nothing downloading"),
        el("p", { class: "empty-text" }, "Pages you save show their progress here, and stay here once they're done until you close the app.")));
    }
    root.replaceChildren(...nodes);
    for (const s of going) updateSavingCard(s);
    for (const r of runs) updateRunCard(r);
    if (state.downloads) fresh.forEach((node) => M.arrive(node));
    paintDownloads();
  }

  function clearFinished() {
    state.finished = [];
    renderDownloads();
    $("downloadsBack").focus();
  }

  function doneRunCard(e) {
    const r = e.run;
    const name = r.folder && folderPages(r.folder).length ? folderPages(r.folder)[0].folder : null;
    const saved = r.saved ? countLine(r.saved) + (r.again ? " saved again" : " saved") : "Nothing saved";
    return el("div", { class: "card done-run wide", role: "group", "aria-label": (r.folder || "Several pages") + ", done" },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, r.site),
        el("span", { class: "card-title", dir: "auto" }, r.folder || "Several pages"),
        el("span", { class: "card-status" }, [saved, r.stopped ? "Stopped" : null, whenText(e.at)].filter(Boolean).join(" · ")),
        name ? el("span", { class: "card-actions" },
          el("button", { class: "btn-small", type: "button", onclick: () => toLibrary().then(() => openFolder(name)) }, "Open")) : null,
        failedList(r)));
  }

  function donePageCard(p, e) {
    const thumb = thumbUrl(p);
    return el("div", { class: "card done-page wide" },
      el("button", { class: "card-open", type: "button", "aria-label": p.title, onclick: () => toLibrary().then(() => openPage(p.id)) }),
      thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : siteMark(p),
      el("span", { class: "card-body" },
        el("span", { class: "card-site", dir: "auto" }, p.site, p.folder ? " · " + p.folder : null),
        el("span", { class: "card-title", dir: "auto" }, p.title),
        el("span", { class: "card-status" }, "Saved " + whenText(e.at),
          p.missing ? " · " : null, p.missing ? el("span", { class: "warn" }, p.missing + (p.missing === 1 ? " preview" : " previews") + " missing") : null)));
  }

  // The bar's Downloads button: a ring filling with everything being
  // downloaded together, and a warning dot once only pages that couldn't
  // be saved are left. The app's own notification (Android) says
  // the same.
  let toldNative = "";
  function paintDownloads() {
    const active = [...runs];
    const singles = state.saving.filter((s) => !s.error && !(s.run && !s.run.done));
    let units = 0, got = 0;
    for (const r of active) {
      if (r.total) { units += r.total; got += runShare(r) * r.total; }
      else { const page = r.current && !r.current.waiting ? savingShare(r.current) || 0 : 0; units += r.saved + r.failed + 1; got += r.saved + r.failed + page; }
    }
    for (const s of singles) { units += 1; got += s.waiting ? 0 : savingShare(s) || 0; }
    const busy = units > 0;
    const share = busy ? Math.min(1, got / units) : 0;
    const failed = !busy && state.saving.some((s) => s.error);
    const btn = $("downloadsBtn");
    btn.classList.toggle("busy", busy);
    btn.classList.toggle("failed", failed);
    btn.querySelector(".dl-ring-fill").style.strokeDashoffset = String(100 - share * 100);
    btn.setAttribute("aria-label", busy ? "Downloads, " + Math.round(share * 100) + "% done"
      : failed ? "Downloads, some pages couldn't be saved" : "Downloads");
    if (!busy) {
      if (toldNative) C.platform.downloads.stop();
      toldNative = "";
      return;
    }
    const one = active.length === 1 && !singles.length ? active[0] : null;
    const title = one ? (one.again ? "Saving again in " : "Saving into ") + (one.folder || "your library")
      : !active.length && singles.length === 1 ? "Saving a page from " + singles[0].site : "Saving " + Math.round(units) + " pages";
    const text = one ? (one.total ? one.saved + one.failed + " of " + one.total + " done" : countLine(one.saved) + " saved") + (one.paused ? " · Paused" : "")
      : Math.round(share * 100) + "% done";
    const o = { title, text, done: Math.round(share * 1000), total: 1000 };
    const said = JSON.stringify(o);
    if (said === toldNative) return;
    toldNative = said;
    C.platform.downloads.update(o);
  }

  function openDownloads(fromHistory) {
    if (state.downloads) return;
    state.downloads = true;
    renderDownloads();
    if (!fromHistory) history.pushState({ view: "downloads" }, "");
    $("downloadsBody").scrollTop = 0;
    pushScreen($("downloadsView")).then(() => $("downloadsBack").focus());
  }

  function closeDownloads() {
    if (!state.downloads) return;
    state.downloads = false;
    popScreen($("downloadsView"));
  }

  function savingCard(s) {
    return el("div", { class: "card saving wide", role: "group", "aria-label": "Saving " + s.site },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, s.site),
        el("span", { class: "card-title", dir: "auto" }, s.url),
        el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
          el("span", { class: "progress-fill" })),
        el("span", { class: "card-status accent" },
          s.waiting ? null : el("span", { class: "spinner", "aria-hidden": "true" }),
          el("span", { class: "status-text" }, savingStatus(s)))));
  }

  // Progress lands in the card that's already there, so the bar grows on
  // its spring instead of being redrawn at each image.
  function updateSavingCard(s) {
    if (s.run && !s.run.done) { updateRunCard(s.run); return; }
    paintDownloads();
    const card = $("downloads").querySelector('[data-key="' + CSS.escape("s:" + s.key) + '"]');
    if (!card || s.error) return;
    const share = savingShare(s);
    const bar = card.querySelector(".progress");
    bar.classList.toggle("busy", share == null && !s.waiting);
    if (share == null) bar.removeAttribute("aria-valuenow");
    else bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    card.querySelector(".progress-fill").style.transform = "scaleX(" + (share || 0) + ")";
    const status = card.querySelector(".card-status");
    if (!s.waiting && !status.querySelector(".spinner")) status.prepend(el("span", { class: "spinner", "aria-hidden": "true" }));
    status.querySelector(".status-text").textContent = savingStatus(s);
  }

  // The seconds on a slow save tick on their own.
  setInterval(() => { for (const s of state.saving) if (!s.error && !s.waiting) updateSavingCard(s); }, 1000);

  // "Finished" once read to the end, "6 min left" part way, else the length.
  function readingLine(p) {
    if (p.finished) return "Finished";
    if (p.at > 0.02) return Math.max(1, Math.ceil(p.minutes * (1 - p.at))) + " min left";
    return p.minutes + " min";
  }

  // Only what needs a look gets a word: missing previews, or images that
  // load online only. Anything else is ready offline, which goes unsaid.
  // Continue reading's card shows its collection's cover, when it has one.
  function pageCard(p, found, hero) {
    const cover = hero && p.folder ? coverUrl(folderPages(p.folder)) : null;
    const thumb = thumbUrl(p);
    const facts = [readingLine(p), formatSize(p.bytes || 0)].join(" · ");
    const started = !p.finished && p.at > 0.02;
    const status = p.missing
      ? el("span", { class: "warn" }, p.missing + (p.missing === 1 ? " preview" : " previews") + " missing")
      : p.mode === "links" ? el("span", null, "Images online") : null;
    // The whole card opens the page (a button stretched under everything);
    // Retry sits above it, since a button can't hold another.
    const retry = p.missing && C.platform.native && navigator.onLine
      ? el("button", { class: "card-retry", type: "button", onclick: (e) => retryPreviews(p, e.currentTarget) }, "Retry")
      : null;
    return el("div", { class: "card page-card" + (hero ? " continue wide" : "") + (cover ? " has-cover" : ""), "data-ids": p.id },
      el("button", { class: "card-open", type: "button", "aria-label": p.title, onclick: () => tapPages([p.id], () => openPage(p.id)) }),
      pickMark(),
      cover ? el("img", { class: "card-thumb cover", src: cover, alt: "", loading: "lazy" })
        : thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : siteMark(p),
      el("span", { class: "card-body" },
        el("span", { class: "card-site", dir: "auto" }, p.site, p.folder ? " · " + p.folder : null, ...(p.tags || []).map((t) => el("span", { class: "card-tag" }, " · #" + t))),
        el("span", { class: "card-title", dir: "auto" }, p.title),
        found ? el("span", { class: "card-found", dir: "auto" }, found) : null,
        el("span", { class: "card-status" }, facts, status ? " · " : null, status, retry ? " · " : null, retry),
        started ? el("span", { class: "progress thin", role: "progressbar", "aria-label": "Read so far",
          "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p.at * 100)) },
          el("span", { class: "progress-fill", style: "transform: scaleX(" + p.at + ")" })) : null));
  }

  // A card with no picture shows its site: the icon on the preview tint,
  // or the site's first letter when there's no icon to show.
  function siteMark(p) {
    const letter = el("span", { class: "site-letter" }, (p.site || "?").replace(/^www\./, "").charAt(0).toUpperCase());
    const box = el("span", { class: "card-thumb site-mark", "aria-hidden": "true" }, letter);
    const src = iconUrl(p);
    if (src) {
      const img = el("img", { src, alt: "", loading: "lazy" });
      img.addEventListener("load", () => { if (img.naturalWidth > 1) box.classList.add("has-icon"); });
      box.prepend(img);
    }
    return box;
  }

  // The circle a card shows while picking pages.
  const pickMark = () => el("span", { class: "pick", "aria-hidden": "true" });

  async function retryPreviews(p, btn) {
    btn.disabled = true;
    btn.textContent = "Retrying…";
    let res;
    try {
      res = await C.save.retryMissing(p, (done, total) => { btn.textContent = "Retrying " + done + " of " + total; });
    } catch (e) {
      res = null;
    }
    // A card whose content didn't change isn't rebuilt, so its button is reset here.
    btn.disabled = false;
    btn.textContent = "Retry";
    if (!res) { toast("Couldn't open this page's file. Try again."); return; }
    if (res.got) {
      Object.assign(p, { missing: res.missing, thumb: res.thumb, bytes: (p.bytes || 0) + res.bytes });
      if (p.imageBytes != null) p.imageBytes += res.bytes;
      await C.store.writeIndex(state.pages);
    }
    toast(!res.got ? "Still couldn't get them. The site may be down; the images load online."
      : res.missing ? "Got " + res.got + ". " + res.missing + " still missing."
      : "All previews saved. Offline ready.");
    renderLibrary();
  }

  // ---- Search ----
  // Titles, sites, tags and folders as you type; the pages' words after a
  // pause. Matching ignores case, accents, Hebrew niqqud and Arabic
  // harakat, and every word typed has to be there.

  const fold = (s) => String(s || "").normalize("NFKD").replace(/[\p{M}\u0640]/gu, "").toLocaleLowerCase();
  const terms = () => fold(state.query).split(/\s+/).filter(Boolean);
  // id → { text, folded } once read; filled the first time a search needs it.
  const texts = new Map();
  let reading = null, searching = false;

  function metaMatch(p, ts) {
    const hay = fold([p.title, p.site, p.folder, ...(p.tags || []).map((t) => "#" + t)].join(" "));
    return ts.every((t) => hay.includes(t));
  }

  // The sentence the words were found in, trimmed to a line or two.
  function snippet(p, ts) {
    const got = texts.get(p.id);
    if (!got) return null;
    if (!ts.every((t) => got.folded.includes(t))) return null;
    const lines = got.text.split("\n");
    for (const line of lines) {
      const f = fold(line);
      if (!f.includes(ts[0])) continue;
      const sentences = line.split(/(?<=[.!?\u05C3\u06D4])\s+/);
      const s = sentences.find((x) => fold(x).includes(ts[0])) || line;
      if (s.length <= 160) return s;
      const at = Math.max(0, fold(s).indexOf(ts[0]) - 60);
      return (at ? "…" : "") + s.slice(at, at + 150).trim() + "…";
    }
    return null;
  }

  // Reads every page's text that isn't in memory yet: text.txt, or for a
  // page saved before 0.16.0 its page.html, writing text.txt for next time.
  function readTexts() {
    if (reading) return reading;
    const todo = state.pages.filter((p) => !texts.has(p.id));
    if (!todo.length) return Promise.resolve();
    reading = (async () => {
      let done = 0;
      for (const p of todo) {
        let text = await C.store.readText(p.id);
        if (text == null) {
          try {
            const html = await C.store.readPage(p.id);
            text = html ? C.save.plainText(new DOMParser().parseFromString(html, "text/html").body) : "";
            if (html) C.store.writeText(p.id, text).catch(() => {});
          } catch (e) { text = ""; }
        }
        texts.set(p.id, { text, folded: fold(text) });
        done++;
        if (todo.length > 10 && done % 5 === 0) searchNote("Searching the text of your pages · " + done + " of " + todo.length);
      }
    })().finally(() => { reading = null; });
    return reading;
  }

  function searchNote(text) {
    const note = $("searchNote");
    note.textContent = text || "";
    note.hidden = !text;
  }

  let searchTimer = null;
  function onSearch() {
    state.query = $("librarySearch").value;
    $("searchClear").hidden = !state.query;
    renderLibrary();
    clearTimeout(searchTimer);
    if (!terms().length) { searching = false; searchNote(""); return; }
    searching = true;
    searchTimer = setTimeout(async () => {
      await readTexts();
      searching = false;
      searchNote("");
      if (terms().length) renderLibrary();
    }, 300);
  }

  function clearSearch() {
    $("librarySearch").value = "";
    onSearch();
  }

  // Search shows when its button is tapped, and stays while something is
  // typed in it; empty, it goes away again (0.27.10).
  let searchOpen = false;
  function paintSearch() {
    const on = !!state.pages.length && (searchOpen || !!state.query);
    $("searchBox").hidden = !on;
    $("searchBtn").setAttribute("aria-expanded", String(on));
    $("searchBtn").classList.toggle("on", on);
  }
  function openSearch() {
    searchOpen = true;
    paintSearch();
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("librarySearch").focus({ preventScroll: true });
  }
  function closeSearch() {
    if (state.query) clearSearch();
    searchOpen = false;
    paintSearch();
  }

  // ---- Filters and order ----

  const unread = (p) => !p.finished && !(p.at > 0.02);
  function shown(p) {
    const f = state.filter;
    if (f === "unread") return unread(p);
    if (f === "finished") return !!p.finished;
    if (f.startsWith("#")) return (p.tags || []).some((t) => sameTag(t, f.slice(1)));
    return true;
  }

  const filterName = () => (state.filter === "unread" ? "Unread" : state.filter === "finished" ? "Finished" : state.filter);

  function setFilter(f) {
    state.filter = f;
    store(FILTER_KEY, f);
    renderLibrary();
  }

  // Show and Order (0.28.0), over everything the library lists: one
  // dropdown each, so a long tag list waits in a menu instead of a row of
  // capsules. Rebuilt only when what they show changes, so a save landing
  // doesn't close a menu that's open.
  function renderTools() {
    const tags = allTags();
    const sig = [state.pages.length > 0, state.filter, state.sort, tags.join("\u0000")].join("|");
    if (libTools.dataset.sig === sig) return;
    libTools.dataset.sig = sig;
    libTools.hidden = !state.pages.length;
    if (libTools.hidden) return;
    fill(libTools, dropdown({
      label: "Show", cls: "start show-wrap" + (state.filter === "all" ? "" : " on"),
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
      options: [{ value: "all", label: "All pages" }, { value: "unread", label: "Unread" }, { value: "finished", label: "Finished" },
        ...(tags.length ? [{ head: "Tags" }, ...tags.map((t) => ({ value: "#" + t, label: "#" + t }))] : [])],
      value: state.filter,
      onpick: setFilter,
    }), el("div", { class: "lib-tools-end" }, sortControl()));
  }


  const SORTS = [["saved", "Newest saved"], ["read", "Last read"], ["length", "Longest"], ["site", "Site"]];
  const BY = {
    saved: (a, b) => (b.savedAt || 0) - (a.savedAt || 0),
    read: (a, b) => (b.readAt || 0) - (a.readAt || 0) || (b.savedAt || 0) - (a.savedAt || 0),
    length: (a, b) => (b.minutes || 0) - (a.minutes || 0),
    site: (a, b) => (a.site || "").localeCompare(b.site || "") || a.title.localeCompare(b.title),
  };
  const sorted = (list) => [...list].sort(BY[state.sort] || BY.saved);

  function sortControl() {
    return dropdown({
      label: "Order", cls: "end sort-wrap",
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
      options: SORTS.map(([value, label]) => ({ value, label })),
      value: BY[state.sort] ? state.sort : "saved",
      onpick: (v) => { state.sort = v; store(SORT_KEY, v); renderLibrary(); },
    });
  }

  // Our own dropdown (0.26.0), in place of the system's <select>: a
  // button showing the choice, and a small menu that arrives under it.
  // Arrow keys move through it, Escape or a tap outside puts it away.
  function dropdown(o) {
    let value = o.value;
    const face = el("span", { class: "dropdown-face" });
    const btn = el("button", { class: "dropdown-btn", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" }, face);
    if (o.icon) btn.insertAdjacentHTML("afterbegin", o.icon);
    btn.insertAdjacentHTML("beforeend", '<svg class="dropdown-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
    const wrap = el("div", { class: "dropdown " + (o.cls || "") }, btn);
    const show = () => {
      const at = o.options.find((x) => !x.head && x.value === value) || (o.placeholder ? { label: o.placeholder } : o.options[0]);
      const empty = !!o.placeholder && at.label === o.placeholder;
      face.textContent = at.label;
      face.classList.toggle("unset", empty);
      btn.setAttribute("aria-label", empty ? o.label : o.label + ": " + at.label);
    };
    let menu = null;
    const outside = (e) => { if (!wrap.contains(e.target)) close(false); };
    function close(focus) {
      if (!menu) return;
      const m = menu;
      menu = null;
      m.style.pointerEvents = "none";
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      M.leave(m).then(() => m.remove());
      if (focus) btn.focus();
    }
    function open() {
      const nodes = o.options.map((x) => {
        if (x.head) return el("div", { class: "dropdown-head", role: "presentation" }, x.head);
        const check = el("span", { class: "dropdown-check", "aria-hidden": "true" });
        if (x.value === value) check.innerHTML = CHECK;
        return el("button", { class: "dropdown-item", type: "button", role: "option", "aria-selected": String(x.value === value),
          onclick: () => { const changed = x.value !== value; value = x.value; show(); close(true); if (changed) o.onpick(x.value); } },
          el("span", { class: "dropdown-text", dir: "auto" }, x.label), check);
      });
      const items = nodes.filter((x) => x.tagName === "BUTTON");
      menu = el("div", { class: "dropdown-menu", role: "listbox", "aria-label": o.label }, ...nodes);
      menu.addEventListener("keydown", (e) => {
        const i = items.indexOf(document.activeElement);
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
        else if (e.key === "Home" || e.key === "End") { e.preventDefault(); items[e.key === "Home" ? 0 : items.length - 1].focus(); }
        else if (e.key === "Tab") close(false);
      });
      wrap.append(menu);
      btn.setAttribute("aria-expanded", "true");
      M.arrive(menu, -6);
      // A menu opened low on the screen scrolls up into view.
      menu.scrollIntoView({ block: "nearest" });
      document.addEventListener("pointerdown", outside, true);
      (items.find((b) => b.getAttribute("aria-selected") === "true") || items[0]).focus({ preventScroll: true });
    }
    btn.addEventListener("click", () => (menu ? close(true) : open()));
    btn.addEventListener("keydown", (e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !menu) { e.preventDefault(); open(); } });
    show();
    wrap.set = (v) => { value = v; show(); };
    return wrap;
  }

  const sectionHead = (label, extra) => el("div", { class: "section-head wide" }, el("h2", { class: "overline" }, label), extra || null);

  // The page to carry on with: the one read last that isn't finished.
  function continuePage() {
    const going = state.pages.filter((p) => !p.finished && p.at > 0.02);
    return going.sort((a, b) => (b.readAt || 0) - (a.readAt || 0))[0] || null;
  }

  // Folders, the one touched last first.
  function foldersByUse() {
    const last = (name) => Math.max(...folderPages(name).map((p) => Math.max(p.readAt || 0, p.savedAt || 0)));
    return allFolders().map((n) => [n, last(n)]).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }

  // A collection as one item among pages, for the library's order: its
  // newest page, the one read last, its length and its site.
  function asItem(name) {
    const list = folderPages(name);
    return { folder: name, title: name, site: list[0].site,
      savedAt: Math.max(...list.map((p) => p.savedAt || 0)),
      readAt: Math.max(...list.map((p) => p.readAt || 0)),
      minutes: list.reduce((n, p) => n + (p.minutes || 0), 0) };
  }

  // One list's groups: by day under Newest saved and Last read, by site
  // under Site, none under Longest.
  function groupOf(x) {
    if (state.sort === "site") return x.site || "";
    if (state.sort === "length") return "";
    const t = state.sort === "read" ? x.readAt : x.savedAt;
    if (!t) return "Not started";
    const day = 864e5, start = new Date().setHours(0, 0, 0, 0);
    return t >= start ? "Today" : t >= start - day ? "Yesterday" : t >= start - 6 * day ? "This week"
      : t >= start - 29 * day ? "This month" : "Earlier";
  }

  const layout = () => { const v = load(LAYOUT_KEY, "shelf"); return LAYOUTS.some((l) => l.value === v) ? v : "shelf"; };

  const pageSig = (p) => [p.title, readingLine(p), p.missing, p.thumb, Math.round((p.at || 0) * 50), navigator.onLine, (p.tags || []).join(","), p.folder, p.mode].join("|");

  // The pages the library is showing, for Select all.
  let onScreen = [];

  // Cards are keyed and kept between renders; only ones that weren't there
  // before arrive on a spring, so a re-render never replays the list.
  // Show and Order sit over everything. Shelf and Grid are in sections:
  // Continue reading (unless it's turned off, or something is filtered),
  // Collections, then the pages in no collection. One list puts the
  // collections among those pages, in groups. A tag filter lists every
  // page it matches, collections' pages too; a search lists only what it
  // found.
  let firstRender = true;
  function renderLibrary() {
    const root = $("library");
    const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
    const n = state.pages.length;
    // A tag filter whose last page lost the tag (or was deleted) falls back to All.
    if (n && state.filter.startsWith("#")
      && !allTags().some((t) => sameTag(t, state.filter.slice(1)))) { state.filter = "all"; store(FILTER_KEY, "all"); }
    renderTools();
    $("libraryMeta").textContent = n ? pagesLine(n) : "Nothing saved yet";
    $("searchBtn").hidden = !n;
    paintSearch();
    const how = layout();
    $("libraryView").dataset.layout = how;
    const nodes = [];
    const fresh = [];
    // A kept card whose content changed (reading progress, a renamed page)
    // is rebuilt in place, without arriving again.
    const keep = (key, make, sig) => {
      let node = old.get(key);
      if (!node) { node = make(); node.dataset.key = key; fresh.push(node); }
      else if (sig != null && node.dataset.sig !== sig) { node = make(); node.dataset.key = key; }
      if (sig != null) node.dataset.sig = sig;
      nodes.push(node);
    };
    const ts = terms();
    const found = new Map();
    const pages = sorted(state.pages.filter(shown).filter((p) => {
      if (!ts.length) return true;
      if (metaMatch(p, ts)) return found.set(p.id, null), true;
      const s = snippet(p, ts);
      if (s) return found.set(p.id, s), true;
      return false;
    }));
    onScreen = pages;
    // Unread and Finished keep collections whole: a collection shows when
    // it has an unread page, or when all of it is read.
    const status = state.filter === "unread" || state.filter === "finished";
    const flat = ts.length || (state.filter !== "all" && !status);
    const folders = flat ? [] : allFolders().filter((f) => !status
      || (state.filter === "unread" ? folderPages(f).some(unread) : folderPages(f).every((x) => x.finished)));
    const folderSig = (f) => [f, freshCount(f), ...folderPages(f).map((x) => x.id + readingLine(x) + (x.thumb || "") + (x.cover || ""))].join("|");
    if (!ts.length && state.filter === "all") {
      const going = !state.select && load(CONTINUE_KEY, true) && continuePage();
      if (going) {
        keep("h:continue", () => sectionHead("Continue reading"));
        keep("c:" + going.id, () => pageCard(going, null, true), pageSig(going));
      }
    }
    const loose = flat ? pages : pages.filter((p) => !p.folder);
    if (how === "list" && !flat) {
      const items = sorted([...folders.map(asItem), ...loose]);
      let group = null;
      for (const x of items) {
        const g = groupOf(x);
        if (g && g !== group) keep("h:g:" + g, () => sectionHead(g));
        group = g;
        if (x.id) keep("p:" + x.id, () => pageCard(x), pageSig(x));
        else keep("t:" + x.folder, () => { const t = folderTile(x.folder); t.removeAttribute("role"); return t; }, folderSig(x.folder));
      }
    } else {
      if (folders.length) {
        const names = sorted(folders.map(asItem)).map((x) => x.folder);
        keep("h:folders", () => sectionHead("Collections"));
        keep("folders", () => foldersStrip(names), names.map(folderSig).join("‖"));
      }
      if (loose.length) {
        const label = (ts.length ? "Found" : state.filter === "all" ? (n > loose.length ? "Pages in no collection" : "Pages")
          : status && folders.length ? filterName() + " pages in no collection" : filterName()) + " · " + loose.length;
        keep("h:pages", () => sectionHead(label), label);
      }
      for (const p of loose) {
        if (ts.length) {
          const s = found.get(p.id);
          keep("q:" + p.id, () => pageCard(p, s), [pageSig(p), s].join("|"));
        } else keep("p:" + p.id, () => pageCard(p), pageSig(p));
      }
    }
    if (n && !pages.length && ts.length) {
      keep("none:q", () => el("div", { class: "empty wide" },
        el("p", { class: "empty-text", "data-q": "" }),
        el("button", { class: "btn-quiet", type: "button", onclick: clearSearch }, "Clear search")));
      nodes[nodes.length - 1].querySelector("[data-q]").textContent = searching ? "Searching…"
        : "Nothing matches “" + state.query.trim() + "”" + (state.filter === "all" ? "." : " in " + filterName() + ".");
    } else if (n && !loose.length && !folders.length) {
      keep("none:" + state.filter, () => el("div", { class: "empty wide" },
        el("p", { class: "empty-text" }, state.filter === "unread" ? "You've started everything you saved."
          : state.filter === "finished" ? "Nothing finished yet." : "No pages tagged " + state.filter + "."),
        el("button", { class: "btn-quiet", type: "button", onclick: () => setFilter("all") }, "Show all")));
    }
    if (!n) {
      keep("empty", () => el("div", { class: "empty wide" },
        el("h2", { class: "empty-title" }, "Pages you take with you"),
        el("p", { class: "empty-text" }, C.platform.native
          ? "Share a page to Carry-on from your browser, or paste its link below. It stays readable with no connection, with a link back to the original."
          : "Paste a Wikipedia link below, or bring the pages you saved on your phone: back up there, then open the backup here."),
        C.platform.native ? null : el("button", { class: "btn-quiet empty-open", type: "button", onclick: () => openSettings(false, "storage") }, "Open a backup")));
    }
    root.replaceChildren(...nodes);
    if (!firstRender) fresh.forEach((node) => M.arrive(node));
    firstRender = false;
    paintPicks();
    renderDownloads();
    if (state.place === "feeds") renderFeeds();
    if (state.side) renderSide();
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

  // Every link in a paste or share, in order and once each. A text field
  // drops line breaks, so a link also ends where the next one starts.
  function linksFrom(text) {
    const out = [];
    for (const m of String(text).match(/https?:\/\/.+?(?=https?:\/\/|[\s<>"]|$)/gi) || []) {
      const url = m.replace(/[).,;!?]+$/, "");
      if (!out.some((u) => sameUrl(u, url))) out.push(url);
    }
    return out;
  }

  const sameUrl = (a, b) => a && b && a.split("#")[0].replace(/\/$/, "") === b.split("#")[0].replace(/\/$/, "");
  const savedAs = (url) => state.pages.find((p) => sameUrl(p.url, url) || sameUrl(p.requested, url));
  const newJob = (url, folder) => ({ key: url, url, site: C.save.siteName(url), done: 0, total: null, error: null, folder: folder || null });

  async function savePage(url, folder, how) {
    const existing = savedAs(url);
    if (existing) { toast("Already in your library"); openPage(existing.id); return; }
    if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) return;
    state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
    const job = { ...newJob(url, folder), ...how };
    state.saving.unshift(job);
    renderLibrary();
    toast("Saving. It's in Downloads.");
    const meta = await runJob(job);
    if (meta) toast(meta.missing ? "Saved. Some previews are missing." : "Saved for offline reading");
    if (meta && !C.platform.native) C.store.keepStored();
    else if (job.contents) contentsFound(job);
  }

  // A link that turned out to be a contents page opens as a list to check.
  function contentsFound(job) {
    dropFailed(job);
    openBatch(job.contents.links.join("\n"), false, folderName(job.contents.title || job.site), job.url);
    toast("That's a list of chapters. Check them, then save.");
  }

  // Saves one after another are half a second apart, as WebToEpub spaces
  // them, so a long run doesn't hammer the site.
  const PACE_MS = 500;

  // Several links saved one after another, in order, optionally into a
  // folder (so its pages follow the order of the links). A link already
  // saved isn't saved again; it just joins the folder at its place.
  async function saveAll(all, folder, tags = [], mode, skipSaved, kind, source) {
    const name = folder ? folderName(folder) : null;
    const places = skipSaved && name ? placesBetween(all, name) : new Map();
    const urls = skipSaved ? all.filter((u) => !savedAs(u)) : all;
    const jobs = urls.filter((u) => !state.saving.some((s) => !s.error && sameUrl(s.url, u))).map((u) => ({ ...newJob(u, name), tags, mode, kind, source: name ? source : undefined }));
    state.saving = state.saving.filter((s) => !(s.error && jobs.some((j) => sameUrl(j.url, s.url))));
    const fresh = jobs.filter((j) => !savedAs(j.url));
    fresh.forEach((j) => { if (places.has(j.url)) j.folderAt = places.get(j.url); });
    const run = fresh.length > 1 ? startRun(name, fresh[0].site, fresh.length) : null;
    fresh.forEach((j) => { j.waiting = true; j.run = run; });
    state.saving = [...fresh, ...state.saving];
    renderLibrary();
    if (run) toast("Saving " + countLine(fresh.length) + ". They're in Downloads.");
    let saved = 0, failed = 0, had = 0, stopped = 0;
    for (const job of jobs) {
      if (job.waiting && !state.saving.includes(job)) { stopped++; continue; }
      const existing = savedAs(job.url);
      if (existing) {
        had++;
        if (name) { existing.folder = name; existing.folderAt = Date.now(); if (source) existing.source = source; }
        if (tags.length) existing.tags = withTags(existing.tags, tags);
        if (name || tags.length) { await C.store.writeIndex(state.pages); renderLibrary(); if (state.folder) renderFolder(); }
        continue;
      }
      if (saved + failed) await new Promise((done) => setTimeout(done, PACE_MS));
      if (run && !(await gate(run))) { stopped++; continue; }
      if (!state.saving.includes(job)) { stopped++; continue; }
      job.waiting = false;
      if (run) run.current = job;
      renderLibrary();
      if (await runJob(job)) { saved++; if (run) run.saved++; } else { failed++; if (run) run.failed++; }
      if (run) { run.current = null; updateRunCard(run); }
      if (state.folder) renderFolder();
    }
    endRun(run);
    if (run) renderLibrary();
    if (name && source) updateCover(name);
    if (!jobs.length) return;
    toast([saved ? "Saved " + countLine(saved) + (name ? " into " + name : "") : "",
      had ? had + " already saved" + (name && !saved ? ", now in " + name : "") : "",
      failed ? failed + " couldn't be saved" : "", stopped ? "stopped before " + countLine(stopped) : ""].filter(Boolean).join(" · ") + ".");
  }

  // Where new pages go in a folder when the pages around them in the list
  // are already there: between their neighbours, in the list's order, so
  // filling in chapters 1 to 40 under 41 to 60 puts them first. Links
  // with no neighbour in the folder are left out (they go at the end).
  function placesBetween(urls, name) {
    const at = urls.map((u) => {
      const p = savedAs(u);
      return p && p.folder && sameTag(p.folder, name) ? (p.folderAt || p.savedAt || 0) : null;
    });
    const out = new Map();
    for (let i = 0; i < urls.length;) {
      if (at[i] != null || savedAs(urls[i])) { i++; continue; }
      let j = i;
      while (j < urls.length && at[j] == null) j++;
      const gap = urls.slice(i, j).filter((u) => !savedAs(u));
      let back = i - 1;
      while (back >= 0 && at[back] == null) back--;
      const lo = back >= 0 ? at[back] : null, hi = j < urls.length ? at[j] : null;
      gap.forEach((u, k) => {
        if (lo != null && hi != null && hi > lo) out.set(u, lo + ((hi - lo) * (k + 1)) / (gap.length + 1));
        else if (hi != null) out.set(u, hi - (gap.length - k) / 1000);
        else if (lo != null) out.set(u, lo + (k + 1) / 1000);
      });
      i = j;
    }
    return out;
  }

  // Saves one queued link; resolves to its meta, or null when it failed
  // (the card then says why and offers Try again).
  async function runJob(job) {
    job.started = Date.now();
    try {
      const meta = await C.save.save(job.url, {
        mode: job.mode || load(IMAGES_KEY, "previews"),
        kind: job.kind || "article",
        asPage: !!job.asPage,
        onProgress: (p) => {
          if (p.stage === "drawing") job.drawing = true;
          if (p.stage === "images") { job.done = p.done; job.total = p.total; }
          updateSavingCard(job);
        },
      });
      const old = job.again;
      if (old) {
        // Saved again: the new copy takes the old one's place, keeping its
        // collection, tags and read position.
        for (const k of ["requested", "folder", "folderAt", "source", "tags", "at", "finished", "readAt"]) if (old[k] !== undefined) meta[k] = old[k];
        const i = state.pages.indexOf(old);
        if (i < 0) await C.store.removePage(meta.id);
        else {
          state.pages[i] = meta;
          await C.store.writeIndex(state.pages);
          await C.store.removePage(old.id);
        }
      } else {
        meta.requested = job.url;
        if (job.folder) { meta.folder = folderName(job.folder); meta.folderAt = job.folderAt || Date.now(); if (job.source) meta.source = job.source; }
        if (job.tags && job.tags.length) meta.tags = withTags([], job.tags);
        state.pages.unshift(meta);
        await C.store.writeIndex(state.pages);
      }
      state.saving = state.saving.filter((s) => s !== job);
      if (!job.run) finish({ key: "p:" + meta.id, page: meta.id });
      renderLibrary();
      return meta;
    } catch (e) {
      job.error = e instanceof C.save.SaveError ? e.message : "Couldn't save this page. Try again.";
      if (e instanceof C.save.ContentsPage) job.contents = e.contents;
      if (!(e instanceof C.save.SaveError)) console.error(e);
      renderLibrary();
      return null;
    }
  }

  // ---- Screens ----
  // The reader and Settings are pushed over the library, which stays laid
  // out underneath (inert, not hidden) so its scroll position survives. Each
  // push is a history entry, so Android's back gesture pops it.

  // The reader can open over a folder's screen; everything else is over the library.
  const below = (screen) => ((screen.id === "readerView" || screen.id === "batchView") && state.folder ? $("folderView")
    : screen.id === "sectionView" ? $("settingsView")
    : screen.id === "newsView" && state.section ? $("sectionView")
    : screen.id === "newsView" && state.settings ? $("settingsView") : $("libraryView"));

  // Wide enough for Settings' menu to stay beside the section it opened.
  const wide = window.matchMedia ? matchMedia("(min-width: 900px)") : { matches: false };

  // Each push counts, so a pop's animation ending after the same screen
  // was pushed again (back, then a quick tap on it) doesn't hide it and
  // leave the screen underneath inert, taking no taps.
  const pushes = new WeakMap();

  function pushScreen(screen) {
    pushes.set(screen, (pushes.get(screen) || 0) + 1);
    if (screen.id === "sectionView" && wide.matches) {
      screen.dataset.beside = "1";
      screen.hidden = false;
      return M.arrive(screen, 0);
    }
    delete screen.dataset.beside;
    const under = below(screen);
    under.inert = true;
    screen.hidden = false;
    M.under(under, true);
    return M.pushIn(screen);
  }

  function popScreen(screen) {
    const n = pushes.get(screen);
    const hide = () => { if (pushes.get(screen) === n) screen.hidden = true; };
    if (screen.dataset.beside) return M.leave(screen).then(hide);
    const under = below(screen);
    under.inert = false;
    M.under(under, false);
    return M.popOut(screen).then(hide);
  }

  function showOffline() {
    $("offlinePill").hidden = navigator.onLine;
  }

  let opening = null;
  async function openPage(id, fromHistory) {
    const p = state.pages.find((x) => x.id === id);
    if (!p || (!fromHistory && opening === id)) return;
    let html;
    opening = id;
    try { html = await C.store.readPage(id); } catch (e) { html = null; } finally { opening = null; }
    if (!html) { toast("This page's file is missing. Delete it and save it again."); return; }
    if (!fromHistory) history.pushState(readerState(p), "");
    const shown = show(p, html);
    pushScreen($("readerView"));
    await shown;
    $("readerFrame").focus();
  }

  // The history entry for a page in the reader (and the sheet over it).
  const readerState = (p, sheet, image) => ({ view: "reader", page: p.id, folder: state.folder || undefined, sheet: sheet || undefined, image: image || undefined });

  function show(p, html) {
    if (aloud.key !== p.id) stopAloud();
    state.open = p;
    p.readAt = Date.now();
    clearTimeout(positionTimer);
    positionTimer = setTimeout(savePositions, 1500);
    showOffline();
    $("readProgress").dir = p.dir || "ltr";
    $("readerContents").hidden = true;
    $("readerView").classList.remove("bar-away");
    readerScrolled(p.at || 0, 0);
    return C.reader.open($("readerFrame"), html, p, {
      at: p.at || 0, next: endLink(p),
      onPosition: (f) => notePosition(p, f),
      onScroll: readerScrolled,
      onImage: openImage,
      onTap: toggleBar,
      onSelect: showReadHere,
      pages: readingPrefs().layout === "pages",
      top: () => $("readerView").querySelector(".reader-bar").offsetHeight,
    }).then(() => { $("readerContents").hidden = C.reader.headings().length < 2; });
  }

  // A tap on the text brings the bar back, or hides it for reading.
  function toggleBar() {
    if (state.sheet) return;
    const away = !$("readerView").classList.contains("bar-away");
    $("readerView").classList.toggle("bar-away", away);
    lastY = readerY;
    if (!away) readerFoot(C.reader.position());
  }

  // Under the bar's line along the bottom: the section being read and the
  // minutes left, shown with the bar.
  function readerFoot(at) {
    const p = state.open;
    if (!p) return;
    $("readLeft").textContent = at >= 0.995 ? "End" : Math.max(1, Math.ceil((p.minutes || 1) * (1 - at))) + " min left";
    const pg = C.reader.pageInfo();
    const section = C.reader.section();
    $("readSection").textContent = pg ? "Page " + pg.page + " of " + pg.pages + (section ? " · " + section : "") : section;
  }

  // The bar along the bottom fills as the page is read. The top bar slides
  // away on any scroll, up or down, and a tap brings it back; it stays at
  // the top, at the end, and while a sheet is up. Read aloud's own
  // scrolling, following the voice, leaves it as it is.
  let lastY = 0, readerY = 0;
  function readerScrolled(at, y) {
    readerY = y;
    if (readHere && !readHere.hidden) showReadHere(C.reader.selectionSpot());
    $("readProgress").firstElementChild.style.transform = "scaleX(" + at + ")";
    if (!$("readerView").classList.contains("bar-away") || aloud.state !== "stopped") readerFoot(at);
    const bar = $("readerView").querySelector(".reader-bar").offsetHeight;
    let away = $("readerView").classList.contains("bar-away");
    if (y <= bar || at >= 0.999 || state.sheet) away = false;
    else if (C.reader.following()) { lastY = y; return; }
    else if (Math.abs(y - lastY) > 12) away = true;
    else return;
    lastY = y;
    $("readerView").classList.toggle("bar-away", away);
    if (!away) readerFoot(at);
  }

  // The page's h2 and h3 headings; a tap goes there.
  function contentsList() {
    const now = C.reader.section();
    let current = -1;
    const list = C.reader.headings();
    list.forEach((h, i) => { if (h.text === now) current = i; });
    const rows = list.map((h, i) => {
      const b = el("button", { class: "row contents-row" + (h.level === 3 ? " sub" : ""), type: "button",
        onclick: () => { history.back(); C.reader.jumpTo(i); } }, el("span", { class: "row-label", dir: "auto" }, h.text));
      if (i === current) b.setAttribute("aria-current", "location");
      return el("li", null, b);
    });
    const nav = el("nav", { class: "contents", "aria-label": "Contents" }, el("ol", { class: "group contents-list" }, ...rows));
    if (current > 0) requestAnimationFrame(() => { const r = nav.querySelector("[aria-current]"); if (r) r.scrollIntoView({ block: "center" }); });
    return nav;
  }

  // What the end of a page offers: the next page in its folder, else the
  // site's next page (saved already, or to save now and open).
  function endLink(p) {
    if (p.preview) return null;
    const next = neighbour(p, 1);
    if (next) return { over: "Next in " + p.folder, title: next.title, go: () => goTo(next, true) };
    if (!p.next) return null;
    const had = savedAs(p.next);
    if (had) return { over: "Next on " + p.site, title: had.title, go: () => goTo(had, true) };
    return { over: "Next on " + p.site, title: "Save it and read on", go: () => followAndOpen(p) };
  }

  async function followAndOpen(p) {
    if (!navigator.onLine) { toast("You're offline. The next page saves when you're back online."); return; }
    toast("Saving the next page…");
    const got = await follow(p, 1, true);
    if (got && state.open === p) goTo(got, true);
  }

  // Next or previous in a folder: the reader stays and its page changes,
  // in the same history entry, so back still leaves the reader.
  // From the end link (0.28.2) the page turns: the one read slides away
  // to the left and the next comes in from the right.
  async function goTo(p, turn) {
    let html;
    try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
    if (!html) { toast("This page's file is missing. Delete it and save it again."); return; }
    if (state.sheet) await new Promise((resolve) => { addEventListener("popstate", () => resolve(), { once: true }); history.back(); });
    if (positionTimer) savePositions();
    history.replaceState(readerState(p), "");
    const frame = $("readerFrame");
    if (turn) await M.pageOut(frame);
    try { await show(p, html); } finally { if (turn) await M.pageIn(frame); }
    frame.focus();
  }

  // Where each page was left (`at`, 0 to 1) and whether it was ever read to
  // the end, kept in the library index; written a moment after scrolling
  // stops, and when the page is closed.
  let positionTimer = null;
  function notePosition(p, f) {
    p.at = Math.round(f * 1000) / 1000;
    if (f >= 0.97) p.finished = true;
    clearTimeout(positionTimer);
    positionTimer = setTimeout(savePositions, 1500);
  }
  function savePositions() {
    clearTimeout(positionTimer);
    positionTimer = null;
    updateWidgets();
    return C.store.writeIndex(state.pages).catch(() => {});
  }

  function closeReader() {
    if (!state.open) return;
    if (positionTimer) savePositions();
    renderLibrary();
    if (state.folder) renderFolder();
    closeSheet(true);
    if (state.image) { state.image = false; $("imageViewer").hidden = true; $("viewerImg").removeAttribute("src"); }
    stopAloud();
    hideReadHere();
    state.open = null;
    popScreen($("readerView")).then(() => { if (!state.open) C.reader.close(); });
  }

  // ---- Read aloud (0.27.0) ----
  // The page's blocks go to the phone's speech engine (platform.js) as
  // pieces of a sentence or few, from the block at the top of the screen.
  // The app reads on with the screen off; a browser while the page is open.
  // `map` is each piece's block, which the reader lights up.

  const speech = C.platform.speech;
  const aloud = { key: "", map: [], state: "stopped", index: -1, arrived: false };
  const RATES = [0.75, 1, 1.25, 1.5, 2];
  const PIECE = 600;

  // `parts` is [{ text, block }]; a block can be in two parts when the
  // reading starts partway through it.
  function pieces(parts) {
    const items = [], map = [];
    let first = -1;
    // A sentence longer than a piece breaks after a comma, else a space.
    const cut = (x) => {
      const out = [];
      while (x.length > PIECE) {
        let at = x.lastIndexOf(", ", PIECE);
        if (at < PIECE / 2) at = x.lastIndexOf(" ", PIECE);
        if (at < PIECE / 2) at = PIECE;
        out.push(x.slice(0, at + 1));
        x = x.slice(at + 1);
      }
      return x ? out.concat(x) : out;
    };
    parts.forEach(({ text: t, block: b, from }) => {
      if (from) first = items.length;
      const sentences = (t.match(/[^.!?。！？]+(?:[.!?。！？]+["'”’)\]]*\s*|$)/g) || [t]).flatMap(cut);
      let cur = "";
      for (const x of sentences) {
        if (cur && (cur + x).length > PIECE) { items.push(cur.trim()); map.push(b); cur = ""; }
        cur += x;
      }
      if (cur.trim()) { items.push(cur.trim()); map.push(b); }
    });
    return { items, map, first };
  }

  const langOf = (p) => (p.lang || navigator.language || "en").toLowerCase().replace(/^iw\b/, "he");
  const primary = (lang) => String(lang || "").toLowerCase().split(/[-_]/)[0].replace(/^iw$/, "he");
  const voiceFor = (p) => load(VOICE_KEY, {})[primary(langOf(p))] || "";

  // From a block, or from a word in it (`spot` from a selection).
  async function startAloud(from, spot) {
    const p = state.open;
    if (!p) return;
    const texts = C.reader.readable();
    if (!texts.length) { toast("There's no text on this page to read aloud."); return; }
    const block = spot ? spot.block : from == null ? C.reader.firstShown() : from;
    const parts = [];
    texts.forEach((text, b) => {
      if (b !== block) { parts.push({ text, block: b }); return; }
      let cut = spot ? wordAt(text, spot) : 0;
      if (cut > 0) parts.push({ text: text.slice(0, cut), block: b });
      parts.push({ text: text.slice(cut), block: b, from: true });
    });
    const { items, map, first } = pieces(parts);
    const start = Math.max(0, first);
    Object.assign(aloud, { key: p.id, map });
    setAloud("playing", start);
    try {
      await speech.play({ items, start, lang: p.lang || "", voice: voiceFor(p), rate: load(RATE_KEY, 1),
        title: p.title, subtitle: p.folder || p.site || "", key: p.id });
    } catch (e) {
      setAloud("stopped", -1);
      toast("Couldn't read aloud. Check the phone's text-to-speech settings.");
    }
  }

  // Where the selected word starts in the block's spoken text: the copy of
  // the word nearest the selection's offset, else the word at the offset.
  function wordAt(text, spot) {
    const near = (i) => (i < 0 ? Infinity : Math.abs(i - spot.offset));
    let best = -1;
    if (spot.word) for (let i = text.indexOf(spot.word); i >= 0; i = text.indexOf(spot.word, i + 1)) if (near(i) < near(best)) best = i;
    if (best >= 0 && near(best) < 40) return best;
    const at = Math.min(spot.offset, text.length);
    const space = text.lastIndexOf(" ", at - 1);
    return space < 0 ? 0 : space + 1;
  }

  // "Read from here", under a selection while one is up.
  let readHere = null;
  function showReadHere(spot) {
    if (!spot || !speech.available || !state.open || state.sheet) { hideReadHere(); return; }
    if (!readHere) {
      readHere = el("button", { class: "read-here", type: "button", onclick: () => {
        const s = C.reader.selectionSpot();
        hideReadHere();
        C.reader.clearSelection();
        if (s) startAloud(null, s);
      } });
      readHere.innerHTML = $("readerAloud").innerHTML;
      readHere.append("Read from here");
      $("readerView").append(readHere);
    }
    const frame = $("readerFrame").getBoundingClientRect();
    const h = 44, room = frame.bottom - 72;
    let top = frame.top + spot.bottom + 12;
    if (top + h > room) top = frame.top + spot.top - h - 12;
    top = Math.max(frame.top + 8, Math.min(top, room - h));
    readHere.style.top = top + "px";
    readHere.style.left = Math.max(8, Math.min(frame.left + (spot.left + spot.right) / 2, innerWidth - 8)) + "px";
    readHere.hidden = false;
  }
  function hideReadHere() { if (readHere) readHere.hidden = true; }

  function stopAloud() {
    if (aloud.state === "stopped") return;
    setAloud("stopped", -1);
    speech.stop();
  }

  // The block that piece `i` is in, and the first piece of a block.
  const blockAt = (i) => aloud.map[i] ?? -1;
  function moveAloud(d) {
    const b = blockAt(aloud.index) + d;
    const i = aloud.map.indexOf(b);
    if (i < 0) return;
    setAloud(aloud.state, i);
    speech.seek(i);
  }

  function setAloud(st, index) {
    const on = st === "playing" || st === "paused";
    aloud.state = on ? st : "stopped";
    if (index >= 0 || !on) aloud.index = index;
    const btn = $("readerAloud");
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Stop reading aloud" : "Read aloud");
    $("aloudPlayer").hidden = !on;
    $("readerView").classList.toggle("aloud", on);
    if (on && state.open) readerFoot(C.reader.position());
    const play = $("aloudPlay");
    play.classList.toggle("paused", st === "paused");
    play.setAttribute("aria-label", st === "paused" ? "Play" : "Pause");
    const b = blockAt(aloud.index);
    $("aloudPrev").disabled = !on || b <= 0;
    $("aloudNext").disabled = !on || b >= (aloud.map[aloud.map.length - 1] ?? 0);
    if (state.open && state.open.id === aloud.key) C.reader.light(on ? b : -1);
    if (!on) aloud.key = "";
    if (st === "error") toast("The phone's voice stopped. Try again, or pick another voice in Aa.");
  }

  speech.onProgress(({ key, index, state: st }) => {
    if (!key || key !== aloud.key) return;
    setAloud(st, index);
  });
  // Back from the lock screen: the reading may have moved on or ended
  // while the page slept.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || aloud.state === "stopped") return;
    const now = await speech.state();
    if (now.key && now.key === aloud.key) setAloud(now.state, now.index);
    else setAloud("stopped", -1);
  });

  $("readerAloud").hidden = !speech.available;
  $("readerAloud").addEventListener("click", () => (aloud.state === "stopped" ? startAloud() : stopAloud()));
  $("aloudPlay").addEventListener("click", () => {
    if (aloud.state === "playing") { setAloud("paused", aloud.index); speech.pause(); }
    else { setAloud("playing", aloud.index); speech.resume(); }
  });
  $("aloudPrev").addEventListener("click", () => moveAloud(-1));
  $("aloudNext").addEventListener("click", () => moveAloud(1));

  // In the Aa sheet: the voice for this page's language and the speed.
  function aloudControls() {
    const p = state.open;
    const lang = primary(langOf(p));
    const name = (() => { try { return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(lang); } catch (e) { return lang; } })();
    const voiceRow = el("div", { class: "rc-row" }, el("span", { class: "rc-label" }, "Voice"), el("span", { class: "meta" }, "Looking…"));
    const note = el("p", { class: "footnote aloud-note" }, speech.background ? "Keeps reading with the screen off. Pause it from the lock screen." : "Reads while this page is open.");
    speech.voices().then((all) => {
      const mine = all.filter((v) => primary(v.lang) === lang);
      if (!mine.length) {
        voiceRow.lastChild.replaceWith(el("span", { class: "meta" }, "Phone's default"));
        note.textContent = "No " + name + " voice on this phone. Add one in its text-to-speech settings, then come back.";
        return;
      }
      const label = (v, n) => {
        let region = v.lang;
        try { region = new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(v.lang.replace("_", "-")); } catch (e) { /* as is */ }
        const plain = /-x-|#|^[a-z]{2,3}[-_]/i.test(v.name) ? "Voice " + n : v.name;
        return plain + " · " + region + (v.online ? " · online" : "");
      };
      const options = [{ value: "", label: "Phone's default" }, ...mine.map((v, i) => ({ value: v.id, label: label(v, i + 1) }))];
      const saved = voiceFor(p);
      voiceRow.lastChild.replaceWith(dropdown({ label: "Voice", cls: "voice-pick", options,
        value: options.some((o) => o.value === saved) ? saved : "",
        onpick: (v) => {
          const all = load(VOICE_KEY, {});
          if (v) all[lang] = v; else delete all[lang];
          store(VOICE_KEY, all);
          if (aloud.state !== "stopped" && state.open && aloud.key === state.open.id) startAloud(blockAt(aloud.index));
        } }));
    });
    return el("div", { class: "aloud-controls" },
      el("h2", { class: "overline" }, "Read aloud"),
      voiceRow,
      el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, "Speed"),
        seg("aloud-rate", "Speed", RATES.map((r) => ({ value: String(r), label: r + "×" })), String(load(RATE_KEY, 1)),
          (v) => { store(RATE_KEY, Number(v)); if (aloud.state !== "stopped") speech.rate(Number(v)); })),
      note);
  }

  // The same controls in the Aa sheet and in Settings. A change is applied
  // at once and every copy on screen follows it in place, so focus stays put.
  function seg(name, label, options, current, onpick, cls) {
    return el("div", { class: "seg" + (cls ? " " + cls : ""), role: "radiogroup", "aria-label": label },
      ...options.map((o) => el("label", { class: "seg-item" },
        el("input", { class: "visually-hidden", type: "radio", name, value: o.value, checked: o.value === current,
          onchange: () => onpick(o.value) }),
        el("span", { class: "seg-face", style: o.style || null }, o.swatch ? swatch(o.swatch, o.auto ? "auto" : "") : null, o.label, o.sample || null))));
  }

  const themeOptions = (list, short) => list.map((t) => ({ value: t.value, label: (short && t.short) || t.label, swatch: [t.value] }));

  function slider(label, min, max, step, onvalue) {
    return el("input", { class: "range", type: "range", min, max, step, "aria-label": label,
      oninput: (e) => onvalue(Number(e.target.value)) });
  }

  let readingGroups = 0;
  function readingControls(withTheme) {
    const r = readingPrefs();
    const id = "rc" + ++readingGroups;
    const label = (text, key) => el("span", { class: "rc-label" }, text, key ? el("span", { class: "rc-value", "data-value": key }) : null);
    const row = (text, control, key) => el("div", { class: "rc-row" }, label(text, key), control);
    const stack = (text, control) => el("div", { class: "rc-row stack" }, label(text), control);
    const nudge = (d) => setReading({ size: clamp(readingPrefs().size + d, SIZE_MIN, SIZE_MAX) });
    const box = el("div", { class: "reading-controls" },
      row("Layout", seg(id + "-layout", "Layout", [
        { value: "scroll", label: "Scroll" }, { value: "pages", label: "Pages" },
      ], r.layout, (v) => setReading({ layout: v }))),
      row("Text size", el("div", { class: "stepper" },
        el("button", { class: "step-btn small", type: "button", "data-step": "-1", "aria-label": "Smaller text", onclick: () => nudge(-1) }, "A"),
        slider("Text size", SIZE_MIN, SIZE_MAX, 1, (v) => setReading({ size: v })),
        el("button", { class: "step-btn large", type: "button", "data-step": "1", "aria-label": "Larger text", onclick: () => nudge(1) }, "A")), "size"),
      row("Spacing", el("div", { class: "stepper" },
        slider("Line spacing", SPACING_MIN, SPACING_MAX, 0.05, (v) => setReading({ spacing: v }))), "spacing"),
      row("Margins", seg(id + "-margins", "Margins", [
        { value: "narrow", label: "Narrow" }, { value: "normal", label: "Normal" }, { value: "wide", label: "Wide" },
      ], r.margins, (v) => setReading({ margins: v }))),
      stack("Font", seg(id + "-font", "Font",
        FONTS.map((f) => ({ value: f.value, label: f.label, style: "font-family: " + f.family + ", var(--sans)" })),
        r.font, (v) => setReading({ font: v }), "scroll fonts")),
      stack("Hebrew", seg(id + "-hebrew", "Hebrew font",
        HEBREW.map((f) => ({ value: f.value, label: f.label,
          sample: f.family ? el("span", { class: "seg-sample", lang: "he", dir: "rtl", style: "font-family: " + f.family, "aria-hidden": "true" }, "עברית") : null })),
        r.hebrew, (v) => setReading({ hebrew: v }), "scroll hebrew")),
      withTheme ? stack("Theme", seg(id + "-theme", "Theme",
        [{ value: "system", label: "Auto", swatch: autoSwatch(), auto: true }, ...themeOptions(THEMES)],
        state.theme, (v) => { setTheme(v); syncThemeInputs(); }, "themes scroll")) : null,
      el("button", { class: "btn-quiet reset", type: "button", onclick: () => setReading({ ...READING_DEFAULT, layout: readingPrefs().layout }) }, "Reset text"));
    syncReadingControls(box);
    requestAnimationFrame(() => box.querySelectorAll(".seg.scroll").forEach(showPicked));
    return box;
  }

  // A row that scrolls sideways opens with its picked item in view.
  function showPicked(row) {
    const item = row.querySelector("input:checked");
    if (item) row.scrollLeft = item.parentElement.offsetLeft - (row.clientWidth - item.parentElement.offsetWidth) / 2;
  }

  function syncReadingControls(box) {
    const r = readingPrefs();
    const [size, spacing] = box.querySelectorAll(".range");
    size.value = r.size;
    size.setAttribute("aria-valuetext", r.size + " pixels");
    spacing.value = r.spacing;
    spacing.setAttribute("aria-valuetext", r.spacing.toFixed(2));
    box.querySelector('[data-value="size"]').textContent = r.size + " px";
    box.querySelector('[data-value="spacing"]').textContent = r.spacing.toFixed(2);
    box.querySelector('[data-step="-1"]').disabled = r.size <= SIZE_MIN;
    box.querySelector('[data-step="1"]').disabled = r.size >= SIZE_MAX;
    for (const k of ["layout", "margins", "font", "hebrew"]) {
      box.querySelectorAll('input[name$="-' + k + '"]').forEach((i) => { i.checked = i.value === r[k]; });
    }
    // Reset text leaves the layout as it is.
    const dflt = Object.keys(READING_DEFAULT).every((k) => k === "layout" || r[k] === READING_DEFAULT[k]);
    box.querySelector(".reset").disabled = dflt;
  }

  // The theme lives in two places (Aa and Settings); keep both radios true.
  function syncThemeInputs() {
    document.querySelectorAll('input[name$="-theme"], input[name="' + THEME_KEY + '"]').forEach((i) => { i.checked = i.value === state.theme; });
  }

  // ---- The reader's sheets ----
  // "reading" (Aa) and "page" (tags, delete) share one sheet. Each is a
  // history entry of its own, so Android's back closes it before the page.

  const SHEETS = {
    reading: { button: "readerAa", label: "Text and theme", build: () => {
      const box = readingControls(true);
      if (speech.available) box.insertBefore(aloudControls(), box.querySelector(".reset"));
      return box;
    } },
    page: { button: "readerMore", label: "This page", build: () => state.open.preview ? previewSheet(state.open) : pageSheet(state.open, "reader") },
    contents: { button: "readerContents", label: "Contents", build: contentsList },
  };

  function openSheet(kind, fromHistory) {
    if (state.sheet === kind || !state.open || !SHEETS[kind]) return;
    if (state.sheet) closeSheet(true);
    state.sheet = kind;
    const s = SHEETS[kind];
    $("readingBody").replaceChildren(s.build());
    $("readingSheet").setAttribute("aria-label", s.label);
    if (!fromHistory) history.pushState(readerState(state.open, kind), "");
    $(s.button).setAttribute("aria-expanded", "true");
    $("readerView").classList.remove("bar-away");
    $("sheetCatch").hidden = false;
    $("readingSheet").hidden = false;
    M.rise($("readingSheet"));
    const first = kind === "contents" ? $("readingSheet").querySelector("[aria-current]") || $("readingSheet").querySelector("button")
      : $("readingSheet").querySelector("button:not(:disabled), input:checked");
    if (first && kind !== "page") first.focus({ preventScroll: true });
  }

  function closeSheet(now) {
    if (!state.sheet) return;
    const button = $(SHEETS[state.sheet].button);
    state.sheet = false;
    button.setAttribute("aria-expanded", "false");
    $("sheetCatch").hidden = true;
    const sheet = $("readingSheet");
    if (now) { sheet.hidden = true; return; }
    M.sink(sheet).then(() => { if (!state.sheet) sheet.hidden = true; });
    button.focus({ preventScroll: true });
  }

  // ---- Image viewer ----
  // A tapped image, full screen, in its own history entry so back closes
  // it. It grows from where it sat in the page (a fade under reduced
  // motion), shows the preview at once and the full image when online.

  const V = { s: 1, x: 0, y: 0, drag: 0, pointers: new Map(), start: null, tap: null };
  const MAX_ZOOM = 5;

  function openImage(info) {
    if (state.image || !state.open) return;
    state.image = true;
    history.pushState(readerState(state.open, undefined, true), "");
    const viewer = $("imageViewer"), img = $("viewerImg");
    img.alt = info.alt || info.caption || "";
    img.src = info.src;
    $("viewerCaption").textContent = info.caption;
    $("viewerCaption").hidden = !info.caption;
    if (info.full && info.full !== info.src && navigator.onLine) {
      const probe = new Image();
      probe.onload = () => { if (state.image && img.getAttribute("src") === info.src) img.src = info.full; };
      probe.src = info.full;
    }
    resetView(false);
    viewer.hidden = false;
    $("readerView").classList.remove("bar-away");
    $("viewerClose").focus({ preventScroll: true });
    const grow = () => {
      if (M.reduced() || !info.rect.width) return M.arrive(viewer, 0);
      const r = img.getBoundingClientRect();
      if (!r.width) return M.arrive(viewer, 0);
      const k = info.rect.width / r.width;
      const dx = info.rect.left + info.rect.width / 2 - (r.left + r.width / 2);
      const dy = info.rect.top + info.rect.height / 2 - (r.top + r.height / 2);
      const t = M.timing("sheet");
      viewer.animate([{ backgroundColor: "transparent" }, { backgroundColor: getComputedStyle(viewer).backgroundColor }], t);
      img.animate([{ transform: "translate(" + dx + "px," + dy + "px) scale(" + k + ")" }, { transform: "none" }], t);
    };
    if (img.complete && img.naturalWidth) grow(); else img.addEventListener("load", grow, { once: true });
  }

  function closeImage() {
    if (!state.image) return;
    state.image = false;
    const viewer = $("imageViewer");
    M.leave(viewer).then(() => {
      if (state.image) return;
      viewer.hidden = true;
      $("viewerImg").removeAttribute("src");
      resetView(false);
    });
    $("readerFrame").focus({ preventScroll: true });
  }

  function paintView(settle) {
    const img = $("viewerImg");
    img.classList.toggle("settle", !!settle);
    img.style.transform = "translate(" + V.x + "px," + (V.y + V.drag) + "px) scale(" + V.s + ")";
    $("imageViewer").classList.toggle("zoomed", V.s > 1);
    const fade = V.s === 1 ? Math.max(0.3, 1 - Math.abs(V.drag) / 400) : 1;
    $("imageViewer").style.backgroundColor = fade < 1 ? "rgb(11 13 16 / " + fade + ")" : "";
  }
  function resetView(settle) {
    V.s = 1; V.x = 0; V.y = 0; V.drag = 0;
    paintView(settle);
  }
  // Keeps a zoomed image covering the stage: no panning off into black.
  function clampView() {
    const stage = $("viewerStage").getBoundingClientRect();
    const img = $("viewerImg");
    const w = img.offsetWidth * V.s, h = img.offsetHeight * V.s;
    const mx = Math.max(0, (w - stage.width) / 2), my = Math.max(0, (h - stage.height) / 2);
    V.x = Math.min(mx, Math.max(-mx, V.x));
    V.y = Math.min(my, Math.max(-my, V.y));
  }
  // Zooms to `s` keeping the point under (px, py) (stage coordinates) still.
  function zoomAt(s, px, py) {
    const stage = $("viewerStage").getBoundingClientRect();
    const cx = px - stage.left - stage.width / 2, cy = py - stage.top - stage.height / 2;
    s = Math.min(MAX_ZOOM, Math.max(1, s));
    const k = s / V.s;
    V.x = cx - (cx - V.x) * k;
    V.y = cy - (cy - V.y) * k;
    V.s = s;
    if (s === 1) { V.x = 0; V.y = 0; }
    clampView();
  }

  const stage = $("viewerStage");
  const pts = () => [...V.pointers.values()];
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    V.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pts();
    if (p.length === 2) {
      V.start = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s: V.s, x: V.x, y: V.y, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2, pinch: true };
      V.drag = 0;
    } else if (p.length === 1) {
      V.start = { px: e.clientX, py: e.clientY, x: V.x, y: V.y, t: Date.now(), moved: false };
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!V.pointers.has(e.pointerId) || !V.start) return;
    V.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pts();
    if (V.start.pinch && p.length === 2) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
      V.x = V.start.x + (mx - V.start.mx); V.y = V.start.y + (my - V.start.my);
      zoomAt(V.start.s * d / V.start.d, mx, my);
      paintView(false);
      return;
    }
    if (V.start.pinch) return;
    const dx = e.clientX - V.start.px, dy = e.clientY - V.start.py;
    if (Math.hypot(dx, dy) > 6) V.start.moved = true;
    if (V.s > 1) { V.x = V.start.x + dx; V.y = V.start.y + dy; clampView(); }
    else V.drag = dy;
    paintView(false);
  });
  const lift = (e) => {
    if (!V.pointers.has(e.pointerId)) return;
    V.pointers.delete(e.pointerId);
    const start = V.start;
    if (V.pointers.size) { if (start && start.pinch) V.start = null; return; }
    V.start = null;
    if (!start || start.pinch) { clampView(); paintView(true); return; }
    if (V.drag) {
      const far = Math.abs(V.drag) > 120 || Math.abs(V.drag) / Math.max(1, Date.now() - start.t) > 0.6;
      if (far) { history.back(); return; }
      V.drag = 0;
      paintView(true);
      return;
    }
    if (start.moved || e.type === "pointercancel") return;
    // A double tap zooms in on that spot, or back out.
    const now = Date.now();
    if (V.tap && now - V.tap.t < 300 && Math.hypot(e.clientX - V.tap.x, e.clientY - V.tap.y) < 30) {
      V.tap = null;
      if (V.s > 1) resetView(true); else { zoomAt(2.5, e.clientX, e.clientY); paintView(true); }
      return;
    }
    V.tap = { t: now, x: e.clientX, y: e.clientY };
  };
  stage.addEventListener("pointerup", lift);
  stage.addEventListener("pointercancel", lift);
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(V.s * Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
    paintView(false);
  }, { passive: false });
  $("viewerClose").addEventListener("click", () => history.back());

  // ---- Tags ----
  // Any number per page, as typed (trimmed, at most 32 characters), with
  // case-insensitive duplicates dropped.

  const cleanTag = (t) => String(t).replace(/\s+/g, " ").trim().slice(0, 32);
  const sameTag = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

  function allTags() {
    const counts = new Map();
    for (const p of state.pages) for (const t of p.tags || []) {
      const k = [...counts.keys()].find((x) => sameTag(x, t)) || t;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }

  // `has` plus `more`, without case-insensitive repeats.
  function withTags(has, more) {
    const out = [...(has || [])];
    for (const t of more) if (!out.some((x) => sameTag(x, t))) out.push(t);
    return out;
  }

  async function setTags(p, tags) {
    p.tags = tags;
    await C.store.writeIndex(state.pages);
    renderLibrary();
  }

  // ---- Folders ----
  // An ordered run of pages, like a web novel's chapters. A page is in at
  // most one, named by `folder` on its index entry, in the order it joined
  // (`folderAt`). Names match like tags, ignoring case.

  function folderPages(name) {
    return state.pages.filter((p) => p.folder && sameTag(p.folder, name))
      .sort((a, b) => (a.folderAt || a.savedAt || 0) - (b.folderAt || b.savedAt || 0));
  }

  function allFolders() {
    const names = [];
    for (const p of state.pages) if (p.folder && !names.some((n) => sameTag(n, p.folder))) names.push(p.folder);
    return names;
  }

  // A folder's name as already spelled, if one by that name exists.
  const folderName = (name) => allFolders().find((n) => sameTag(n, cleanTag(name))) || cleanTag(name);

  // The page to carry on with: the first one not finished, else the first.
  function folderNext(list) {
    return list.find((p) => !p.finished) || list[0];
  }

  async function setFolder(p, name) {
    const clean = name && cleanTag(name);
    if (clean) {
      if (p.folder && sameTag(p.folder, clean)) return;
      p.folder = folderName(clean);
      p.folderAt = Date.now();
    } else {
      delete p.folder;
      delete p.folderAt;
    }
    await C.store.writeIndex(state.pages);
    renderLibrary();
    if (state.folder) renderFolder();
  }

  // A folder in the library's Folders row: its first picture, its name and
  // how much of it is read.
  function folderTile(name) {
    const list = folderPages(name);
    const done = list.filter((p) => p.finished).length;
    const withThumb = list.find((p) => thumbUrl(p));
    const cover = coverUrl(list);
    const thumb = cover || (withThumb ? thumbUrl(withThumb) : null);
    const fresh = freshCount(name);
    const tile = el("div", { class: "tile", role: "listitem", "data-ids": list.map((p) => p.id).join(",") },
      el("button", { class: "card-open", type: "button", "aria-label": name + ", collection, " + list.length + " pages, " + done + " read" + (fresh ? ", " + newCountText(fresh) + " chapters" : ""),
        onclick: () => tapPages(list.map((p) => p.id), () => openFolder(name)) }),
      pickMark(),
      el("span", { class: "tile-thumb" + (thumb ? "" : " blank"), "aria-hidden": "true" },
        thumb ? el("img", { src: thumb, alt: "", loading: "lazy" }) : null,
        fresh ? el("span", { class: "tile-new" }, "+" + (fresh >= NEW_MAX ? NEW_MAX : fresh)) : null),
      el("span", { class: "tile-name", dir: "auto" }, name),
      el("span", { class: "tile-meta" }, el("span", { class: "tile-kind" }, "Collection · "), (done === list.length ? "All read" : done + " of " + list.length + " read"), el("span", { class: "tile-size" }, " · " + formatSize(sizeOf(list)))),
      el("span", { class: "progress thin", "aria-hidden": "true" },
        el("span", { class: "progress-fill", style: "transform: scaleX(" + done / list.length + ")" })));
    // A cover whose file is gone (a restored backup) is read again.
    if (cover) tile.querySelector(".tile-thumb img").addEventListener("error", () => {
      for (const p of list) { delete p.cover; delete p.coverFrom; }
      updateCover(name);
    }, { once: true });
    // No picture at all: a cover drawn from its name.
    if (!thumb) {
      tile.querySelector(".tile-thumb").insertAdjacentHTML("afterbegin", folderSource(list) ? bookIcon(28).outerHTML
        : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>');
      tile.querySelector(".tile-thumb").append(el("span", { class: "tile-cover-name", dir: "auto" }, name));
    }
    else if (folderSource(list)) tile.querySelector(".tile-thumb").append(el("span", { class: "tile-book" }, bookIcon(16)));
    return tile;
  }

  // Scrolls sideways at phone width, wraps on a desktop.
  const foldersStrip = (names) => el("div", { class: "folder-strip wide", role: "list", "aria-label": "Collections" }, ...names.map(folderTile));

  function openFolder(name, fromHistory) {
    if (state.folder && sameTag(state.folder, name)) return;
    if (!folderPages(name).length) return;
    state.folder = folderPages(name)[0].folder;
    folderMode = "";
    renderFolder();
    if (!fromHistory) history.pushState({ view: "folder", folder: state.folder }, "");
    $("folderBody").scrollTop = 0;
    pushScreen($("folderView")).then(() => $("folderBack").focus());
    updateCover(state.folder);
  }

  function closeFolder() {
    if (!state.folder) return;
    closeFolderMenu(true);
    folderMode = "";
    state.folder = null;
    popScreen($("folderView"));
  }

  // The collection's screen is a book page (0.27.11): its cover and title,
  // how far along, Continue, then its chapters. Its tools are in the ⋯
  // menu; Rename, Reorder, the story page and Export take the screen over
  // in place, with Cancel, Save or Done in the bar.
  let folderMode = "";
  const FOLDER_BARS = {
    rename: { title: "Rename", cancel: true, done: "Save" },
    order: { title: "Reorder", done: "Done" },
    chapters: { title: "Story page", done: "Done" },
    export: { title: "Export", done: "Done" },
  };

  function setFolderMode(m) {
    closeFolderMenu();
    folderMode = m;
    renderFolder();
    $("folderBody").scrollTop = 0;
    const field = $("folderBody").querySelector(".book-title-input");
    if (field) { field.focus(); field.select(); }
    else if (m) $("folderDone").focus({ preventScroll: true });
    else $("folderMore").focus({ preventScroll: true });
  }

  function paintFolderBar() {
    const bar = FOLDER_BARS[folderMode];
    $("folderBack").hidden = !!bar;
    $("folderMore").hidden = !!bar;
    $("folderCancel").hidden = !(bar && bar.cancel);
    $("folderDone").hidden = !bar;
    if (bar) $("folderDone").textContent = bar.done;
    if (bar) fill($("folderTitle"), bar.title);
    else fill($("folderTitle"), folderSource(folderPages(state.folder)) ? bookIcon(18) : null, state.folder);
    $("folderView").querySelector(".screen-bar").classList.toggle("editing", !!bar);
    paintFolderTitle();
  }

  // The bar names the collection once its title has scrolled away.
  function paintFolderTitle() {
    const head = $("folderBody").querySelector(".book-title");
    const away = !folderMode && (!head || head.getBoundingClientRect().bottom < $("folderBody").getBoundingClientRect().top);
    $("folderView").querySelector(".screen-bar").classList.toggle("titled", !!folderMode || away);
  }

  const minutesText = (m) => (m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min");
  const minutesLeft = (list) => list.filter((p) => !p.finished)
    .reduce((sum, p) => sum + Math.max(1, Math.ceil((p.minutes || 1) * (1 - (p.at > 0.02 ? p.at : 0)))), 0);
  const chapterWord = (list, n) => (isSeries(list) ? (n === 1 ? "chapter" : "chapters") : (n === 1 ? "page" : "pages"));

  function bookCover(list) {
    const url = coverUrl(list);
    if (url) {
      const img = el("img", { class: "book-cover", src: url, alt: "" });
      img.addEventListener("error", () => img.replaceWith(drawnCover(list)), { once: true });
      return img;
    }
    return drawnCover(list);
  }
  const drawnCover = (list) => el("div", { class: "book-cover drawn", "aria-hidden": "true" },
    el("span", { class: "book-cover-rule" }),
    el("span", { class: "book-cover-title", dir: "auto" }, state.folder),
    el("span", { class: "book-cover-site" }, list[0].site || ""));

  function bookHead(list, next, done) {
    const n = list.length, name = state.folder;
    const renaming = folderMode === "rename";
    let title;
    if (renaming) {
      title = el("input", { class: "book-title-input", type: "text", value: name, "aria-label": "Collection name",
        maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences", spellcheck: "false", dir: "auto" });
      title.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); $("folderDone").click(); }
        else if (e.key === "Escape") { e.preventDefault(); setFolderMode(""); }
      });
    } else title = el("h2", { class: "book-title", dir: "auto" }, name);
    const left = minutesLeft(list);
    const meta = done === n ? "All " + n + " read" : done + " of " + n + " read · " + minutesText(left) + " left";
    const bar = el("div", { class: "book-progress", role: "progressbar", "aria-label": "Read", "aria-valuemin": "0",
      "aria-valuemax": String(n), "aria-valuenow": String(done), "aria-valuetext": done + " of " + n + " read" },
      el("span", { class: "book-progress-fill", style: "width: " + (done / n * 100).toFixed(1) + "%" }));
    const head = el("div", { class: "book-head" },
      bookCover(list),
      el("div", { class: "book-facts" },
        el("p", { class: "book-site" }, [list[0].site, "Collection"].filter(Boolean).join(" · ")),
        title,
        el("p", { class: "meta folder-meta" }, meta),
        bar));
    if (renaming) {
      return [head, el("p", { class: "footnote book-note" }, n === 1 ? "Renames the collection on its page." : "Renames the collection on all " + n + " of its pages.")];
    }
    const go = done === n ? "Read again from the start" : (next.at > 0.02 || done ? "Continue: " : "Start: ") + next.title;
    const s = savedParts(list);
    return [head,
      el("button", { class: "btn-primary folder-go", type: "button", dir: "auto", onclick: () => openPage(done === n ? list[0].id : next.id) }, go),
      saveNewButton(list),
      el("button", { class: "book-saved", type: "button", onclick: () => openMenu("saved") },
        el("span", null, formatSize(s.total) + " · " + picturesAs(list) + " · "),
        el("span", { class: "accent" }, "What's saved"))];
  }

  // New chapters found by the daily check, saved from here: straight from
  // the story page's list when it gave one, else by following the last
  // chapter's next link.
  function saveNewButton(list) {
    const name = state.folder;
    const fresh = freshCount(name);
    if (!fresh) return null;
    const entry = newFor(name);
    const b = el("button", { class: "btn-quiet book-new", type: "button", onclick: () => {
      if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
      if (runFor(name)) { toast("Already saving into " + name + ". It's in Downloads."); return; }
      if (entry && entry.all) { saveAll(entry.all, name, [], undefined, true, undefined, folderSource(list)); return; }
      const last = list[list.length - 1];
      if (!sizeOk(last, fresh)) return;
      b.disabled = true;
      follow(last, fresh, false).then(() => { if (b.isConnected) b.disabled = false; });
    } }, el("span", { class: "tile-icon", "aria-hidden": "true" }), "Save " + newCountText(fresh) + " " + chapterWord(list, fresh));
    b.firstChild.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS.add + "</svg>";
    return b;
  }

  function renderFolder() {
    const list = folderPages(state.folder);
    if (!list.length) {
      folderMode = "";
      paintFolderBar();
      $("folderBody").replaceChildren(el("p", { class: "empty-text" }, "This collection is empty."));
      return;
    }
    const picking = !!state.select;
    if (picking) folderMode = "";
    if (!picking && !folderMode) lookBack(list[0]);
    const next = folderNext(list);
    const done = list.filter((p) => p.finished).length;
    const ordering = folderMode === "order";
    let top;
    if (folderMode === "chapters") top = [chaptersPanel(list)];
    else if (folderMode === "export") top = [el("div", { class: "folder-actions export-panel" }, exportControls({ pages: list, title: state.folder }, () => setFolderMode("")))];
    else if (ordering) {
      top = [el("div", { class: "order-hint" },
        el("p", { class: "meta" }, "Drag a chapter by its handle, or use the arrows."),
        el("button", { class: "btn-quiet sort-chapters", type: "button", onclick: () => sortByChapter(list) }, "Sort by chapter"))];
    } else top = bookHead(list, next, done);
    const showList = folderMode !== "export";
    fill($("folderBody"),
      ...top,
      showList && !ordering ? sectionHead((isSeries(list) ? "Chapters" : "Pages") + " · " + list.length) : null,
      showList ? el("ol", { class: "group folder-list" + (ordering ? " ordering" : "") },
        ...list.map((p, i) => el("li", folderMode ? { "data-id": p.id } : { "data-id": p.id, "data-ids": p.id },
          el("button", { class: "row chapter" + (p === next && done < list.length ? " now" : ""), type: "button",
            onclick: () => (folderMode ? null : tapPages([p.id], () => openPage(p.id))) },
            pickMark(),
            el("span", { class: "chapter-n", "aria-hidden": "true" }, String(i + 1)),
            el("span", { class: "choice-text" },
              el("span", { class: "row-label", dir: "auto" }, p.title),
              ordering ? null : el("span", { class: "choice-note" + (p.finished ? "" : p.at > 0.02 ? " accent" : "") }, readingLine(p))),
            ordering ? null : chapterMark(p)),
          ordering ? moveButton(p, i, -1, list.length) : null,
          ordering ? moveButton(p, i, 1, list.length) : null,
          ordering ? dragHandle(p) : null))) : null);
    paintFolderBar();
    paintPicks();
  }

  // A tick once read, a filling ring part way.
  function chapterMark(p) {
    if (p.finished) {
      const s = el("span", { class: "chapter-mark done", "aria-hidden": "true" });
      s.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      return s;
    }
    if (p.at > 0.02) return el("span", { class: "chapter-mark ring", "aria-hidden": "true", style: "--at: " + Math.round(p.at * 360) + "deg" });
    return el("span", { class: "chapter-mark", "aria-hidden": "true" });
  }

  const CHEVRON = (d) => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  const CHEVRON_UP = CHEVRON("M6 15l6-6 6 6"), CHEVRON_DOWN = CHEVRON("M6 9l6 6 6-6");

  function moveButton(p, i, step, n) {
    const b = el("button", { class: "icon-btn move", type: "button", "data-step": String(step),
      "aria-label": "Move " + p.title + (step < 0 ? " up" : " down"), onclick: () => movePage(p, step) });
    b.innerHTML = step < 0 ? CHEVRON_UP : CHEVRON_DOWN;
    b.disabled = step < 0 ? i === 0 : i === n - 1;
    return b;
  }

  // Dragging is for fingers and mice; the arrows beside it do the same
  // from a keyboard or a screen reader, so the handle is hidden from them.
  function dragHandle(p) {
    const h = el("span", { class: "drag-handle", "aria-hidden": "true" });
    h.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 12h16M4 16h16"/></svg>';
    h.addEventListener("pointerdown", (e) => dragRow(e, h, p));
    return h;
  }

  function dragRow(e, handle, p) {
    if (e.button > 0) return;
    e.preventDefault();
    const li = handle.closest("li"), body = $("folderBody");
    const rows = [...li.parentNode.children], from = rows.indexOf(li);
    const step = li.offsetHeight, y0 = e.clientY, s0 = body.scrollTop;
    let to = from, y = y0;
    handle.setPointerCapture(e.pointerId);
    li.classList.add("lifted");
    li.parentNode.classList.add("dragging");
    const place = () => {
      const dy = y - y0 + body.scrollTop - s0;
      to = clamp(from + Math.round(dy / step), 0, rows.length - 1);
      li.style.transform = "translateY(" + dy + "px)";
      rows.forEach((r, i) => {
        if (r === li) return;
        const shift = i > from && i <= to ? -step : i < from && i >= to ? step : 0;
        r.style.transform = shift ? "translateY(" + shift + "px)" : "";
      });
    };
    const move = (ev) => {
      y = ev.clientY;
      const box = body.getBoundingClientRect();
      if (y > box.bottom - 48) body.scrollTop += 12;
      else if (y < box.top + 48) body.scrollTop -= 12;
      place();
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      li.parentNode.classList.remove("dragging");
      li.classList.remove("lifted");
      rows.forEach((r) => { r.style.transform = ""; });
      if (to !== from) moveTo(p, to);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  // Moves a page to `to` in its folder. The folder's places are the
  // pages' own `folderAt`s, made distinct and handed out again in the new
  // order, so nothing else in the folder moves.
  async function moveTo(p, to) {
    const list = folderPages(p.folder);
    const i = list.indexOf(p);
    if (i < 0 || to === i || to < 0 || to >= list.length) return false;
    const places = list.map((q) => q.folderAt || q.savedAt || 0);
    for (let k = 1; k < places.length; k++) if (places[k] <= places[k - 1]) places[k] = places[k - 1] + 1;
    list.splice(i, 1);
    list.splice(to, 0, p);
    list.forEach((q, k) => { q.folderAt = places[k]; });
    await C.store.writeIndex(state.pages);
    renderFolder();
    renderLibrary();
    return true;
  }

  async function movePage(p, step) {
    const list = folderPages(p.folder);
    if (!(await moveTo(p, list.indexOf(p) + step))) return;
    const row = $("folderBody").querySelector('li[data-id="' + p.id + '"]');
    const again = row && row.querySelector('.move[data-step="' + step + '"]');
    const focus = again && !again.disabled ? again : row && row.querySelector(".move:not(:disabled)");
    if (focus) focus.focus();
  }

  // Chapter numbers from the titles (or addresses) put the folder in
  // order; pages without one keep their place relative to each other, at
  // the end. The folder's own places are reused, as in moveTo.
  async function sortByChapter(list) {
    const nums = new Map(list.map((p) => [p, C.save.chapterNumber(p.title, p.url)]));
    if ([...nums.values()].filter((n) => n != null).length < 2) { toast("These pages don't have chapter numbers to sort by."); return; }
    const places = list.map((q) => q.folderAt || q.savedAt || 0);
    for (let k = 1; k < places.length; k++) if (places[k] <= places[k - 1]) places[k] = places[k - 1] + 1;
    const sorted = list.map((p, i) => [p, i]).sort((a, b) => {
      const x = nums.get(a[0]), y = nums.get(b[0]);
      return (x == null ? Infinity : x) - (y == null ? Infinity : y) || a[1] - b[1];
    }).map(([p]) => p);
    const moved = sorted.some((p, i) => p !== list[i]);
    sorted.forEach((q, k) => { q.folderAt = places[k]; });
    await C.store.writeIndex(state.pages);
    renderFolder();
    renderLibrary();
    toast(moved ? "Sorted by chapter." : "Already in chapter order.");
  }

  // ---- The collection's ⋯ menu ----
  // A popover under its button rather than a sheet: short, and every
  // entry leads somewhere else.
  function openFolderMenu() {
    if ($("folderPop")) { closeFolderMenu(); return; }
    const list = folderPages(state.folder);
    if (!list.length) return;
    const fresh = freshCount(state.folder);
    const item = (icon, label, onclick, opts = {}) => {
      const b = el("button", { class: "pop-item" + (opts.warn ? " warn" : ""), type: "button", role: "menuitem", tabindex: "-1",
        onclick: () => { closeFolderMenu(true); onclick(); } },
        el("span", { class: "pop-icon", "aria-hidden": "true" }), el("span", { class: "pop-label" }, label),
        opts.note ? el("span", { class: "pop-note" + (opts.accent ? " accent" : "") }, opts.note) : null);
      b.firstChild.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[icon] + "</svg>";
      b.disabled = !!opts.disabled;
      return b;
    };
    const sep = () => el("div", { class: "pop-sep", role: "separator" });
    const pop = el("div", { class: "pop-menu", id: "folderPop", role: "menu", "aria-label": "Collection" },
      item("saved", "What's saved", () => openMenu("saved"), { note: formatSize(sizeOf(list)) }),
      item("book", "Story page", () => setFolderMode("chapters"), fresh ? { note: newCountText(fresh), accent: true } : {}),
      item("add", "Add pages", () => openBatch("", false, state.folder)),
      sep(),
      item("rename", "Rename", () => setFolderMode("rename")),
      item("reorder", "Reorder", () => setFolderMode("order"), { disabled: list.length < 2 }),
      item("select", "Select", () => startSelect([])),
      item("send", "Export", () => setFolderMode("export")),
      sep(),
      item("remove", "Remove", () => openMenu("remove"), { warn: true }));
    const more = $("folderMore"), at = more.getBoundingClientRect();
    pop.style.top = at.bottom + 4 + "px";
    pop.style.right = Math.max(8, innerWidth - at.right) + "px";
    $("folderView").append(pop);
    more.setAttribute("aria-expanded", "true");
    M.arrive(pop, -8);
    const items = () => [...pop.querySelectorAll(".pop-item:not(:disabled)")];
    items()[0].focus();
    pop.addEventListener("keydown", (e) => {
      const all = items(), i = all.indexOf(document.activeElement);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); all[(to + all.length) % all.length].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); closeFolderMenu(); }
      else if (e.key === "Tab") closeFolderMenu(true);
    });
    setTimeout(() => addEventListener("pointerdown", outsideMenu, true));
  }

  function outsideMenu(e) {
    const pop = $("folderPop");
    if (pop && !pop.contains(e.target) && !$("folderMore").contains(e.target)) closeFolderMenu(true);
  }

  // Focus goes back to ⋯ unless what was picked takes it somewhere.
  function closeFolderMenu(away) {
    const pop = $("folderPop");
    removeEventListener("pointerdown", outsideMenu, true);
    if (!pop) return;
    pop.removeAttribute("id");
    pop.style.pointerEvents = "none";
    $("folderMore").setAttribute("aria-expanded", "false");
    M.leave(pop).then(() => pop.remove());
    if (!away) $("folderMore").focus();
  }

  // ---- What's saved (0.27.11) ----
  // A page's size split into its pictures (kept as `imageBytes` since
  // 0.27.11, measured from its files for pages saved before) and the rest:
  // its text, the page itself and the site's icon.
  function savedParts(list) {
    const s = { total: 0, pictures: 0, known: true, previews: 0, full: 0, links: 0, missing: 0 };
    for (const p of list) {
      const imgs = p.images || 0, miss = p.missing || 0;
      s.total += p.bytes || 0;
      if (p.mode === "links") s.links += imgs;
      else {
        s[p.mode === "full" ? "full" : "previews"] += Math.max(0, imgs - miss);
        s.missing += miss;
      }
      if (p.imageBytes != null) s.pictures += p.imageBytes;
      else if (imgs && p.mode !== "links") s.known = false;
    }
    s.pictures = Math.min(s.pictures, s.total);
    s.text = s.total - s.pictures;
    return s;
  }

  function picturesAs(list) {
    const modes = new Set(list.filter((p) => p.images).map((p) => p.mode || "previews"));
    if (!modes.size) return "no pictures";
    if (modes.size > 1) return "pictures mixed";
    return { previews: "pictures as previews", full: "pictures full size", links: "pictures as links" }[[...modes][0]];
  }

  // What one page keeps, for its row in Storage.
  function savedNote(p) {
    const s = savedParts([p]);
    return [s.previews ? s.previews + (s.previews === 1 ? " preview" : " previews") : null,
      s.full ? s.full + " full size" : null,
      s.links ? s.links + (s.links === 1 ? " link" : " links") : null,
      s.missing ? s.missing + " missing" : null].filter(Boolean).join(" · ") || "Text only";
  }

  function savedView(list) {
    const s = savedParts(list);
    const kept = s.previews + s.full;
    const what = s.previews && s.full ? "previews and full size" : s.full ? "full size" : "previews";
    const share = (b) => (s.total ? Math.max(b ? 2 : 0, Math.round(b / s.total * 100)) : 0);
    const legend = (cls, label, value) => el("div", { class: "saved-row" },
      el("span", { class: "saved-key " + cls, "aria-hidden": "true" }),
      el("span", { class: "saved-label" + (cls === "missing" ? " warn" : "") }, label),
      value ? el("span", { class: "saved-value" }, value) : null);
    const lean = s.known && kept && s.pictures > s.text * 2;
    return el("div", { class: "saved-view" },
      el("div", { class: "saved-head" },
        el("span", { class: "saved-title" }, "What's saved"),
        el("span", { class: "saved-value" }, formatSize(s.total))),
      s.known && s.total ? el("div", { class: "saved-bar", "aria-hidden": "true" },
        el("span", { class: "pics", style: "width: " + share(s.pictures) + "%" }),
        el("span", { class: "text", style: "width: " + share(s.text) + "%" })) : null,
      kept ? legend("pics", "Pictures, " + what + " · " + kept, s.known ? formatSize(s.pictures) : "") : null,
      legend("text", "Text and pages", s.known ? formatSize(s.text) : ""),
      s.links ? legend("links", "Pictures as links · " + s.links + ", need a connection", "") : null,
      s.missing ? legend("missing", s.missing + (s.missing === 1 ? " preview" : " previews") + " missing, shown online", "") : null,
      !s.known ? el("p", { class: "footnote" }, C.platform.native ? "Measuring the pictures…" : "Picture sizes show for pages saved from 0.27.11 on.")
        : lean ? el("p", { class: "footnote" }, "Most of it is pictures. Save again with Links to keep only the text, about " + formatSize(s.text) + ".") : null);
  }

  // Pages saved before 0.27.11 have their pictures measured from their
  // files, once, the first time What's saved is shown for them.
  const measured = new Set();
  async function measureSizes(list, then) {
    if (!C.platform.native) return;
    const todo = list.filter((p) => p.imageBytes == null && p.images && p.mode !== "links" && !measured.has(p.id));
    if (!todo.length) return;
    let changed = false;
    for (const p of todo) {
      measured.add(p.id);
      try {
        const files = await C.store.listSized(p.id);
        if (!files.length || files.some((f) => f.size == null)) continue;
        p.imageBytes = files.filter((f) => f.rel.startsWith("images/")).reduce((sum, f) => sum + f.size, 0);
        changed = true;
      } catch (e) { /* stays unknown */ }
    }
    if (!changed) return;
    await C.store.writeIndex(state.pages);
    then();
  }

  // The collection's What's saved sheet: the breakdown, and saving it all
  // again with pictures another way.
  function savedSheet() {
    const name = state.folder;
    const list = folderPages(name);
    const n = list.length;
    let mode = load(IMAGES_KEY, "previews");
    const s = savedParts(list);
    const note = el("p", { class: "footnote" });
    const paintNote = () => {
      note.textContent = (mode === "links" && s.known ? "Links keeps the text only, about " + formatSize(s.text) + ". " : "") + "Your place in each " + chapterWord(list, 1) + " stays.";
    };
    paintNote();
    const go = el("button", { class: "btn-primary refresh-go", type: "button", onclick: () => back().then(() => refreshFolder(name, mode, go)) },
      "Save " + n + " " + chapterWord(list, n) + " again");
    go.disabled = !list.some((p) => /^https?:/.test(p.url || "")) || !!runFor(name);
    measureSizes(list, () => { if (state.menu && state.menu.kind === "saved") redrawMenu(); if (state.folder) renderFolder(); });
    return el("div", { class: "page-controls saved-sheet" },
      savedView(list),
      C.platform.native ? el("h2", { class: "overline" }, "Save again with pictures as") : el("h2", { class: "overline" }, "Save again"),
      C.platform.native ? seg("refresh-images", "Pictures", [
        { value: "previews", label: "Previews" }, { value: "full", label: "Full" }, { value: "links", label: "Links" },
      ], mode, (v) => { mode = v; paintNote(); }) : null,
      note,
      go);
  }

  function removeSheet() {
    const list = folderPages(state.folder);
    const n = list.length;
    return el("div", { class: "page-controls remove-sheet" },
      el("div", { class: "menu-head" },
        el("p", { class: "menu-title", dir: "auto" }, "Remove “" + state.folder + "”?"),
        el("p", { class: "meta" }, countLine(n) + " · " + formatSize(sizeOf(list)))),
      el("button", { class: "sheet-row", type: "button", onclick: () => removeFolder(false) }, "Remove the collection, keep its " + countLine(n)),
      el("button", { class: "sheet-row danger", type: "button", onclick: () => removeFolder(true) }, "Delete the collection and its " + countLine(n)),
      el("button", { class: "btn-text menu-cancel", type: "button", onclick: () => history.back() }, "Cancel"));
  }

  // Takes the folder off its pages, or deletes them with it (asked once
  // more, since that can't be undone), then goes back to the library.
  async function removeFolder(withPages) {
    const name = state.folder;
    const list = folderPages(name);
    if (withPages && !confirm("Delete “" + name + "” and its " + countLine(list.length) + " from " + HERE + "?")) return;
    for (const p of list) {
      if (withPages) await C.store.removePage(p.id);
      else { delete p.folder; delete p.folderAt; }
    }
    if (withPages) state.pages = state.pages.filter((p) => !list.includes(p));
    await C.store.writeIndex(state.pages);
    folderMode = "";
    await back(state.menu ? 2 : 1);
    renderLibrary();
    toast(withPages ? "Deleted " + name + " and its " + countLine(list.length) : "Removed " + name + ". Its pages are in the library.");
  }

  // The page before or after `p` in its folder, if any.
  function neighbour(p, step) {
    if (!p || !p.folder) return null;
    const list = folderPages(p.folder);
    return list[list.indexOf(p) + step] || null;
  }

  const ICONS = {
    open: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    send: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    original: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    select: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
    reorder: '<path d="M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5"/>',
    rename: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    saved: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
    chapters: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 5.5v2M4.5 11.5v1M4 17h1.5l-1.5 2h1.5"/>',
    remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  };
  function tileButton(icon, label, onclick, cls) {
    const b = el("button", { class: "tile-btn" + (cls ? " " + cls : ""), type: "button", onclick }, el("span", { class: "tile-icon", "aria-hidden": "true" }), label);
    b.firstChild.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[icon] + "</svg>";
    return b;
  }
  const menuRow = (label, onclick, cls) => el("button", { class: "row", type: "button", onclick }, el("span", { class: "row-label" + (cls ? " " + cls : "") }, label));

  // A page's actions in the order they're used: where it goes (open,
  // share, send, the original), what it is (tags, folder), its series in
  // the reader, then the rarely used. The reader's ⋯ and the library's
  // long press are the same sheet.
  function pageSheet(p, where) {
    const box = el("div", { class: "page-controls" });
    const inReader = where === "reader";
    let exporting = false;
    const draw = () => {
      if (exporting) {
        fill(box, exportControls(p, () => { exporting = false; draw(); focusFirst(box); }));
        focusFirst(box);
        return;
      }
      const series = inReader ? [neighbours(p), neighbour(p, -1) ? null : followControls(p, true), neighbour(p, 1) ? null : followControls(p)].filter(Boolean) : [];
      fill(box,
        inReader ? null : el("div", { class: "menu-head" },
          el("p", { class: "menu-title", dir: "auto" }, p.title),
          el("p", { class: "meta" }, [p.site, p.folder, readingLine(p), formatSize(p.bytes || 0)].filter(Boolean).join(" · "))),
        el("div", { class: "tile-row" },
          inReader ? null : tileButton("open", "Open", () => back().then(() => openPage(p.id))),
          tileButton("share", "Share", () => shareLink(p)),
          tileButton("send", "Export", () => { exporting = true; draw(); }),
          tileButton("original", "Original", () => C.platform.openOutside(p.url))),
        el("h3", { class: "overline" }, "This page"),
        tagsRow(p, draw),
        folderRow(p, draw),
        series.length ? el("h3", { class: "overline" }, "Series") : null,
        ...series,
        el("h3", { class: "overline" }, "More"),
        el("div", { class: "group" },
          menuRow(p.finished ? "Mark as unread" : "Mark as read", () => markRead([p], !p.finished).then(draw)),
          inReader ? null : menuRow("Select", () => back().then(() => startSelect([p.id]))),
          fullImagesRow(p),
          menuRow("Delete this page", () => deletePage(p, where), "warn")));
    };
    draw();
    return box;
  }

  function tagsRow(p, redraw) {
    const tags = p.tags || [];
    const others = allTags().filter((t) => !tags.some((x) => sameTag(x, t)));
    const input = el("input", { class: "tag-input", type: "text", placeholder: "Add a tag", "aria-label": "Add a tag",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
    const refocus = () => { const i = document.querySelector(".sheet:not([hidden]) .tag-input"); if (i) i.focus({ preventScroll: true }); };
    const add = (raw) => {
      const t = cleanTag(raw);
      if (!t || tags.some((x) => sameTag(x, t))) return;
      const known = allTags().find((x) => sameTag(x, t));
      setTags(p, [...tags, known || t]).then(() => { redraw(); refocus(); });
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(input.value); } });
    return el("div", { class: "rc-row tall" }, el("span", { class: "rc-label" }, "Tags"),
      el("div", { class: "tag-edit" },
        el("div", { class: "chips" },
          ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": "Remove tag " + t,
            onclick: () => setTags(p, tags.filter((x) => x !== t)).then(redraw) }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×"))),
          input),
        others.length ? el("div", { class: "chips" },
          ...others.slice(0, 12).map((t) => el("button", { class: "chip", type: "button", "aria-label": "Add tag " + t, onclick: () => add(t) }, "+ " + t))) : null));
  }

  // From the reader, back out of it; from the library's sheet, back to the
  // library (or out of a folder this emptied).
  async function deletePage(p, where) {
    if (!confirm("Delete “" + p.title + "” from this phone?")) return;
    await C.store.removePage(p.id);
    state.pages = state.pages.filter((x) => x.id !== p.id);
    await C.store.writeIndex(state.pages);
    if (where === "reader") history.go(state.sheet ? -2 : -1);
    else await back(andFolder(1));
    renderLibrary();
    if (state.folder) renderFolder();
    toast("Deleted");
  }

  // ---- Picking several ----
  // "Select" (or a long press on a folder) turns taps into picks; the bar
  // along the bottom then tags, moves, marks or deletes every picked page
  // at once. A history entry, so back leaves it.

  const picked = () => state.pages.filter((p) => state.select && state.select.has(p.id));

  // A tap on a card or a folder: opens it, or picks it while picking.
  function tapPages(ids, open) {
    if (!state.select) { open(); return; }
    const all = ids.every((id) => state.select.has(id));
    for (const id of ids) all ? state.select.delete(id) : state.select.add(id);
    paintPicks();
  }

  function startSelect(ids, fromHistory) {
    if (state.select) return;
    state.select = new Set(ids || []);
    if (!fromHistory) history.pushState({ view: "select", folder: state.folder || undefined }, "");
    $("selectHead").hidden = false;
    $("selectBar").hidden = false;
    M.arrive($("selectHead"), -8);
    M.arrive($("selectBar"), 16);
    if (state.folder) renderFolder(); else renderLibrary();
    paintPicks();
    $("selectCancel").focus({ preventScroll: true });
  }

  function endSelect() {
    if (!state.select) return;
    state.select = null;
    $("selectHead").hidden = true;
    $("selectBar").hidden = true;
    renderLibrary();
    if (state.folder) renderFolder();
  }

  // Picks are painted onto the cards already there, so picking never
  // rebuilds the list or moves focus.
  function paintPicks() {
    const on = !!state.select;
    document.body.classList.toggle("selecting", on);
    for (const node of document.querySelectorAll("[data-ids]")) {
      const ids = node.dataset.ids.split(",");
      const isPicked = on && ids.every((id) => state.select.has(id));
      node.classList.toggle("picked", isPicked);
      const open = node.querySelector("button");
      if (on) open.setAttribute("aria-pressed", String(isPicked)); else open.removeAttribute("aria-pressed");
    }
    if (!on) return;
    const list = picked();
    const scope = state.folder ? folderPages(state.folder) : onScreen;
    $("selectCount").textContent = list.length ? countLine(list.length) + " picked" : "Pick pages";
    $("selectAll").textContent = scope.length && scope.every((p) => state.select.has(p.id)) ? "Pick none" : "Select all";
    $("selReadLabel").textContent = list.length && list.every((p) => p.finished) ? "Mark unread" : "Mark read";
    for (const id of ["selTags", "selFolder", "selRead", "selDelete"]) $(id).disabled = !list.length;
  }

  function selectAll() {
    const scope = state.folder ? folderPages(state.folder) : onScreen;
    const all = scope.every((p) => state.select.has(p.id));
    for (const p of scope) all ? state.select.delete(p.id) : state.select.add(p.id);
    paintPicks();
  }

  async function markRead(list, read) {
    for (const p of list) {
      p.finished = read;
      if (!read) p.at = 0;
    }
    await C.store.writeIndex(state.pages);
    renderLibrary();
    if (state.folder) renderFolder();
  }

  // Back through `n` history entries; resolves once there.
  const back = (n = 1) => new Promise((resolve) => {
    addEventListener("popstate", () => resolve(), { once: true });
    history.go(-n);
  });

  // How far back a change that empties the open folder has to go.
  const andFolder = (n) => n + (state.folder && !folderPages(state.folder).length ? 1 : 0);

  async function readPicked() {
    const list = picked();
    if (!list.length) return;
    const read = !list.every((p) => p.finished);
    await markRead(list, read);
    await back();
    toast("Marked " + countLine(list.length) + (read ? " as read" : " as unread"));
  }

  async function deletePicked() {
    const list = picked();
    if (!list.length || !confirm("Delete " + countLine(list.length) + " from " + HERE + "?")) return;
    for (const p of list) await C.store.removePage(p.id);
    state.pages = state.pages.filter((p) => !list.includes(p));
    await C.store.writeIndex(state.pages);
    await back(andFolder(1));
    renderLibrary();
    toast("Deleted " + countLine(list.length));
  }

  // ---- The library's sheet ----
  // A page's menu (a long press, or right-click), and the tags and folder
  // for picked pages. One sheet from the bottom over a dimmed library, in
  // its own history entry.

  const MENUS = {
    page: { label: "Page", build: () => pageSheet(state.menu.page, "library") },
    tags: { label: "Tags", build: tagsSheet },
    folder: { label: "Collection", build: folderSheet },
    saved: { label: "What's saved", build: savedSheet },
    remove: { label: "Remove collection", build: removeSheet },
    addFeed: { label: "Add a feed", build: addFeedSheet },
    feed: { label: "Feed", build: feedSheet },
  };
  let menuUnder = [];

  function openMenu(kind, page) {
    if (state.menu || !MENUS[kind]) return;
    state.menu = { kind, page };
    history.pushState({ view: "menu", kind, page: page ? page.id : undefined, folder: state.folder || undefined,
      select: state.select ? true : undefined }, "");
    $("menuBody").replaceChildren(MENUS[kind].build());
    $("menuSheet").setAttribute("aria-label", MENUS[kind].label);
    menuUnder = [state.folder ? $("folderView") : $("libraryView"), $("selectHead"), $("selectBar")].filter((n) => !n.inert);
    menuUnder.forEach((n) => { n.inert = true; });
    $("menuCatch").hidden = false;
    $("menuSheet").hidden = false;
    M.arrive($("menuCatch"), 0);
    M.rise($("menuSheet"));
    const first = $("menuSheet").querySelector("button:not(:disabled)");
    if (first) first.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (!state.menu) return;
    state.menu = null;
    menuUnder.forEach((n) => { n.inert = false; });
    menuUnder = [];
    const sheet = $("menuSheet"), catcher = $("menuCatch");
    M.leave(catcher).then(() => { if (!state.menu) catcher.hidden = true; });
    M.sink(sheet).then(() => { if (!state.menu) sheet.hidden = true; });
  }

  function redrawMenu() {
    if (state.menu) $("menuBody").replaceChildren(MENUS[state.menu.kind].build());
  }

  // Tags for every picked page: a tag on all of them is on, one on some
  // shows how many; a tap puts it on all of them, or takes it off all.
  function tagsSheet() {
    const box = el("div", { class: "page-controls" });
    const draw = () => {
      const list = picked(), n = list.length;
      const on = (t) => list.filter((p) => (p.tags || []).some((x) => sameTag(x, t))).length;
      const write = async (change) => {
        list.forEach(change);
        await C.store.writeIndex(state.pages);
        renderLibrary();
        if (state.folder) renderFolder();
        draw();
      };
      const add = (raw) => {
        const t = cleanTag(raw);
        if (!t) return;
        const name = allTags().find((x) => sameTag(x, t)) || t;
        write((p) => { p.tags = withTags(p.tags, [name]); }).then(() => box.querySelector(".tag-input").focus({ preventScroll: true }));
      };
      const input = el("input", { class: "tag-input", type: "text", placeholder: "New tag", "aria-label": "New tag",
        maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(input.value); } });
      const tags = allTags();
      fill(box,
        el("h2", { class: "menu-title" }, "Tags for " + countLine(n)),
        tags.length ? el("div", { class: "chips" }, ...tags.map((t) => {
          const k = on(t), all = k === n;
          return el("button", { class: "chip" + (all ? " on" : k ? " some" : ""), type: "button", "aria-pressed": all ? "true" : k ? "mixed" : "false",
            "aria-label": t + (all ? ", on all, remove" : k ? ", on " + k + " of " + n + ", add to all" : ", add"),
            onclick: () => (all ? write((p) => { p.tags = (p.tags || []).filter((x) => !sameTag(x, t)); }) : add(t)) },
          t, k && !all ? el("span", { class: "chip-n" }, k + "/" + n) : null);
        })) : null,
        input,
        el("button", { class: "btn-primary menu-done", type: "button", onclick: () => history.back() }, "Done"));
    };
    draw();
    return box;
  }

  // Moves every picked page into one folder, keeping their order, or out
  // of their folders.
  function folderSheet() {
    const list = picked(), n = list.length;
    const move = async (name) => {
      const target = name && cleanTag(name) ? folderName(name) : null;
      const now = Date.now();
      [...list].sort((a, b) => (a.folderAt || a.savedAt || 0) - (b.folderAt || b.savedAt || 0)).forEach((p, i) => {
        if (!target) { delete p.folder; delete p.folderAt; return; }
        if (p.folder && sameTag(p.folder, target)) return;
        p.folder = target;
        p.folderAt = now + i;
      });
      await C.store.writeIndex(state.pages);
      await back(andFolder(2));
      renderLibrary();
      if (state.folder) renderFolder();
      toast(target ? "Moved " + countLine(n) + " to " + target : "Took " + countLine(n) + " out of their collections");
    };
    const input = el("input", { class: "tag-input", type: "text", placeholder: "New collection", "aria-label": "New collection",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && cleanTag(input.value)) { e.preventDefault(); move(input.value); } });
    const folders = allFolders();
    return el("div", { class: "page-controls" },
      el("h2", { class: "menu-title" }, "Move " + countLine(n) + " to"),
      folders.length ? el("div", { class: "chips" }, ...folders.map((f) => el("button", { class: "chip", type: "button", onclick: () => move(f) }, f))) : null,
      input,
      list.some((p) => p.folder) ? el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: () => move(null) }, el("span", { class: "row-label" }, "Take out of their collections"))) : null);
  }

  // A long press (or right-click) on a page opens its menu; on a folder it
  // starts picking with the folder picked; while picking it picks.
  function onLongPress(node) {
    const ids = node.dataset.ids.split(",");
    if (state.select) { tapPages(ids); return; }
    if (node.classList.contains("tile")) { startSelect(ids); return; }
    const p = state.pages.find((x) => x.id === ids[0]);
    if (p) openMenu("page", p);
  }

  function longPress(root) {
    let timer = null, start = null, fired = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    root.addEventListener("pointerdown", (e) => {
      fired = false;
      const node = e.button === 0 && e.target.closest("[data-ids]");
      if (!node || e.target.closest(".card-retry, .move")) return;
      start = { x: e.clientX, y: e.clientY };
      cancel();
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        if (navigator.vibrate) navigator.vibrate(10);
        onLongPress(node);
      }, 480);
    });
    root.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(t, cancel);
    root.addEventListener("click", (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
    root.addEventListener("contextmenu", (e) => {
      const node = e.target.closest("[data-ids]");
      if (!node) return;
      e.preventDefault();
      cancel();
      if (fired) return;
      fired = true;
      onLongPress(node);
    });
  }

  // ---- Pages leaving the app, and coming back (backup.js) ----

  async function shareLink(p) {
    try {
      if (await C.platform.shareLink(p.title, p.url)) return;
      await navigator.clipboard.writeText(p.url);
      toast("Link copied");
    } catch (e) { toast("Couldn't share the link. Try again."); }
  }

  // ---- Export (0.25.2) ----
  // A page as a file of the kind picked, saved where the person picks or
  // handed to the share sheet. PDF goes through the print screen, where
  // Save as PDF is a printer; page source is the site's page fetched again,
  // for working out why a site saves badly.
  const EXPORTS = [
    { value: "pdf", label: "PDF", note: "Opens the print screen, where Save as PDF is a printer." },
    { value: "html", label: "HTML", note: "One file with its pictures. Opens in any browser, and back in Carry-on.", mime: "text/html" },
    { value: "epub", label: "EPUB", note: "For an e-reader, Apple Books or Send to Kindle.", mime: "application/epub+zip" },
    { value: "md", label: "Markdown", note: "The text for a notes app. Pictures link to the site.", mime: "text/markdown" },
    { value: "source", label: "Page source", note: "The site's own page, fetched again. Send it when a site saves badly.", mime: "text/html" },
  ];
  const exportKind = () => { const k = load(EXPORT_KEY, "html"); return EXPORTS.some((e) => e.value === k) ? k : "html"; };

  function focusFirst(box) {
    requestAnimationFrame(() => { const f = box.querySelector("input:checked, button"); if (f) f.focus({ preventScroll: true }); });
  }

  // `what` is a page, or { pages, title } for a folder.
  function exportControls(what, done) {
    const folder = !!what.pages;
    const kinds = EXPORTS.filter((e) => !folder || e.value !== "source");
    let kind = folder ? load(EXPORT_KEY + ".folder", "epub") : exportKind();
    if (!kinds.some((e) => e.value === kind)) kind = "epub";
    const p = what;
    const save = el("button", { class: "btn-primary export-save", type: "button", onclick: () => exportAs(p, kind, "save", save) });
    const send = el("button", { class: "btn-quiet export-send", type: "button", onclick: () => exportAs(p, kind, "send", send) }, "Send");
    const sync = () => {
      save.textContent = kind === "pdf" ? "Print or save as PDF" : C.platform.native ? "Save to device" : "Download";
      send.hidden = kind === "pdf" || !C.platform.native;
    };
    const group = choiceGroup({ key: "export-kind", label: "Export as", options: kinds, get: () => kind,
      set: (v) => { kind = v; store(folder ? EXPORT_KEY + ".folder" : EXPORT_KEY, v); sync(); } });
    sync();
    return el("div", { class: "export" },
      el("div", { class: "export-top" },
        el("button", { class: "btn-quiet export-back", type: "button", onclick: done }, "Back"),
        el("p", { class: "menu-title", dir: "auto" }, folder ? what.title : p.title)),
      group,
      el("div", { class: "export-actions" }, save, send));
  }

  async function exportAs(p, kind, how, btn) {
    const pages = p.pages || null;
    if (kind === "pdf") { await (pages ? printPages(pages, p.title, btn) : printPage(p, btn)); return; }
    if (kind === "source" && !navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
    const mime = EXPORTS.find((e) => e.value === kind).mime;
    btn.disabled = true;
    try {
      let name, text = null, uri = null, blob = null;
      if (kind === "epub") ({ name, uri = null, blob = null } = await C.epub.exportBook(pages || [p], pages ? p.title : undefined));
      else if (kind === "md") ({ name, text } = await (pages ? C.backup.exportMarkdownAll(pages, p.title) : C.backup.exportMarkdown(p)));
      else if (kind === "html") ({ name, html: text } = await (pages ? C.backup.exportPages(pages, p.title) : C.backup.exportPage(p)));
      else ({ name, html: text } = await C.save.pageSource(p.url));
      if (!uri && text != null) uri = await C.platform.writeCache(name, text);
      if (!uri) C.platform.download(name, blob || new Blob([text], { type: mime }));
      else if (how === "save") {
        const saved = await C.platform.saveFile(uri, name, mime);
        if (saved === null) await C.platform.shareFile(uri, name);
        else if (saved) toast("Saved " + name);
      } else await C.platform.shareFile(uri, name);
    } catch (e) {
      if (!(e instanceof C.save.SaveError)) console.error(e);
      toast(e instanceof C.save.SaveError ? e.message : "Couldn't make the file. Try again.");
    }
    btn.disabled = false;
  }

  // A page, or a folder in its order, as an e-book (epub.js), for an
  // e-reader or Send to Kindle.
  async function sendBook(pages, btn, title) {
    btn.disabled = true;
    try {
      const out = await C.epub.exportBook([].concat(pages), title);
      if (out.uri) await C.platform.shareFile(out.uri, out.name);
      else C.platform.download(out.name, out.blob);
    } catch (e) {
      console.error(e);
      toast("Couldn't make the book. Try again.");
    }
    btn.disabled = false;
  }

  // The page file with a plain print style, on the phone's print screen;
  // it runs no scripts and loads nothing, its pictures are inside it.
  const printPage = (p, btn) => printFile(() => C.backup.exportPage(p), btn);
  const printPages = (pages, title, btn) => printFile(() => C.backup.exportPages(pages, title), btn);
  async function printFile(make, btn) {
    btn.disabled = true;
    try {
      const { name, html } = await make();
      const head = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
        "<style>" + C.epub.STYLE + "</style>";
      await C.platform.printHtml(name.replace(/\.html$/, ""), html.replace(/<head>/i, "<head>" + head));
    } catch (e) {
      console.error(e);
      toast("Couldn't open printing. Try again.");
    }
    btn.disabled = false;
  }

  async function backUp(btn) {
    if (!state.pages.length && !feeds.length) { toast("There's nothing to back up yet."); return; }
    btn.disabled = true;
    const label = btn.querySelector(".row-label");
    label.textContent = "Backing up…";
    try {
      const out = await C.backup.exportLibrary(state.pages, (done, total) => { label.textContent = "Backing up, " + done + " of " + total; }, feeds);
      if (out.uri) await C.platform.shareFile(out.uri, out.name);
      else C.platform.download(out.name, out.blob);
    } catch (e) {
      console.error(e);
      toast("Couldn't write the backup. Free some space and try again.");
    }
    btn.disabled = false;
    label.textContent = "Back up the library";
  }

  // A backup (a zip) or one page's file, picked from the phone.
  async function openFile(file, btn) {
    if (!file) return;
    const label = btn.querySelector(".row-label");
    btn.disabled = true;
    label.textContent = "Opening…";
    try {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (head[0] === 0x50 && head[1] === 0x4b) {
        const res = await C.backup.restoreLibrary(file, state.pages, sameUrl, (done, total) => { label.textContent = "Restoring, " + done + " of " + total; });
        state.pages = res.pages;
        await C.store.writeIndex(state.pages);
        texts.clear();
        await loadThumbs();
        if (res.added + res.replaced) C.store.keepStored();
        const followed = restoreFeeds(res.feeds);
        const n = res.added + res.replaced;
        const what = [n ? countLine(n) : "", followed ? (followed === 1 ? "1 feed" : followed + " feeds") : ""].filter(Boolean).join(" and ");
        toast((what ? "Restored " + what : "Nothing new to restore") + (res.kept ? ". " + res.kept + " already here" + (res.kept === 1 ? " was" : " were") + " kept." : "."));
      } else {
        const meta = await C.backup.importPage(await file.text(), (url) => !!savedAs(url));
        if (meta.already) {
          toast("Already in your library");
        } else {
          state.pages.unshift(meta);
          await C.store.writeIndex(state.pages);
          await loadThumbs();
          C.store.keepStored();
          toast("Added “" + meta.title + "”");
        }
      }
      renderLibrary();
    } catch (e) {
      if (!/Carry-on|empty/.test(e.message)) console.error(e);
      toast(/Carry-on|empty/.test(e.message) ? e.message : "Couldn't open that file. Try again.");
    }
    if (state.settings) renderSettings();
    if (state.section) renderSection();
  }

  function backupGroup() {
    const input = el("input", { type: "file", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" });
    const open = el("button", { class: "row", type: "button", onclick: () => input.click() },
      el("span", { class: "row-label accent" }, "Restore or open a file"));
    input.addEventListener("change", () => { const f = input.files[0]; input.value = ""; openFile(f, open); });
    return el("section", { class: "settings-section", id: "backupSection" },
      el("h2", { class: "overline" }, "Backup"),
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: (e) => backUp(e.currentTarget) },
          el("span", { class: "row-label accent" }, "Back up the library")),
        open, input),
      el("p", { class: "footnote" }, "One file with every page, its pictures, tags, collections and where you were, and the feeds you follow. " + (C.platform.native ? "Keep it off the phone" : "Keep it somewhere other than this browser") + ". Restoring keeps whichever copy of a page was saved last. A page sent as a file opens here too."));
  }

  // "Save full images" for a page saved with previews or links only.
  function fullImagesRow(p) {
    if (!C.platform.native || p.mode === "full" || !p.images) return null;
    return el("button", { class: "row", type: "button", onclick: (e) => saveFullImages(p, e.currentTarget) },
      el("span", { class: "choice-text" },
        el("span", { class: "row-label" }, "Save full images"),
        el("span", { class: "choice-note" }, "For maps, diagrams and comics. About 150 KB an image.")));
  }

  async function saveFullImages(p, btn) {
    if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
    btn.disabled = true;
    const label = btn.querySelector(".row-label");
    label.textContent = "Saving full images…";
    let res;
    try {
      res = await C.save.saveFullImages(p, (done, total) => { label.textContent = "Saving full images, " + done + " of " + total; });
    } catch (e) { res = null; }
    if (!res) { btn.disabled = false; label.textContent = "Save full images"; toast("Couldn't open this page's file. Try again."); return; }
    Object.assign(p, { mode: "full", missing: res.missing, bytes: Math.max(0, (p.bytes || 0) + res.bytes) });
    if (p.imageBytes != null) p.imageBytes = Math.max(0, p.imageBytes + res.bytes);
    await C.store.writeIndex(state.pages);
    renderLibrary();
    toast(res.failed ? "Saved " + res.got + " full images. " + res.failed + " kept their previews." : "Full images saved.");
    if (state.menu && state.menu.page === p) redrawMenu();
    if (state.open !== p) return;
    if (state.sheet === "page") $("readingBody").replaceChildren(SHEETS.page.build());
    const html = await C.store.readPage(p.id).catch(() => null);
    if (html) show(p, html);
  }

  function folderRow(p, redraw) {
    const others = allFolders().filter((n) => !(p.folder && sameTag(n, p.folder)));
    const input = el("input", { class: "tag-input", type: "text", "aria-label": p.folder ? "Move to a new collection" : "Add to a new collection",
      placeholder: p.folder ? "New collection" : "Add to a new collection", maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (cleanTag(input.value)) setFolder(p, input.value).then(redraw);
    });
    return el("div", { class: "rc-row tall" }, el("span", { class: "rc-label" }, "Collection"),
      el("div", { class: "tag-edit" },
        el("div", { class: "chips" },
          p.folder ? el("button", { class: "chip on", type: "button", "aria-label": "Take out of " + p.folder,
            onclick: () => setFolder(p, null).then(redraw) }, p.folder, el("span", { class: "chip-x", "aria-hidden": "true" }, "×")) : null,
          input),
        others.length ? el("div", { class: "chips" },
          ...others.slice(0, 8).map((n) => el("button", { class: "chip", type: "button", "aria-label": (p.folder ? "Move to " : "Add to ") + n,
            onclick: () => setFolder(p, n).then(redraw) }, (p.folder ? "→ " : "+ ") + n))) : null));
  }

  function neighbours(p) {
    const prev = neighbour(p, -1), next = neighbour(p, 1);
    if (!prev && !next) return null;
    const step = (q, label) => {
      const b = el("button", { class: "sheet-row step-row", type: "button", onclick: () => q && goTo(q) },
        el("span", { class: "step-over" }, label), el("span", { class: "step-title", dir: "auto" }, q ? q.title : "None"));
      b.disabled = !q;
      return b;
    };
    return el("div", { class: "step-rows" }, step(prev, "Previous"), step(next, "Next"));
  }

  // ---- Saving several ----
  // Opens when a paste or share holds more than one link: the links (one
  // a line, editable), the folder to save them into, and Save.

  // `from` is the page read as a list of chapters, which can still be
  // saved as one page.
  function openBatch(text, fromHistory, folder, from) {
    if (state.batch) return;
    state.batch = true;
    renderBatch(linksFrom(text).join("\n"), folder || null, from);
    if (!fromHistory) history.pushState({ view: "batch", folder: state.folder || undefined }, "");
    // Set once it shows: a hidden screen keeps its old scroll.
    const shown = pushScreen($("batchView"));
    $("batchBody").scrollTop = 0;
    shown.then(() => $("batchBack").focus());
  }

  function closeBatch() {
    if (!state.batch) return;
    state.batch = false;
    popScreen($("batchView"));
  }

  const LONG_LIST = 50;

  function renderBatch(text, preset, from) {
    let folder = preset;
    // The page the chapters were read from, kept on the folder (0.26.0).
    let source = from || null;
    let mode = load(IMAGES_KEY, "previews");
    // A comic's folder saves its next chapters as comics too.
    let kind = preset && folderPages(preset).some((p) => p.comic) ? "comic" : "article";
    if (kind === "comic") mode = "full";
    const tags = [];
    const area = el("textarea", { class: "batch-links", rows: "6", "aria-label": "Links, one a line", spellcheck: "false",
      autocapitalize: "off", autocomplete: "off", dir: "ltr" });
    area.value = text;
    const count = el("p", { class: "meta batch-count" });
    // Links already saved can be left where they are, or (switched off)
    // moved into this folder at their place in the list.
    const skip = el("input", { class: "switch batch-skip", type: "checkbox", role: "switch", checked: true, onchange: () => sync() });
    const skipNote = el("span", { class: "choice-note" });
    const skipRow = el("div", { class: "group" }, el("label", { class: "row" },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, "Skip pages already saved"), skipNote), skip));
    const go = el("button", { class: "btn-primary batch-go", type: "submit" });
    const input = el("input", { class: "tag-input", type: "text", placeholder: "New collection", "aria-label": "New collection",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
    // One link may be a contents page: its chapters replace it, and the
    // folder takes its name.
    const finder = el("button", { class: "btn-small batch-find", type: "button", onclick: async () => {
      const url = linksFrom(area.value)[0];
      if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
      finder.disabled = true;
      finder.textContent = "Finding chapters…";
      try {
        const found = await C.save.findChapters(url);
        if (found.links.length) {
          source = url;
          area.value = found.links.join("\n");
          if (!folder) choose(folderName(found.title || C.save.siteName(url)));
          sync();
        } else toast("Couldn't find a list of chapters on that page.");
      } catch (e) { toast(e instanceof C.save.SaveError ? e.message : "Couldn't read that page. Try again."); }
      finder.disabled = false;
      finder.textContent = "Find chapters on this page";
    } }, "Find chapters on this page");
    const sync = () => {
      const links = linksFrom(area.value);
      const had = links.filter((u) => savedAs(u)).length;
      const n = skip.checked ? links.length - had : links.length;
      finder.hidden = links.length !== 1;
      skipRow.hidden = !had;
      skipNote.textContent = had === links.length ? "All " + had + " are already saved"
        : had + " already saved" + (skip.checked ? ", left where they are" : (folder ? ", moved into " + folder : ""));
      count.textContent = links.length ? links.length + (links.length === 1 ? " link" : " links") : "No links yet. Paste them here, one a line.";
      go.textContent = n ? "Save " + countLine(n) + (folder ? " into " + folder : "") : links.length ? "Nothing new to save" : "Save";
      go.disabled = !n;
    };
    const pick = (f, typed) => { folder = f; if (!typed) input.value = ""; sync(); };
    // The collection: None, one already there, or a new one typed in.
    const NEW = "\u0000new";
    const folderPick = dropdown({ label: "Collection", cls: "field-pick batch-folder", value: "",
      options: [{ value: "", label: "None" }, ...foldersByUse().map((f) => ({ value: f, label: f })), { value: NEW, label: "New collection…" }],
      onpick: (v) => {
        input.hidden = v !== NEW;
        if (v === NEW) { pick(cleanTag(input.value) ? folderName(input.value) : null, true); input.focus(); }
        else pick(v || null);
      } });
    input.hidden = true;
    const choose = (name) => {
      const had = name && allFolders().find((f) => sameTag(f, name));
      folderPick.set(had || (name ? NEW : ""));
      input.hidden = !name || !!had;
      if (had) pick(had);
      else { input.value = name || ""; pick(name || null, true); }
    };
    // Tags for every page this saves: the ones picked, each with its ×,
    // then a dropdown of the rest and "New tag…", which opens a field.
    const tagBox = el("div", { class: "tag-edit" });
    let typing = false;
    const drawTags = (focus) => {
      const others = allTags().filter((t) => !tags.some((x) => sameTag(x, t)));
      const tagInput = el("input", { class: "tag-input", type: "text", placeholder: "New tag", "aria-label": "New tag",
        maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
      const add = (raw) => {
        const t = cleanTag(raw);
        if (!t || tags.some((x) => sameTag(x, t))) return;
        tags.push(allTags().find((x) => sameTag(x, t)) || t);
        typing = false;
        drawTags("pick");
      };
      tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(tagInput.value); } });
      const showInput = typing || !allTags().length;
      tagInput.hidden = !showInput;
      const tagPick = dropdown({ label: "Add a tag", placeholder: "Add a tag", cls: "field-pick batch-tag", value: null,
        options: [...others.map((t) => ({ value: t, label: t })), { value: NEW, label: "New tag…" }],
        onpick: (v) => { if (v === NEW) { typing = true; drawTags("input"); } else add(v); } });
      fill(tagBox,
        tags.length ? el("div", { class: "chips" },
          ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": "Remove tag " + t,
            onclick: () => { tags.splice(tags.indexOf(t), 1); drawTags(); } }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×")))) : null,
        allTags().length ? tagPick : null, tagInput);
      if (focus === "input") tagInput.focus({ preventScroll: true });
      else if (focus === "pick" && allTags().length) tagPick.querySelector(".dropdown-btn").focus({ preventScroll: true });
    };
    drawTags();
    area.addEventListener("input", sync);
    input.addEventListener("input", () => pick(cleanTag(input.value) ? folderName(input.value) : null, true));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    const KIND_NOTES = { article: "The text and its pictures, read as a page.", comic: "Only the page's pictures, in order, edge to edge. For comics and manga." };
    const kindNote = el("p", { class: "meta" }, KIND_NOTES[kind]);
    const images = C.platform.native ? seg("batch-images", "Images", [
      { value: "previews", label: "Previews" }, { value: "full", label: "Full" }, { value: "links", label: "Links" },
    ], mode, (v) => { mode = v; }) : null;
    const asPage = from ? el("section", { class: "settings-section batch-from" },
      el("p", { class: "meta" }, "Carry-on read this page as a list of chapters."),
      el("button", { class: "btn-quiet batch-as-page", type: "button", onclick: () => { history.back(); savePage(from, null, { asPage: true }); } },
        "Save it as one page instead")) : null;
    const form = el("form", { class: "batch-form" }, asPage,
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Links"), area, count, finder, skipRow),
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Save as"),
        seg("batch-kind", "Save as", [{ value: "article", label: "Article" }, { value: "comic", label: "Comic" }], kind, (v) => {
          kind = v;
          kindNote.textContent = KIND_NOTES[v];
          // Comics read best full size; still a choice below.
          const pick = images && images.querySelector('input[value="' + (v === "comic" ? "full" : load(IMAGES_KEY, "previews")) + '"]');
          if (pick) { pick.checked = true; mode = pick.value; }
        }),
        kindNote),
      images ? el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Images"), images,
        el("p", { class: "meta" }, "Full images for comics, maps and diagrams. Settings picks the usual choice.")) : null,
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Collection"),
        el("div", { class: "tag-edit" }, folderPick, input),
        el("p", { class: "meta" }, "Pages in a collection keep the order of the links.")),
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Tags"), tagBox),
      go);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const all = linksFrom(area.value);
      const skipSaved = skip.checked && !skipRow.hidden;
      const urls = skipSaved ? all.filter((u) => !savedAs(u)) : all;
      if (!urls.length) return;
      if (urls.length > LONG_LIST && !confirm("Save " + urls.length + " pages? They save one at a time, so a list this long takes a while. Pause and Stop are on its card.")) return;
      history.back();
      saveAll(skipSaved ? all : urls, folder, tags, mode, skipSaved, kind, source);
    });
    $("batchBody").replaceChildren(form);
    if (folder) choose(folder);
    sync();
  }

  // ---- Following a site's next links ----
  // A page saved with a next link (save.js) can bring its next pages in
  // after it, into its folder: one link at a time, each saved page giving
  // the next. A page not yet in a folder starts one, named after it.

  // "The Wandering Inn - Chapter 1.01" → "The Wandering Inn".
  function seriesName(p) {
    if (p.series) return cleanTag(p.series) || p.site;
    const t = p.title.replace(/[\s\-–—:|,·]*(chapter|ch\.?|part|episode|ep\.?|book|vol\.?|פרק|capítulo|chapitre|kapitel)\s*[\d.ivxl]+\b.*$/iu, "").trim();
    return cleanTag(t && t !== p.title ? t : p.title) || p.site;
  }

  // Saves up to `n` pages following `from`'s next links (previous ones
  // with `back`, placed before it in the folder); resolves to the first
  // one saved (or already there), or null. Quiet when asked. A folder's
  // run stops early when its Stop is tapped and waits while paused.
  async function follow(from, n, quiet, back) {
    const key = back ? "prev" : "next", word = back ? "previous" : "next";
    if (from[key] === undefined) {
      try { from[key] = await C.save.findNext(from.url, back); } catch (e) { toast("Couldn't reach " + from.site + " to find the " + word + " page."); return null; }
      await C.store.writeIndex(state.pages);
      if (!from[key]) { toast("There's no " + word + " page."); return null; }
    }
    if (!from.folder) { from.folder = folderName(seriesName(from)); from.folderAt = Date.now(); }
    const name = from.folder;
    let at = from.folderAt || from.savedAt || Date.now();
    const place = () => (back ? --at : undefined);
    const run = n > 1 ? startRun(name, from.site, n === Infinity ? null : n) : null;
    const seen = new Set([from.url]);
    let url = from[key], saved = 0, first = null, failed = false, stopped = false;
    while (url && saved < n && !seen.has(url)) {
      if (run && run.stopped) { stopped = true; break; }
      seen.add(url);
      const had = savedAs(url);
      if (had) {
        if (!had.folder) { had.folder = name; had.folderAt = place() || Date.now(); }
        else if (back && sameTag(had.folder, name)) at = Math.min(at, had.folderAt || at);
        first = first || had;
        url = had[key];
        continue;
      }
      if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) break;
      state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
      if (saved) await new Promise((done) => setTimeout(done, PACE_MS));
      if (run && !(await gate(run))) { stopped = true; break; }
      const job = { ...newJob(url, name), folderAt: place(), run, ...(from.comic ? { kind: "comic", mode: from.mode } : {}) };
      state.saving.unshift(job);
      if (run) run.current = job;
      renderLibrary();
      const meta = await runJob(job);
      if (run) run.current = null;
      if (!meta) { failed = true; if (run) run.failed++; break; }
      saved++;
      if (run) { run.saved++; updateRunCard(run); }
      first = first || meta;
      url = meta[key];
      if (state.folder) renderFolder();
    }
    endRun(run);
    await C.store.writeIndex(state.pages);
    renderLibrary();
    if (state.folder) renderFolder();
    if (!quiet || failed) {
      const end = back ? ". That's the first one." : ". That's the last one.";
      toast(saved ? "Saved " + countLine(saved) + " into " + name + (failed ? ". The " + word + " one couldn't be saved." : stopped ? ". Stopped." : !url ? end : ".")
        : failed ? "Couldn't save the " + word + " page." : first ? "The " + word + " page is already saved." : "There's no " + word + " page.");
    }
    return first;
  }

  // A folder's first page saved before 0.20.0 never looked for a previous
  // link: read it from the original once, quietly, when the folder opens.
  const lookingBack = new Set();
  function lookBack(p) {
    if (!p || p.prev !== undefined || p.licence === "wikipedia" || !navigator.onLine || lookingBack.has(p.id)) return;
    lookingBack.add(p.id);
    C.save.findNext(p.url, true).then((u) => {
      p.prev = u || "";
      return C.store.writeIndex(state.pages);
    }).then(() => { if (state.folder && p.prev && !savedAs(p.prev)) renderFolder(); }, () => {});
  }

  // "Save the next 1 · 5 · 10 · All" for the last page of a run with a
  // next link, or the previous ones (`back`) for the first. While a run
  // saves, Stop.
  // Image chapters run to tens of megabytes, so a long run is confirmed
  // with a size taken from the chapters saved last.
  const BIG_CHAPTER = 5e6;
  function sizeOk(p, n) {
    if (n < 5) return true;
    const last = (p.folder ? folderPages(p.folder) : [p]).filter((q) => q.bytes)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 3);
    const each = last.length ? sizeOf(last) / last.length : 0;
    if (each < BIG_CHAPTER) return true;
    return confirm(n === Infinity
      ? "The last chapters were about " + formatSize(each) + " each. Save all of them?"
      : "The last chapters were about " + formatSize(each) + " each, so " + n + " more is about " + formatSize(each * n) + ". Save them?");
  }

  function followControls(p, back) {
    const key = back ? "prev" : "next";
    // Pages saved before 0.10.0 never looked for a next link (`next` is
    // missing, not ""); follow() reads it from the original on first use.
    // A missing previous link is read when the folder opens (lookBack).
    const unknown = !back && p && p.next === undefined && p.licence !== "wikipedia";
    if (!p || (!unknown && (!p[key] || savedAs(p[key])))) return null;
    const busy = () => !!runFor(p.folder) || state.saving.some((s) => !s.error && s.folder && p.folder && sameTag(s.folder, p.folder));
    const what = back ? "previous" : "next";
    const going = runFor(p.folder);
    const stop = el("button", { class: "chip stop", type: "button", "aria-label": "Stop saving",
      onclick: () => { stopRun(runFor(p.folder)); stop.disabled = true; } }, "Stop");
    const pause = el("button", { class: "chip pause", type: "button", "aria-label": going && going.paused ? "Resume saving" : "Pause saving",
      onclick: () => { const r = runFor(p.folder); if (r) pauseRun(r, !r.paused); } }, going && going.paused ? "Resume" : "Pause");
    stop.hidden = !busy();
    pause.hidden = !going;
    const run = (n) => (e) => {
      if (busy()) return;
      if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
      if (!sizeOk(p, n)) return;
      e.currentTarget.closest(".follow").querySelectorAll("button:not(.stop):not(.pause)").forEach((b) => { b.disabled = true; });
      stop.hidden = false;
      pause.hidden = n === 1;
      follow(p, n, false, back).then(() => { if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build()); });
    };
    const chip = (n) => {
      const b = el("button", { class: "chip", type: "button",
        "aria-label": n === Infinity ? "Save all the " + what + " pages from " + p.site : "Save the " + what + " " + countLine(n) + " from " + p.site,
        onclick: run(n) }, n === Infinity ? "All" : String(n));
      b.disabled = busy();
      return b;
    };
    return el("div", { class: "rc-row follow" + (back ? " back" : "") }, el("span", { class: "rc-label" }, back ? "Save previous" : "Save next"),
      el("div", { class: "chips" }, ...[1, 5, 10, Infinity].map(chip), pause, stop));
  }

  // ---- New chapters (0.25.0) ----
  // A series folder (one whose pages link to each other as next and
  // previous) is checked for chapters after its last one by reading that
  // page's next link again: the one kept when it was saved is often ""
  // because it was the newest chapter then. Found chapters are counted by
  // walking on, up to NEW_MAX, and the last page's `next` is updated, so
  // the folder's Save next row appears. Results are kept per folder:
  // { [lower-case name]: { at, count } }.
  const NEW_MAX = 10;
  const DAY = 864e5;
  const newChapters = () => load(NEW_KEY, {});
  const newFor = (name) => newChapters()[String(name).toLowerCase()] || null;
  function setNewFor(name, entry) {
    const all = newChapters();
    if (entry) all[String(name).toLowerCase()] = entry; else delete all[String(name).toLowerCase()];
    store(NEW_KEY, all);
  }

  // The story's page a folder is linked to (0.26.0): kept on each of its
  // pages as `source`, so it travels with them in backups. "" when none.
  const folderSource = (list) => (list.find((p) => p.source) || {}).source || "";
  function bookIcon(size) {
    const s = el("span", { class: "book-icon", "aria-hidden": "true" });
    s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS.book + "</svg>";
    return s;
  }

  function isSeries(list) {
    if (folderSource(list)) return true;
    if (list.length < 2) return false;
    const last = list[list.length - 1];
    if (!/^https?:/.test(last.url || "") || last.licence === "wikipedia") return false;
    return list.some((p) => list.some((q) => q !== p && ((p.next && sameUrl(p.next, q.url)) || (p.prev && sameUrl(p.prev, q.url)))));
  }

  const checking = new Set();
  // Resolves to the number of new chapters found (NEW_MAX meaning at
  // least that many), or null when the site couldn't be reached.
  async function checkNew(name, quiet) {
    const key = String(name).toLowerCase();
    if (checking.has(key)) return null;
    const list = folderPages(name);
    const last = list[list.length - 1];
    if (!last) return null;
    checking.add(key);
    if (state.folder && sameTag(state.folder, name)) renderFolder();
    let count = 0;
    const source = folderSource(list);
    try {
      if (source) {
        // A linked folder reads the story's own chapter list: whatever in
        // it isn't saved is new, wherever it sits.
        const found = await C.save.findChapters(source);
        const all = found.links.slice(0, 5000);
        count = all.filter((u) => !savedAs(u)).length;
        setNewFor(name, { at: Date.now(), count, all });
        await updateCover(name, found.cover || "");
      } else {
        let url = await C.save.findNext(last.url);
        if (url && !savedAs(url)) {
          last.next = url;
          await C.store.writeIndex(state.pages);
          const seen = new Set([last.url]);
          while (url && !seen.has(url) && !savedAs(url) && count < NEW_MAX) {
            seen.add(url);
            count++;
            if (count === NEW_MAX) break;
            try { url = await C.save.findNext(url); } catch (e) { break; }
          }
        }
        setNewFor(name, { at: Date.now(), count });
      }
    } catch (e) {
      if (!quiet) toast("Couldn't reach " + last.site + " to look for new chapters.");
      count = null;
    } finally {
      checking.delete(key);
    }
    if (state.folder && sameTag(state.folder, name)) renderFolder();
    renderLibrary();
    if (!quiet && count === 0) toast("No new chapters yet.");
    return count;
  }

  const newCountText = (n) => (n >= NEW_MAX ? NEW_MAX + "+" : String(n)) + " new";

  // The new chapters still unsaved: those saved since the check no
  // longer count, and none are left once the last page's next is saved.
  function freshCount(name) {
    const entry = newFor(name);
    if (!entry || !entry.count) return 0;
    if (entry.all) return entry.all.filter((u) => !savedAs(u)).length;
    const list = folderPages(name);
    const last = list[list.length - 1];
    if (!last || !last.next || savedAs(last.next)) return 0;
    const since = list.filter((p) => (p.savedAt || 0) > entry.at).length;
    return Math.max(1, entry.count - since);
  }

  function checkRow(list) {
    if (!isSeries(list)) return null;
    const name = state.folder;
    const entry = newFor(name);
    const fresh = freshCount(name);
    const busy = checking.has(String(name).toLowerCase());
    const note = busy ? "Looking…" : !entry ? "Not checked yet"
      : fresh ? newCountText(fresh) + " · checked " + whenText(entry.at)
      : "None yet · checked " + whenText(entry.at);
    const btn = el("button", { class: "chip", type: "button", onclick: () => {
      if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
      checkNew(name, false);
    } }, "Check");
    btn.disabled = busy;
    // From a story page, the new ones are saved straight from its list,
    // each at its place among those already saved.
    const take = entry && entry.all && fresh ? el("button", { class: "chip on save-new", type: "button", onclick: () => {
      if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
      saveAll(entry.all, name, [], undefined, true, undefined, folderSource(list));
    } }, "Save " + fresh) : null;
    return el("div", { class: "rc-row check-new" },
      el("span", { class: "rc-label" }, "New chapters"),
      el("div", { class: "chips" },
        el("span", { class: "check-note" + (fresh ? " accent" : ""), role: "status" }, note), take, btn));
  }

  // ---- The folder's Chapters panel (0.26.0) ----
  // Everything about a series in one place: new chapters, saving earlier
  // or later ones, the story page it's linked to, and saving the saved
  // ones again.
  function chaptersPanel(list) {
    const rows = [checkRow(list), followControls(list[0], true), followControls(list[list.length - 1])].filter(Boolean);
    return el("div", { class: "folder-actions chapters-panel" },
      rows.length ? el("div", { class: "chapter-tools" }, ...rows)
        : el("p", { class: "meta" }, "These pages don't link to each other, so there's nothing to look for. Link the collection to its story page below."),
      sourceSection(list));
  }

  function sourceSection(list) {
    const name = state.folder;
    const src = folderSource(list);
    const input = el("input", { class: "tag-input source-input", type: "url", inputmode: "url", value: src,
      placeholder: "The story's page, with its chapter list", "aria-label": "Story page", autocapitalize: "off", spellcheck: "false" });
    const link = el("button", { class: "btn-quiet source-link", type: "button", onclick: async () => {
      const u = linkFrom(input.value);
      if (!u) { toast("Paste the link to the story's page."); return; }
      if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
      link.disabled = true;
      link.textContent = "Reading…";
      try {
        const found = await C.save.findChapters(u);
        if (!found.links.length) { toast("Couldn't find a list of chapters on that page."); return; }
        setSource(name, u, found.cover || "");
        toast("Linked to " + countLine(found.links.length).replace("page", "chapter") + " on " + C.save.siteName(u));
      } catch (e) {
        toast(e instanceof C.save.SaveError ? e.message : "Couldn't read that page. Try again.");
      } finally {
        if (link.isConnected) { link.disabled = false; link.textContent = src ? "Change" : "Link"; }
      }
    } }, src ? "Change" : "Link");
    const unlink = src ? el("button", { class: "btn-quiet source-unlink", type: "button", onclick: () => { setSource(name, ""); toast("Unlinked " + name); } }, "Unlink") : null;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); link.click(); } });
    return el("section", { class: "settings-section source-section" },
      el("h2", { class: "overline" }, "Story page"),
      el("div", { class: "source-row" }, input, link, unlink),
      el("p", { class: "footnote" }, "New chapters are read from its chapter list, which also finds chapters added in between."));
  }

  async function setSource(name, url, cover) {
    for (const p of folderPages(name)) { if (url) p.source = url; else delete p.source; }
    setNewFor(name, null);
    await C.store.writeIndex(state.pages);
    renderFolder();
    renderLibrary();
    if (url) updateCover(name, cover);
  }

  // Keeps a linked collection's cover (its story page's picture) in step:
  // `url` when the page was just read, else the page is read for it.
  // Once per session for a collection that has none.
  const coverTried = new Set();
  async function updateCover(name, url) {
    const list = folderPages(name);
    const src = folderSource(list);
    if (!list.length || !src) return;
    if (url === undefined) {
      const key = String(name).toLowerCase();
      if (coverTried.has(key) || !navigator.onLine || list.some((p) => p.cover)) return;
      coverTried.add(key);
      try { url = (await C.save.findChapters(src)).cover || ""; } catch (e) { return; }
    }
    if (!url || list.some((p) => p.coverFrom === url && p.cover)) return;
    const cover = await C.save.keepCover(url, src);
    for (const p of folderPages(name)) { p.cover = cover; p.coverFrom = url; }
    await C.store.writeIndex(state.pages);
    if (state.folder && sameTag(state.folder, name)) renderFolder();
    renderLibrary();
  }

  // Saves the folder's pages again where they are, to switch their
  // pictures or pick up an author's edits; each keeps its place, tags
  // and read position. Started from What's saved.
  // Each page is a job that knows the page it replaces, in a run of its
  // own, so it shows in Downloads with Pause and Stop like any other.
  async function refreshFolder(name, mode, btn) {
    const list = folderPages(name).filter((p) => /^https?:/.test(p.url || ""));
    if (!list.length || !navigator.onLine) { if (!navigator.onLine) toast("You're offline. Try again when you're back online."); return; }
    btn.disabled = true;
    const run = startRun(folderName(name), list[0].site, list.length, true);
    const jobs = list.map((old) => ({ ...newJob(old.url, name), key: "again:" + old.id, again: old, mode, kind: old.comic ? "comic" : "article", waiting: true, run }));
    state.saving = [...jobs, ...state.saving];
    renderLibrary();
    toast("Saving " + countLine(list.length) + " again. They're in Downloads.");
    let done = 0, failed = 0, stopped = 0;
    for (const job of jobs) {
      if (done + failed) await new Promise((ok) => setTimeout(ok, PACE_MS));
      if (!(await gate(run)) || !state.saving.includes(job)) { stopped++; continue; }
      job.waiting = false;
      run.current = job;
      renderLibrary();
      if (await runJob(job)) { done++; run.saved++; } else { failed++; run.failed++; }
      run.current = null;
      updateRunCard(run);
    }
    endRun(run);
    if (state.folder && sameTag(state.folder, name)) renderFolder();
    renderLibrary();
    toast("Saved " + countLine(done) + " again" + (failed ? " · " + failed + " couldn't be saved" : "") + (stopped ? " · stopped before " + countLine(stopped) : "") + ".");
  }

  function whenText(at) {
    const mins = Math.round((Date.now() - at) / 6e4);
    if (mins < 2) return "just now";
    if (mins < 60) return mins + " min ago";
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + " h ago";
    const days = Math.round(hours / 24);
    return days === 1 ? "yesterday" : days + " days ago";
  }

  // Once a day per series folder, after the library is up and online,
  // one folder at a time, quietly.
  let dailyRunning = false;
  async function dailyCheck(force) {
    if (dailyRunning || !navigator.onLine || (!force && !load(DAILY_KEY, true))) return 0;
    dailyRunning = true;
    let found = 0;
    try {
      for (const name of allFolders()) {
        if (!isSeries(folderPages(name))) continue;
        const entry = newFor(name);
        if (!force && entry && Date.now() - entry.at < DAY) continue;
        const n = await checkNew(name, true);
        if (n) found++;
      }
    } finally {
      dailyRunning = false;
    }
    return found;
  }

  // Renamed in place on the book page; the new-chapters entry follows.
  async function renameFolder(raw) {
    const old = state.folder;
    const name = cleanTag(raw || "");
    if (!name) { toast("Type a name for the collection."); return false; }
    if (name === old) return true;
    const clash = allFolders().find((n) => sameTag(n, name) && !sameTag(n, old));
    if (clash) { toast("There's already a collection called " + clash + "."); return false; }
    for (const p of folderPages(old)) p.folder = name;
    const entry = newFor(old);
    if (entry && !sameTag(old, name)) { setNewFor(name, entry); setNewFor(old, null); }
    await C.store.writeIndex(state.pages);
    state.folder = name;
    history.replaceState({ view: "folder", folder: name }, "");
    renderLibrary();
    return true;
  }

  // ---- Feeds (0.28.0) ----
  // Following a site: its feed is read every few hours while the app is
  // open and online, and its posts wait in one river, newest day first,
  // until they're saved, or save themselves where the feed is set to. A
  // post stays in the river (as Saved, once saved) until it's older than
  // its feed's window. Feeds are kept in localStorage as [{ url, title,
  // link, icon, mode: "show" | "save", images, folder, days, addedAt,
  // checkedAt, error, items: [{ id, url, title, date, foundAt, tried }] }].
  const FEEDS_KEY = "carryon.feeds";
  const PLACE_KEY = "carryon.place";
  const FEEDS_SEEN_KEY = "carryon.feedsSeen";
  const FEEDS_ASKED_KEY = "carryon.feedsAsked";
  const FEED_EVERY = 3 * 36e5;
  const FEED_KEEP = 100;
  const FEED_DAYS = [{ value: "3", label: "3 days" }, { value: "7", label: "A week" }, { value: "30", label: "A month" }];
  const FEED_ICONS = {
    library: ICONS.book,
    feeds: '<path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.5"/>',
    add: ICONS.add,
    out: ICONS.original,
  };
  const feedIcon = (name, size = 20) => {
    const s = el("span", { class: "side-icon", "aria-hidden": "true" });
    s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + FEED_ICONS[name] + "</svg>";
    return s;
  };

  let feeds = load(FEEDS_KEY, []);
  if (!Array.isArray(feeds)) feeds = [];
  state.place = load(PLACE_KEY, "library") === "feeds" ? "feeds" : "library";
  // The feed picked in the river (its url), or null for all of them.
  state.feed = null;
  state.side = false;
  let feedsChecking = false;

  const saveFeeds = () => { store(FEEDS_KEY, feeds); watchFeeds(); updateWidgets(); };
  // What the closed app's checks compare with: every post each feed has.
  let watchTimer = null, askToNotify = false;
  function watchFeeds() {
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      const list = feeds.map((f) => ({ url: f.url, title: f.title, known: [...new Set(f.items.flatMap((it) => [it.id, it.url]).filter(Boolean))] }));
      C.platform.feedChecks.watch(list, askToNotify && list.length > 0);
      askToNotify = false;
    }, 1000);
  }
  const postAt = (it) => it.date || it.foundAt || 0;
  const postKey = (it) => it.id || it.url;
  const inWindow = (f, it) => postAt(it) >= Date.now() - (f.days || 7) * DAY;
  const feedPosts = (f) => f.items.filter((it) => inWindow(f, it));
  const savingUrl = (url) => state.saving.some((s) => !s.error && sameUrl(s.url, url));
  const waitingIn = (f) => feedPosts(f).filter((it) => !savedAs(it.url)).length;
  // New since Feeds was last looked at, for the sidebar's pill.
  const freshPosts = () => {
    const seen = load(FEEDS_SEEN_KEY, 0);
    return feeds.reduce((n, f) => n + feedPosts(f).filter((it) => it.foundAt > seen && !savedAs(it.url)).length, 0);
  };

  // The feed's site icon, or its first letter, like a card with no picture.
  function feedMark(f, small) {
    const url = f.link || f.url;
    const box = siteMark({ site: C.feeds.siteOf(url) || f.title, icon: f.icon, url });
    box.className = "site-mark feed-mark" + (small ? " small" : "");
    return box;
  }

  // "About 2 posts a day · last one 2 h ago", from the posts' dates.
  function rateLine(items) {
    const ds = items.map((it) => it.date).filter(Boolean).sort((a, b) => b - a);
    if (!ds.length) return items.length ? countLine(items.length).replace("page", "post") : "No posts yet";
    const last = whenText(ds[0]);
    if (ds.length < 2) return "Last post " + last;
    const perDay = (ds.length - 1) / Math.max((ds[0] - ds[ds.length - 1]) / DAY, 1 / 24);
    const perWeek = perDay * 7;
    const rate = perDay >= 1.5 ? "About " + Math.round(perDay) + " posts a day"
      : perDay >= 0.75 ? "About a post a day"
      : perWeek >= 1.5 ? "About " + Math.round(perWeek) + " posts a week"
      : perWeek >= 0.75 ? "About a post a week" : "A post now and then";
    return rate + " · last one " + last;
  }

  // Today, Yesterday, a weekday this week, then the date.
  function dayName(t) {
    const start = new Date().setHours(0, 0, 0, 0);
    if (t >= start) return "Today";
    if (t >= start - DAY) return "Yesterday";
    const d = new Date(t);
    if (t >= start - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  }

  // A feed's posts after a check: what it lists now, with when each was
  // first seen kept, plus earlier posts it dropped while they're still
  // inside the window.
  function mergeFeed(f, got) {
    const now = Date.now();
    const had = new Map(f.items.map((it) => [postKey(it), it]));
    const items = got.items.map((it) => {
      const old = had.get(postKey(it));
      const out = { id: it.id, url: it.url, title: it.title, date: it.date, foundAt: old ? old.foundAt : now };
      if (old && old.tried) out.tried = true;
      return out;
    });
    const now_ = new Set(items.map(postKey));
    for (const old of f.items) if (!now_.has(postKey(old)) && inWindow(f, old)) items.push(old);
    f.items = items.sort((a, b) => postAt(b) - postAt(a)).slice(0, FEED_KEEP);
    if (got.icon) f.icon = got.icon;
    if (got.link) f.link = got.link;
  }

  // Feeds from a backup: one not followed here is followed again, with its
  // posts; one followed already keeps its settings here. Returns how
  // many were added.
  function restoreFeeds(list) {
    let added = 0;
    for (const f of list || []) {
      if (feeds.some((h) => sameUrl(h.url, f.url))) continue;
      feeds.push(f);
      added++;
    }
    if (added) {
      saveFeeds();
      paintFeeds();
      setTimeout(() => checkFeeds(), 0);
    }
    return added;
  }

  // ---- Home screen widgets (0.29.0, Android) ----
  // Keep reading shows the page read last that isn't finished (or the
  // last one at all); Feeds the three newest posts not saved yet. Handed
  // over whenever the app goes to the background, and after changes.
  let widgetTimer = null;
  function updateWidgets() {
    clearTimeout(widgetTimer);
    widgetTimer = setTimeout(() => {
      const read = state.pages.filter((p) => p.readAt).sort((a, b) => b.readAt - a.readAt);
      const p = read.find((x) => !x.finished) || read[0];
      const posts = feeds.flatMap((f) => feedPosts(f).filter((it) => !savedAs(it.url)).map((it) => ({ f, it })))
        .sort((a, b) => postAt(b.it) - postAt(a.it)).slice(0, 3)
        .map(({ f, it }) => ({ title: it.title, site: f.title, url: it.url, feed: f.url }));
      C.platform.widgets.update({
        reading: p ? { id: p.id, title: p.title, at: p.at || 0,
          meta: [p.site, (p.at || 0) >= 0.995 ? "Finished" : Math.max(1, Math.ceil((p.minutes || 1) * (1 - (p.at || 0)))) + " min left"].filter(Boolean).join(" · ") } : null,
        feeds: { following: feeds.length > 0, fresh: freshPosts(), posts },
      });
    }, 800);
  }

  // A widget's tap: the page to keep reading, a post, or Feeds.
  async function takeWidget() {
    const got = await C.platform.widgets.take();
    if (!got || !got.kind) return;
    await toLibrary();
    if (got.kind === "page" && state.pages.some((p) => p.id === got.id)) { openPage(got.id); return; }
    if (got.kind === "post" && got.url) {
      await goPlace("feeds");
      const f = feeds.find((x) => x.items.some((it) => it.url === got.url));
      const saved = savedAs(got.url);
      if (saved) openPage(saved.id);
      else if (f) previewPost(f, f.items.find((it) => it.url === got.url));
      return;
    }
    if (got.kind === "feeds" || got.kind === "library") await goPlace(got.kind);
  }

  // Posts found with the app closed: those feeds are read again now, and
  // the notification's tap opens Feeds.
  async function takeFeedNews() {
    const news = await C.platform.feedChecks.news();
    if (news.open) {
      await toLibrary();
      if (state.place !== "feeds" || state.feed) await goPlace("feeds");
    }
    let due = false;
    for (const url of news.feeds) {
      const f = feeds.find((x) => x.url === url);
      if (f) { f.checkedAt = 0; due = true; }
    }
    if (due) checkFeeds(false);
  }

  // One feed read again; a feed set to save its posts saves the new ones.
  async function checkFeed(f) {
    let got = null, error = "";
    try { got = await C.feeds.readFeed(f.url); }
    catch (e) { error = e instanceof C.feeds.FeedError ? e.message : "Couldn't check this feed. Try again later."; }
    if (!feeds.includes(f)) return;
    if (got) mergeFeed(f, got);
    f.error = error;
    f.checkedAt = Date.now();
    saveFeeds();
    paintFeeds();
    if (got && f.mode === "save") autoSave(f);
  }

  // Every feed not checked in the last few hours, one at a time, quietly.
  async function checkFeeds(force) {
    if (feedsChecking || !navigator.onLine || !feeds.length) return;
    feedsChecking = true;
    paintFeeds();
    try {
      for (const f of [...feeds]) {
        if (!force && f.checkedAt && Date.now() - f.checkedAt < FEED_EVERY) continue;
        await checkFeed(f);
      }
    } finally {
      feedsChecking = false;
      paintFeeds();
    }
  }

  // Saves run one feed after another, so two feeds saving at once don't
  // interleave their runs.
  let feedSaves = Promise.resolve();
  function autoSave(f) {
    const todo = feedPosts(f).filter((it) => !it.tried && !savedAs(it.url) && !savingUrl(it.url));
    if (!todo.length) return;
    todo.forEach((it) => { it.tried = true; });
    saveFeeds();
    saveFeedPosts(todo.map((it) => ({ f, it })));
  }

  // Into each post's feed's collection, oldest first so the collection
  // reads in order, with the feed's pictures setting.
  function saveFeedPosts(list) {
    if (!navigator.onLine) { toast("You're offline. Save these when you're back online."); return feedSaves; }
    const by = new Map();
    for (const x of [...list].sort((a, b) => postAt(a.it) - postAt(b.it))) {
      if (savedAs(x.it.url) || savingUrl(x.it.url)) continue;
      if (!by.has(x.f)) by.set(x.f, []);
      by.get(x.f).push(x.it.url);
    }
    for (const [f, urls] of by) {
      const folder = f.folder ? folderName(f.folder) : null;
      const how = { mode: C.platform.native ? f.images || load(IMAGES_KEY, "previews") : undefined };
      feedSaves = feedSaves.then(() => urls.length === 1 ? savePage(urls[0], folder || undefined, how)
        : saveAll(urls, folder, [], how.mode, true)).then(paintFeeds, paintFeeds);
    }
    paintFeeds();
    return feedSaves;
  }

  function paintFeeds() {
    if (state.place === "feeds") renderFeeds();
    if (state.side) renderSide();
    if (state.menu && state.menu.kind === "feed") redrawMenu();
  }

  // Library or Feeds under the same bar; only the title changes.
  function paintPlace() {
    const feedsOn = state.place === "feeds";
    $("placeTitle").textContent = feedsOn ? "Feeds" : "Library";
    $("libraryView").dataset.place = state.place;
    $("library").hidden = feedsOn;
    $("feeds").hidden = !feedsOn;
    // The bottom field follows a feed in Feeds, and saves a link elsewhere.
    $("saveUrl").placeholder = feedsOn ? "Paste a site or feed to follow" : "Paste a link to save";
    document.querySelector('label[for="saveUrl"]').textContent = feedsOn ? "Site or feed" : "Page link";
    $("saveForm").querySelector(".btn-primary").textContent = feedsOn ? "Follow" : "Save";
    $("severalBtn").hidden = feedsOn;
    if (feedsOn) { if (state.query) clearSearch(); renderFeeds(); }
    else renderLibrary();
  }

  function goPlace(place, feed) {
    state.place = place;
    state.feed = feed || null;
    store(PLACE_KEY, place);
    const done = state.side ? back() : Promise.resolve();
    paintPlace();
    scrollTo(0, 0);
    return done;
  }

  function pickFeed(url) {
    state.feed = url;
    renderFeeds();
  }

  function renderFeeds() {
    const root = $("feeds");
    const picked = state.feed && feeds.find((f) => f.url === state.feed);
    if (state.feed && !picked) state.feed = null;
    if (document.visibilityState !== "hidden") store(FEEDS_SEEN_KEY, Date.now());
    const active = document.activeElement && root.contains(document.activeElement)
      ? [document.activeElement.closest("[data-key]"), document.activeElement.className] : null;
    const chipsAt = root.querySelector(".feed-chips");
    const scrollX = chipsAt ? chipsAt.scrollLeft : 0;
    const nodes = [];
    if (!feeds.length) {
      nodes.push(el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, "Follow the sites you read"),
        el("p", { class: "empty-text" }, C.platform.native
          ? "Add a site and its new posts wait here for you to save, or save themselves."
          : "Add a site and its new posts wait here. Most sites only let Carry-on on your phone read their feed."),
        el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addFeed") }, "Add a feed")));
      root.replaceChildren(...nodes);
      return;
    }
    const chip = (label, n, on, onclick, key) => {
      const b = el("button", { class: "chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), "data-key": key, onclick },
        el("span", { class: "chip-label", dir: "auto" }, label), n ? " · " + n : null);
      return b;
    };
    const all = feeds.reduce((n, f) => n + waitingIn(f), 0);
    nodes.push(el("div", { class: "chips filters feed-chips", role: "group", "aria-label": "Feeds" },
      chip("All", all, !picked, () => pickFeed(null), "chip:all"),
      ...feeds.map((f) => {
        const c = chip(f.title, waitingIn(f), picked === f, () => pickFeed(f.url), "chip:" + f.url);
        c.dataset.feed = f.url;
        return c;
      })));
    const checked = Math.max(0, ...(picked ? [picked] : feeds).map((f) => f.checkedAt || 0));
    const line = feedsChecking ? "Checking…" : picked && picked.error ? picked.error
      : checked ? "Checked " + whenText(checked) : "Not checked yet";
    nodes.push(el("div", { class: "feed-head" },
      el("p", { class: "meta" + (picked && picked.error && !feedsChecking ? " warn" : "") }, line),
      // Phones pull down to check; a pointer gets the button.
      el("button", { class: "btn-text feed-check", type: "button", "data-key": "check", onclick: () => checkNow(picked) }, "Check now")));
    const list = (picked ? [picked] : feeds).flatMap((f) => feedPosts(f).map((it) => ({ f, it })))
      .sort((a, b) => postAt(b.it) - postAt(a.it));
    let day = null, group = null;
    for (const x of list) {
      const d = dayName(postAt(x.it));
      if (d !== day) {
        day = d;
        const open = list.filter((y) => dayName(postAt(y.it)) === d && !savedAs(y.it.url) && !savingUrl(y.it.url));
        nodes.push(sectionHead(d, open.length > 1
          ? el("button", { class: "btn-text", type: "button", "data-key": "all:" + d, onclick: () => saveFeedPosts(open) }, "Save all " + open.length) : null));
        group = el("div", { class: "group feed-group" });
        nodes.push(group);
      }
      group.append(postRow(x.f, x.it, !picked));
    }
    if (!list.length) {
      const days = (picked || feeds[0]).days || 7;
      nodes.push(el("div", { class: "empty" },
        el("p", { class: "empty-text" }, (picked && picked.error) || (!checked ? "Its posts show up after the first check."
          : "Nothing posted in the last " + (FEED_DAYS.find((o) => o.value === String(days)) || FEED_DAYS[1]).label.replace(/^A /, "").toLowerCase() + "."))));
    }
    root.replaceChildren(...nodes);
    const chips = root.querySelector(".feed-chips");
    if (chips) chips.scrollLeft = scrollX;
    if (active && active[0]) {
      const again = root.querySelector('[data-key="' + CSS.escape(active[0].dataset.key) + '"]');
      const cls = String(active[1]).split(" ")[0];
      const target = again && cls && (again.classList.contains(cls) ? again : again.querySelector("." + cls));
      if (target) target.focus({ preventScroll: true });
    }
  }

  async function checkNow(f) {
    if (!navigator.onLine) { toast("You're offline. Check again when you're back online."); return; }
    if (f) { feedsChecking = true; paintFeeds(); try { await checkFeed(f); } finally { feedsChecking = false; paintFeeds(); } }
    else await checkFeeds(true);
  }

  // A post: a tap opens it (the saved copy, or the original online); +
  // saves it into its feed's collection.
  function postRow(f, it, withFeed) {
    const saved = savedAs(it.url);
    const busy = !saved && savingUrl(it.url);
    const when = whenText(postAt(it));
    const open = () => (saved ? openPage(saved.id) : previewPost(f, it));
    const outside = el("button", { class: "post-act", type: "button", "aria-label": "Open " + it.title + " in the browser",
      onclick: () => C.platform.openOutside(it.url) }, feedIcon("out", 18));
    let right;
    if (saved) right = el("span", { class: "post-saved" }, "Saved");
    else {
      right = el("button", { class: "post-act post-save", type: "button", "aria-label": busy ? "Saving " + it.title : "Save " + it.title,
        onclick: () => saveFeedPosts([{ f, it }]) });
      if (busy) { right.disabled = true; right.append(el("span", { class: "spinner", "aria-hidden": "true" })); }
      else right.append(feedIcon("add", 18));
    }
    return el("div", { class: "post", "data-key": "post:" + f.url + " " + postKey(it) },
      el("button", { class: "post-open", type: "button", "aria-label": (saved ? "Read " : "Open ") + it.title, onclick: open }),
      withFeed ? feedMark(f) : null,
      el("span", { class: "post-body" },
        withFeed ? el("span", { class: "post-feed", dir: "auto" }, f.title) : null,
        el("span", { class: "post-title", dir: "auto" }, it.title),
        el("span", { class: "post-meta" }, saved ? readingLine(saved) + " · " + when : when)),
      outside, right);
  }

  // A post read in the app without saving it: the reader shows it, and
  // its ⋯ offers Save and the browser.
  let previewing = null;
  async function previewPost(f, it) {
    if (!navigator.onLine) { toast("You're offline. Save posts while you're online to read them here."); return; }
    if (previewing) return;
    previewing = it.url;
    toast("Opening…");
    let got;
    try { got = await C.save.preview(it.url); }
    catch (e) {
      toast(e instanceof C.save.SaveError ? e.message : C.platform.canFetchPages
        ? "Couldn't open that post. Try the browser button." : "This browser can't reach that site. Try the browser button.");
      return;
    } finally { previewing = null; }
    got.meta.feed = f.url;
    got.meta.post = it.url;
    history.pushState(readerState(got.meta), "");
    const shown = show(got.meta, got.html);
    pushScreen($("readerView"));
    await shown;
    $("readerFrame").focus();
  }

  function previewSheet(p) {
    const f = feeds.find((x) => x.url === p.feed);
    const saved = savedAs(p.post) || savedAs(p.url);
    return el("div", { class: "page-controls" },
      el("div", { class: "menu-head" },
        el("p", { class: "menu-title", dir: "auto" }, p.title),
        el("p", { class: "meta" }, [p.site, p.minutes + " min", "Not saved"].join(" · "))),
      el("div", { class: "tile-row" },
        tileButton("add", saved ? "Saved" : "Save", saved ? () => {} : () => {
          if (f) saveFeedPosts([{ f, it: { url: p.post, date: Date.now() } }]);
          else savePage(p.url);
          history.back();
        }),
        tileButton("original", "Browser", () => C.platform.openOutside(p.url))));
  }

  // ---- The sidebar ----
  // Library with its collections under it, then Feeds with its feeds,
  // from the bar's menu button, over a dimmed screen in its own history
  // entry. Each list shows the three touched last (0.28.1).
  const SIDE_MAX = 3;
  function sideCover(name) {
    const list = folderPages(name);
    const src = coverUrl(list) || list.map(thumbUrl).find(Boolean);
    const box = el("span", { class: "side-cover", "aria-hidden": "true" });
    if (src) box.append(el("img", { src, alt: "", loading: "lazy" }));
    return box;
  }

  function openFromSide(name) {
    return back().then(() => {
      if (state.place !== "library") { state.place = "library"; store(PLACE_KEY, "library"); paintPlace(); }
      openFolder(name);
    });
  }

  const withFeed = (node, f) => { node.dataset.feed = f.url; return node; };

  function renderSide() {
    const item = (icon, label, on, extra, onclick, cls) => {
      const b = el("button", { class: "side-item" + (cls ? " " + cls : ""), type: "button", onclick }, icon,
        el("span", { class: "side-label", dir: "auto" }, label), extra || null);
      if (on) b.setAttribute("aria-current", "page");
      return b;
    };
    const count = (n, cls) => (n ? el("span", { class: cls || "side-n" }, String(n)) : null);
    const fresh = freshPosts();
    const inFeeds = state.place === "feeds";
    const latest = (f) => Math.max(0, ...f.items.map(postAt));
    fill($("sidebar"),
      el("p", { class: "side-title" }, "Carry-on"),
      item(feedIcon("library"), "Library", !inFeeds, count(state.pages.length, "side-count"), () => goPlace("library")),
      ...foldersByUse().slice(0, SIDE_MAX).map((name) =>
        item(sideCover(name), name, false, count(freshCount(name)), () => openFromSide(name), "side-sub")),
      el("hr", { class: "side-line" }),
      item(feedIcon("feeds"), "Feeds", inFeeds && !state.feed, fresh ? el("span", { class: "side-pill" }, fresh + " new") : null,
        () => goPlace("feeds")),
      ...[...feeds].sort((a, b) => latest(b) - latest(a)).slice(0, SIDE_MAX).map((f) =>
        withFeed(item(feedMark(f, true), f.title, inFeeds && state.feed === f.url, count(waitingIn(f)), () => goPlace("feeds", f.url), "side-sub"), f)),
      item(feedIcon("add"), "Add a feed", false, null, () => back().then(() => openMenu("addFeed")), "side-sub side-add"));
  }

  function openSide() {
    if (state.side) return;
    state.side = true;
    history.pushState({ view: "side" }, "");
    renderSide();
    const side = $("sidebar");
    $("libraryView").inert = true;
    $("sideBtn").setAttribute("aria-expanded", "true");
    side.style.pointerEvents = "";
    $("sideCatch").hidden = false;
    side.hidden = false;
    M.arrive($("sideCatch"), 0);
    M.slideIn(side);
    const at = side.querySelector("[aria-current]") || side.querySelector("button");
    if (at) at.focus({ preventScroll: true });
  }

  function closeSide() {
    if (!state.side) return;
    state.side = false;
    sideByBack = false;
    const side = $("sidebar"), catcher = $("sideCatch");
    const had = side.contains(document.activeElement);
    $("libraryView").inert = false;
    $("sideBtn").setAttribute("aria-expanded", "false");
    side.style.pointerEvents = "none";
    M.leave(catcher).then(() => { if (!state.side) catcher.hidden = true; });
    M.slideOut(side).then(() => { if (!state.side) side.hidden = true; });
    if (had) $("sideBtn").focus({ preventScroll: true });
  }

  // ---- Gestures (0.28.2) ----

  // Holding a feed (its chip, or its row in the sidebar), or right-clicking
  // it, opens its settings.
  function holdFeeds(root) {
    let timer = null, start = null, fired = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const open = (node) => {
      const f = feeds.find((x) => x.url === node.dataset.feed);
      if (!f) return;
      if (navigator.vibrate) navigator.vibrate(10);
      (state.side ? back() : Promise.resolve()).then(() => openMenu("feed", f));
    };
    root.addEventListener("pointerdown", (e) => {
      fired = false;
      const node = e.button === 0 && e.target.closest("[data-feed]");
      if (!node) return;
      start = { x: e.clientX, y: e.clientY };
      cancel();
      timer = setTimeout(() => { timer = null; fired = true; open(node); }, 480);
    });
    root.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(t, cancel);
    root.addEventListener("click", (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
    root.addEventListener("contextmenu", (e) => {
      const node = e.target.closest("[data-feed]");
      if (!node) return;
      e.preventDefault();
      cancel();
      if (!fired) { fired = true; open(node); }
    });
  }

  // Android's Back in Library or Feeds opens the sidebar (0.29.0), and Back
  // again with it open that way puts the app away. Anywhere else Back
  // steps back through history as before.
  let sideByBack = false;
  const backOpens = C.platform.onBack(({ canGoBack }) => {
    if (state.side && sideByBack) { C.platform.exitApp(); return; }
    if (canGoBack && history.state && history.state.view) { history.back(); return; }
    if (!state.side) { openSide(); sideByBack = true; return; }
    C.platform.exitApp();
  });

  // Where there's no Back to use (iOS, a browser), a swipe to the right
  // from the left edge opens it. Rows that scroll sideways keep theirs.
  const EDGE = 24;
  function swipeToSide(root) {
    if (backOpens) return;
    let start = null;
    root.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= EDGE && !state.select && !state.menu && !state.side
        && !e.target.closest(".filters, .folder-strip, input, textarea, .drag-handle") ? { x: t.clientX, y: t.clientY } : null;
    }, { passive: true });
    root.addEventListener("touchmove", (e) => {
      if (!start) return;
      const t = e.touches[0], dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
      if (dy > 24 || dx < -24) { start = null; return; }
      if (dx > 64 && dy < dx / 2) { start = null; openSide(); }
    }, { passive: true });
    root.addEventListener("touchend", () => { start = null; }, { passive: true });
  }

  // Pulling down from the top checks for what's new: in Feeds the feeds
  // on show (all, or the picked one), in the library every collection
  // that follows a series, for new chapters.
  const PULL_AT = 64;
  function pullToCheck(root) {
    const hint = $("pullHint");
    let start = null, pulled = 0;
    const set = (h, settle) => {
      hint.classList.toggle("settle", !!settle && !M.reduced());
      hint.style.height = h + "px";
      hint.classList.toggle("ready", h >= PULL_AT);
    };
    root.addEventListener("touchstart", (e) => {
      start = !feedsChecking && !dailyRunning && scrollY <= 0 && e.touches.length === 1 && !state.side && !state.menu
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      pulled = 0;
    }, { passive: true });
    root.addEventListener("touchmove", (e) => {
      if (!start) return;
      const t = e.touches[0], dy = t.clientY - start.y, dx = Math.abs(t.clientX - start.x);
      if (dy < 0 || (pulled === 0 && dx > dy)) { start = null; if (pulled) set(0, true); pulled = 0; return; }
      pulled = Math.min(PULL_AT * 1.4, dy * 0.5);
      hint.hidden = false;
      set(pulled);
    }, { passive: true });
    root.addEventListener("touchend", () => {
      if (!start) return;
      start = null;
      if (pulled < PULL_AT) { set(0, true); pulled = 0; return; }
      pulled = 0;
      set(48, true);
      hint.classList.add("busy");
      const picked = state.feed && feeds.find((f) => f.url === state.feed);
      const done = () => { hint.classList.remove("busy"); set(0, true); };
      if (state.place === "feeds") { checkNow(picked || null).finally(done); return; }
      checkChapters().finally(done);
    }, { passive: true });
  }

  async function checkChapters() {
    if (!navigator.onLine) { toast("You're offline. Check again when you're back online."); return; }
    if (!allFolders().some((n) => isSeries(folderPages(n)))) { toast("No collections follow a series yet."); return; }
    const found = await dailyCheck(true);
    renderLibrary();
    toast(found ? "New chapters in " + found + (found === 1 ? " collection" : " collections") + "." : "No new chapters.");
  }

  // ---- Add a feed, and a feed's settings ----

  const picturesLine = (mode) => !C.platform.native ? ""
    : mode === "full" ? ", with full pictures" : mode === "links" ? ", with pictures as links" : ", with pictures as previews";

  function addFeedSheet() {
    let found = null, mode = "show";
    const input = el("input", { class: "feed-input", type: "url", inputmode: "url", placeholder: "A site or its feed", "aria-label": "A site or its feed",
      autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "go" });
    const help = el("p", { class: "footnote" }, "A site's address is enough: Carry-on finds its feed.");
    const card = el("div", { class: "found-feed" });
    const note = el("p", { class: "footnote" });
    const modeBox = el("div", { class: "feed-mode" },
      el("h2", { class: "overline" }, "New posts"),
      seg("add-feed-mode", "New posts", [{ value: "show", label: "Show them" }, { value: "save", label: "Save them" }], mode,
        (v) => { mode = v; paintNote(); }),
      note);
    const go = el("button", { class: "btn-primary", type: "button" }, "Find its feed");
    const paintNote = () => {
      if (!found) return;
      note.textContent = (mode === "save" ? "New posts save themselves while you're online. " : "New posts wait in Feeds for you to save. ")
        + "Saved posts go into a collection called " + cleanTag(found.feed.title) + picturesLine(load(IMAGES_KEY, "previews")) + ".";
    };
    const reset = () => {
      found = null;
      card.hidden = true;
      modeBox.hidden = true;
      go.textContent = "Find its feed";
      help.className = "footnote";
      help.textContent = "A site's address is enough: Carry-on finds its feed.";
    };
    reset();
    const find = async () => {
      const typed = input.value.trim();
      if (!typed) { input.focus(); return; }
      go.disabled = true;
      go.textContent = "Looking for its feed…";
      try {
        const got = await C.feeds.findFeed(linkFrom(typed) || typed);
        const had = feeds.find((f) => sameUrl(f.url, got.url));
        if (had) throw new C.feeds.FeedError("You already follow " + had.title + ".");
        if (input.value.trim() !== typed) return;
        found = got;
        fill(card, feedMark({ url: got.url, link: got.feed.link, icon: got.feed.icon, title: got.feed.title }),
          el("span", { class: "found-text" },
            el("span", { class: "found-name", dir: "auto" }, got.feed.title),
            el("span", { class: "meta" }, rateLine(got.feed.items))));
        card.hidden = false;
        modeBox.hidden = false;
        help.className = "footnote";
        help.textContent = C.feeds.siteOf(got.url) + " · " + (got.feed.items.length === 1 ? "1 post" : got.feed.items.length + " posts") + " in its feed";
        go.textContent = "Follow";
        paintNote();
      } catch (e) {
        reset();
        help.className = "footnote warn";
        help.textContent = e instanceof C.feeds.FeedError ? e.message : "Couldn't read that. Check the address and try again.";
      } finally {
        go.disabled = false;
      }
    };
    const follow = async () => {
      const got = found;
      const f = { url: got.url, title: cleanTag(got.feed.title) || C.feeds.siteOf(got.url), link: got.feed.link, icon: got.feed.icon,
        mode, images: load(IMAGES_KEY, "previews"), folder: cleanTag(got.feed.title) || C.feeds.siteOf(got.url), days: 7,
        addedAt: Date.now(), checkedAt: Date.now(), error: "", items: [] };
      mergeFeed(f, got.feed);
      feeds.push(f);
      askToNotify = true;
      saveFeeds();
      await back();
      await goPlace("feeds", f.url);
      toast("Following " + f.title);
      if (mode === "save") autoSave(f);
    };
    go.addEventListener("click", () => (found ? follow() : find()));
    input.addEventListener("input", () => { if (found) reset(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
    const preset = state.menu && state.menu.page && state.menu.page.url;
    if (preset) { input.value = preset; setTimeout(find, 0); }
    else setTimeout(() => input.focus({ preventScroll: true }), 50);
    return el("div", { class: "page-controls add-feed" },
      el("h2", { class: "menu-title" }, "Add a feed"),
      el("div", { class: "feed-field" }, input, help),
      card, modeBox, go);
  }

  function feedSheet() {
    const f = state.menu.page;
    const set = (change) => { Object.assign(f, change); saveFeeds(); if (state.place === "feeds") renderFeeds(); };
    const row = (label, control) => el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, label), control);
    const into = el("input", { class: "tag-input", type: "text", value: f.folder || "", placeholder: "No collection", "aria-label": "Save into",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
    into.addEventListener("change", () => set({ folder: cleanTag(into.value) }));
    into.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); into.blur(); } });
    const shortUrl = f.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    return el("div", { class: "page-controls feed-sheet" },
      el("div", { class: "menu-head" },
        el("p", { class: "menu-title", dir: "auto" }, f.title),
        el("p", { class: "meta" }, shortUrl)),
      el("div", { class: "rc-list" },
        row("New posts", seg("feed-mode", "New posts", [{ value: "show", label: "Show them" }, { value: "save", label: "Save them" }], f.mode,
          (v) => { set({ mode: v }); if (v === "save") autoSave(f); })),
        C.platform.native ? row("Pictures", seg("feed-images", "Pictures", [
          { value: "previews", label: "Previews" }, { value: "full", label: "Full" }, { value: "links", label: "Links" },
        ], f.images || load(IMAGES_KEY, "previews"), (v) => set({ images: v }))) : null,
        row("Save into", into),
        row("Skip posts older than", seg("feed-days", "Skip posts older than", FEED_DAYS, String(f.days || 7), (v) => set({ days: Number(v) })))),
      el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || (f.checkedAt ? "Checked " + whenText(f.checkedAt) + ". " : "") + rateLine(f.items) + "."),
      el("button", { class: "sheet-row", type: "button", onclick: (e) => {
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = "Checking…";
        checkNow(f).then(redrawMenu);
      } }, "Check now"),
      el("button", { class: "sheet-row danger", type: "button", onclick: () => unfollow(f) }, "Unfollow"),
      el("p", { class: "footnote" }, "Unfollowing keeps the posts you saved."));
  }

  async function unfollow(f) {
    feeds = feeds.filter((x) => x !== f);
    saveFeeds();
    if (state.feed === f.url) state.feed = null;
    await back();
    paintFeeds();
    toast("Unfollowed " + f.title + ". The posts you saved stay.");
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
        { value: "system", label: "Auto", note: "Your light and dark themes, following your phone", swatch: autoSwatch(), auto: true },
        ...THEMES.map((t) => ({ value: t.value, label: t.label, note: t.note, swatch: [t.value] })),
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

  function swatch(themes, cls) {
    return el("span", { class: "swatch" + (cls ? " " + cls : ""), "aria-hidden": "true" },
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
        o.swatch ? swatch(o.auto ? autoSwatch() : o.swatch, o.auto ? "auto" : "") : null,
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, o.label),
          o.note ? el("span", { class: "choice-note" }, o.note) : null),
        check));
    }
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, g.label),
      list,
      g.footnote ? el("p", { class: "footnote" }, g.footnote) : null);
  }

  // Which light and which dark theme Auto switches between.
  function autoGroup() {
    const a = autoThemes();
    const row = (text, control) => el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, text), control);
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Auto"),
      el("div", { class: "group" },
        el("div", { class: "rc-list" },
          row("When your phone is light", seg("auto-light", "Light theme for Auto", themeOptions(THEMES.filter((t) => !t.dark), true), a.light,
            (v) => setAutoTheme({ light: v }), "themes grid five")),
          row("When your phone is dark", seg("auto-dark", "Dark theme for Auto", themeOptions(THEMES.filter((t) => t.dark), true), a.dark,
            (v) => setAutoTheme({ dark: v }), "themes grid")))),
      el("p", { class: "footnote" }, "Used when the theme is Auto."));
  }

  function readingGroup() {
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Reading type"),
      el("div", { class: "group" },
        el("p", { class: "reading-sample" }, "The page is the product. Everything else gets out of its way."),
        readingControls(false)),
      el("p", { class: "footnote" }, "The same as Aa while you read."));
  }

  function libraryGroup() {
    const input = el("input", { class: "switch", type: "checkbox", role: "switch", checked: load(CONTINUE_KEY, true),
      onchange: (e) => { store(CONTINUE_KEY, e.target.checked); renderLibrary(); } });
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Library"),
      el("div", { class: "group" },
        el("label", { class: "row" },
          el("span", { class: "choice-text" },
            el("span", { class: "choice-label" }, "Continue reading"),
            el("span", { class: "choice-note" }, "The page you read last, at the top of the library")),
          input),
        el("label", { class: "row" },
          el("span", { class: "choice-text" },
            el("span", { class: "choice-label" }, "Check for new chapters"),
            el("span", { class: "choice-note" }, "Once a day, for collections saved with Save next, when you're online")),
          el("input", { class: "switch", type: "checkbox", role: "switch", checked: load(DAILY_KEY, true),
            onchange: (e) => store(DAILY_KEY, e.target.checked) })),
        el("button", { class: "row", type: "button", onclick: async (e) => {
          if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
          const b = e.currentTarget;
          b.disabled = true;
          const found = await dailyCheck(true);
          b.disabled = false;
          toast(found ? countFolders(found) + " with new chapters." : "No new chapters yet.");
        } }, el("span", { class: "row-label accent" }, "Check all collections now"))));
  }
  const countFolders = (n) => n + (n === 1 ? " collection" : " collections");

  // Folders first, biggest first, then the pages in no folder as one
  // more group; a group opens in place to its pages, biggest first.
  const storageOpen = new Set();
  function storageGroup() {
    const n = state.pages.length;
    const bySize = (a, b) => (b.bytes || 0) - (a.bytes || 0);
    const groups = allFolders().map((name) => ({ key: "f:" + name, name, pages: folderPages(name) }));
    const loose = state.pages.filter((p) => !p.folder);
    groups.sort((a, b) => sizeOf(b.pages) - sizeOf(a.pages));
    if (loose.length) groups.push({ key: "loose", name: "Not in a collection", pages: loose, loose: true });
    const list = el("div", { class: "group" });
    if (!n) list.append(el("div", { class: "row" }, el("span", { class: "row-label muted" }, "Nothing saved yet")));
    for (const g of groups) {
      const open = storageOpen.has(g.key);
      const pages = el("div", { class: "storage-pages", id: "storage-" + g.key.replace(/[^\w-]/g, "_") });
      pages.hidden = !open;
      if (open) {
        pages.append(savedView(g.pages));
        measureSizes(g.pages, remeasured);
      }
      for (const p of [...g.pages].sort(bySize)) {
        pages.append(el("button", { class: "row", type: "button", onclick: () => toLibrary().then(() => openPage(p.id)) },
          el("span", { class: "choice-text" },
            el("span", { class: "row-label", dir: "auto" }, p.title),
            el("span", { class: "choice-note" + (p.missing && p.mode !== "links" ? " warn" : "") }, savedNote(p))),
          el("span", { class: "row-value" }, formatSize(p.bytes || 0))));
      }
      const head = el("button", { class: "row storage-folder" + (g.loose ? " loose" : ""), type: "button", "aria-expanded": String(open), "aria-controls": pages.id,
        onclick: () => {
          const now = !storageOpen.has(g.key);
          if (now) storageOpen.add(g.key); else storageOpen.delete(g.key);
          head.setAttribute("aria-expanded", String(now));
          pages.hidden = !now;
          if (now && !pages.querySelector(".saved-view")) {
            pages.prepend(savedView(g.pages));
            measureSizes(g.pages, remeasured);
          }
        } },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label", dir: "auto" }, g.name),
          el("span", { class: "choice-note" }, countLine(g.pages.length))),
        el("span", { class: "row-value" }, formatSize(sizeOf(g.pages))),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›"));
      list.append(head, pages);
    }
    return el("section", { class: "settings-section" },
      el("p", { class: "storage-total" }, formatSize(totalBytes())),
      el("p", { class: "section-lead" }, n ? countLine(n) + " " + ON_HERE + ". Delete a page from its menu: press and hold it in the library." : "Pages you save show here with their size."),
      el("h2", { class: "overline" }, "By collection"),
      list);
  }

  const remeasured = () => { if (state.section === "storage") renderSection(); };

  function aboutGroup() {
    const list = el("div", { class: "group" });
    const releases = C.platform.releasesUrl() || "https://github.com/danielnoam/carry-on/releases/latest";
    list.append(el("div", { class: "row" }, el("span", { class: "row-label" }, "Version"), el("span", { class: "row-value" }, APP_VERSION)));
    list.append(el("a", { class: "row", href: releases, target: "_blank", rel: "noopener" },
      el("span", { class: "row-label accent" }, "Releases and source"),
      el("span", { class: "row-value", "aria-hidden": "true" }, "↗")));
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (!C.platform.native && !installed && installPrompt) {
      list.prepend(el("button", { class: "row install-row", type: "button", onclick: installApp },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label accent" }, "Install Carry-on"),
          el("span", { class: "choice-note" }, "Opens in its own window and works with no connection"))));
    }
    return el("section", { class: "settings-section" },
      list,
      !C.platform.native && !installed && !installPrompt && ios
        ? el("p", { class: "footnote install-hint" }, "To install Carry-on, tap Share, then Add to Home Screen.") : null,
      el("p", { class: "footnote" }, "Pages stay " + ON_HERE + ". Carry-on collects nothing."));
  }

  // The browser's own install offer (Chrome, Edge, Android), kept for the
  // Install row in About instead of the browser's banner.
  let installPrompt = null;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    if (state.section === "about") renderSection();
  });
  addEventListener("appinstalled", () => {
    installPrompt = null;
    if (state.section === "about") renderSection();
    toast("Installed. Carry-on is with your other apps.");
  });
  async function installApp() {
    if (!installPrompt) return;
    const offer = installPrompt;
    installPrompt = null;
    offer.prompt();
    try { await offer.userChoice; } catch (e) { /* closed */ }
    if (state.section === "about") renderSection();
  }

  // A browser's storage (0.27.12): how much it holds, and whether it may
  // clear the pages to make space, with the ask to keep them.
  function browserStorageGroup() {
    if (C.platform.native) return null;
    const box = el("section", { class: "settings-section browser-storage" });
    box.hidden = true;
    const draw = (info) => {
      box.hidden = !info;
      if (!info) return;
      const kept = info.kept
        ? el("div", { class: "row" }, el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Kept"),
          el("span", { class: "choice-note" }, "This browser won't clear your pages to make space.")))
        : el("button", { class: "row keep-row", type: "button", onclick: async () => {
          const ok = await C.store.keepStored();
          toast(ok ? "This browser will keep your pages." : "This browser didn't agree. Installing Carry-on usually helps.");
          draw(await C.store.storageInfo());
        } }, el("span", { class: "choice-text" },
          el("span", { class: "choice-label accent" }, "Keep pages from being cleared"),
          el("span", { class: "choice-note" }, "Browsers may clear a site's data when space runs low.")));
      box.replaceChildren(
        el("h2", { class: "overline" }, "This browser"),
        el("div", { class: "group" },
          el("div", { class: "row" }, el("span", { class: "row-label" }, "Space used"),
            el("span", { class: "row-value" }, formatSize(info.usage) + (info.quota ? " of " + formatSize(info.quota) : ""))),
          kept),
        el("p", { class: "footnote" }, "Pages saved here stay in this browser only. Clearing its site data deletes them, so keep a backup."));
    };
    C.store.storageInfo().then(draw);
    return box;
  }

  // Settings is a short menu; each entry is a screen of its own.
  const updateOut = () => ["available", "downloading", "ready"].includes(upd.phase) && upd.latest;
  const SECTIONS = {
    appearance: { title: "Appearance", build: () => [choiceGroup(SETTINGS[0]), autoGroup(), readingGroup(),
      choiceGroup({ key: LAYOUT_KEY, label: "Library layout", get: layout, set: (v) => { store(LAYOUT_KEY, v); renderLibrary(); }, options: LAYOUTS }),
      libraryGroup()],
      value: () => themeName(state.theme) },
    saving: { title: "Saving", build: () => [choiceGroup(SETTINGS[1])],
      value: () => SETTINGS[1].options.find((o) => o.value === SETTINGS[1].get()).label },
    storage: { title: "Storage and backup", build: () => [storageGroup(), browserStorageGroup(), backupGroup()], value: () => formatSize(totalBytes()) },
    updates: { title: "Updates", build: () => [updatesGroup()], value: () => (updateOut() ? upd.latest + " is out" : "") },
    about: { title: "About", build: () => [aboutGroup()], value: () => APP_VERSION },
  };

  function renderSettings() {
    const row = (key) => {
      const s = SECTIONS[key];
      const b = el("button", { class: "row nav-row", type: "button", onclick: () => openSection(key) },
        el("span", { class: "row-label" }, s.title),
        el("span", { class: "row-value" + (key === "updates" && updateOut() ? " accent" : "") }, s.value()),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›"));
      if (state.section === key) b.setAttribute("aria-current", "page");
      return b;
    };
    const out = updateOut();
    fill($("settingsBody"),
      el("div", { class: "settings-menu" },
        out ? el("div", { class: "group update-card" },
          el("div", { class: "row update-row out" },
            el("span", { class: "row-label accent" }, "Carry-on " + upd.latest + " is out"),
            el("button", { class: "btn-small", type: "button", onclick: () => openSection("updates") }, "View"))) : null,
        el("div", { class: "group" }, row("appearance"), row("saving")),
        el("div", { class: "group" }, row("storage")),
        el("div", { class: "group" }, row("updates"), row("about"))));
  }

  function renderSection() {
    const s = SECTIONS[state.section];
    $("sectionTitle").textContent = s.title;
    fill($("sectionBody"), ...s.build());
  }

  // On a phone a section is pushed over the menu; on a desktop it sits
  // beside it, and another entry swaps it in place.
  function openSection(key, fromHistory) {
    if (!SECTIONS[key] || state.section === key) return;
    const swap = !!state.section;
    state.section = key;
    renderSection();
    const entry = { view: "settings", section: key };
    if (!fromHistory) swap ? history.replaceState(entry, "") : history.pushState(entry, "");
    renderSettings();
    $("sectionBody").scrollTop = 0;
    if (!swap) pushScreen($("sectionView")).then(() => { if (!wide.matches) $("sectionBack").focus(); });
  }

  function closeSection() {
    if (!state.section) return;
    state.section = null;
    popScreen($("sectionView"));
    if (state.settings) renderSettings();
  }

  // `at` names a section to open over the menu (the update bar opens Updates).
  function openSettings(fromHistory, at) {
    if (state.settings) return;
    state.settings = true;
    renderSettings();
    if (!fromHistory) history.pushState({ view: "settings" }, "");
    $("settingsBody").scrollTop = 0;
    const shown = pushScreen($("settingsView"));
    if (at) openSection(at);
    else shown.then(() => $("settingsBack").focus());
  }

  function closeSettings() {
    if (!state.settings) return;
    closeSection();
    state.settings = false;
    popScreen($("settingsView"));
  }

  // ---- Wiring ----

  function route(s) {
    const view = s && s.view;
    const inSettings = view === "settings" || (view === "news" && s.over === "settings");
    if (view !== "reader") closeReader();
    if (view !== "menu") closeMenu();
    if (view !== "side") closeSide();
    if (view === "side" && !state.side) history.back();
    if (view !== "select" && !(view === "menu" && s.select)) endSelect();
    if (view !== "news") closeNews();
    if (view !== "downloads") closeDownloads();
    if (!inSettings) closeSettings();
    else if (!s.section) closeSection();
    if (view !== "batch") closeBatch();
    if (view === "batch") openBatch("", true, s.folder);
    const folder = ["folder", "reader", "batch", "select", "menu"].includes(view) && s.folder;
    if (!folder) closeFolder();
    else if (!state.folder) openFolder(folder, true);
    if (view === "select") startSelect([], true);
    // A sheet isn't rebuilt going forward: step back off it instead.
    if (view === "menu" && !state.menu) history.back();
    if (view === "reader" && String(s.page).startsWith("preview:") && !(state.open && state.open.id === s.page)) { history.back(); return; }
    if (view === "reader" && (!state.open || state.open.id !== s.page)) openPage(s.page, true);
    if (state.image && !(view === "reader" && s.image)) closeImage();
    if (view === "reader" && s.image && !state.image) history.back();
    if (view === "reader" && s.sheet !== state.sheet) closeSheet();
    if (view === "reader" && s.sheet && state.open && state.open.id === s.page) openSheet(s.sheet, true);
    if (inSettings) { openSettings(true); if (s.section) openSection(s.section, true); }
    if (view === "news") openNews(true);
    if (view === "downloads") openDownloads(true);
  }

  // Back to the library from whatever screen is up, through history so the
  // stack stays honest; resolves once it's there.
  function toLibrary() {
    if (!(history.state && history.state.view)) return Promise.resolve();
    return new Promise((resolve) => {
      addEventListener("popstate", () => resolve(), { once: true });
      history.go(-[state.folder, state.open, state.sheet, state.image, state.settings, state.section, state.batch, state.news, state.select, state.menu, state.downloads, state.side].filter(Boolean).length || -1);
    });
  }

  $("settingsBtn").addEventListener("click", () => openSettings());
  $("sideBtn").addEventListener("click", openSide);
  holdFeeds($("feeds"));
  holdFeeds($("sidebar"));
  swipeToSide($("libraryView"));
  pullToCheck($("libraryView"));
  $("sideCatch").addEventListener("click", () => history.back());
  $("downloadsBtn").addEventListener("click", () => openDownloads());
  $("downloadsBack").addEventListener("click", () => history.back());
  // The notification's Stop (Android) stops every run.
  C.platform.downloads.onStop(() => { for (const r of [...runs]) stopRun(r); });
  $("sectionBack").addEventListener("click", () => history.back());
  // Search's button sits in the bar that stays, so it's there from anywhere
  // in the list. A second tap, with the field empty or in view, puts it away.
  $("searchBtn").addEventListener("click", () => {
    const box = $("searchBox");
    if (!box.hidden && (!state.query || box.getBoundingClientRect().bottom > $("topBar").offsetHeight)) closeSearch();
    else openSearch();
  });
  $("librarySearch").addEventListener("blur", () => { if (!state.query) { searchOpen = false; setTimeout(paintSearch, 150); } });
  // The bar gets its hairline once the list scrolls under it.
  const topBar = $("topBar");
  addEventListener("scroll", () => topBar.classList.toggle("scrolled", scrollY > 0), { passive: true });
  $("selectCancel").addEventListener("click", () => history.back());
  $("selectAll").addEventListener("click", selectAll);
  $("selTags").addEventListener("click", () => openMenu("tags"));
  $("selFolder").addEventListener("click", () => openMenu("folder"));
  $("selRead").addEventListener("click", readPicked);
  $("selDelete").addEventListener("click", deletePicked);
  $("menuCatch").addEventListener("click", () => history.back());
  longPress($("library"));
  longPress($("folderBody"));
  $("settingsBack").addEventListener("click", () => history.back());
  $("folderBack").addEventListener("click", () => history.back());
  $("folderMore").addEventListener("click", openFolderMenu);
  $("folderCancel").addEventListener("click", () => setFolderMode(""));
  $("folderDone").addEventListener("click", async () => {
    if (folderMode === "rename" && !(await renameFolder($("folderBody").querySelector(".book-title-input").value))) return;
    setFolderMode("");
  });
  $("folderBody").addEventListener("scroll", paintFolderTitle, { passive: true });
  // Escape steps out of Reorder, the story page or Export; Rename's field
  // handles its own.
  $("folderView").addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && folderMode && !state.menu && !state.select) { e.preventDefault(); setFolderMode(""); }
  });
  $("batchBack").addEventListener("click", () => history.back());
  // What's typed in the save field comes along, so one link can be saved
  // as a comic or with other images.
  $("severalBtn").addEventListener("click", () => { const typed = $("saveUrl").value; $("saveUrl").value = ""; openBatch(typed); });
  $("librarySearch").addEventListener("input", onSearch);
  $("librarySearch").addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (state.query) clearSearch();
    else { closeSearch(); $("searchBtn").focus(); }
  });
  $("searchClear").addEventListener("click", () => { clearSearch(); $("librarySearch").focus(); });
  $("newsBack").addEventListener("click", () => history.back());

  $("saveForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.place === "feeds") {
      const typed = $("saveUrl").value.trim();
      $("saveUrl").value = "";
      $("saveUrl").blur();
      openMenu("addFeed", { url: typed });
      return;
    }
    if (linksFrom($("saveUrl").value).length > 1) {
      openBatch($("saveUrl").value);
      $("saveUrl").value = "";
      $("saveUrl").blur();
      return;
    }
    const url = linkFrom($("saveUrl").value);
    if (!url) { toast("That doesn't look like a link. Paste the page's address."); return; }
    $("saveUrl").value = "";
    $("saveUrl").blur();
    savePage(url);
  });

  $("readerBack").addEventListener("click", () => history.go(state.sheet || state.image ? -2 : -1));
  // A button closes its own sheet, and swaps the other one in place (one
  // history entry for whichever sheet is up).
  function toggleSheet(kind) {
    if (state.sheet === kind) { history.back(); return; }
    if (state.sheet) history.replaceState(readerState(state.open, kind), "");
    openSheet(kind, !!state.sheet);
  }
  $("readerMore").addEventListener("click", () => toggleSheet("page"));
  $("readerAa").addEventListener("click", () => toggleSheet("reading"));
  $("readerContents").addEventListener("click", () => toggleSheet("contents"));
  $("sheetCatch").addEventListener("click", () => history.back());
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && (state.sheet || state.image || state.menu || state.select || state.side)) history.back();
    // In pages, the arrow keys turn them (inside the page, src/reader.js
    // does the same).
    if (state.open && !state.sheet && !state.image && C.reader.paged && !e.altKey && !e.ctrlKey && !e.metaKey
      && !(e.target.closest && e.target.closest("input, textarea, select, [contenteditable]"))) {
      const rtl = state.open.dir === "rtl";
      const d = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, PageDown: 1, PageUp: -1 }[e.key];
      if (d) { e.preventDefault(); C.reader.turn(d); }
    }
  });
  addEventListener("popstate", (e) => route(e.state));
  addEventListener("online", () => { showOffline(); renderLibrary(); });
  addEventListener("offline", () => { showOffline(); renderLibrary(); });

  // ---- Shared from another app (Android) ----
  // native/share hands over what Chrome's share sheet sent: usually the
  // link, sometimes "Title https://…". Saved straight away.
  async function saveShared() {
    const share = C.platform.plugin("ShareTarget");
    if (!share) return;
    let got;
    try { got = await share.take(); } catch (e) { return; }
    if (!got || !got.text) return;
    if (linksFrom(got.text).length > 1) { await toLibrary(); openBatch(got.text); return; }
    const url = linkFrom(got.text);
    if (!url) { toast("That share had no link in it."); return; }
    await toLibrary();
    savePage(url);
  }

  paintPlace();
  Promise.all([C.platform.ready, C.store.ready]).then(() => Promise.all([C.store.readIndex(), loadThumbs()])).then(([pages]) => {
    state.pages = Array.isArray(pages) ? pages : [];
    if (history.state && history.state.view) history.replaceState(null, "");
    paintPlace();
    noteVersion();
    const share = C.platform.plugin("ShareTarget");
    if (share && share.addListener) share.addListener("shared", saveShared);
    saveShared();
    setTimeout(() => dailyCheck(false), 1500);
    setTimeout(() => checkFeeds(false), 3000);
    // Feeds followed before 0.28.4 are handed over once, with the ask.
    if (feeds.length && !load(FEEDS_ASKED_KEY, false)) { store(FEEDS_ASKED_KEY, true); askToNotify = true; }
    watchFeeds();
    takeFeedNews();
    C.platform.feedChecks.onOpen(takeFeedNews);
    takeWidget();
    C.platform.widgets.onOpen(takeWidget);
    updateWidgets();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { if (positionTimer) savePositions(); updateWidgets(); return; }
      takeFeedNews();
      takeWidget();
    });
  });
  addEventListener("online", () => { dailyCheck(false); checkFeeds(false); });
  // Feeds are due every few hours; asked about while the app is open.
  setInterval(() => checkFeeds(false), 15 * 6e4);

  // ---- The app updating itself (from LifeLog's 0.179.0) ----
  // A newer build is a newer APK on this repo's Releases, tagged
  // app-v<APP_VERSION> by .github/workflows/android.yml, whose notes are
  // that version's CHANGELOG.md section. Asked once per launch,
  // unauthenticated: the Releases are public. The work lives in Settings'
  // Updates section; the library's bar is only the nudge that leads there.
  function isNewerVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  }

  // phase: idle, checking, current, failed, available, downloading, ready.
  const upd = { phase: "idle", latest: null, notes: "", pct: 0, apk: null, error: "" };

  function setUpd(change) {
    Object.assign(upd, change);
    paintUpdateBar();
    if (state.settings) renderSettings();
    if (state.section === "updates" && $("updatesSection")) $("updatesSection").replaceWith(updatesGroup());
  }

  async function checkForNewerApp() {
    const build = await C.platform.ready;
    if (!C.platform.native || !build || !build.repo) return;
    if (upd.phase === "checking" || upd.phase === "downloading") return;
    C.platform.clearOldUpdates(APP_VERSION, isNewerVersion);
    setUpd({ phase: "checking" });
    try {
      const res = await C.platform.fetchText("https://api.github.com/repos/" + build.repo + "/releases/latest",
        { headers: { Accept: "application/vnd.github+json" } });
      if (res.status !== 200) throw new Error("HTTP " + res.status);
      const release = JSON.parse(res.text);
      const latest = String(release.tag_name || "").replace(/^app-v/, "");
      if (/^\d+\.\d+\.\d+$/.test(latest) && isNewerVersion(latest, APP_VERSION)) {
        setUpd({ phase: upd.latest === latest && upd.apk ? "ready" : "available", latest, notes: String(release.body || "") });
      } else setUpd({ phase: "current" });
    } catch (e) {
      setUpd({ phase: "failed", error: "Couldn't check. Try again when you're online." });
    }
  }

  // Android downloads the APK with its progress, then opens the installer;
  // if that's dismissed, Install reopens it from the same file. iOS installs
  // nothing an app hands it: a sideloaded build is updated from AltStore or
  // SideStore, so there it opens the release.
  async function startUpdate() {
    if (C.platform.ios) { C.platform.openOutside(C.platform.releasesUrl()); return; }
    if (upd.phase === "ready") return install();
    setUpd({ phase: "downloading", pct: 0 });
    let apk;
    try {
      apk = await C.platform.downloadUpdate(upd.latest, (f) => setUpd({ pct: Math.round(f * 100) }));
    } catch (e) {
      setUpd({ phase: "available", error: "The download didn't finish. Try again." });
      return;
    }
    if (!apk) {
      setUpd({ phase: "available" });
      C.platform.openOutside(C.platform.apkUrl());
      return;
    }
    setUpd({ phase: "ready", apk, error: "" });
    install();
  }

  async function install() {
    try {
      await C.platform.openInstaller(upd.apk);
    } catch (e) {
      setUpd({ error: "Couldn't open the installer. Try again." });
    }
  }

  // The library's bar: a newer version is out (View opens Settings at
  // Updates), or this one just arrived (What's new). × puts it away.
  let barDismissed = null;
  function paintUpdateBar() {
    const bar = $("updateBar");
    const out = ["available", "downloading", "ready"].includes(upd.phase) && upd.latest;
    const fresh = !out && justUpdated;
    const key = out ? "out:" + upd.latest : fresh ? "new:" + APP_VERSION : null;
    if (!key || barDismissed === key) {
      bar.hidden = true;
      return;
    }
    $("updateText").textContent = out
      ? (upd.phase === "downloading" ? "Downloading " + upd.latest + " · " + upd.pct + "%" : upd.phase === "ready" ? "Carry-on " + upd.latest + " is ready to install" : "Carry-on " + upd.latest + " is out")
      : "Updated to " + APP_VERSION;
    const btn = $("updateBtn");
    btn.textContent = out ? "View" : "What's new";
    btn.onclick = () => (out ? openSettings(false, "updates") : openNews());
    $("updateClose").onclick = () => {
      barDismissed = key;
      if (fresh) justUpdated = false;
      bar.hidden = true;
    };
    if (bar.hidden) {
      bar.hidden = false;
      M.arrive(bar);
    }
  }

  // Shown once after an update arrives: the version seen last is kept, and
  // a library that existed before this was kept counts as an update.
  let justUpdated = false;
  function noteVersion() {
    const seen = load(SEEN_KEY, null);
    justUpdated = seen ? isNewerVersion(APP_VERSION, seen) : state.pages.length > 0;
    store(SEEN_KEY, APP_VERSION);
    paintUpdateBar();
  }

  function updatesGroup() {
    const list = el("div", { class: "group" },
      el("div", { class: "row" }, el("span", { class: "row-label" }, "This version"), el("span", { class: "row-value" }, APP_VERSION)));
    if (C.platform.native) {
      const out = ["available", "downloading", "ready"].includes(upd.phase);
      const status = {
        idle: "Not checked yet", checking: "Checking…", current: "You have the latest version",
        failed: upd.error, available: "Carry-on " + upd.latest + " is out",
        downloading: "Downloading " + upd.latest + " · " + upd.pct + "%", ready: "Carry-on " + upd.latest + " is ready to install",
      }[upd.phase];
      const action = out ? el("button", { class: "btn-small", type: "button", onclick: startUpdate },
        upd.phase === "downloading" ? upd.pct + "%" : C.platform.ios ? "Get it" : upd.phase === "ready" ? "Install" : "Update") : null;
      if (action && upd.phase === "downloading") action.disabled = true;
      list.append(el("div", { class: "row update-row" + (out ? " out" : "") },
        upd.phase === "checking" || upd.phase === "downloading" ? el("span", { class: "spinner", "aria-hidden": "true" }) : null,
        el("span", { class: "row-label" + (out ? " accent" : upd.phase === "failed" ? " warn" : "") , role: "status" }, status), action));
      if (out && upd.error) list.append(el("div", { class: "row" }, el("span", { class: "row-label warn" }, upd.error)));
      if (out && upd.notes) list.append(el("div", { class: "update-notes" }, el("p", { class: "overline" }, "What's in " + upd.latest), ...notesView(changelogEntries("## [" + upd.latest + "]\n" + upd.notes))));
      const check = el("button", { class: "row", type: "button", onclick: () => checkForNewerApp() },
        el("span", { class: "row-label accent" }, "Check for updates"));
      check.disabled = upd.phase === "checking" || upd.phase === "downloading";
      list.append(check);
    }
    list.append(el("button", { class: "row", type: "button", onclick: () => openNews() },
      el("span", { class: "row-label accent" }, "What's new"), el("span", { class: "row-value", "aria-hidden": "true" }, "›")));
    return el("section", { class: "settings-section", id: "updatesSection" }, list);
  }

  // ---- What's new ----
  // CHANGELOG.md, bundled with the app, read into versions of headed lists.

  function changelogEntries(md) {
    const out = [];
    let entry = null, section = null, item = null;
    for (const line of String(md).split("\n")) {
      let m;
      if ((m = line.match(/^## \[([^\]]+)\](?:\s*-\s*(\S+))?/))) { entry = { version: m[1], date: m[2] || "", sections: [] }; out.push(entry); section = item = null; }
      else if (!entry) continue;
      else if ((m = line.match(/^### (.+)/))) { section = { title: m[1].trim(), items: [] }; entry.sections.push(section); item = null; }
      else if ((m = line.match(/^\s*[-*] (.+)/))) {
        if (!section) { section = { title: "", items: [] }; entry.sections.push(section); }
        item = m[1].trim();
        section.items.push(item);
      } else if (line.trim() && section && section.items.length && /^\s/.test(line)) {
        section.items[section.items.length - 1] += " " + line.trim();
      } else if (!line.trim()) item = null;
    }
    // Markdown's marks aren't needed to read a line.
    for (const e of out) for (const sec of e.sections) sec.items = sec.items.map((t) => t.replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
    return out;
  }

  function notesView(entries) {
    return entries.flatMap((e) => e.sections.map((sec) => el("div", { class: "news-section" },
      sec.title ? el("h4", { class: "news-kind" }, sec.title) : null,
      el("ul", { class: "news-list" }, ...sec.items.map((t) => el("li", null, t))))));
  }

  let changelog = null;
  async function readChangelog() {
    if (changelog) return changelog;
    try {
      const res = await fetch("CHANGELOG.md?v=" + APP_VERSION);
      if (!res.ok) throw new Error("HTTP " + res.status);
      changelog = changelogEntries(await res.text());
    } catch (e) {
      changelog = null;
    }
    return changelog;
  }

  async function openNews(fromHistory) {
    if (state.news) return;
    state.news = true;
    const over = state.settings ? "settings" : undefined;
    if (!fromHistory) history.pushState({ view: "news", over, section: state.section || undefined }, "");
    justUpdated = false;
    paintUpdateBar();
    $("newsBody").replaceChildren(el("p", { class: "meta" }, "Loading…"));
    $("newsBody").scrollTop = 0;
    pushScreen($("newsView")).then(() => $("newsBack").focus());
    const entries = await readChangelog();
    if (!state.news) return;
    $("newsBody").replaceChildren(...(entries && entries.length ? entries.map((e) => el("section", { class: "news-entry" + (e.version === APP_VERSION ? " now" : "") },
      el("h2", { class: "news-version" }, e.version, e.version === APP_VERSION ? el("span", { class: "news-you" }, "You have this") : null),
      e.date ? el("p", { class: "meta" }, formatDay(e.date)) : null,
      ...notesView([e]))) : [el("p", { class: "empty-text" }, "The list of changes didn't load.")]));
  }

  function closeNews() {
    if (!state.news) return;
    state.news = false;
    popScreen($("newsView"));
  }

  function formatDay(iso) {
    const d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }

  checkForNewerApp();

  if (!C.platform.native && "serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  C.linkFrom = linkFrom;
  C.isNewerVersion = isNewerVersion;
})();
