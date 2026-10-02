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

  // Hebrew and Arabic pages say so on <html> or <body>; the saved page keeps
  // it, or the reader lays them out left to right.
  function textDir(doc) {
    const d = (doc.documentElement.getAttribute("dir") || (doc.body && doc.body.getAttribute("dir")) || "").toLowerCase();
    return d === "rtl" ? "rtl" : "";
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

  async function fromAnyPage(url) {
    const res = await get(url);
    const finalUrl = res.url || url;
    const doc = parse(res.text, finalUrl);
    const docTitle = (doc.querySelector("title") || {}).textContent || "";
    if (/^(just a moment|attention required|access denied|are you a robot)/i.test(docTitle.trim())) {
      throw new SaveError("The site asked for a browser check, so Carry-on can't save it yet.");
    }
    const og = doc.querySelector('meta[property="og:title"]');
    const h1s = doc.querySelectorAll("h1");
    const headline = (og && og.content) || (h1s.length === 1 ? h1s[0].textContent : "");
    resolveLazyImages(doc, finalUrl);
    if (typeof window.Readability !== "function") throw new SaveError("The reader part of the app didn't load. Restart Carry-on.");
    const article = new window.Readability(doc, { charThreshold: 500, keepClasses: false }).parse();
    if (!article || (article.textContent || "").trim().length < MIN_TEXT) {
      throw new SaveError("This page builds itself with JavaScript, which Carry-on can't save yet.");
    }
    const body = new DOMParser().parseFromString(article.content, "text/html").body;
    return {
      url: finalUrl,
      title: (headline.trim() || article.title || docTitle || siteName(finalUrl)).trim().replace(/\s+/g, " "),
      site: (article.siteName || siteName(finalUrl)).trim(),
      byline: (article.byline || "").trim(),
      body, base: finalUrl, licence: null,
      lang: (doc.documentElement.getAttribute("lang") || article.lang || "").trim(),
      dir: article.dir === "rtl" || textDir(doc) === "rtl" ? "rtl" : "",
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

  // ---- Cleaning ----

  // Rebuilds `body` into `out` (a fresh document) from the allowlist.
  // Returns the images and videos found, for localise().
  function clean(body, base, pageUrl, out) {
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
    // Wrappers left empty once their media or chrome is gone.
    root.querySelectorAll("p, div, span:not(.co-play), section, figure, li").forEach((n) => {
      if (!n.textContent.trim() && !n.querySelector("img, figure, br, hr, table")) n.remove();
    });
    return { root, media };
  }

  // ---- Media ----

  // Downloads previews (or full images, or nothing, per the image setting)
  // into images/ beside page.html. A failed one keeps its link and is
  // counted as missing; the reader shows a placeholder for it offline.
  async function localise(id, media, mode, onProgress) {
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
        bytes += await C.store.download(id, rel, url);
        m.el.setAttribute("src", rel);
        if (!thumb && !m.video) thumb = rel;
      } catch (e) {
        missing++;
        m.el.setAttribute("data-full", fallback);
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

  function pageHtml(meta, root, out) {
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

  // ---- Saving ----

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Saves `url`; onProgress({ stage, done, total }) reports images as they
  // land. Resolves to the page's meta, which the library index lists.
  async function save(url, { mode = "previews", onProgress } = {}) {
    const wiki = wikipediaPage(url);
    if (onProgress) onProgress({ stage: "text" });
    const got = wiki ? await fromWikipedia(wiki) : await fromAnyPage(url);
    const out = document.implementation.createHTMLDocument("");
    const { root, media } = clean(got.body, got.base, got.url, out);
    if (!root.textContent.trim()) throw new SaveError("Nothing readable was found on this page.");
    // The page's own headline, when the article kept it, would sit under the
    // one pageHtml writes.
    const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
    const first = root.querySelector("h2, h3");
    if (first && norm(first.textContent) === norm(got.title) && norm(root.textContent).startsWith(norm(first.textContent))) first.remove();

    const id = newId();
    const meta = {
      id, url: got.url, title: got.title, site: got.site, byline: got.byline,
      licence: got.licence, savedAt: Date.now(), minutes: readingMinutes(root.textContent),
      lang: wiki ? wiki.host.split(".")[0] : got.lang || "", dir: got.dir || "", mode: C.platform.native ? mode : "links",
    };
    if (onProgress) onProgress({ stage: "images", done: 0, total: media.length });
    const res = await localise(id, media, mode, (done, total) => onProgress && onProgress({ stage: "images", done, total }));
    Object.assign(meta, { images: res.total, missing: res.missing, thumb: res.thumb });
    const html = pageHtml(meta, root, out);
    try {
      meta.bytes = res.bytes + await C.store.writePage(id, html, meta);
    } catch (e) {
      await C.store.removePage(id);
      throw new SaveError("Couldn't write the page to the phone. Free some space and try again.");
    }
    return meta;
  }

  C.save = {
    save, SaveError, textDir,
    wikipediaPage, wikimediaThumb, parseSrcset, pickWidth, youtubeId, vimeoId, extOf, isTrackingPixel, readingMinutes, siteName,
  };
})();
