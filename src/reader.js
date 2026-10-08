// Waypage: shows a saved page. The page's HTML is untrusted (CLAUDE.md),
// so it goes into an iframe sandboxed without allow-scripts, under its own
// CSP, never into the app's document: a script there could reach the
// Capacitor plugins. allow-same-origin stays, which without allow-scripts
// only lets this file reach in to theme it and handle taps; nothing inside
// can run.
(function () {
  const C = window.Waypage;

  const CSP = "default-src 'none'; img-src 'self' https: data: blob:; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'none'";
  const TOKENS = ["bg", "surface", "ink", "muted", "accent", "line", "preview", "video", "on-video", "scrim",
    "serif", "sans", "measure", "s-1", "s-2", "s-3", "s-4", "s-5", "s-6", "s-7", "r-sm", "r-md", "r-full",
    "fs-title", "lh-title", "fs-heading", "lh-heading", "fs-body", "lh-body", "fs-label", "lh-label", "fs-meta", "lh-meta",
    "reader-fs", "reader-lh", "reader-font", "reader-pad", "reader-measure"];
  const NEAR = 2;

  let frame = null, doc = null, scrollTimer = null, scrollFrame = 0, topSpace = null, bottomSpace = null;
  // Pages (0.29.0): the text in columns a screen wide, turned instead of
  // scrolled. `paged` is the reader's choice; a comic chapter always
  // scrolls.
  let paged = false, comic = false;
  const isPaged = () => paged && !comic && !!doc;
  // The "Next" link this file adds at the end of a page in a folder; only
  // that element (not a look-alike in the page) moves on.
  let nextLink = null, onNext = null, onImage = null, onTap = null;
  // The page's h2 and h3 headings, found once it's shown.
  let heads = [];
  // A page saved with full images already has them: nothing to swap in.
  let savedFull = false;
  // Each missing image's placeholder, which sits before the image's link
  // when it has one, so the link's underline doesn't run through it.
  let placeholders = new WeakMap();

  const appUrl = (rel) => new URL(rel + "?v=" + C.version, location.href).href;

  function srcdoc(html, base) {
    const head = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
      (base ? '<base href="' + base + '">' : "") +
      '<link rel="stylesheet" href="' + appUrl("src/fonts.css") + '">' +
      '<link rel="stylesheet" href="' + appUrl("src/reader.css") + '">';
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  }

  function applyTheme() {
    if (!doc) return;
    const at = isPaged() ? position() : 0;
    const css = getComputedStyle(document.documentElement);
    for (const t of TOKENS) doc.documentElement.style.setProperty("--" + t, css.getPropertyValue("--" + t).trim());
    doc.documentElement.style.colorScheme = css.colorScheme;
    // A new text size or margin moves the columns: back to the same place.
    if (isPaged()) requestAnimationFrame(() => { if (isPaged()) relayout(at); });
  }

  function placeholder(img) {
    const box = doc.createElement("span");
    box.className = "co-placeholder";
    const alt = (img.getAttribute("alt") || "").trim();
    if (alt) {
      const a = doc.createElement("span");
      a.textContent = alt;
      box.append(a);
    }
    const note = doc.createElement("span");
    note.textContent = "Image loads when you're online";
    box.append(note);
    return box;
  }

  // The full image replaces the preview once it's near the screen and has
  // loaded, so a slow connection never blanks what's already there.
  function swapNearImages() {
    if (!doc || !navigator.onLine) return;
    const h = frame.contentWindow.innerHeight;
    for (const img of doc.querySelectorAll("img[data-full]:not([data-swapped])")) {
      const full = img.getAttribute("data-full");
      if (img.getAttribute("src") === full || (savedFull && !img.classList.contains("co-missing"))) { img.setAttribute("data-swapped", ""); continue; }
      const r = (placeholders.get(img) || img).getBoundingClientRect();
      const w = frame.contentWindow.innerWidth;
      if (isPaged() ? r.right < -w * NEAR || r.left > w * (1 + NEAR) : r.bottom < -h * NEAR || r.top > h * (1 + NEAR)) continue;
      img.setAttribute("data-swapped", "");
      const probe = new Image();
      probe.onload = () => {
        img.src = full;
        img.hidden = false;
        const box = placeholders.get(img);
        if (box) { box.remove(); placeholders.delete(img); }
      };
      probe.onerror = () => img.removeAttribute("data-swapped");
      probe.src = full;
    }
  }

  function applyConnection() {
    if (!doc) return;
    const online = navigator.onLine;
    doc.documentElement.classList.toggle("offline", !online);
    for (const note of doc.querySelectorAll(".co-video-note")) {
      note.textContent = online ? "Tap to play on " + (note.getAttribute("data-site") || "the site") : "Plays when you're back online";
    }
    for (const img of doc.querySelectorAll("img.co-missing:not([data-swapped])")) {
      if (!placeholders.has(img)) {
        const box = placeholder(img);
        (img.closest("a") || img).before(box);
        placeholders.set(img, box);
      }
      img.hidden = true;
    }
    for (const cap of doc.querySelectorAll("figure:not(.co-video) > figcaption")) {
      const img = cap.parentElement.querySelector("img[data-full]");
      let label = cap.querySelector(".co-full");
      if (!online && !savedFull && img && !img.hasAttribute("data-swapped") && !img.classList.contains("co-missing")) {
        if (!label) {
          label = doc.createElement("span");
          label.className = "co-full";
          label.textContent = "Full size online";
          cap.prepend(label);
        }
      } else if (label) label.remove();
    }
    swapNearImages();
  }

  // What a tapped image hands the viewer: where it is on screen, what to
  // show now, the full image to swap in when online, and its words.
  function imageInfo(img) {
    const r = img.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const fig = img.closest("figure");
    const cap = fig && fig.querySelector("figcaption");
    let caption = "";
    if (cap) {
      const c = cap.cloneNode(true);
      c.querySelectorAll(".co-full").forEach((n) => n.remove());
      c.querySelectorAll(".co-credit").forEach((n) => n.before(" · "));
      caption = c.textContent.replace(/\s+/g, " ").replace(/^ · /, "").trim();
    } else if (img.hasAttribute("data-credit")) caption = img.getAttribute("data-credit");
    return {
      src: img.currentSrc || img.src,
      full: /^https:/.test(img.getAttribute("data-full") || "") && !(savedFull && !img.classList.contains("co-missing")) ? img.getAttribute("data-full") : "",
      alt: (img.getAttribute("alt") || "").trim(),
      caption,
      rect: { left: f.left + r.left, top: f.top + r.top, width: r.width, height: r.height },
    };
  }

  // The page's pictures in order, for the viewer's previous and next
  // (1.5.0); icons and the like are left out.
  const images = () => (doc ? [...doc.body.querySelectorAll("img")].filter((img) => !img.closest(".co-next") && (img.closest("figure") || img.width >= 120)) : []);

  // In an image chapter a tap shows or hides the bar, as text does, and a
  // double tap zooms in on that spot, or back out (1.2.2).
  let tapTimer = 0;
  function onClick(e) {
    const img = e.target.closest && e.target.closest("img");
    if (img && img.closest(".co-comic")) {
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = 0;
        if (zoom > 1) setZoom(1, e.clientX, e.clientY); else setZoom(2.5, e.clientX, e.clientY);
      } else tapTimer = setTimeout(() => { tapTimer = 0; if (onTap) onTap(); }, 280);
      e.preventDefault();
      return;
    }
    if (img && !img.hidden && !img.closest(".co-video") && img.naturalWidth) {
      e.preventDefault();
      onImage(imageInfo(img));
      return;
    }
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) {
      const sel = doc.getSelection();
      if ((sel && !sel.isCollapsed) || (e.target.closest && e.target.closest("button, summary, input, label"))) return;
      // In pages, a tap at either side turns, in the middle it's the bar.
      const w = frame.contentWindow.innerWidth;
      if (isPaged() && e.clientX < w * 0.3) { turn(rtl() ? 1 : -1); return; }
      if (isPaged() && e.clientX > w * 0.7) { turn(rtl() ? -1 : 1); return; }
      if (onTap) onTap();
      return;
    }
    e.preventDefault();
    if (a === nextLink) { onNext(); return; }
    const href = a.getAttribute("href");
    if (href.startsWith("#")) {
      let id = href.slice(1);
      try { id = decodeURIComponent(id); } catch (err) { /* as is */ }
      const target = doc.getElementById(id);
      if (target && isPaged()) goPage(pageOf(target));
      else if (target) target.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    if (/^(https?|mailto):/.test(a.href)) C.platform.openOutside(a.href);
  }

  // Where the reader is, as text (1.3.0): the block (paragraph, heading,
  // list item, panel) at the top edge and how far into it, "12/37" for
  // block 12, 37% in. A fraction of the scroll height (position) is not
  // the same place at another width or type size; this is.
  let anchors = [];
  function findAnchors() {
    anchors = doc ? [...doc.body.querySelectorAll(BLOCKS + ", .co-comic img")].filter((el) => !el.closest(SKIP) && !el.querySelector(BLOCKS)) : [];
  }
  let restoredAt = 0;
  function spot() {
    if (!doc || !anchors.length) return "";
    const edge = (topSpace ? topSpace() : 0) + 8;
    if (isPaged()) {
      const p = page();
      const i = anchors.findIndex((el) => pageOf(el) === p);
      return i < 0 ? "" : i + "/0";
    }
    for (const [i, el] of anchors.entries()) {
      const rct = el.getBoundingClientRect();
      if (rct.bottom <= edge || !rct.height) continue;
      return i + "/" + Math.max(0, Math.min(99, Math.round((edge - rct.top) / rct.height * 100)));
    }
    return "";
  }
  // Scrolls (or turns) to a spot; false when it names nothing here.
  function toSpot(s) {
    const m = /^(\d+)\/(\d+)$/.exec(s || "");
    const el = m && anchors[Number(m[1])];
    if (!el || !doc) return false;
    const w = frame.contentWindow;
    if (isPaged()) { goPage(pageOf(el), true); return true; }
    const edge = (topSpace ? topSpace() : 0) + 8;
    const rct = el.getBoundingClientRect();
    w.scrollTo(0, Math.max(0, w.scrollY + rct.top + rct.height * Number(m[2]) / 100 - edge));
    return true;
  }
  // Goes to where another device got to (app.js, the furthest-read toast).
  function jump(at, s) {
    if (!doc) return;
    if (toSpot(s)) return;
    const w = frame.contentWindow;
    if (isPaged()) relayout(at); else w.scrollTo(0, at * (doc.documentElement.scrollHeight - w.innerHeight));
  }

  // How far down the page the reader is, 0 to 1; a page shorter than the
  // screen counts as read to the end.
  function position() {
    const w = frame && frame.contentWindow;
    if (!w || !doc) return 0;
    if (isPaged()) { const n = pages(); return n <= 1 ? 1 : Math.min(1, page() / (n - 1)); }
    const room = doc.documentElement.scrollHeight - w.innerHeight;
    return room <= 0 ? 1 : Math.min(1, Math.max(0, w.scrollY / room));
  }

  const clean = (h) => h.textContent.replace(/\s+/g, " ").trim();

  function headings() {
    return heads.map((h) => ({ level: h.tagName === "H3" ? 3 : 2, text: clean(h) }));
  }

  // The heading of the part being read: the last one above the bar's edge,
  // or in pages, the last one on this page or before it.
  function section() {
    let cur = null;
    const edge = (topSpace ? topSpace() : 0) + 24;
    const p = isPaged() ? page() : 0;
    for (const h of heads) {
      if (isPaged() ? pageOf(h) > p : h.getBoundingClientRect().top > edge) break;
      cur = h;
    }
    return cur ? clean(cur) : "";
  }

  // Straight to a heading, just under the bar.
  function jumpTo(i) {
    const h = heads[i];
    if (!h || !frame) return;
    if (isPaged()) { goPage(pageOf(h), true); return; }
    const w = frame.contentWindow;
    w.scrollTo(0, h.getBoundingClientRect().top + w.scrollY - (topSpace ? topSpace() : 0) - 8);
  }

  // A book of pictures (1.5.1): a scan or a PDF read from its file, or a
  // comic. Its pages, the one at the top of the screen, and a jump to one,
  // for the rail of pages beside it.
  const printed = () => (doc ? [...doc.querySelectorAll(".co-comic > img")] : []);
  function printedPages() {
    return printed().map((img, i) => ({ n: i + 1, page: Number(img.getAttribute("data-page")) || 0,
      src: /^(blob|data:image\/(?!svg)|https?|capacitor|file)/.test(img.getAttribute("src") || "") ? img.src : "" }));
  }
  function printedNow() {
    const edge = (topSpace ? topSpace() : 0) + 24;
    let cur = 1;
    for (const [i, img] of printed().entries()) {
      if (img.getBoundingClientRect().top > edge) break;
      cur = i + 1;
    }
    return cur;
  }
  function toPrinted(n) {
    const img = printed()[n - 1];
    if (!img || !frame) return;
    const w = frame.contentWindow;
    w.scrollTo(w.scrollX, img.getBoundingClientRect().top + w.scrollY - (topSpace ? topSpace() : 0) - 8);
  }

  // Read aloud (0.27.0): the page's text as blocks in reading order, and
  // the one being read lit up and kept in view.
  const BLOCKS = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, figcaption, dt, dd, td, th";
  let blocks = [], lit = null, followUntil = 0;
  function speechText(el) {
    const c = el.cloneNode(true);
    for (const x of c.querySelectorAll("sup")) if (/^\s*\[[^\]]*\]\s*$/.test(x.textContent)) x.remove();
    for (const x of c.querySelectorAll("style, script, button, .co-placeholder")) x.remove();
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  const SKIP = ".co-meta, .co-licence, .co-next, .co-video, nav, aside";
  const BREAKS = new Set(("BR HR P DIV SECTION ARTICLE HEADER FOOTER MAIN FIGURE TABLE UL OL DL LI BLOCKQUOTE PRE " +
    "H1 H2 H3 H4 H5 H6 DETAILS SUMMARY FIGCAPTION DT DD").split(" "));
  // Text that sits straight in a div between <br>s (Blogger posts, old
  // sites), or beside a nested block (an author's note's text after its
  // heading, a list item with a sublist), has no paragraph of its own to
  // read or light, so each run of it between line breaks is wrapped in an
  // inline span.co-run, which changes nothing on screen.
  function wrapLoose() {
    if (doc.body.dataset.coRuns) return;
    doc.body.dataset.coRuns = "1";
    const holders = new Set();
    const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const up = t.parentElement;
      const block = up.closest(BLOCKS);
      if (!/[\p{L}\p{N}]/u.test(t.data) || (block && !block.querySelector(BLOCKS)) || up.closest(SKIP)) continue;
      let h = up;
      while (h !== doc.body && !BREAKS.has(h.tagName)) h = h.parentElement;
      holders.add(h);
    }
    const SEL = [...BREAKS].join(",");
    for (const h of holders) {
      let run = [];
      const close = () => {
        if (run.some((n) => /[\p{L}\p{N}]/u.test(n.textContent))) {
          const span = doc.createElement("span");
          span.className = "co-run";
          run[0].before(span);
          span.append(...run);
        }
        run = [];
      };
      // An inline element holding line breaks (a <span> around the whole
      // post) is split inside itself.
      const split = (el) => {
        for (const n of [...el.childNodes]) {
          if (n.nodeType === 1 && BREAKS.has(n.tagName)) close();
          else if (n.nodeType === 1 && n.querySelector(SEL)) { close(); split(n); close(); }
          else run.push(n);
        }
      };
      split(h);
      close();
    }
  }
  // Inside a closed spoiler: not read, as it isn't shown.
  const hidden = (el) => { const d = el.closest("details:not([open])"); return !!d && !el.closest("summary"); };

  // What Read aloud leaves out (0.34.0). `footnotes`: the notes at the end
  // (a Wikipedia reflist, a site's footnotes, a "Notes" or "References"
  // heading and what follows it) are read only when asked. `edges`: the
  // clip's own title, the site's header and footer left in the page,
  // captions, and a PDF's page marks are skipped when asked.
  let readOpts = { footnotes: false, edges: false };
  const NOTES = ".references, .reflist, .mw-references-wrap, .footnotes, .footnote, #footnotes, .endnotes, [role=doc-endnotes], [role=doc-footnote], aside.fn";
  const NOTES_HEAD = /^(notes?|footnotes?|end ?notes|references|citations|sources|bibliography)$/i;
  const EDGES = ".co-head, header, footer, [role=banner], [role=contentinfo], figcaption, .co-credit, .co-page";
  function notesFrom() {
    // A heading named for notes, and everything up to the next heading of
    // its rank or higher.
    const out = new Set();
    for (const h of doc.body.querySelectorAll("h2, h3, h4")) {
      if (!NOTES_HEAD.test(h.textContent.trim())) continue;
      out.add(h);
      const rank = Number(h.tagName[1]);
      for (let n = h.nextElementSibling; n; n = n.nextElementSibling) {
        if (/^H[1-6]$/.test(n.tagName) && Number(n.tagName[1]) <= rank) break;
        const inner = n.querySelector && n.querySelector("h1, h2, h3, h4, h5, h6");
        if (inner && Number(inner.tagName[1]) <= rank) break;
        out.add(n);
      }
    }
    return out;
  }
  function readable(opts) {
    if (!doc) return [];
    if (opts) readOpts = { ...readOpts, ...opts };
    wrapLoose();
    const notes = readOpts.footnotes ? null : notesFrom();
    const inNotes = (el) => !!notes && (!!el.closest(NOTES) || [...notes].some((n) => n === el || n.contains(el)));
    blocks = [...doc.body.querySelectorAll(BLOCKS + ", .co-run")].filter((el) => !el.closest(SKIP)
      && !el.querySelector(BLOCKS) && !hidden(el) && !inNotes(el) && !(readOpts.edges && el.closest(EDGES)))
      .map((el) => ({ el, text: speechText(el) })).filter((b) => /[\p{L}\p{N}]/u.test(b.text));
    return blocks.map((b) => b.text);
  }
  // The first block not yet scrolled past, where reading starts.
  function firstShown() {
    const edge = (topSpace ? topSpace() : 0) + 8;
    const p = isPaged() ? page() : 0;
    const i = blocks.findIndex((b) => (isPaged() ? pageOf(b.el) >= p : b.el.getBoundingClientRect().bottom > edge));
    return Math.max(0, i);
  }
  function light(i) {
    // Opened again while it's read aloud (1.4.1): the blocks are found
    // afresh, so the one being read lights up and comes into view.
    if (!blocks.length && doc && i >= 0) readable();
    if (lit) lit.classList.remove("co-speaking");
    lit = blocks[i] ? blocks[i].el : null;
    if (!lit || !frame) return;
    lit.classList.add("co-speaking");
    if (isPaged()) {
      if (pageOf(lit) !== page()) { followUntil = Date.now() + 1000; goPage(pageOf(lit)); }
      return;
    }
    const w = frame.contentWindow;
    const r = lit.getBoundingClientRect();
    const edge = (topSpace ? topSpace() : 0) + 8;
    if (r.top < edge || r.bottom > w.innerHeight - 48) {
      followUntil = Date.now() + 1000;
      w.scrollTo({ top: r.top + w.scrollY - edge - 16, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }

  // Where a selection starts, for "Read from here": its block, how far
  // into the block's text, and where it is on screen (the frame's own
  // coordinates).
  function selectionSpot() {
    const sel = doc && doc.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) return null;
    if (!blocks.length) readable();
    const r = sel.getRangeAt(0);
    const at = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const i = blocks.findIndex((b) => b.el.contains(at));
    if (i < 0) return null;
    const pre = doc.createRange();
    pre.setStart(blocks[i].el, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    const box = r.getBoundingClientRect();
    return { block: i, offset: pre.toString().replace(/\s+/g, " ").replace(/^ /, "").length,
      word: sel.toString().trim().split(/\s+/)[0], top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  }
  function clearSelection() {
    const sel = doc && doc.getSelection();
    if (sel) sel.removeAllRanges();
  }

  // Whether the page is scrolling itself to follow the reading, which
  // shouldn't put the bars away.
  const following = () => Date.now() < followUntil;

  // Room at the top of the page for the reader bar, which floats over it,
  // and at the bottom for the line under it (1.1.0), so the end of a page
  // (its Next card) clears it.
  function applyTop() {
    // A PDF's printed pages go two side by side as the text does (1.5.0).
    if (doc) doc.documentElement.classList.toggle("co-spread", !!doc.querySelector(".co-printed") && twoUp(width()));
    if (doc && topSpace) doc.documentElement.style.setProperty("--co-top", topSpace() + "px");
    if (doc && bottomSpace) doc.documentElement.style.setProperty("--co-bottom", bottomSpace() + "px");
    if (isPaged()) relayout();
  }

  // ---- Pages ----

  const rtl = () => !!doc && getComputedStyle(doc.body).direction === "rtl";
  const width = () => frame.contentWindow.innerWidth;
  const pages = () => Math.max(1, Math.round(doc.documentElement.scrollWidth / width()));
  // While a turn runs, the page is the one it's going to, so quick taps add up.
  const page = () => (turning ? turning.to : Math.round(Math.abs(frame.contentWindow.scrollX) / width()));
  // The page an element starts on, from where it sits on screen now and
  // how far the frame has really scrolled (mid-turn, page() is the one
  // the turn is going to, so it can't be the base).
  function pageOf(el) {
    const r = el.getBoundingClientRect(), w = width();
    const x = rtl() ? w - r.right : r.left;
    return Math.max(0, Math.min(pages() - 1, Math.floor((x + Math.abs(frame.contentWindow.scrollX) + 1) / w)));
  }
  // A turn is a short ease-out of its own: the WebView's smooth scroll
  // takes most of a second for a screen's width.
  let turning = null;
  function goPage(n, now) {
    const w = frame.contentWindow;
    const to = Math.max(0, Math.min(pages() - 1, n));
    const x = to * width() * (rtl() ? -1 : 1);
    if (turning) w.cancelAnimationFrame(turning.raf);
    turning = null;
    if (now || matchMedia("(prefers-reduced-motion: reduce)").matches) { w.scrollTo(x, 0); return; }
    const from = w.scrollX, t0 = w.performance.now(), ms = 220;
    const me = { to };
    const step = (t) => {
      if (turning !== me) return;
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      w.scrollTo(from + (x - from) * e, 0);
      if (k < 1) me.raf = w.requestAnimationFrame(step);
      else turning = null;
    };
    me.raf = w.requestAnimationFrame(step);
    turning = me;
  }
  function turn(d) {
    if (!isPaged()) return;
    const n = page() + d;
    if (n < 0 || n >= pages()) return;
    goPage(n);
  }

  // Two pages side by side on a wide window (1.5.0): "one", "two", or
  // "auto", which goes two-up from 1000 px.
  let spread = "auto";
  const twoUp = (w) => (spread === "two" ? w >= 640 : spread === "auto" ? w >= 1000 : false);
  function setSpread(v) {
    spread = v;
    if (doc) applyTop();
  }

  // Column sizes for this width: a column as wide as the reading measure
  // allows, centred, so a column and its gap are one screen. Two-up, each
  // half of the screen is laid out the same way.
  function relayout(at) {
    const root = doc.documentElement;
    const keep = at == null ? position() : at;
    const probe = doc.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;width:var(--reader-measure, var(--measure));padding-inline:var(--reader-pad, 20px)";
    doc.body.append(probe);
    const measure = probe.getBoundingClientRect().width, pad = parseFloat(getComputedStyle(probe).paddingLeft) || 20;
    probe.remove();
    const w = width();
    const half = twoUp(w) ? w / 2 : w;
    // Two pages keep a margin of at least 40 px each side, so they read as two.
    const edge = half < w ? Math.max(pad, 40) : pad;
    const col = Math.floor(Math.min(measure - 2 * pad, half - 2 * edge));
    const side = (half - col) / 2;
    root.classList.toggle("co-two", half < w);
    root.style.setProperty("--co-col", col + "px");
    root.style.setProperty("--co-side", side + "px");
    root.style.setProperty("--co-gap", 2 * side + "px");
    const n = pages();
    goPage(Math.round(keep * (n - 1)), true);
  }

  // ---- Zoom on an image chapter (1.2.2) ----
  // Printed pages and panels zoom in place, as in a PDF viewer: a pinch
  // scales the chapter under the fingers and, once the fingers lift, the
  // chapter is laid out at that width, so a pan is the page's own scroll,
  // and the pages are drawn again at the new width (files.drawNear). A
  // double tap goes to 2.5x on that spot, or back; Ctrl and the wheel do
  // the same on a desktop.
  const ZOOM_MAX = 4;
  let zoom = 1, pinch = null;
  const comicRoot = () => (doc && comic ? doc.querySelector(".co-comic") : null);
  // The chapter's top left corner in the page's own coordinates, with any
  // transform taken off it first.
  function origin(root) {
    const w = frame.contentWindow;
    root.style.transform = "";
    const r = root.getBoundingClientRect();
    return { x: r.left + w.scrollX, y: r.top + w.scrollY, w };
  }
  // Lays the chapter out at `s` times its width, keeping the content that
  // was at page point (px, py) under screen point (mx, my).
  function setZoom(s, mx, my, px, py) {
    const root = comicRoot();
    if (!root) return;
    const { x: ox, y: oy, w } = origin(root);
    if (px == null) { px = w.scrollX + mx; py = w.scrollY + my; }
    s = Math.min(ZOOM_MAX, Math.max(1, s));
    if (s < 1.05) s = 1;
    const base = root.offsetWidth / zoom;
    const q = s / zoom;
    zoom = s;
    root.style.transformOrigin = "";
    root.style.width = s === 1 ? "" : Math.round(base * s) + "px";
    w.scrollTo(ox + (px - ox) * q - mx, oy + (py - oy) * q - my);
  }
  function zoomInput() {
    doc.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 2 || !comicRoot()) { if (e.touches.length !== 2) pinch = null; return; }
      const root = comicRoot();
      const [a, b] = e.touches;
      const { x: ox, y: oy, w } = origin(root);
      const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
      pinch = { root, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), from: zoom, s: zoom, mx, my, x: mx, y: my,
        px: w.scrollX + mx, py: w.scrollY + my, ox, oy };
      root.style.transformOrigin = (pinch.px - ox) + "px " + (pinch.py - oy) + "px";
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; }
      e.preventDefault();
    }, { passive: false });
    doc.addEventListener("touchmove", (e) => {
      if (!pinch || e.touches.length !== 2) return;
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinch.s = Math.min(ZOOM_MAX, Math.max(1, pinch.from * d / pinch.d));
      pinch.x = (a.clientX + b.clientX) / 2;
      pinch.y = (a.clientY + b.clientY) / 2;
      pinch.root.style.transform = "translate(" + (pinch.x - pinch.mx) + "px," + (pinch.y - pinch.my) + "px) scale(" + (pinch.s / pinch.from) + ")";
      e.preventDefault();
    }, { passive: false });
    const done = (e) => {
      if (!pinch || e.touches.length >= 2) return;
      const p = pinch;
      pinch = null;
      setZoom(p.s, p.x, p.y, p.px, p.py);
    };
    doc.addEventListener("touchend", done);
    doc.addEventListener("touchcancel", done);
    doc.addEventListener("wheel", (e) => {
      if (!e.ctrlKey || !comicRoot()) return;
      e.preventDefault();
      setZoom(zoom * Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
    }, { passive: false });
  }

  // Turns pages with a swipe and the arrow keys. The page can't scroll on
  // its own (overflow hidden), so a sideways swipe is all a page turn.
  function pagedInput() {
    let start = null;
    doc.addEventListener("touchstart", (e) => {
      start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    doc.addEventListener("touchend", (e) => {
      if (!start || !isPaged()) return;
      const t = e.changedTouches[0], dx = t.clientX - start.x, dy = t.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx)) return;
      turn((dx < 0) !== rtl() ? 1 : -1);
    }, { passive: true });
    doc.addEventListener("keydown", (e) => {
      if (!isPaged() || e.altKey || e.ctrlKey || e.metaKey) return;
      const fwd = { ArrowRight: !rtl(), ArrowLeft: rtl(), PageDown: true, " ": !e.shiftKey }[e.key];
      const bwd = { ArrowLeft: !rtl(), ArrowRight: rtl(), PageUp: true, " ": e.shiftKey }[e.key];
      if (fwd) { e.preventDefault(); turn(1); } else if (bwd) { e.preventDefault(); turn(-1); }
    });
  }

  // Which page of how many, in pages mode; null when scrolling.
  const pageInfo = () => (doc && isPaged() ? { page: page() + 1, pages: pages() } : null);

  // Scroll or pages, kept where the reader was.
  function setPaged(on) {
    const at = doc ? position() : 0;
    paged = !!on;
    if (!doc || comic) return;
    doc.documentElement.classList.toggle("co-paged", paged);
    if (paged) relayout(at);
    else {
      const w = frame.contentWindow;
      w.scrollTo(0, at * (doc.documentElement.scrollHeight - w.innerHeight));
    }
  }

  // Renders `html` (a page.html) into `iframe`, scrolled to `at` (0 to 1),
  // and reports the position as the reader scrolls: onScroll(at, y) every
  // frame, onPosition(at) once it stops. Resolves once it's shown.
  // `next` ({ over, title, go }) adds a link to the next page at the end;
  // `top` () gives the height the bar covers; onImage(info) opens a tapped
  // image.
  function open(iframe, html, meta, { at = 0, spot: spotAt = "", onPosition, onScroll, next, top, onImage: image, onTap: tap, onSelect, pages: asPages, bottom, onKey } = {}) {
    frame = iframe;
    turning = null;
    paged = !!asPages;
    comic = false;
    zoom = 1;
    pinch = null;
    blocks = [];
    lit = null;
    onImage = image || null;
    onTap = tap || null;
    heads = [];
    topSpace = top || null;
    bottomSpace = bottom || null;
    savedFull = meta.mode === "full";
    doc = null;
    nextLink = null;
    onNext = next ? next.go : null;
    placeholders = new WeakMap();
    return new Promise((resolve) => {
      iframe.onload = () => {
        doc = iframe.contentDocument;
        // Pages saved before 0.4.0 may not carry their direction.
        if (!doc.documentElement.hasAttribute("dir") && C.save.textDir(doc) === "rtl") doc.documentElement.dir = "rtl";
        applyTheme();
        applyConnection();
        applyTop();
        if (next) {
          nextLink = doc.createElement("a");
          nextLink.href = "#";
          nextLink.className = "co-next";
          const over = doc.createElement("span");
          over.className = "co-next-over";
          over.textContent = next.over;
          const title = doc.createElement("span");
          title.className = "co-next-title";
          title.dir = "auto";
          title.textContent = next.title;
          nextLink.append(over, title);
          doc.body.append(nextLink);
        }
        heads = [...doc.body.querySelectorAll("h2, h3")].filter((h) => clean(h));
        doc.addEventListener("click", onClick);
        comic = !!doc.querySelector(".co-comic");
        if (isPaged()) doc.documentElement.classList.add("co-paged");
        pagedInput();
        zoomInput();
        // Keys pressed in the page that it doesn't use itself go to the
        // app's shortcuts (1.5.0).
        if (onKey) doc.addEventListener("keydown", (e) => { if (!e.defaultPrevented) onKey(e); });
        if (onSelect) {
          let selTimer = 0;
          doc.addEventListener("selectionchange", () => {
            clearTimeout(selTimer);
            selTimer = setTimeout(() => { if (doc) onSelect(selectionSpot()); }, 250);
          });
        }
        iframe.contentWindow.addEventListener("scroll", () => {
          if (onScroll && !scrollFrame) {
            scrollFrame = requestAnimationFrame(() => {
              scrollFrame = 0;
              if (doc) onScroll(position(), isPaged() ? Math.abs(iframe.contentWindow.scrollX) : iframe.contentWindow.scrollY);
            });
          }
          clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            swapNearImages();
            // The scroll that put the page back where it was isn't a move.
            if (onPosition && performance.now() - restoredAt > 400) onPosition(position(), spot());
          }, 150);
        }, { passive: true });
        // Back to where the page was left, once the fonts have set the
        // text's height; the end of a finished page isn't worth returning to.
        const ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
        ready.then(() => {
          if (!doc) return;
          const w = iframe.contentWindow;
          const back = at > 0.01 && at < 0.97 ? at : 0;
          findAnchors();
          // By the text's spot where there is one (1.3.0), else by the
          // fraction, as before. Pages lays the columns out first, so the
          // spot's page is measured on the real layout.
          if (isPaged()) relayout(back);
          if (back && toSpot(spotAt)) { /* there */ }
          else if (back && !isPaged()) w.scrollTo(0, back * (doc.documentElement.scrollHeight - w.innerHeight));
          restoredAt = performance.now();
          if (!back && onPosition && position() === 1) onPosition(1, spot());
          if (onScroll) onScroll(position(), isPaged() ? 0 : w.scrollY);
        });
        resolve();
      };
      iframe.srcdoc = srcdoc(html, C.store.pageDirUrl(meta.id));
    });
  }

  function close() {
    if (frame) { frame.onload = null; frame.srcdoc = ""; }
    frame = null;
    doc = null;
    topSpace = null;
    bottomSpace = null;
    onImage = null;
    onTap = null;
    heads = [];
    nextLink = null;
    onNext = null;
    blocks = [];
    anchors = [];
    lit = null;
  }

  addEventListener("online", applyConnection);
  addEventListener("resize", applyTop);
  addEventListener("offline", applyConnection);

  C.reader = { open, close, position, spot, jump, setPaged, turn, get paged() { return isPaged(); }, pageInfo, headings, section, jumpTo, readable, firstShown, light, following, selectionSpot, clearSelection, applyTheme, applyConnection, srcdoc, CSP, setSpread, refit: applyTop, images, imageInfo, printedPages, printedNow, toPrinted };
})();
