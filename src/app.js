// Carry-on: the shell. Version, theme, the library, saving, the reader and
// Settings, and the screens moving between them.
(function () {
  const APP_VERSION = "0.19.0";
  window.CarryOn.version = APP_VERSION;

  const C = window.CarryOn;
  const M = C.motion;
  const THEMES = ["paper", "sepia", "night"];
  const THEME_KEY = "carryon.theme";
  const IMAGES_KEY = "carryon.images";
  const READING_KEY = "carryon.reading";
  const FILTER_KEY = "carryon.filter";
  const SEEN_KEY = "carryon.seenVersion";
  const SORT_KEY = "carryon.sort";

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
    // Whether a tapped image is up full screen over the reader.
    image: false,
    batch: false,
    news: false,
    // The folder whose screen is up (its name), under the reader if a page is open.
    folder: null,
    // Which pages the library shows: "all", "unread", "finished" or "#tag".
    filter: load(FILTER_KEY, "all"),
    // What's typed in the library's search field, and whether it's open.
    query: "",
    searchOpen: false,
    // The row of tag chips under the status chips.
    tagsOpen: false,
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
  const sizeOf = (pages) => pages.reduce((sum, p) => sum + (p.bytes || 0), 0);
  const totalBytes = () => sizeOf(state.pages);
  const countLine = (n) => n + (n === 1 ? " page" : " pages");
  const pagesLine = (n) => countLine(n) + " · " + formatSize(totalBytes());

  function thumbUrl(p) {
    if (!p.thumb) return null;
    if (/^https?:/.test(p.thumb)) return p.thumb;
    const base = C.store.pageDirUrl(p.id);
    return base ? base + p.thumb : null;
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
          el("button", { class: "btn-small", type: "button", onclick: () => { dropFailed(s); savePage(s.url, s.folder); } }, "Try again"),
          el("button", { class: "btn-quiet", type: "button", onclick: () => dropFailed(s) }, "Remove"))));
  }

  function dropFailed(s) {
    state.saving = state.saving.filter((x) => x !== s);
    renderLibrary();
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
    const card = $("library").querySelector('[data-key="' + CSS.escape("s:" + s.key) + '"]');
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
  function pageCard(p, found) {
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
    return el("div", { class: "card", "data-ids": p.id },
      el("button", { class: "card-open", type: "button", "aria-label": p.title, onclick: () => tapPages([p.id], () => openPage(p.id)) }),
      pickMark(),
      thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : null,
      el("span", { class: "card-body" },
        el("span", { class: "card-site", dir: "auto" }, p.site, p.folder ? " · " + p.folder : null, ...(p.tags || []).map((t) => el("span", { class: "card-tag" }, " · #" + t))),
        el("span", { class: "card-title", dir: "auto" }, p.title),
        found ? el("span", { class: "card-found", dir: "auto" }, found) : null,
        el("span", { class: "card-status" }, facts, status ? " · " : null, status, retry ? " · " : null, retry),
        started ? el("span", { class: "progress thin", role: "progressbar", "aria-label": "Read so far",
          "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p.at * 100)) },
          el("span", { class: "progress-fill", style: "transform: scaleX(" + p.at + ")" })) : null));
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

  // Search sits behind its icon; closing it clears what was typed.
  function toggleSearch(open) {
    state.searchOpen = open;
    $("searchBtn").setAttribute("aria-expanded", String(open));
    $("searchBox").hidden = !open;
    if (open) { M.arrive($("searchBox"), -8); $("librarySearch").focus(); return; }
    if (state.query) clearSearch();
    searchNote("");
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

  // Status first (All, Unread, Finished), then Tags, which opens a row of
  // its own so a long tag list doesn't push the status chips away.
  function renderFilters() {
    const box = $("filters"), row = $("tagFilters");
    const tags = allTags();
    const tagOn = state.filter.startsWith("#");
    box.hidden = !state.pages.length;
    row.hidden = box.hidden || !tags.length || !(state.tagsOpen || tagOn);
    if (box.hidden) return;
    const chip = (f, label) => el("button", { class: "chip" + (state.filter === f ? " on" : ""), type: "button",
      "aria-pressed": String(state.filter === f), onclick: () => setFilter(state.filter === f && f !== "all" ? "all" : f) }, label);
    const tagsChip = tags.length ? el("button", { class: "chip" + (tagOn ? " on" : ""), type: "button",
      "aria-expanded": String(!row.hidden), "aria-controls": "tagFilters",
      onclick: () => {
        if (tagOn) { state.tagsOpen = false; setFilter("all"); return; }
        state.tagsOpen = !state.tagsOpen;
        renderFilters();
      } }, tagOn ? state.filter : "Tags", el("span", { class: "chip-caret", "aria-hidden": "true" }, tagOn ? "×" : "▾")) : null;
    fill(box, chip("all", "All"), chip("unread", "Unread"), chip("finished", "Finished"), tagsChip);
    if (!row.hidden) fill(row, ...tags.map((t) => chip("#" + t, "#" + t)));
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
    const select = el("select", { class: "sort", "aria-label": "Order", onchange: (e) => {
      state.sort = e.target.value;
      store(SORT_KEY, state.sort);
      renderLibrary();
    } }, ...SORTS.map(([v, label]) => el("option", { value: v }, label)));
    select.value = BY[state.sort] ? state.sort : "saved";
    const wrap = el("label", { class: "sort-wrap" }, select);
    wrap.insertAdjacentHTML("afterbegin", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>');
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

  const pageSig = (p) => [p.title, readingLine(p), p.missing, p.thumb, Math.round((p.at || 0) * 50), navigator.onLine, (p.tags || []).join(","), p.folder, p.mode].join("|");

  // The pages the library is showing, for Select all.
  let onScreen = [];

  // Cards are keyed and kept between renders; only ones that weren't there
  // before arrive on a spring, so a re-render never replays the list.
  // Under All the library is in sections: Continue reading, Folders, then
  // the pages in no folder. A status or tag filter, or a search, lists the
  // pages themselves.
  let firstRender = true;
  function renderLibrary() {
    const root = $("library");
    const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
    const n = state.pages.length;
    // A tag filter whose last page lost the tag (or was deleted) falls back to All.
    if (n && state.filter.startsWith("#")
      && !allTags().some((t) => sameTag(t, state.filter.slice(1)))) { state.filter = "all"; store(FILTER_KEY, "all"); }
    renderFilters();
    $("libraryMeta").textContent = n ? pagesLine(n) : "Nothing saved yet";
    $("searchBtn").hidden = $("selectBtn").hidden = !n;
    if (!n && state.searchOpen) toggleSearch(false);
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
    const flat = ts.length || state.filter !== "all";
    if (!flat) {
      const going = !state.select && continuePage();
      if (going) {
        keep("h:continue", () => sectionHead("Continue reading"));
        keep("c:" + going.id, () => pageCard(going), pageSig(going));
      }
      const folders = foldersByUse();
      if (folders.length) {
        keep("h:folders", () => sectionHead("Folders"));
        keep("folders", () => foldersStrip(folders), folders.map((f) => [f, ...folderPages(f).map((x) => x.id + readingLine(x) + (x.thumb || ""))].join("|")).join("‖"));
      }
    }
    const loose = flat ? pages : pages.filter((p) => !p.folder);
    if (loose.length) {
      const label = (ts.length ? "Found" : state.filter === "all" ? (n > loose.length ? "Pages in no folder" : "Pages") : filterName()) + " · " + loose.length;
      keep("h:pages", () => sectionHead(label, sortControl()), label);
    }
    for (const p of loose) {
      if (ts.length) {
        const s = found.get(p.id);
        keep("q:" + p.id, () => pageCard(p, s), [pageSig(p), s].join("|"));
      } else keep("p:" + p.id, () => pageCard(p), pageSig(p));
    }
    if (n && !pages.length && ts.length) {
      keep("none:q", () => el("div", { class: "empty wide" },
        el("p", { class: "empty-text", "data-q": "" }),
        el("button", { class: "btn-quiet", type: "button", onclick: clearSearch }, "Clear search")));
      nodes[nodes.length - 1].querySelector("[data-q]").textContent = searching ? "Searching…"
        : "Nothing matches “" + state.query.trim() + "”" + (state.filter === "all" ? "." : " in " + filterName() + ".");
    } else if (n && !pages.length) {
      keep("none:" + state.filter, () => el("div", { class: "empty wide" },
        el("p", { class: "empty-text" }, state.filter === "unread" ? "You've started everything you saved."
          : state.filter === "finished" ? "Nothing finished yet." : "No pages tagged " + state.filter + "."),
        el("button", { class: "btn-quiet", type: "button", onclick: () => setFilter("all") }, "Show all")));
    }
    if (!n && !state.saving.length) {
      keep("empty", () => el("div", { class: "empty wide" },
        el("h2", { class: "empty-title" }, "Pages you take with you"),
        el("p", { class: "empty-text" },
          "Share a page to Carry-on from your browser, or paste its link below. It stays readable with no connection, with a link back to the original.")));
    }
    root.replaceChildren(...nodes);
    for (const s of state.saving) updateSavingCard(s);
    if (!firstRender) fresh.forEach((node) => M.arrive(node));
    firstRender = false;
    paintPicks();
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

  async function savePage(url, folder) {
    const existing = savedAs(url);
    if (existing) { toast("Already in your library"); openPage(existing.id); return; }
    if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) return;
    state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
    const job = newJob(url, folder);
    state.saving.unshift(job);
    renderLibrary();
    const meta = await runJob(job);
    if (meta) toast(meta.missing ? "Saved. Some previews are missing." : "Saved for offline reading");
  }

  // Several links saved one after another, in order, optionally into a
  // folder (so its pages follow the order of the links). A link already
  // saved isn't saved again; it just joins the folder at its place.
  async function saveAll(urls, folder, tags = [], mode) {
    const name = folder ? folderName(folder) : null;
    const jobs = urls.filter((u) => !state.saving.some((s) => !s.error && sameUrl(s.url, u))).map((u) => ({ ...newJob(u, name), tags, mode }));
    state.saving = state.saving.filter((s) => !(s.error && jobs.some((j) => sameUrl(j.url, s.url))));
    const fresh = jobs.filter((j) => !savedAs(j.url));
    fresh.forEach((j) => { j.waiting = true; });
    state.saving = [...fresh, ...state.saving];
    renderLibrary();
    let saved = 0, failed = 0, had = 0;
    for (const job of jobs) {
      const existing = savedAs(job.url);
      if (existing) {
        had++;
        if (name) { existing.folder = name; existing.folderAt = Date.now(); }
        if (tags.length) existing.tags = withTags(existing.tags, tags);
        if (name || tags.length) { await C.store.writeIndex(state.pages); renderLibrary(); if (state.folder) renderFolder(); }
        continue;
      }
      job.waiting = false;
      updateSavingCard(job);
      if (await runJob(job)) saved++; else failed++;
      if (state.folder) renderFolder();
    }
    if (!jobs.length) return;
    toast([saved ? "Saved " + countLine(saved) + (name ? " into " + name : "") : "",
      had ? had + " already saved" + (name && !saved ? ", now in " + name : "") : "",
      failed ? failed + " couldn't be saved" : ""].filter(Boolean).join(" · ") + ".");
  }

  // Saves one queued link; resolves to its meta, or null when it failed
  // (the card then says why and offers Try again).
  async function runJob(job) {
    job.started = Date.now();
    try {
      const meta = await C.save.save(job.url, {
        mode: job.mode || load(IMAGES_KEY, "previews"),
        onProgress: (p) => {
          if (p.stage === "drawing") job.drawing = true;
          if (p.stage === "images") { job.done = p.done; job.total = p.total; }
          updateSavingCard(job);
        },
      });
      meta.requested = job.url;
      if (job.folder) { meta.folder = folderName(job.folder); meta.folderAt = Date.now(); }
      if (job.tags && job.tags.length) meta.tags = withTags([], job.tags);
      state.pages.unshift(meta);
      await C.store.writeIndex(state.pages);
      state.saving = state.saving.filter((s) => s !== job);
      renderLibrary();
      return meta;
    } catch (e) {
      job.error = e instanceof C.save.SaveError ? e.message : "Couldn't save this page. Try again.";
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

  function pushScreen(screen) {
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
    if (screen.dataset.beside) return M.leave(screen).then(() => { screen.hidden = true; });
    const under = below(screen);
    under.inert = false;
    M.under(under, false);
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
    if (!fromHistory) history.pushState(readerState(p), "");
    const shown = show(p, html);
    pushScreen($("readerView"));
    await shown;
    $("readerFrame").focus();
  }

  // The history entry for a page in the reader (and the sheet over it).
  const readerState = (p, sheet, image) => ({ view: "reader", page: p.id, folder: state.folder || undefined, sheet: sheet || undefined, image: image || undefined });

  function show(p, html) {
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
      top: () => $("readerView").querySelector(".reader-bar").offsetHeight,
    }).then(() => { $("readerContents").hidden = C.reader.headings().length < 2; });
  }

  // A tap on the text hides the bar for reading, or brings it back.
  function toggleBar() {
    if (state.sheet) return;
    const away = !$("readerView").classList.contains("bar-away");
    $("readerView").classList.toggle("bar-away", away);
    if (!away) readerFoot(C.reader.position());
  }

  // Under the bar's line along the bottom: the section being read and the
  // minutes left, shown with the bar.
  function readerFoot(at) {
    const p = state.open;
    if (!p) return;
    $("readLeft").textContent = at >= 0.995 ? "End" : Math.max(1, Math.ceil((p.minutes || 1) * (1 - at))) + " min left";
    $("readSection").textContent = C.reader.section();
  }

  // The bar along the bottom fills as the page is read. The top bar slides
  // away while reading on down and comes back on any scroll up, at the top
  // and at the end, and while a sheet is up.
  let lastY = 0;
  function readerScrolled(at, y) {
    $("readProgress").firstElementChild.style.transform = "scaleX(" + at + ")";
    if (!$("readerView").classList.contains("bar-away")) readerFoot(at);
    const bar = $("readerView").querySelector(".reader-bar").offsetHeight;
    const dy = y - lastY;
    let away = $("readerView").classList.contains("bar-away");
    if (y <= bar || at >= 0.999 || state.sheet) away = false;
    else if (dy > 12) away = true;
    else if (dy < -12) away = false;
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
    const next = neighbour(p, 1);
    if (next) return { over: "Next in " + p.folder, title: next.title, go: () => goTo(next) };
    if (!p.next) return null;
    const had = savedAs(p.next);
    if (had) return { over: "Next on " + p.site, title: had.title, go: () => goTo(had) };
    return { over: "Next on " + p.site, title: "Save it and read on", go: () => followAndOpen(p) };
  }

  async function followAndOpen(p) {
    if (!navigator.onLine) { toast("You're offline. The next page saves when you're back online."); return; }
    toast("Saving the next page…");
    const got = await follow(p, 1, true);
    if (got && state.open === p) goTo(got);
  }

  // Next or previous in a folder: the reader stays and its page changes,
  // in the same history entry, so back still leaves the reader.
  async function goTo(p) {
    let html;
    try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
    if (!html) { toast("This page's file is missing. Delete it and save it again."); return; }
    if (state.sheet) await new Promise((resolve) => { addEventListener("popstate", () => resolve(), { once: true }); history.back(); });
    if (positionTimer) savePositions();
    history.replaceState(readerState(p), "");
    await show(p, html);
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
    if (state.folder) renderFolder();
    closeSheet(true);
    if (state.image) { state.image = false; $("imageViewer").hidden = true; $("viewerImg").removeAttribute("src"); }
    state.open = null;
    popScreen($("readerView")).then(() => { if (!state.open) C.reader.close(); });
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
    page: { button: "readerMore", label: "This page", build: () => pageSheet(state.open, "reader") },
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
    const thumb = withThumb ? thumbUrl(withThumb) : null;
    const tile = el("div", { class: "tile", role: "listitem", "data-ids": list.map((p) => p.id).join(",") },
      el("button", { class: "card-open", type: "button", "aria-label": name + ", folder, " + list.length + " pages, " + done + " read",
        onclick: () => tapPages(list.map((p) => p.id), () => openFolder(name)) }),
      pickMark(),
      el("span", { class: "tile-thumb" + (thumb ? "" : " blank"), "aria-hidden": "true" },
        thumb ? el("img", { src: thumb, alt: "", loading: "lazy" }) : null),
      el("span", { class: "tile-name", dir: "auto" }, name),
      el("span", { class: "tile-meta" }, (done === list.length ? "All read" : done + " of " + list.length + " read") + " · " + formatSize(sizeOf(list))),
      el("span", { class: "progress thin", "aria-hidden": "true" },
        el("span", { class: "progress-fill", style: "transform: scaleX(" + done / list.length + ")" })));
    if (!thumb) tile.querySelector(".tile-thumb").innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
    return tile;
  }

  // Scrolls sideways at phone width, wraps on a desktop.
  const foldersStrip = (names) => el("div", { class: "folder-strip wide", role: "list", "aria-label": "Folders" }, ...names.map(folderTile));

  function openFolder(name, fromHistory) {
    if (state.folder && sameTag(state.folder, name)) return;
    if (!folderPages(name).length) return;
    state.folder = folderPages(name)[0].folder;
    folderMode = "";
    renderFolder();
    if (!fromHistory) history.pushState({ view: "folder", folder: state.folder }, "");
    $("folderBody").scrollTop = 0;
    pushScreen($("folderView")).then(() => $("folderBack").focus());
  }

  function closeFolder() {
    if (!state.folder) return;
    state.folder = null;
    popScreen($("folderView"));
  }

  // The folder screen's mode: reading (""), "order" (move buttons on each
  // row) or "remove" (the two ways to remove it, spelled out).
  let folderMode = "";

  function renderFolder() {
    const list = folderPages(state.folder);
    $("folderTitle").textContent = state.folder;
    if (!list.length) {
      $("folderBody").replaceChildren(el("p", { class: "empty-text" }, "This folder is empty."));
      return;
    }
    const next = folderNext(list);
    const done = list.filter((p) => p.finished).length;
    const go = done === list.length ? "Read again from the start" : (next.at > 0.02 || done ? "Continue: " : "Start: ") + next.title;
    const picking = !!state.select;
    if (picking) folderMode = "";
    fill($("folderBody"),
      el("p", { class: "meta folder-meta" }, countLine(list.length) + " · " + done + " read · " + formatSize(sizeOf(list))),
      picking ? null : el("button", { class: "btn-primary folder-go", type: "button", dir: "auto",
        onclick: () => openPage(done === list.length ? list[0].id : next.id) }, go),
      el("ol", { class: "group folder-list" + (folderMode === "order" ? " ordering" : "") },
        ...list.map((p, i) => el("li", folderMode ? { "data-id": p.id } : { "data-id": p.id, "data-ids": p.id },
          el("button", { class: "row chapter" + (p === next && done < list.length ? " now" : ""), type: "button", onclick: () => tapPages([p.id], () => openPage(p.id)) },
            pickMark(),
            el("span", { class: "chapter-n", "aria-hidden": "true" }, String(i + 1)),
            el("span", { class: "choice-text" },
              el("span", { class: "row-label", dir: "auto" }, p.title),
              el("span", { class: "choice-note" + (p.finished ? "" : p.at > 0.02 ? " accent" : "") }, readingLine(p)))),
          folderMode === "order" ? moveButton(p, i, -1, list.length) : null,
          folderMode === "order" ? moveButton(p, i, 1, list.length) : null))),
      folderMode || picking ? null : followControls(list[list.length - 1]),
      picking ? null : folderActions(list));
    paintPicks();
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

  // Swaps a page with its neighbour. The folder's places are the pages'
  // own `folderAt`s, made distinct and handed out again in the new order,
  // so nothing else in the folder moves.
  async function movePage(p, step) {
    const list = folderPages(p.folder);
    const i = list.indexOf(p), j = i + step;
    if (i < 0 || j < 0 || j >= list.length) return;
    const places = list.map((q) => q.folderAt || q.savedAt || 0);
    for (let k = 1; k < places.length; k++) if (places[k] <= places[k - 1]) places[k] = places[k - 1] + 1;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((q, k) => { q.folderAt = places[k]; });
    await C.store.writeIndex(state.pages);
    renderFolder();
    renderLibrary();
    const row = $("folderBody").querySelector('li[data-id="' + p.id + '"]');
    const again = row && row.querySelector('.move[data-step="' + step + '"]');
    const focus = again && !again.disabled ? again : row && row.querySelector(".move:not(:disabled)");
    if (focus) focus.focus();
  }

  function folderActions(list) {
    const n = list.length;
    const mode = (m) => () => { folderMode = m; renderFolder(); };
    if (folderMode === "remove") {
      return el("div", { class: "folder-actions remove", role: "group", "aria-label": "Remove " + state.folder },
        el("p", { class: "meta" }, "Remove “" + state.folder + "”?"),
        el("button", { class: "sheet-row", type: "button", onclick: () => removeFolder(false) },
          "Remove the folder, keep its " + countLine(n)),
        el("button", { class: "sheet-row danger", type: "button", onclick: () => removeFolder(true) },
          "Delete the folder and its " + countLine(n)),
        el("button", { class: "btn-quiet", type: "button", onclick: mode("") }, "Cancel"));
    }
    if (folderMode === "order") {
      return el("div", { class: "folder-actions" },
        el("button", { class: "btn-primary", type: "button", onclick: mode("") }, "Done"));
    }
    return el("div", { class: "folder-actions" },
      el("button", { class: "btn-quiet", type: "button", onclick: () => openBatch("", false, state.folder) }, "Add pages"),
      el("button", { class: "btn-quiet", type: "button", onclick: () => startSelect([]) }, "Select"),
      n > 1 ? el("button", { class: "btn-quiet", type: "button", onclick: mode("order") }, "Reorder") : null,
      el("button", { class: "btn-quiet", type: "button", onclick: renameFolder }, "Rename"),
      el("button", { class: "btn-quiet danger", type: "button", onclick: mode("remove") }, "Remove folder"));
  }

  // Takes the folder off its pages, or deletes them with it (asked once
  // more, since that can't be undone), then goes back to the library.
  async function removeFolder(withPages) {
    const name = state.folder;
    const list = folderPages(name);
    if (withPages && !confirm("Delete “" + name + "” and its " + countLine(list.length) + " from this phone?")) return;
    for (const p of list) {
      if (withPages) await C.store.removePage(p.id);
      else { delete p.folder; delete p.folderAt; }
    }
    if (withPages) state.pages = state.pages.filter((p) => !list.includes(p));
    await C.store.writeIndex(state.pages);
    folderMode = "";
    history.back();
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
  };
  function tileButton(icon, label, onclick) {
    const b = el("button", { class: "tile-btn", type: "button", onclick }, el("span", { class: "tile-icon", "aria-hidden": "true" }), label);
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
    const draw = () => {
      const series = inReader ? [neighbours(p), neighbour(p, 1) ? null : followControls(p)].filter(Boolean) : [];
      fill(box,
        inReader ? null : el("div", { class: "menu-head" },
          el("p", { class: "menu-title", dir: "auto" }, p.title),
          el("p", { class: "meta" }, [p.site, p.folder, readingLine(p), formatSize(p.bytes || 0)].filter(Boolean).join(" · "))),
        el("div", { class: "tile-row" },
          inReader ? null : tileButton("open", "Open", () => back().then(() => openPage(p.id))),
          tileButton("share", "Share", () => shareLink(p)),
          tileButton("send", "Send", (e) => sendPage(p, e.currentTarget)),
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
    if (!list.length || !confirm("Delete " + countLine(list.length) + " from this phone?")) return;
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
    folder: { label: "Folder", build: folderSheet },
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
      toast(target ? "Moved " + countLine(n) + " to " + target : "Took " + countLine(n) + " out of their folders");
    };
    const input = el("input", { class: "tag-input", type: "text", placeholder: "New folder", "aria-label": "New folder",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && cleanTag(input.value)) { e.preventDefault(); move(input.value); } });
    const folders = allFolders();
    return el("div", { class: "page-controls" },
      el("h2", { class: "menu-title" }, "Move " + countLine(n) + " to"),
      folders.length ? el("div", { class: "chips" }, ...folders.map((f) => el("button", { class: "chip", type: "button", onclick: () => move(f) }, f))) : null,
      input,
      list.some((p) => p.folder) ? el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: () => move(null) }, el("span", { class: "row-label" }, "Take out of their folders"))) : null);
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

  // The page as one HTML file that opens in any browser, and in Carry-on
  // through Settings, Restore or open.
  async function sendPage(p, btn) {
    btn.disabled = true;
    try {
      const { name, html } = await C.backup.exportPage(p);
      if (!(await C.platform.saveAndShare(name, html))) C.platform.download(name, new Blob([html], { type: "text/html" }));
    } catch (e) {
      console.error(e);
      toast("Couldn't make the file. Try again.");
    }
    btn.disabled = false;
  }

  async function backUp(btn) {
    if (!state.pages.length) { toast("There's nothing to back up yet."); return; }
    btn.disabled = true;
    const label = btn.querySelector(".row-label");
    label.textContent = "Backing up…";
    try {
      const out = await C.backup.exportLibrary(state.pages, (done, total) => { label.textContent = "Backing up, " + done + " of " + total; });
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
        const n = res.added + res.replaced;
        toast((n ? "Restored " + countLine(n) : "Nothing new to restore") + (res.kept ? ". " + res.kept + " already here" + (res.kept === 1 ? " was" : " were") + " kept." : "."));
      } else {
        const meta = await C.backup.importPage(await file.text(), (url) => !!savedAs(url));
        if (meta.already) {
          toast("Already in your library");
        } else {
          state.pages.unshift(meta);
          await C.store.writeIndex(state.pages);
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
      el("p", { class: "footnote" }, "One file with every page, its pictures, tags, folders and where you were. Keep it off the phone. Restoring keeps whichever copy of a page was saved last. A page sent as a file opens here too."));
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
    const input = el("input", { class: "tag-input", type: "text", "aria-label": p.folder ? "Move to a new folder" : "Add to a new folder",
      placeholder: p.folder ? "New folder" : "Add to a new folder", maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (cleanTag(input.value)) setFolder(p, input.value).then(redraw);
    });
    return el("div", { class: "rc-row tall" }, el("span", { class: "rc-label" }, "Folder"),
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

  function openBatch(text, fromHistory, folder) {
    if (state.batch) return;
    state.batch = true;
    renderBatch(linksFrom(text).join("\n"), folder || null);
    if (!fromHistory) history.pushState({ view: "batch", folder: state.folder || undefined }, "");
    $("batchBody").scrollTop = 0;
    pushScreen($("batchView")).then(() => $("batchBack").focus());
  }

  function closeBatch() {
    if (!state.batch) return;
    state.batch = false;
    popScreen($("batchView"));
  }

  function renderBatch(text, preset) {
    let folder = preset;
    let mode = load(IMAGES_KEY, "previews");
    const tags = [];
    const area = el("textarea", { class: "batch-links", rows: "6", "aria-label": "Links, one a line", spellcheck: "false",
      autocapitalize: "off", autocomplete: "off", dir: "ltr" });
    area.value = text;
    const count = el("p", { class: "meta batch-count" });
    const go = el("button", { class: "btn-primary batch-go", type: "submit" });
    const chips = el("div", { class: "chips" });
    const input = el("input", { class: "tag-input", type: "text", placeholder: "New folder", "aria-label": "New folder",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
    const sync = () => {
      const n = linksFrom(area.value).length;
      count.textContent = n ? n + (n === 1 ? " link" : " links") : "No links yet. Paste them here, one a line.";
      go.textContent = n ? "Save " + countLine(n) + (folder ? " into " + folder : "") : "Save";
      go.disabled = !n;
      chips.querySelectorAll(".chip").forEach((c) => {
        const on = c.dataset.folder === (folder || "");
        c.classList.toggle("on", on);
        c.setAttribute("aria-pressed", String(on));
      });
    };
    const pick = (f, typed) => { folder = f; if (!typed) input.value = ""; sync(); };
    chips.append(...[null, ...allFolders()].map((f) => el("button", { class: "chip", type: "button", "data-folder": f || "",
      onclick: () => pick(f) }, f || "None")));
    // Tags for every page this saves, chosen the same way as in ⋯.
    const tagBox = el("div", { class: "tag-edit" });
    const drawTags = () => {
      const others = allTags().filter((t) => !tags.some((x) => sameTag(x, t)));
      const tagInput = el("input", { class: "tag-input", type: "text", placeholder: "Add a tag", "aria-label": "Add a tag",
        maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
      const add = (raw) => {
        const t = cleanTag(raw);
        if (!t || tags.some((x) => sameTag(x, t))) return;
        tags.push(allTags().find((x) => sameTag(x, t)) || t);
        drawTags();
        tagBox.querySelector(".tag-input").focus({ preventScroll: true });
      };
      tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(tagInput.value); } });
      fill(tagBox,
        el("div", { class: "chips" },
          ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": "Remove tag " + t,
            onclick: () => { tags.splice(tags.indexOf(t), 1); drawTags(); } }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×"))),
          tagInput),
        others.length ? el("div", { class: "chips" },
          ...others.slice(0, 12).map((t) => el("button", { class: "chip", type: "button", "aria-label": "Add tag " + t, onclick: () => add(t) }, "+ " + t))) : null);
    };
    drawTags();
    area.addEventListener("input", sync);
    input.addEventListener("input", () => pick(cleanTag(input.value) ? folderName(input.value) : null, true));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    const form = el("form", { class: "batch-form" },
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Links"), area, count),
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Folder"),
        el("div", { class: "tag-edit" }, chips, input),
        el("p", { class: "meta" }, "Pages in a folder keep the order of the links.")),
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Tags"), tagBox),
      C.platform.native ? el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Images"),
        seg("batch-images", "Images", [
          { value: "previews", label: "Previews" }, { value: "full", label: "Full" }, { value: "links", label: "Links" },
        ], mode, (v) => { mode = v; }),
        el("p", { class: "meta" }, "Full images for comics, maps and diagrams. Settings picks the usual choice.")) : null,
      go);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const urls = linksFrom(area.value);
      if (!urls.length) return;
      history.back();
      saveAll(urls, folder, tags, mode);
    });
    $("batchBody").replaceChildren(form);
    sync();
  }

  // ---- Following a site's next links ----
  // A page saved with a next link (save.js) can bring its next pages in
  // after it, into its folder: one link at a time, each saved page giving
  // the next. A page not yet in a folder starts one, named after it.

  // "The Wandering Inn - Chapter 1.01" → "The Wandering Inn".
  function seriesName(p) {
    const t = p.title.replace(/[\s\-–—:|,·]*(chapter|ch\.?|part|episode|ep\.?|book|vol\.?|פרק|capítulo|chapitre|kapitel)\s*[\d.ivxl]+\b.*$/iu, "").trim();
    return cleanTag(t && t !== p.title ? t : p.title) || p.site;
  }

  // Saves up to `n` pages following `from`'s next links; resolves to the
  // first one saved (or already there), or null. Quiet when asked.
  async function follow(from, n, quiet) {
    if (from.next === undefined) {
      try { from.next = await C.save.findNext(from.url); } catch (e) { toast("Couldn't reach " + from.site + " to find the next page."); return null; }
      await C.store.writeIndex(state.pages);
      if (!from.next) { toast("There's no next page."); return null; }
    }
    if (!from.folder) { from.folder = folderName(seriesName(from)); from.folderAt = Date.now(); }
    const name = from.folder;
    const seen = new Set([from.url]);
    let url = from.next, saved = 0, first = null, failed = false;
    while (url && saved < n && !seen.has(url)) {
      seen.add(url);
      const had = savedAs(url);
      if (had) {
        if (!had.folder) { had.folder = name; had.folderAt = Date.now(); }
        first = first || had;
        url = had.next;
        continue;
      }
      if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) break;
      state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
      const job = newJob(url, name);
      state.saving.unshift(job);
      renderLibrary();
      const meta = await runJob(job);
      if (!meta) { failed = true; break; }
      saved++;
      first = first || meta;
      url = meta.next;
      if (state.folder) renderFolder();
    }
    await C.store.writeIndex(state.pages);
    renderLibrary();
    if (state.folder) renderFolder();
    if (!quiet || failed) {
      toast(saved ? "Saved " + countLine(saved) + " into " + name + (failed ? ". The next one couldn't be saved." : !url ? ". That's the last one." : ".")
        : failed ? "Couldn't save the next page." : first ? "The next page is already saved." : "There's no next page.");
    }
    return first;
  }

  // "Save the next 1 · 5 · 10" for the last page of a run with a next link.
  function followControls(p) {
    // Pages saved before 0.10.0 never looked for a next link (`next` is
    // missing, not ""); follow() reads it from the original on first use.
    const unknown = p && p.next === undefined && p.licence !== "wikipedia";
    if (!p || (!unknown && (!p.next || savedAs(p.next)))) return null;
    const busy = () => state.saving.some((s) => !s.error && s.folder && p.folder && sameTag(s.folder, p.folder));
    return el("div", { class: "rc-row follow" }, el("span", { class: "rc-label" }, "Save next"),
      el("div", { class: "chips" }, ...[1, 5, 10].map((n) => el("button", { class: "chip", type: "button",
        "aria-label": "Save the next " + countLine(n) + " from " + p.site,
        onclick: (e) => {
          if (busy()) return;
          if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
          e.currentTarget.closest(".follow").querySelectorAll("button").forEach((b) => { b.disabled = true; });
          follow(p, n).then(() => { if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build()); });
        } }, String(n)))));
  }

  async function renameFolder() {
    const old = state.folder;
    const raw = prompt("Rename “" + old + "”", old);
    const name = raw && cleanTag(raw);
    if (!name || name === old) return;
    const clash = allFolders().find((n) => sameTag(n, name) && !sameTag(n, old));
    if (clash) { toast("There's already a folder called " + clash + "."); return; }
    for (const p of folderPages(old)) p.folder = name;
    await C.store.writeIndex(state.pages);
    state.folder = name;
    history.replaceState({ view: "folder", folder: name }, "");
    renderFolder();
    renderLibrary();
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
      el("h2", { class: "overline" }, g.label),
      list,
      g.footnote ? el("p", { class: "footnote" }, g.footnote) : null);
  }

  function readingGroup() {
    return el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Reading type"),
      el("div", { class: "group" },
        el("p", { class: "reading-sample" }, "The page is the product. Everything else gets out of its way."),
        readingControls(false)),
      el("p", { class: "footnote" }, "The same as Aa while you read."));
  }

  function storageGroup() {
    const n = state.pages.length;
    const list = el("div", { class: "group" });
    if (!n) list.append(el("div", { class: "row" }, el("span", { class: "row-label muted" }, "Nothing saved yet")));
    for (const p of [...state.pages].sort((a, b) => (b.bytes || 0) - (a.bytes || 0))) {
      list.append(el("button", { class: "row", type: "button", onclick: () => toLibrary().then(() => openPage(p.id)) },
        el("span", { class: "row-label", dir: "auto" }, p.title),
        el("span", { class: "row-value" }, formatSize(p.bytes || 0))));
    }
    return el("section", { class: "settings-section" },
      el("p", { class: "storage-total" }, formatSize(totalBytes())),
      el("p", { class: "section-lead" }, n ? countLine(n) + " on this phone. Delete a page from its menu: press and hold it in the library." : "Pages you save show here with their size."),
      el("h2", { class: "overline" }, "Pages by size"),
      list);
  }

  function aboutGroup() {
    const list = el("div", { class: "group" });
    const releases = C.platform.releasesUrl() || "https://github.com/danielnoam/carry-on/releases/latest";
    list.append(el("div", { class: "row" }, el("span", { class: "row-label" }, "Version"), el("span", { class: "row-value" }, APP_VERSION)));
    list.append(el("a", { class: "row", href: releases, target: "_blank", rel: "noopener" },
      el("span", { class: "row-label accent" }, "Releases and source"),
      el("span", { class: "row-value", "aria-hidden": "true" }, "↗")));
    return el("section", { class: "settings-section" },
      list,
      el("p", { class: "footnote" }, "Pages stay on this phone. Carry-on collects nothing."));
  }

  // Settings is a short menu; each entry is a screen of its own.
  const updateOut = () => ["available", "downloading", "ready"].includes(upd.phase) && upd.latest;
  const SECTIONS = {
    appearance: { title: "Appearance", build: () => [choiceGroup(SETTINGS[0]), readingGroup()],
      value: () => SETTINGS[0].options.find((o) => o.value === state.theme).label },
    saving: { title: "Saving", build: () => [choiceGroup(SETTINGS[1])],
      value: () => SETTINGS[1].options.find((o) => o.value === SETTINGS[1].get()).label },
    storage: { title: "Storage and backup", build: () => [storageGroup(), backupGroup()], value: () => formatSize(totalBytes()) },
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
    if (view !== "select" && !(view === "menu" && s.select)) endSelect();
    if (view !== "news") closeNews();
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
    if (view === "reader" && (!state.open || state.open.id !== s.page)) openPage(s.page, true);
    if (state.image && !(view === "reader" && s.image)) closeImage();
    if (view === "reader" && s.image && !state.image) history.back();
    if (view === "reader" && s.sheet !== state.sheet) closeSheet();
    if (view === "reader" && s.sheet && state.open && state.open.id === s.page) openSheet(s.sheet, true);
    if (inSettings) { openSettings(true); if (s.section) openSection(s.section, true); }
    if (view === "news") openNews(true);
  }

  // Back to the library from whatever screen is up, through history so the
  // stack stays honest; resolves once it's there.
  function toLibrary() {
    if (!(history.state && history.state.view)) return Promise.resolve();
    return new Promise((resolve) => {
      addEventListener("popstate", () => resolve(), { once: true });
      history.go(-[state.folder, state.open, state.sheet, state.image, state.settings, state.section, state.batch, state.news, state.select, state.menu].filter(Boolean).length || -1);
    });
  }

  $("settingsBtn").addEventListener("click", () => openSettings());
  $("sectionBack").addEventListener("click", () => history.back());
  $("searchBtn").addEventListener("click", () => toggleSearch(!state.searchOpen));
  $("selectBtn").addEventListener("click", () => startSelect([]));
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
  $("batchBack").addEventListener("click", () => history.back());
  $("severalBtn").addEventListener("click", () => openBatch(""));
  $("librarySearch").addEventListener("input", onSearch);
  $("librarySearch").addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (state.query) clearSearch(); else { toggleSearch(false); $("searchBtn").focus(); }
  });
  $("searchClear").addEventListener("click", () => { clearSearch(); $("librarySearch").focus(); });
  $("newsBack").addEventListener("click", () => history.back());

  $("saveForm").addEventListener("submit", (e) => {
    e.preventDefault();
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
    if (e.key === "Escape" && !e.defaultPrevented && (state.sheet || state.image || state.menu || state.select)) history.back();
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

  renderLibrary();
  Promise.all([C.platform.ready, C.store.ready]).then(() => C.store.readIndex()).then((pages) => {
    state.pages = Array.isArray(pages) ? pages : [];
    if (history.state && history.state.view) history.replaceState(null, "");
    renderLibrary();
    noteVersion();
    const share = C.platform.plugin("ShareTarget");
    if (share && share.addListener) share.addListener("shared", saveShared);
    saveShared();
  });

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
