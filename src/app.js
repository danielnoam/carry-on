// Carry-on: the shell. Version, theme, the library, saving, the reader and
// Settings, and the screens moving between them.
(function () {
  const APP_VERSION = "0.7.0";
  window.CarryOn.version = APP_VERSION;

  const C = window.CarryOn;
  const M = C.motion;
  const THEMES = ["paper", "sepia", "night"];
  const THEME_KEY = "carryon.theme";
  const IMAGES_KEY = "carryon.images";
  const READING_KEY = "carryon.reading";
  const FILTER_KEY = "carryon.filter";

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
    const shown = text;
    toastTimer = setTimeout(() => { M.leave(t).then(() => { if (t.textContent === shown) t.hidden = true; }); }, 3200);
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
    sheet: false,
    // Which pages the library shows: "all", "unread", "finished" or "#tag".
    filter: load(FILTER_KEY, "all"),
  };
  paintTheme(state.theme);

  // ---- Reading ----
  // Text size, line spacing and font for saved pages, set from the reader's
  // Aa sheet or Settings. They're tokens on the app's :root, which
  // src/reader.js copies into the page like the theme's colours.
  const SIZES = [16, 18, 19, 21, 24];
  const SPACING = { tight: 1.4, normal: 1.58, loose: 1.8 };
  const FONTS = { serif: "--serif", sans: "--sans" };
  const READING_DEFAULT = { size: 2, spacing: "normal", font: "serif" };

  function readingPrefs() {
    const r = { ...READING_DEFAULT, ...load(READING_KEY, {}) };
    if (!(r.size >= 0 && r.size < SIZES.length)) r.size = READING_DEFAULT.size;
    if (!SPACING[r.spacing]) r.spacing = READING_DEFAULT.spacing;
    if (!FONTS[r.font]) r.font = READING_DEFAULT.font;
    return r;
  }

  function paintReading() {
    const r = readingPrefs();
    const px = SIZES[r.size];
    const root = document.documentElement.style;
    root.setProperty("--reader-fs", px + "px");
    root.setProperty("--reader-lh", Math.round(px * SPACING[r.spacing]) + "px");
    root.setProperty("--reader-font", "var(" + FONTS[r.font] + ")");
    if (C.reader) C.reader.applyTheme();
  }

  function setReading(change) {
    store(READING_KEY, { ...readingPrefs(), ...change });
    paintReading();
    document.querySelectorAll(".reading-controls").forEach(syncReadingControls);
  }
  paintReading();
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

  // A save that failed stays in the list with the reason until it's retried
  // or removed: a toast alone is gone before anyone looks back at the phone.
  function failedCard(s) {
    return el("div", { class: "card saving failed", role: "group", "aria-label": "Couldn't save " + s.site },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, s.site),
        el("span", { class: "card-title", dir: "auto" }, s.url),
        el("span", { class: "card-status" }, el("span", { class: "warn" }, s.error)),
        el("span", { class: "card-actions" },
          el("button", { class: "btn-small", type: "button", onclick: () => { dropFailed(s); savePage(s.url); } }, "Try again"),
          el("button", { class: "btn-quiet", type: "button", onclick: () => dropFailed(s) }, "Remove"))));
  }

  function dropFailed(s) {
    state.saving = state.saving.filter((x) => x !== s);
    renderLibrary();
  }

  function savingCard(s) {
    return el("div", { class: "card saving", role: "group", "aria-label": "Saving " + s.site },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, s.site),
        el("span", { class: "card-title", dir: "auto" }, s.url),
        el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
          el("span", { class: "progress-fill" })),
        el("span", { class: "card-status accent" }, savingStatus(s))));
  }

  // Progress lands in the card that's already there, so the bar grows on
  // its spring instead of being redrawn at each image.
  function updateSavingCard(s) {
    const card = $("library").querySelector('[data-key="' + CSS.escape("s:" + s.key) + '"]');
    if (!card || s.error) return;
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    card.querySelector(".progress").setAttribute("aria-valuenow", String(pct));
    card.querySelector(".progress-fill").style.transform = "scaleX(" + pct / 100 + ")";
    card.querySelector(".card-status").textContent = savingStatus(s);
  }

  // "Finished" once read to the end, "6 min left" part way, else the length.
  function readingLine(p) {
    if (p.finished) return "Finished";
    if (p.at > 0.02) return Math.max(1, Math.ceil(p.minutes * (1 - p.at))) + " min left";
    return p.minutes + " min";
  }

  function pageCard(p) {
    const thumb = thumbUrl(p);
    const facts = [readingLine(p), formatSize(p.bytes || 0)].join(" · ") + " · ";
    const started = !p.finished && p.at > 0.02;
    const status = p.missing
      ? el("span", { class: "warn" }, "Text saved · " + p.missing + (p.missing === 1 ? " preview" : " previews") + " missing")
      : p.mode === "links"
        ? el("span", null, "Text offline · images online")
        : el("span", { class: "ok" }, "Offline ready");
    // The whole card opens the page (a button stretched under everything);
    // Retry sits above it, since a button can't hold another.
    const retry = p.missing && C.platform.native && navigator.onLine
      ? el("button", { class: "card-retry", type: "button", onclick: (e) => retryPreviews(p, e.currentTarget) }, "Retry")
      : null;
    return el("div", { class: "card" },
      el("button", { class: "card-open", type: "button", "aria-label": p.title, onclick: () => openPage(p.id) }),
      thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : null,
      el("span", { class: "card-body" },
        el("span", { class: "card-site", dir: "auto" }, p.site, ...(p.tags || []).map((t) => el("span", { class: "card-tag" }, " · #" + t))),
        el("span", { class: "card-title", dir: "auto" }, p.title),
        el("span", { class: "card-status" }, facts, status, retry ? " · " : null, retry),
        started ? el("span", { class: "progress thin", role: "progressbar", "aria-label": "Read so far",
          "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p.at * 100)) },
          el("span", { class: "progress-fill", style: "transform: scaleX(" + p.at + ")" })) : null));
  }

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
      await C.store.writeIndex(state.pages);
    }
    toast(!res.got ? "Still couldn't get them. The site may be down; the images load online."
      : res.missing ? "Got " + res.got + ". " + res.missing + " still missing."
      : "All previews saved. Offline ready.");
    renderLibrary();
  }

  // ---- Filters ----

  const unread = (p) => !p.finished && !(p.at > 0.02);
  function shown(p) {
    const f = state.filter;
    if (f === "unread") return unread(p);
    if (f === "finished") return !!p.finished;
    if (f.startsWith("#")) return (p.tags || []).some((t) => sameTag(t, f.slice(1)));
    return true;
  }

  function setFilter(f) {
    state.filter = f;
    store(FILTER_KEY, f);
    renderLibrary();
  }

  function renderFilters() {
    const box = $("filters");
    box.hidden = !state.pages.length;
    if (box.hidden) return;
    const chip = (f, label) => el("button", { class: "chip" + (state.filter === f ? " on" : ""), type: "button",
      "aria-pressed": String(state.filter === f), onclick: () => setFilter(state.filter === f && f !== "all" ? "all" : f) }, label);
    box.replaceChildren(chip("all", "All"), chip("unread", "Unread"), chip("finished", "Finished"),
      ...allTags().map((t) => chip("#" + t, "#" + t)));
  }

  // Cards are keyed and kept between renders; only ones that weren't there
  // before arrive on a spring, so a re-render never replays the list.
  let firstRender = true;
  function renderLibrary() {
    const root = $("library");
    const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
    const n = state.pages.length;
    // A tag filter whose last page lost the tag (or was deleted) falls back to All.
    if (n && state.filter.startsWith("#")
      && !allTags().some((t) => sameTag(t, state.filter.slice(1)))) { state.filter = "all"; store(FILTER_KEY, "all"); }
    renderFilters();
    const allOffline = state.pages.every((p) => !p.missing && p.mode !== "links");
    $("libraryMeta").textContent = n ? pagesLine(n) + (allOffline ? " · all readable offline" : "") : "Nothing saved yet";
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
    for (const s of state.saving) keep((s.error ? "f:" : "s:") + s.key, () => (s.error ? failedCard(s) : savingCard(s)));
    const pages = state.pages.filter(shown);
    for (const p of pages) keep("p:" + p.id, () => pageCard(p), [p.title, readingLine(p), p.missing, p.thumb, Math.round((p.at || 0) * 50), navigator.onLine, (p.tags || []).join(",")].join("|"));
    if (n && !pages.length) {
      keep("none:" + state.filter, () => el("div", { class: "empty" },
        el("p", { class: "empty-text" }, state.filter === "unread" ? "You've started everything you saved."
          : state.filter === "finished" ? "Nothing finished yet." : "No pages tagged " + state.filter + "."),
        el("button", { class: "btn-quiet", type: "button", onclick: () => setFilter("all") }, "Show all")));
    }
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
    if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) return;
    state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
    const job = { key: url, url, site: C.save.siteName(url), done: 0, total: null, error: null };
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
      state.saving = state.saving.filter((s) => s !== job);
    } catch (e) {
      job.error = e instanceof C.save.SaveError ? e.message : "Couldn't save this page. Try again.";
      if (!(e instanceof C.save.SaveError)) console.error(e);
    }
    renderLibrary();
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
    const shown = C.reader.open($("readerFrame"), html, p, { at: p.at || 0, onPosition: (f) => notePosition(p, f) });
    cover($("readerView"));
    await shown;
    $("readerFrame").focus();
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
    return C.store.writeIndex(state.pages).catch(() => {});
  }

  function closeReader() {
    if (!state.open) return;
    if (positionTimer) savePositions();
    renderLibrary();
    closeSheet(true);
    state.open = null;
    uncover($("readerView")).then(() => { if (!state.open) C.reader.close(); });
  }

  async function deleteOpen() {
    const p = state.open;
    if (!p || !confirm("Delete “" + p.title + "” from this phone?")) return;
    await C.store.removePage(p.id);
    state.pages = state.pages.filter((x) => x.id !== p.id);
    await C.store.writeIndex(state.pages);
    history.go(state.sheet ? -2 : -1);
    renderLibrary();
    toast("Deleted");
  }

  // The same controls in the Aa sheet and in Settings. A change is applied
  // at once and every copy on screen follows it in place, so focus stays put.
  function seg(name, label, options, current, onpick, cls) {
    return el("div", { class: "seg" + (cls ? " " + cls : ""), role: "radiogroup", "aria-label": label },
      ...options.map((o) => el("label", { class: "seg-item" },
        el("input", { class: "visually-hidden", type: "radio", name, value: o.value, checked: o.value === current,
          onchange: () => onpick(o.value) }),
        el("span", { class: "seg-face", style: o.style || null }, o.swatch ? swatch(o.swatch) : null, o.label))));
  }

  let readingGroups = 0;
  function readingControls(withTheme) {
    const r = readingPrefs();
    const id = "rc" + ++readingGroups;
    const row = (label, control) => el("div", { class: "rc-row" }, el("span", { class: "rc-label" }, label), control);
    const steps = el("span", { class: "steps", role: "img" }, ...SIZES.map(() => el("span", { class: "step" })));
    const stepper = el("div", { class: "stepper" },
      el("button", { class: "step-btn small", type: "button", "data-step": "-1", "aria-label": "Smaller text",
        onclick: () => setReading({ size: Math.max(0, readingPrefs().size - 1) }) }, "A"),
      steps,
      el("button", { class: "step-btn large", type: "button", "data-step": "1", "aria-label": "Larger text",
        onclick: () => setReading({ size: Math.min(SIZES.length - 1, readingPrefs().size + 1) }) }, "A"));
    const box = el("div", { class: "reading-controls" },
      row("Text size", stepper),
      row("Spacing", seg(id + "-spacing", "Line spacing", [
        { value: "tight", label: "Tight" }, { value: "normal", label: "Normal" }, { value: "loose", label: "Loose" },
      ], r.spacing, (v) => setReading({ spacing: v }))),
      row("Font", seg(id + "-font", "Font", [
        { value: "serif", label: "Serif", style: "font-family: var(--serif)" },
        { value: "sans", label: "Sans", style: "font-family: var(--sans)" },
      ], r.font, (v) => setReading({ font: v }))),
      withTheme ? row("Theme", seg(id + "-theme", "Theme", [
        { value: "system", label: "Auto", swatch: ["paper", "night"] },
        { value: "paper", label: "Paper", swatch: ["paper"] },
        { value: "sepia", label: "Sepia", swatch: ["sepia"] },
        { value: "night", label: "Night", swatch: ["night"] },
      ], state.theme, (v) => { setTheme(v); syncThemeInputs(); }, "themes")) : null);
    syncReadingControls(box);
    return box;
  }

  function syncReadingControls(box) {
    const r = readingPrefs();
    box.querySelectorAll(".step").forEach((s, i) => { s.classList.toggle("on", i <= r.size); s.classList.toggle("now", i === r.size); });
    box.querySelector(".steps").setAttribute("aria-label", "Text size " + (r.size + 1) + " of " + SIZES.length);
    box.querySelector('[data-step="-1"]').disabled = r.size === 0;
    box.querySelector('[data-step="1"]').disabled = r.size === SIZES.length - 1;
    for (const [k, v] of [["spacing", r.spacing], ["font", r.font]]) {
      box.querySelectorAll('input[name$="-' + k + '"]').forEach((i) => { i.checked = i.value === v; });
    }
  }

  // The theme lives in two places (Aa and Settings); keep both radios true.
  function syncThemeInputs() {
    document.querySelectorAll('input[name$="-theme"], input[name="' + THEME_KEY + '"]').forEach((i) => { i.checked = i.value === state.theme; });
  }

  // ---- The reader's sheets ----
  // "reading" (Aa) and "page" (tags, delete) share one sheet. Each is a
  // history entry of its own, so Android's back closes it before the page.

  const SHEETS = {
    reading: { button: "readerAa", label: "Text and theme", build: () => readingControls(true) },
    page: { button: "readerMore", label: "This page", build: () => pageControls(state.open) },
  };

  function openSheet(kind, fromHistory) {
    if (state.sheet === kind || !state.open || !SHEETS[kind]) return;
    if (state.sheet) closeSheet(true);
    state.sheet = kind;
    const s = SHEETS[kind];
    $("readingBody").replaceChildren(s.build());
    $("readingSheet").setAttribute("aria-label", s.label);
    if (!fromHistory) history.pushState({ view: "reader", page: state.open.id, sheet: kind }, "");
    $(s.button).setAttribute("aria-expanded", "true");
    $("sheetCatch").hidden = false;
    $("readingSheet").hidden = false;
    M.rise($("readingSheet"));
    const first = $("readingSheet").querySelector("button:not(:disabled), input:checked");
    if (first && kind === "reading") first.focus({ preventScroll: true });
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

  async function setTags(p, tags) {
    p.tags = tags;
    await C.store.writeIndex(state.pages);
    renderLibrary();
  }

  function pageControls(p) {
    const box = el("div", { class: "page-controls" });
    const draw = () => {
      const tags = p.tags || [];
      const others = allTags().filter((t) => !tags.some((x) => sameTag(x, t)));
      const input = el("input", { class: "tag-input", type: "text", placeholder: "Add a tag", "aria-label": "Add a tag",
        maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
      const add = (raw) => {
        const t = cleanTag(raw);
        if (!t || tags.some((x) => sameTag(x, t))) return;
        const known = allTags().find((x) => sameTag(x, t));
        setTags(p, [...tags, known || t]).then(() => { draw(); box.querySelector(".tag-input").focus({ preventScroll: true }); });
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(input.value); } });
      box.replaceChildren(
        el("div", { class: "rc-row top" }, el("span", { class: "rc-label" }, "Tags"),
          el("div", { class: "tag-edit" },
            el("div", { class: "chips" },
              ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": "Remove tag " + t,
                onclick: () => setTags(p, tags.filter((x) => x !== t)).then(draw) }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×"))),
              input),
            others.length ? el("div", { class: "chips" },
              ...others.slice(0, 12).map((t) => el("button", { class: "chip", type: "button", "aria-label": "Add tag " + t, onclick: () => add(t) }, "+ " + t))) : null)),
        el("button", { class: "sheet-row danger", type: "button", onclick: deleteOpen }, "Delete this page"));
    };
    draw();
    return box;
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

  function readingGroup() {
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Reading"),
      el("div", { class: "group" },
        el("p", { class: "reading-sample" }, "The page is the product. Everything else gets out of its way."),
        readingControls(false)),
      el("p", { class: "footnote" }, "Also under Aa while you read."));
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
    const [appearance, saving] = SETTINGS.map(choiceGroup);
    $("settingsBody").replaceChildren(appearance, readingGroup(), saving, storageGroup(), aboutGroup());
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
    if (view === "reader" && s.sheet !== state.sheet) closeSheet();
    if (view === "reader" && s.sheet && state.open && state.open.id === s.page) openSheet(s.sheet, true);
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

  $("readerBack").addEventListener("click", () => history.go(state.sheet ? -2 : -1));
  // A button closes its own sheet, and swaps the other one in place (one
  // history entry for whichever sheet is up).
  function toggleSheet(kind) {
    if (state.sheet === kind) { history.back(); return; }
    if (state.sheet) history.replaceState({ view: "reader", page: state.open.id, sheet: kind }, "");
    openSheet(kind, !!state.sheet);
  }
  $("readerMore").addEventListener("click", () => toggleSheet("page"));
  $("readerAa").addEventListener("click", () => toggleSheet("reading"));
  $("sheetCatch").addEventListener("click", () => history.back());
  addEventListener("keydown", (e) => { if (e.key === "Escape" && state.sheet) history.back(); });
  addEventListener("popstate", (e) => route(e.state));
  addEventListener("online", () => { showOffline(); renderLibrary(); });
  addEventListener("offline", () => { showOffline(); renderLibrary(); });

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
