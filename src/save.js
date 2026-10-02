// Carry-on: turning a link into a saved page (docs/PROPOSAL.md,
// "Architecture"). Fetch, pick the article (the Wikipedia adapter or
// Readability), clean it down to an allowlist, then download image previews
// and video thumbnails next to it.
//
// The fetched HTML is only ever parsed with DOMParser, whose documents run
// no scripts and load nothing; what comes out is rebuilt element by element
// from the allowlist, so nothing the page carried survives unless named here.
(function () {
  const C = window.CarryOn;

  const PREVIEW_WIDTH = 480;
  // Wikimedia serves (and caches) thumbnails at fixed steps; other widths
  // are generated on demand and rate-limited for tools.
  const WIKI_PREVIEW = 500;
  const WIKI_FULL = 1280;
  const WORDS_PER_MINUTE = 230;
  const MIN_TEXT = 250;

  const KEEP = new Set(("p br hr h2 h3 h4 h5 h6 a img figure figcaption ul ol li dl dt dd blockquote q cite pre code kbd samp var " +
    "em strong b i u s del ins sub sup small mark abbr time span div section article header footer " +
    "table thead tbody tfoot tr td th caption details summary").split(" "));
  const DROP = new Set(("script style noscript template iframe frame frameset object embed applet form input button select " +
    "textarea option label nav svg math canvas audio video picture source track map area link meta base head title dialog").split(" "));
  const ATTRS = { a: ["href"], img: ["alt", "width", "height"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan", "scope"], ol: ["start"], time: ["datetime"], abbr: ["title"] };
  const GLOBAL_ATTRS = ["id", "lang", "dir"];

  // ---- Pure helpers (test/save.test.js) ----

  function absolute(href, base) {
    try { return new URL(href, base).href; } catch (e) { return null; }
  }

  // { host, title } for a Wikipedia article link, mobile or desktop; null
  // for anything else, including special and talk pages.
  function wikipediaPage(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const m = u.hostname.match(/^([a-z0-9-]+)\.(?:m\.)?wikipedia\.org$/i);
    if (!m || m[1] === "www") return null;
    let title = null;
    if (u.pathname.startsWith("/wiki/")) title = decodeURIComponent(u.pathname.slice(6));
    else if (u.pathname === "/w/index.php") title = u.searchParams.get("title");
    if (!title || /^(Special|Talk|User|Wikipedia|File|Help|Portal|Category|Template):/i.test(title)) return null;
    return { host: m[1].toLowerCase() + ".wikipedia.org", title: title.replace(/ /g, "_") };
  }

  // The same Wikimedia thumbnail at another width, never wider than the
  // file itself (a thumbnail can't upscale). Non-thumbnail URLs pass through.
  function wikimediaThumb(src, width, fileWidth) {
    const m = src.match(/^(.*\/thumb\/.+\/)(\d+)px-([^/]+)$/);
    if (!m) return src;
    const w = fileWidth ? Math.min(width, fileWidth) : width;
    if (fileWidth && w >= fileWidth && !/\.(svg|tiff?|pdf|webm|ogv)\./i.test(m[3])) {
      return m[1].replace("/thumb/", "/").replace(/\/$/, "");
    }
    return m[1] + w + "px-" + m[3];
  }

  // srcset candidates as [{ url, w }], widths from "480w" or density × base.
  function parseSrcset(srcset, base) {
    return String(srcset || "").split(/,\s+(?=\S)/).map((part) => {
      const [url, d] = part.trim().split(/\s+/);
      const n = parseFloat(d) || 1;
      const w = /w$/.test(d || "") ? n : n * PREVIEW_WIDTH;
      const abs = url && absolute(url, base);
      return abs ? { url: abs, w } : null;
    }).filter(Boolean);
  }

  // The candidate nearest at or above `target`, or the widest below it.
  function pickWidth(candidates, target) {
    if (!candidates.length) return null;
    const sorted = [...candidates].sort((a, b) => a.w - b.w);
    return (sorted.find((c) => c.w >= target) || sorted[sorted.length - 1]).url;
  }

  function youtubeId(src) {
    const m = String(src).match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function vimeoId(src) {
    const m = String(src).match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  }

  function extOf(url) {
    const m = String(url).split(/[?#]/)[0].match(/\.(jpe?g|png|gif|webp|avif|svg)$/i);
    return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
  }

  function isTrackingPixel(width, height, src) {
    const w = parseInt(width, 10), h = parseInt(height, 10);
    if ((w && w <= 2) || (h && h <= 2)) return true;
    return /[/.](pixel|beacon|tracking|analytics)[/.?]|facebook\.com\/tr\b|\/b\/ss\//i.test(String(src));
  }

  function readingMinutes(text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  }

  // Words a site uses on its link to the next chapter or page.
  const NEXT_WORDS = /^(next|next (chapter|page|part|episode|post)|הבא|הפרק הבא|לפרק הבא|לעמוד הבא|siguiente|suivant|weiter|nächste|下一章|下一页|次へ|次の話)$/i;

  function isNextText(text) {
    const t = String(text || "").replace(/[›»→>\s]+$/u, "").replace(/^[‹«←<\s]+/u, "").replace(/\s+/g, " ").trim();
    return NEXT_WORDS.test(t);
  }

  // The page's link to what comes next (rel="next", or a link worded like
  // "Next chapter"), on the same site and not the page itself; "" if none.
  // Read before Readability, which strips navigation.
  function nextLink(doc, pageUrl) {
    let host;
    try { host = new URL(pageUrl).host; } catch (e) { return ""; }
    const ok = (href) => {
      const u = absolute(href, pageUrl);
      try {
        const x = new URL(u);
        return /^https?:$/.test(x.protocol) && x.host === host && u.split("#")[0] !== pageUrl.split("#")[0] ? u.split("#")[0] : "";
      } catch (e) { return ""; }
    };
    for (const l of doc.querySelectorAll('link[rel~="next"][href], a[rel~="next"][href]')) {
      const u = ok(l.getAttribute("href"));
      if (u) return u;
    }
    for (const a of doc.querySelectorAll("a[href]")) {
      if (!isNextText(a.textContent) && !isNextText(a.getAttribute("aria-label")) && !isNextText(a.getAttribute("title"))) continue;
      const u = ok(a.getAttribute("href"));
      if (u) return u;
    }
    return "";
  }

  function siteName(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  // ---- Fetching ----

  class SaveError extends Error {}

  async function get(url, headers) {
    let res;
    try {
      res = await C.platform.fetchText(url, { headers });
    } catch (e) {
      if (/time(d)?\s?out/i.test((e && e.message) || "")) throw new SaveError("The site didn't answer. Try again, or later on a better connection.");
      throw new SaveError(C.platform.canFetchPages
        ? "Couldn't reach this page. Check the link, or try again when you're online."
        : "This browser can't fetch that site directly. Save it from the Carry-on app.");
    }
    if (res.status === 429) throw new SaveError("The site asked to slow down. Try again in a few minutes.");
    if (res.status === 404 || res.status === 410) throw new SaveError("That page doesn't exist any more. Check the link.");
    if (res.status >= 400) throw new SaveError("The site answered with an error (" + res.status + "). Try again later.");
    return res;
  }

  // Hebrew and Arabic pages usually say so on <html> or <body>, or by their
  // language; when they don't (ynet's article markup), the letters decide.
  // The saved page keeps it, or the reader lays it out left to right.
  const RTL_LANGS = /^(he|iw|yi|ar|fa|ur|ps|sd|ckb|dv)\b/i;
  function textDir(doc, text) {
    const root = doc.documentElement;
    const d = (root.getAttribute("dir") || (doc.body && doc.body.getAttribute("dir")) || "").toLowerCase();
    if (d === "rtl") return "rtl";
    if (RTL_LANGS.test(root.getAttribute("lang") || "")) return "rtl";
    const sample = String(text != null ? text : (doc.body && doc.body.textContent) || "").slice(0, 4000);
    const rtl = (sample.match(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    const ltr = (sample.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF]/g) || []).length;
    return rtl > ltr ? "rtl" : "";
  }

  function parse(html, base) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const b = doc.createElement("base");
    b.href = base;
    doc.head.prepend(b);
    return doc;
  }

  async function fromWikipedia(page) {
    const api = "https://" + page.host + "/api/rest_v1/page/html/" + encodeURIComponent(page.title) + "?redirect=true";
    const res = await get(api, { Accept: "text/html; charset=utf-8", "Api-User-Agent": "Carry-on (https://github.com/danielnoam/carry-on)" });
    const url = "https://" + page.host + "/wiki/" + encodeURIComponent(page.title).replace(/%2F/g, "/");
    const doc = parse(res.text, url);
    doc.querySelectorAll(".navbox, .vertical-navbox, .sistersitebox, .metadata, .ambox, .noprint, .mw-empty-elt, [role=navigation], .portalbox, .side-box, .hatnote")
      .forEach((n) => n.remove());
    doc.querySelectorAll("img").forEach((img) => {
      const src = absolute(img.getAttribute("src") || "", "https://" + page.host + "/");
      if (!src) return;
      const fw = parseInt(img.getAttribute("data-file-width"), 10) || 0;
      img.setAttribute("src", src);
      img.removeAttribute("srcset");
      if (/upload\.wikimedia\.org\/.*\/thumb\//.test(src)) {
        img.setAttribute("data-co-preview", wikimediaThumb(src, WIKI_PREVIEW, fw));
        img.setAttribute("data-co-full", wikimediaThumb(src, WIKI_FULL, fw));
      }
    });
    await credits(doc, page.host);
    doc.querySelectorAll("video").forEach((v) => {
      const file = v.getAttribute("resource");
      if (file) v.setAttribute("data-co-link", absolute(file, url) || "");
      v.setAttribute("data-co-site", "Wikipedia");
    });
    const title = (doc.querySelector("head > title") || {}).textContent || page.title.replace(/_/g, " ");
    return {
      url, title: title.trim(), site: "Wikipedia", byline: "",
      body: doc.body, base: url,
      licence: "wikipedia", dir: textDir(doc),
    };
  }

  // Each image's author and licence from the file's page ("Jane Doe,
  // CC BY-SA 4.0"), as data-co-credit; rebuild() puts it under the image.
  // Icons and flags are left out, and so is everything if the API fails.
  async function credits(doc, host) {
    const files = new Map();
    for (const img of doc.querySelectorAll("img[resource]")) {
      if ((parseInt(img.getAttribute("width"), 10) || 0) < 100) continue;
      let name;
      try { name = decodeURIComponent(img.getAttribute("resource").replace(/^.*?\/(?=[^/]+:)/, "")).replace(/_/g, " "); } catch (e) { continue; }
      if (!files.has(name)) files.set(name, []);
      files.get(name).push(img);
    }
    const names = [...files.keys()];
    for (let i = 0; i < names.length; i += 50) {
      const titles = names.slice(i, i + 50);
      let data;
      try {
        const res = await get("https://" + host + "/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata" +
          "&iiextmetadatafilter=Artist%7CLicenseShortName&origin=*&titles=" + encodeURIComponent(titles.join("|")),
        { "Api-User-Agent": "Carry-on (https://github.com/danielnoam/carry-on)" });
        data = JSON.parse(res.text).query;
      } catch (e) { return; }
      const renamed = new Map(((data && data.normalized) || []).map((n) => [n.to, n.from]));
      for (const pg of (data && data.pages) || []) {
        const meta = pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].extmetadata;
        const imgs = files.get(pg.title) || files.get(renamed.get(pg.title));
        if (!meta || !imgs) continue;
        const credit = creditLine(meta.Artist && meta.Artist.value, meta.LicenseShortName && meta.LicenseShortName.value);
        if (credit) imgs.forEach((img) => img.setAttribute("data-co-credit", credit));
      }
    }
  }

  // "Jane Doe, CC BY-SA 4.0" from Commons' Artist (HTML) and licence.
  function creditLine(artistHtml, licence) {
    const text = (h) => new DOMParser().parseFromString(String(h || ""), "text/html").body.textContent.replace(/\s+/g, " ").trim();
    let artist = text(artistHtml);
    if (artist.length > 80) artist = artist.slice(0, 79).trimEnd() + "…";
    return [artist, text(licence)].filter(Boolean).join(", ");
  }

  const CHECK_TITLE = /^(just a moment|attention required|access denied|are you a robot)/i;

  // Reads the article out of a page's HTML. null when there isn't enough
  // text, or the page is a browser check, so the caller can try drawing it.
  function readArticle(html, finalUrl) {
    const doc = parse(html, finalUrl);
    const docTitle = (doc.querySelector("title") || {}).textContent || "";
    if (CHECK_TITLE.test(docTitle.trim())) return { check: true };
    const og = doc.querySelector('meta[property="og:title"]');
    const h1s = doc.querySelectorAll("h1");
    const headline = (og && og.content) || (h1s.length === 1 ? h1s[0].textContent : "");
    const next = nextLink(doc, finalUrl);
    resolveLazyImages(doc, finalUrl);
    if (typeof window.Readability !== "function") throw new SaveError("The reader part of the app didn't load. Restart Carry-on.");
    const article = new window.Readability(doc, { charThreshold: 500, keepClasses: false }).parse();
    if (!article || (article.textContent || "").trim().length < MIN_TEXT) return null;
    return { doc, docTitle, headline, next, article };
  }

  async function fromAnyPage(url, onDrawing) {
    const res = await get(url);
    let finalUrl = res.url || url;
    let got = readArticle(res.text, finalUrl);
    // Pages that build themselves with scripts, or wait behind a browser
    // check, get drawn in a hidden WebView on Android and read again. The
    // saved copy is the same script-free HTML as any other page's.
    if ((!got || got.check) && C.platform.canRender) {
      if (onDrawing) onDrawing();
      const drawn = await C.platform.render(finalUrl);
      if (drawn) {
        finalUrl = drawn.url;
        got = readArticle(drawn.text, finalUrl);
      }
    }
    if (got && got.check) throw new SaveError("The site asked for a browser check, so Carry-on can't save it yet.");
    if (!got) {
      throw new SaveError(C.platform.canRender
        ? "Carry-on couldn't find the article on this page, even after letting it draw itself."
        : "This page builds itself with JavaScript, which Carry-on can't save yet.");
    }
    const { doc, docTitle, headline, next, article } = got;
    const body = new DOMParser().parseFromString(article.content, "text/html").body;
    return {
      url: finalUrl,
      title: (headline.trim() || article.title || docTitle || siteName(finalUrl)).trim().replace(/\s+/g, " "),
      site: (article.siteName || siteName(finalUrl)).trim(),
      byline: (article.byline || "").trim(),
      body, base: finalUrl, licence: null,
      lang: (doc.documentElement.getAttribute("lang") || article.lang || "").trim(),
      dir: article.dir === "rtl" || textDir(doc, article.textContent) === "rtl" ? "rtl" : "",
      next,
    };
  }

  // Lazy loaders keep the real image in data-src, data-srcset or a
  // <picture>'s <source>, with a placeholder in src. Done before Readability,
  // which drops images it thinks are empty.
  function resolveLazyImages(doc, base) {
    doc.querySelectorAll("picture").forEach((pic) => {
      const img = pic.querySelector("img");
      if (!img) return;
      const sets = [...pic.querySelectorAll("source[srcset], source[data-srcset]")]
        .filter((s) => !/avif|jxl/.test(s.getAttribute("type") || ""))
        .map((s) => s.getAttribute("srcset") || s.getAttribute("data-srcset"));
      if (sets.length && !img.getAttribute("srcset")) img.setAttribute("srcset", sets[0]);
    });
    doc.querySelectorAll("img").forEach((img) => {
      for (const a of ["data-src", "data-lazy-src", "data-original", "data-url", "data-hi-res-src"]) {
        const v = img.getAttribute(a);
        if (v && !/^data:/.test(v)) { img.setAttribute("src", v); break; }
      }
      const lazySet = img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset");
      if (lazySet) img.setAttribute("srcset", lazySet);
      const src = img.getAttribute("src") || "";
      if ((!src || /^data:/.test(src)) && img.getAttribute("srcset")) {
        const pick = pickWidth(parseSrcset(img.getAttribute("srcset"), base), PREVIEW_WIDTH);
        if (pick) img.setAttribute("src", pick);
      }
    });
  }

  // ---- Rebuilding ----

  // Rebuilds `body` into `out` (a fresh document) from the allowlist.
  // Returns the images and videos found, for saveImages().
  function rebuild(body, base, pageUrl, out) {
    const media = [];
    const pageNoHash = pageUrl.split("#")[0];

    function videoCard(link, thumb, title, site) {
      const fig = out.createElement("figure");
      fig.className = "co-video";
      const a = out.createElement("a");
      a.href = link;
      if (thumb) {
        const img = out.createElement("img");
        img.alt = "";
        media.push({ el: img, preview: thumb, full: null, video: true });
        a.append(img);
      }
      const play = out.createElement("span");
      play.className = "co-play";
      play.setAttribute("aria-hidden", "true");
      a.append(play);
      const cap = out.createElement("figcaption");
      const t = out.createElement("span");
      t.className = "co-video-title";
      t.textContent = (title || "Video") + " · " + site;
      const note = out.createElement("span");
      note.className = "co-video-note";
      note.setAttribute("data-site", site);
      note.textContent = "Plays when you're back online";
      cap.append(t, note);
      fig.append(a, cap);
      return fig;
    }

    function video(node) {
      const tag = node.localName;
      const fig = node.closest("figure");
      const caption = fig && fig.querySelector("figcaption");
      const named = node.getAttribute("title") || node.getAttribute("aria-label") || (caption && caption.textContent.trim());
      const src = absolute(node.getAttribute("src") || node.getAttribute("data-src") || "", base) || "";
      if (tag === "iframe") {
        const yt = youtubeId(src);
        if (yt) return videoCard("https://www.youtube.com/watch?v=" + yt, "https://i.ytimg.com/vi/" + yt + "/hqdefault.jpg", named, "YouTube");
        const vm = vimeoId(src);
        if (vm) return videoCard("https://vimeo.com/" + vm, null, named, "Vimeo");
        return null;
      }
      if (tag === "video") {
        const source = node.querySelector("source[src]");
        const link = node.getAttribute("data-co-link") || src || (source && absolute(source.getAttribute("src"), base)) || pageUrl;
        const poster = absolute(node.getAttribute("poster") || "", base);
        return videoCard(link, poster && /^https?:/.test(poster) ? poster : null, named, node.getAttribute("data-co-site") || siteName(link));
      }
      return null;
    }

    function image(node) {
      const src = absolute(node.getAttribute("src") || "", base);
      if (!src || !/^https?:/.test(src)) return null;
      if (isTrackingPixel(node.getAttribute("width"), node.getAttribute("height"), src)) return null;
      const set = parseSrcset(node.getAttribute("srcset"), base);
      const preview = node.getAttribute("data-co-preview") || pickWidth(set, PREVIEW_WIDTH) || src;
      const full = node.getAttribute("data-co-full") || pickWidth(set, 1600) || src;
      const img = out.createElement("img");
      for (const a of ATTRS.img) {
        const v = node.getAttribute(a);
        if (v != null && (a === "alt" || /^\d+$/.test(v))) img.setAttribute(a, v);
      }
      const credit = node.getAttribute("data-co-credit");
      if (credit) img.setAttribute("data-credit", credit);
      media.push({ el: img, preview, full });
      return img;
    }

    function walk(from, to) {
      for (const node of [...from.childNodes]) {
        if (node.nodeType === 3) { to.append(out.createTextNode(node.data)); continue; }
        if (node.nodeType !== 1) continue;
        let tag = node.localName;
        if (tag === "iframe" || tag === "video") { const card = video(node); if (card) to.append(card); continue; }
        if (tag === "img") { const img = image(node); if (img) to.append(img); continue; }
        if (tag === "picture") { const img = node.querySelector("img"); if (img) { const i = image(img); if (i) to.append(i); } continue; }
        if (DROP.has(tag)) continue;
        if (/display:\s*none|visibility:\s*hidden/i.test(node.getAttribute("style") || "") || node.hasAttribute("hidden")) continue;
        if (tag === "h1") tag = "h2";
        if (!KEEP.has(tag)) { walk(node, to); continue; }
        const el = out.createElement(tag);
        for (const a of GLOBAL_ATTRS.concat(ATTRS[tag] || [])) {
          const v = node.getAttribute(a);
          if (v == null || a === "href") continue;
          el.setAttribute(a, v);
        }
        if (tag === "a") {
          const raw = node.getAttribute("href") || "";
          const abs = raw.startsWith("#") ? null : absolute(raw, base);
          if (raw.startsWith("#")) el.setAttribute("href", raw);
          else if (abs && abs.split("#")[0] === pageNoHash && abs.includes("#")) el.setAttribute("href", "#" + abs.split("#")[1]);
          else if (abs && /^(https?|mailto):/.test(abs)) el.setAttribute("href", abs);
        }
        walk(node, el);
        // A figure around an embed: the video card is the figure, and its
        // caption already became the card's title.
        const card = tag === "figure" && el.querySelector(".co-video");
        to.append(card || el);
      }
    }

    const root = out.createElement("div");
    root.className = "co-body";
    walk(body, root);
    // A credit goes under the image's caption; one outside a figure stays
    // on the image, for the image viewer.
    root.querySelectorAll("figure:not(.co-video) img[data-credit]").forEach((img) => {
      const fig = img.closest("figure");
      if (fig.querySelector(".co-credit")) { img.removeAttribute("data-credit"); return; }
      let cap = fig.querySelector("figcaption");
      if (!cap) { cap = out.createElement("figcaption"); fig.append(cap); }
      const line = out.createElement("small");
      line.className = "co-credit";
      line.textContent = img.getAttribute("data-credit");
      cap.append(line);
      img.removeAttribute("data-credit");
    });
    // Wrappers left empty once their media or chrome is gone.
    root.querySelectorAll("p, div, span:not(.co-play), section, figure, li").forEach((n) => {
      if (!n.textContent.trim() && !n.querySelector("img, figure, br, hr, table")) n.remove();
    });
    return { root, media };
  }

  // ---- Media ----

  // Downloads one image into the page's directory; a preview much wider
  // than the screen needs is redrawn smaller (store.shrink). Resolves to
  // { rel, bytes } of the file kept.
  async function keep(id, rel, url, mode) {
    const size = await C.store.download(id, rel, url);
    return mode === "full" ? { rel, bytes: size } : C.store.shrink(id, rel, size, PREVIEW_WIDTH);
  }

  // Downloads previews (or full images, or nothing, per the image setting)
  // into images/ beside page.html. A failed one keeps its link and is
  // counted as missing; the reader shows a placeholder for it offline.
  async function saveImages(id, media, mode, onProgress) {
    let done = 0, missing = 0, bytes = 0, thumb = null;
    const total = media.length;
    const queue = media.map((m, i) => ({ ...m, i }));
    const native = C.platform.native;

    async function one(m) {
      const url = mode === "full" && m.full ? m.full : m.preview;
      const fallback = m.full || url;
      if (!m.video) m.el.setAttribute("data-full", fallback);
      if (!native) { m.el.setAttribute("src", url); return; }
      if (mode === "links") { m.el.setAttribute("data-full", fallback); m.el.className = "co-missing"; return; }
      const rel = "images/" + m.i + "." + extOf(url);
      try {
        const got = await keep(id, rel, url, mode);
        bytes += got.bytes;
        m.el.setAttribute("src", got.rel);
        if (!thumb && !m.video) thumb = got.rel;
      } catch (e) {
        missing++;
        m.el.setAttribute("data-full", fallback);
        m.el.setAttribute("data-preview", url);
        m.el.className = "co-missing";
      }
    }

    async function worker() {
      while (queue.length) {
        await one(queue.shift());
        done++;
        if (onProgress) onProgress(done, total);
      }
    }
    await Promise.all([1, 2, 3, 4].map(worker));
    if (!native) thumb = (media.find((m) => !m.video) || {}).preview || null;
    return { bytes, missing, thumb, total };
  }

  // ---- The page file ----

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function savedPageHtml(meta, root, out) {
    const head = out.createElement("header");
    head.className = "co-head";
    const line = out.createElement("p");
    line.className = "co-meta";
    line.textContent = [meta.site, "saved " + formatDate(meta.savedAt), meta.minutes + " min"].join(" · ");
    const h1 = out.createElement("h1");
    h1.textContent = meta.title;
    head.append(line, h1);
    if (meta.byline) {
      const by = out.createElement("p");
      by.className = "co-byline";
      by.textContent = meta.byline;
      head.append(by);
    }
    const foot = out.createElement("footer");
    foot.className = "co-licence";
    const link = out.createElement("a");
    link.href = meta.url;
    link.textContent = "Read the original";
    foot.append(meta.licence === "wikipedia"
      ? "Text from Wikipedia, CC BY-SA 4.0, by Wikipedia contributors. "
      : "Saved from " + meta.site + " on " + formatDate(meta.savedAt) + ". ", link);
    const doc = out.implementation.createHTMLDocument(meta.title);
    if (meta.lang) doc.documentElement.lang = meta.lang;
    if (meta.dir) doc.documentElement.dir = meta.dir;
    doc.body.append(head, root, foot);
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  // A page's words with a line break after each block, for search: the
  // article only, without the header and licence lines savedPageHtml adds.
  const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, figcaption, blockquote, pre, td, th, dt, dd, div, section, article";
  function plainText(root) {
    const copy = root.cloneNode(true);
    copy.querySelectorAll(".co-head, .co-licence, .co-next, .co-credit, script, style").forEach((n) => n.remove());
    copy.querySelectorAll(BLOCKS).forEach((n) => n.append("\n"));
    return copy.textContent.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  }

  // ---- Saving ----

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Saves `url`; onProgress({ stage, done, total }) reports drawing a
  // script-built page, then images as they land. Resolves to the page's meta, which the library index lists.
  async function save(url, { mode = "previews", onProgress } = {}) {
    const wiki = wikipediaPage(url);
    if (onProgress) onProgress({ stage: "text" });
    const got = wiki ? await fromWikipedia(wiki) : await fromAnyPage(url, () => onProgress && onProgress({ stage: "drawing" }));
    const out = document.implementation.createHTMLDocument("");
    const { root, media } = rebuild(got.body, got.base, got.url, out);
    if (!root.textContent.trim()) throw new SaveError("Nothing readable was found on this page.");
    // The page's own headline, when the article kept it, would sit under the
    // one savedPageHtml writes.
    const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
    const first = root.querySelector("h2, h3");
    if (first && norm(first.textContent) === norm(got.title) && norm(root.textContent).startsWith(norm(first.textContent))) first.remove();

    const id = newId();
    const meta = {
      id, url: got.url, title: got.title, site: got.site, byline: got.byline,
      licence: got.licence, savedAt: Date.now(), minutes: readingMinutes(root.textContent),
      lang: wiki ? wiki.host.split(".")[0] : got.lang || "", dir: got.dir || "", mode: C.platform.native ? mode : "links",
      next: got.next || "",
    };
    if (onProgress) onProgress({ stage: "images", done: 0, total: media.length });
    const res = await saveImages(id, media, mode, (done, total) => onProgress && onProgress({ stage: "images", done, total }));
    Object.assign(meta, { images: res.total, missing: res.missing, thumb: res.thumb });
    const html = savedPageHtml(meta, root, out);
    try {
      meta.bytes = res.bytes + await C.store.writePage(id, html, meta);
      const text = plainText(root);
      await C.store.writeText(id, text);
      meta.bytes += C.store.bytesOf(text);
    } catch (e) {
      await C.store.removePage(id);
      throw new SaveError("Couldn't write the page to the phone. Free some space and try again.");
    }
    return meta;
  }

  // Tries the previews that didn't download when the page was saved again,
  // into the same page directory. Pages saved before 0.6.0 didn't keep the preview's
  // address, so those use the full image's (a Wikimedia one is narrowed to
  // the preview width). Resolves to { got, missing, bytes, thumb }.
  async function retryMissing(meta, onProgress) {
    const html = await C.store.readPage(meta.id);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = [...doc.querySelectorAll("img.co-missing")];
    let got = 0, bytes = 0, done = 0, thumb = meta.thumb || null;
    const stamp = Date.now().toString(36);
    for (const [i, img] of imgs.entries()) {
      const full = img.getAttribute("data-full") || "";
      let url = img.getAttribute("data-preview") || full;
      if (!img.hasAttribute("data-preview") && /upload\.wikimedia\.org\/.*\/thumb\//.test(full)) url = wikimediaThumb(full, WIKI_PREVIEW, 0);
      if (!/^https?:/.test(url)) continue;
      const rel = "images/r" + stamp + "-" + i + "." + extOf(url);
      try {
        const kept = await keep(meta.id, rel, url, meta.mode);
        bytes += kept.bytes;
        img.setAttribute("src", kept.rel);
        img.removeAttribute("class");
        img.removeAttribute("data-preview");
        if (!thumb && !img.closest(".co-video")) thumb = kept.rel;
        got++;
      } catch (e) { /* still missing */ }
      if (onProgress) onProgress(++done, imgs.length);
    }
    const missing = doc.querySelectorAll("img.co-missing").length;
    if (got) {
      const out = { ...meta, missing, thumb };
      await C.store.writePage(meta.id, "<!doctype html>\n" + doc.documentElement.outerHTML, out);
    }
    return { got, missing, bytes, thumb };
  }

  // Swaps every image on a saved page for its full-size one ("Save full
  // images" in ⋯), deleting the preview each replaces. One that can't be
  // fetched keeps its preview. Resolves to { got, failed, bytes } where
  // bytes is the change in the page's size.
  async function saveFullImages(meta, onProgress) {
    const html = await C.store.readPage(meta.id);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = [...doc.querySelectorAll("img[data-full]")].filter((img) => !img.closest(".co-video") && /^https?:/.test(img.getAttribute("data-full")));
    let got = 0, failed = 0, bytes = 0, done = 0;
    const stamp = Date.now().toString(36);
    for (const [i, img] of imgs.entries()) {
      const url = img.getAttribute("data-full");
      const rel = "images/f" + stamp + "-" + i + "." + extOf(url);
      try {
        bytes += await C.store.download(meta.id, rel, url);
        // The library card keeps its small preview.
        const old = img.getAttribute("src") || "";
        if (/^images\//.test(old) && old !== meta.thumb) bytes -= await C.store.removeFile(meta.id, old);
        img.setAttribute("src", rel);
        img.removeAttribute("class");
        img.removeAttribute("data-preview");
        got++;
      } catch (e) { failed++; }
      if (onProgress) onProgress(++done, imgs.length);
    }
    const out = { ...meta, mode: "full", missing: doc.querySelectorAll("img.co-missing").length };
    await C.store.writePage(meta.id, "<!doctype html>\n" + doc.documentElement.outerHTML, out);
    return { got, failed, bytes, missing: out.missing };
  }

  // A page's next link, read from the original: for pages saved before
  // 0.10.0, which didn't keep one. "" when it has none.
  async function findNext(url) {
    const res = await get(url);
    return nextLink(parse(res.text, res.url || url), res.url || url);
  }

  C.save = {
    save, SaveError, retryMissing, saveFullImages, findNext, creditLine, textDir, isNextText, plainText,
    wikipediaPage, wikimediaThumb, parseSrcset, pickWidth, youtubeId, vimeoId, extOf, isTrackingPixel, readingMinutes, siteName,
  };
})();
