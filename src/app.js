// Carry-on: the shell. Version, theme, the library, saving, the reader and
// Settings, and the screens moving between them.
(function () {
  const APP_VERSION = "0.13.0";
  window.CarryOn.version = APP_VERSION;

  const C = window.CarryOn;
  const M = C.motion;
  const THEMES = ["paper", "sepia", "night"];
  const THEME_KEY = "carryon.theme";
  const IMAGES_KEY = "carryon.images";
  const READING_KEY = "carryon.reading";
  const FILTER_KEY = "carryon.filter";
  const SEEN_KEY = "carryon.seenVersion";

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
    batch: false,
    news: false,
    // The folder whose screen is up (its name), under the reader if a page is open.
    folder: null,
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
    return el("div", { class: "card saving failed", role: "group", "aria-label": "Couldn't save " + s.site },
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
    return el("div", { class: "card saving", role: "group", "aria-label": "Saving " + s.site },
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
        el("span", { class: "card-site", dir: "auto" }, p.site, p.folder ? " · " + p.folder : null, ...(p.tags || []).map((t) => el("span", { class: "card-tag" }, " · #" + t))),
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
    // Under All, a folder's pages are one card, where its newest page would be.
    const grouped = new Set();
    for (const p of pages) {
      if (p.folder && state.filter === "all") {
        const k = p.folder.toLocaleLowerCase();
        if (grouped.has(k)) continue;
        grouped.add(k);
        const list = folderPages(p.folder);
        keep("d:" + k, () => folderCard(p.folder), [p.folder, ...list.map((x) => x.id + readingLine(x) + (x.thumb || ""))].join("|"));
        continue;
      }
      keep("p:" + p.id, () => pageCard(p), [p.title, readingLine(p), p.missing, p.thumb, Math.round((p.at || 0) * 50), navigator.onLine, (p.tags || []).join(","), p.folder].join("|"));
    }
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
  async function saveAll(urls, folder) {
    const name = folder ? folderName(folder) : null;
    const jobs = urls.filter((u) => !state.saving.some((s) => !s.error && sameUrl(s.url, u))).map((u) => newJob(u, name));
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
        if (name) { existing.folder = name; existing.folderAt = Date.now(); await C.store.writeIndex(state.pages); renderLibrary(); }
        continue;
      }
      job.waiting = false;
      updateSavingCard(job);
      if (await runJob(job)) saved++; else failed++;
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
        mode: load(IMAGES_KEY, "previews"),
        onProgress: (p) => {
          if (p.stage === "drawing") job.drawing = true;
          if (p.stage === "images") { job.done = p.done; job.total = p.total; }
          updateSavingCard(job);
        },
      });
      meta.requested = job.url;
      if (job.folder) { meta.folder = folderName(job.folder); meta.folderAt = Date.now(); }
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
  const below = (screen) => (screen.id === "readerView" && state.folder ? $("folderView")
    : screen.id === "newsView" && state.settings ? $("settingsView") : $("libraryView"));

  function pushScreen(screen) {
    const under = below(screen);
    under.inert = true;
    screen.hidden = false;
    M.under(under, true);
    return M.pushIn(screen);
  }

  function popScreen(screen) {
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
  const readerState = (p, sheet) => ({ view: "reader", page: p.id, folder: state.folder || undefined, sheet: sheet || undefined });

  function show(p, html) {
    state.open = p;
    $("readerOriginal").href = p.url;
    showOffline();
    $("readProgress").dir = p.dir || "ltr";
    readerScrolled(p.at || 0, 0);
    return C.reader.open($("readerFrame"), html, p, {
      at: p.at || 0, next: endLink(p),
      onPosition: (f) => notePosition(p, f),
      onScroll: readerScrolled,
      top: () => $("readerView").querySelector(".reader-bar").offsetHeight,
    });
  }

  // The bar along the bottom fills as the page is read. The top bar slides
  // away while reading on down and comes back on any scroll up, at the top
  // and at the end, and while a sheet is up.
  let lastY = 0;
  function readerScrolled(at, y) {
    $("readProgress").firstElementChild.style.transform = "scaleX(" + at + ")";
    const bar = $("readerView").querySelector(".reader-bar").offsetHeight;
    const dy = y - lastY;
    let away = $("readerView").classList.contains("bar-away");
    if (y <= bar || at >= 0.999 || state.sheet) away = false;
    else if (dy > 12) away = true;
    else if (dy < -12) away = false;
    else return;
    lastY = y;
    $("readerView").classList.toggle("bar-away", away);
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
    state.open = null;
    popScreen($("readerView")).then(() => { if (!state.open) C.reader.close(); });
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
    if (!fromHistory) history.pushState(readerState(state.open, kind), "");
    $(s.button).setAttribute("aria-expanded", "true");
    $("readerView").classList.remove("bar-away");
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

  function folderCard(name) {
    const list = folderPages(name);
    const done = list.filter((p) => p.finished).length;
    const next = folderNext(list);
    const withThumb = list.find((p) => thumbUrl(p));
    const thumb = withThumb ? thumbUrl(withThumb) : null;
    const line = done === list.length ? "All read"
      : (next.at > 0.02 ? "Continue: " : done ? "Next: " : "Start: ") + next.title;
    return el("div", { class: "card folder-card" },
      el("button", { class: "card-open", type: "button", "aria-label": name + ", folder, " + list.length + " pages, " + done + " read",
        onclick: () => openFolder(name) }),
      el("span", { class: "card-thumb stack" + (thumb ? "" : " blank"), "aria-hidden": "true" },
        thumb ? el("img", { src: thumb, alt: "", loading: "lazy" }) : null),
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, "Folder · " + countLine(list.length) + " · " + done + " read"),
        el("span", { class: "card-title", dir: "auto" }, name),
        el("span", { class: "card-status", dir: "auto" }, line),
        done && done < list.length ? el("span", { class: "progress thin", role: "progressbar", "aria-label": "Pages read",
          "aria-valuemin": "0", "aria-valuemax": String(list.length), "aria-valuenow": String(done) },
          el("span", { class: "progress-fill", style: "transform: scaleX(" + done / list.length + ")" })) : null));
  }

  function openFolder(name, fromHistory) {
    if (state.folder && sameTag(state.folder, name)) return;
    if (!folderPages(name).length) return;
    state.folder = folderPages(name)[0].folder;
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
    $("folderBody").replaceChildren(
      el("p", { class: "meta folder-meta" }, countLine(list.length) + " · " + done + " read"),
      el("button", { class: "btn-primary folder-go", type: "button", dir: "auto",
        onclick: () => openPage(done === list.length ? list[0].id : next.id) }, go),
      el("ol", { class: "group folder-list" },
        ...list.map((p, i) => el("li", null,
          el("button", { class: "row chapter" + (p === next && done < list.length ? " now" : ""), type: "button", onclick: () => openPage(p.id) },
            el("span", { class: "chapter-n", "aria-hidden": "true" }, String(i + 1)),
            el("span", { class: "choice-text" },
              el("span", { class: "row-label", dir: "auto" }, p.title),
              el("span", { class: "choice-note" + (p.finished ? "" : p.at > 0.02 ? " accent" : "") }, readingLine(p))))))),
      followControls(list[list.length - 1]),
      el("button", { class: "btn-quiet folder-rename", type: "button", onclick: renameFolder }, "Rename folder"));
  }

  // The page before or after `p` in its folder, if any.
  function neighbour(p, step) {
    if (!p || !p.folder) return null;
    const list = folderPages(p.folder);
    return list[list.indexOf(p) + step] || null;
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
        el("div", { class: "rc-row tall" }, el("span", { class: "rc-label" }, "Tags"),
          el("div", { class: "tag-edit" },
            el("div", { class: "chips" },
              ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": "Remove tag " + t,
                onclick: () => setTags(p, tags.filter((x) => x !== t)).then(draw) }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×"))),
              input),
            others.length ? el("div", { class: "chips" },
              ...others.slice(0, 12).map((t) => el("button", { class: "chip", type: "button", "aria-label": "Add tag " + t, onclick: () => add(t) }, "+ " + t))) : null)),
        folderRow(p, draw),
        neighbours(p),
        neighbour(p, 1) ? null : followControls(p),
        el("button", { class: "sheet-row danger", type: "button", onclick: deleteOpen }, "Delete this page"));
    };
    draw();
    return box;
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

  function openBatch(text, fromHistory) {
    if (state.batch) return;
    state.batch = true;
    renderBatch(linksFrom(text).join("\n"));
    if (!fromHistory) history.pushState({ view: "batch" }, "");
    $("batchBody").scrollTop = 0;
    pushScreen($("batchView")).then(() => $("batchBack").focus());
  }

  function closeBatch() {
    if (!state.batch) return;
    state.batch = false;
    popScreen($("batchView"));
  }

  function renderBatch(text) {
    let folder = null;
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
    area.addEventListener("input", sync);
    input.addEventListener("input", () => pick(cleanTag(input.value) ? folderName(input.value) : null, true));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    const form = el("form", { class: "batch-form" },
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Links"), area, count),
      el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Folder"),
        el("div", { class: "tag-edit" }, chips, input),
        el("p", { class: "meta" }, "Pages in a folder keep the order of the links.")),
      go);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const urls = linksFrom(area.value);
      if (!urls.length) return;
      history.back();
      saveAll(urls, folder);
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
    if (!p || !p.next || savedAs(p.next)) return null;
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
    const list = el("div", { class: "group" });
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
    $("settingsBody").replaceChildren(appearance, readingGroup(), saving, storageGroup(), updatesGroup(), aboutGroup());
  }

  // `at` names a section to scroll to (the update bar opens at Updates).
  function openSettings(fromHistory, at) {
    if (state.settings) return;
    state.settings = true;
    renderSettings();
    if (!fromHistory) history.pushState({ view: "settings" }, "");
    $("settingsBody").scrollTop = 0;
    const shown = pushScreen($("settingsView"));
    if (at && $(at)) $("settingsBody").scrollTop = $(at).offsetTop - $("settingsBody").offsetTop - 8;
    shown.then(() => $("settingsBack").focus());
  }

  function closeSettings() {
    if (!state.settings) return;
    state.settings = false;
    popScreen($("settingsView"));
  }

  // ---- Wiring ----

  function route(s) {
    const view = s && s.view;
    if (view !== "reader") closeReader();
    if (view !== "news") closeNews();
    if (view !== "settings" && !(view === "news" && s.over === "settings")) closeSettings();
    if (view !== "batch") closeBatch();
    if (view === "batch") openBatch("", true);
    const folder = (view === "folder" || view === "reader") && s.folder;
    if (!folder) closeFolder();
    else if (!state.folder) openFolder(folder, true);
    if (view === "reader" && (!state.open || state.open.id !== s.page)) openPage(s.page, true);
    if (view === "reader" && s.sheet !== state.sheet) closeSheet();
    if (view === "reader" && s.sheet && state.open && state.open.id === s.page) openSheet(s.sheet, true);
    if (view === "settings") openSettings(true);
    if (view === "news") { if (s.over === "settings") openSettings(true); openNews(true); }
  }

  // Back to the library from whatever screen is up, through history so the
  // stack stays honest; resolves once it's there.
  function toLibrary() {
    if (!(history.state && history.state.view)) return Promise.resolve();
    return new Promise((resolve) => {
      addEventListener("popstate", () => resolve(), { once: true });
      history.go(-[state.folder, state.open, state.sheet, state.settings, state.batch, state.news].filter(Boolean).length || -1);
    });
  }

  $("settingsBtn").addEventListener("click", () => openSettings());
  $("settingsBack").addEventListener("click", () => history.back());
  $("folderBack").addEventListener("click", () => history.back());
  $("batchBack").addEventListener("click", () => history.back());
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

  $("readerBack").addEventListener("click", () => history.go(state.sheet ? -2 : -1));
  // A button closes its own sheet, and swaps the other one in place (one
  // history entry for whichever sheet is up).
  function toggleSheet(kind) {
    if (state.sheet === kind) { history.back(); return; }
    if (state.sheet) history.replaceState(readerState(state.open, kind), "");
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
    if (state.settings && $("updatesSection")) $("updatesSection").replaceWith(updatesGroup());
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
    btn.onclick = () => (out ? openSettings(false, "updatesSection") : openNews());
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
    return el("section", { class: "settings-section", id: "updatesSection" }, el("h2", { class: "overline" }, "Updates"), list);
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
    if (!fromHistory) history.pushState({ view: "news", over }, "");
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
