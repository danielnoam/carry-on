// Carry-on: shows a saved page. The page's HTML is untrusted (CLAUDE.md),
// so it goes into an iframe sandboxed without allow-scripts, under its own
// CSP, never into the app's document: a script there could reach the
// Capacitor plugins. allow-same-origin stays, which without allow-scripts
// only lets this file reach in to theme it and handle taps; nothing inside
// can run.
(function () {
  const C = window.CarryOn;

  const CSP = "default-src 'none'; img-src 'self' https: data: blob:; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'none'";
  const TOKENS = ["bg", "surface", "ink", "muted", "accent", "line", "preview", "video", "on-video", "scrim",
    "serif", "sans", "measure", "s-1", "s-2", "s-3", "s-4", "s-5", "s-6", "s-7", "r-sm", "r-md", "r-full",
    "fs-title", "lh-title", "fs-heading", "lh-heading", "fs-body", "lh-body", "fs-label", "lh-label", "fs-meta", "lh-meta",
    "reader-fs", "reader-lh", "reader-font", "reader-pad", "reader-measure"];
  const NEAR = 2;

  let frame = null, doc = null, scrollTimer = null, scrollFrame = 0, topSpace = null;
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
    const css = getComputedStyle(document.documentElement);
    for (const t of TOKENS) doc.documentElement.style.setProperty("--" + t, css.getPropertyValue("--" + t).trim());
    doc.documentElement.style.colorScheme = css.colorScheme;
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
      if (r.bottom < -h * NEAR || r.top > h * (1 + NEAR)) continue;
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

  // In an image chapter a tap shows or hides the bar, as text does, and a
  // double tap opens the panel in the viewer, to zoom.
  let tapTimer = 0;
  function onClick(e) {
    const img = onImage && e.target.closest && e.target.closest("img");
    if (img && img.closest(".co-comic")) {
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = 0;
        if (!img.hidden && img.naturalWidth) onImage(imageInfo(img));
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
      if (onTap && (!sel || sel.isCollapsed) && !(e.target.closest && e.target.closest("button, summary, input, label"))) onTap();
      return;
    }
    e.preventDefault();
    if (a === nextLink) { onNext(); return; }
    const href = a.getAttribute("href");
    if (href.startsWith("#")) {
      let id = href.slice(1);
      try { id = decodeURIComponent(id); } catch (err) { /* as is */ }
      const target = doc.getElementById(id);
      if (target) target.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    if (/^(https?|mailto):/.test(a.href)) C.platform.openOutside(a.href);
  }

  // How far down the page the reader is, 0 to 1; a page shorter than the
  // screen counts as read to the end.
  function position() {
    const w = frame && frame.contentWindow;
    if (!w || !doc) return 0;
    const room = doc.documentElement.scrollHeight - w.innerHeight;
    return room <= 0 ? 1 : Math.min(1, Math.max(0, w.scrollY / room));
  }

  const clean = (h) => h.textContent.replace(/\s+/g, " ").trim();

  function headings() {
    return heads.map((h) => ({ level: h.tagName === "H3" ? 3 : 2, text: clean(h) }));
  }

  // The heading of the part being read: the last one above the bar's edge.
  function section() {
    let cur = null;
    const edge = (topSpace ? topSpace() : 0) + 24;
    for (const h of heads) {
      if (h.getBoundingClientRect().top > edge) break;
      cur = h;
    }
    return cur ? clean(cur) : "";
  }

  // Straight to a heading, just under the bar.
  function jumpTo(i) {
    const h = heads[i];
    if (!h || !frame) return;
    const w = frame.contentWindow;
    w.scrollTo(0, h.getBoundingClientRect().top + w.scrollY - (topSpace ? topSpace() : 0) - 8);
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
  // sites) has no paragraph to read or light, so each run of it between
  // line breaks is wrapped in an inline span.co-run, which changes nothing
  // on screen.
  function wrapLoose() {
    if (doc.body.dataset.coRuns) return;
    doc.body.dataset.coRuns = "1";
    const holders = new Set();
    const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const up = t.parentElement;
      if (!/[\p{L}\p{N}]/u.test(t.data) || up.closest(BLOCKS) || up.closest(SKIP)) continue;
      let h = up;
      while (h !== doc.body && !BREAKS.has(h.tagName)) h = h.parentElement;
      holders.add(h);
    }
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
      for (const n of [...h.childNodes]) {
        if (n.nodeType === 1 && (BREAKS.has(n.tagName) || n.querySelector([...BREAKS].join(",")))) close();
        else run.push(n);
      }
      close();
    }
  }
  function readable() {
    if (!doc) return [];
    wrapLoose();
    blocks = [...doc.body.querySelectorAll(BLOCKS + ", .co-run")].filter((el) => !el.closest(SKIP)
      && !el.querySelector(BLOCKS)).map((el) => ({ el, text: speechText(el) })).filter((b) => /[\p{L}\p{N}]/u.test(b.text));
    return blocks.map((b) => b.text);
  }
  // The first block not yet scrolled past, where reading starts.
  function firstShown() {
    const edge = (topSpace ? topSpace() : 0) + 8;
    const i = blocks.findIndex((b) => b.el.getBoundingClientRect().bottom > edge);
    return Math.max(0, i);
  }
  function light(i) {
    if (lit) lit.classList.remove("co-speaking");
    lit = blocks[i] ? blocks[i].el : null;
    if (!lit || !frame) return;
    lit.classList.add("co-speaking");
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

  // Room at the top of the page for the reader bar, which floats over it.
  function applyTop() {
    if (doc && topSpace) doc.documentElement.style.setProperty("--co-top", topSpace() + "px");
  }

  // Renders `html` (a page.html) into `iframe`, scrolled to `at` (0 to 1),
  // and reports the position as the reader scrolls: onScroll(at, y) every
  // frame, onPosition(at) once it stops. Resolves once it's shown.
  // `next` ({ over, title, go }) adds a link to the next page at the end;
  // `top` () gives the height the bar covers; onImage(info) opens a tapped
  // image.
  function open(iframe, html, meta, { at = 0, onPosition, onScroll, next, top, onImage: image, onTap: tap, onSelect } = {}) {
    frame = iframe;
    blocks = [];
    lit = null;
    onImage = image || null;
    onTap = tap || null;
    heads = [];
    topSpace = top || null;
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
              if (doc) onScroll(position(), iframe.contentWindow.scrollY);
            });
          }
          clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            swapNearImages();
            if (onPosition) onPosition(position());
          }, 150);
        }, { passive: true });
        // Back to where the page was left, once the fonts have set the
        // text's height; the end of a finished page isn't worth returning to.
        const ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
        ready.then(() => {
          if (!doc) return;
          const w = iframe.contentWindow;
          if (at > 0.01 && at < 0.97) w.scrollTo(0, at * (doc.documentElement.scrollHeight - w.innerHeight));
          else if (onPosition && position() === 1) onPosition(1);
          if (onScroll) onScroll(position(), w.scrollY);
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
    onImage = null;
    onTap = null;
    heads = [];
    nextLink = null;
    onNext = null;
    blocks = [];
    lit = null;
  }

  addEventListener("online", applyConnection);
  addEventListener("resize", applyTop);
  addEventListener("offline", applyConnection);

  C.reader = { open, close, position, headings, section, jumpTo, readable, firstShown, light, following, selectionSpot, clearSelection, applyTheme, applyConnection, srcdoc, CSP };
})();
