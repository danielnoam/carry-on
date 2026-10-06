// Carry-on: your own files (0.31.0). An EPUB, a Markdown or text file, an
// HTML page or a CBZ comic opened from the phone becomes a clip like a
// saved page: its words rebuilt through save.cleanSaved's allowlist (a
// file is as untrusted as a web page), its pictures written beside it, and
// the file itself kept as it came (original.<ext>), for sharing it on and
// for the storage-place setting to come (TODO.md, "Files").
(function () {
  const C = window.CarryOn;
  const S = () => C.store;
  const B = () => C.backup;

  const KINDS = { epub: "EPUB", md: "Markdown", txt: "Text", html: "HTML", cbz: "Comic" };
  const EXTS = { epub: "epub", md: "md", markdown: "md", txt: "txt", text: "txt", html: "html", htm: "html", xhtml: "html", cbz: "cbz" };
  const PICTURE = /\.(jpe?g|png|gif|webp)$/i;
  const MIME_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

  class FileError extends Error {}

  const extOf = (name) => ((String(name).match(/\.([a-z0-9]{1,8})$/i) || [])[1] || "").toLowerCase();
  const baseName = (name) => String(name).replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_]+/g, " ").trim() || "Untitled";
  const decode = (bytes) => new TextDecoder(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8").decode(bytes);
  const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

  // A picture waits for the page behind a stand-in data: address that
  // cleanSaved lets through, and is written out once the page is clean,
  // so a book's pictures are never held as base64 text.
  function pictures() {
    const waiting = new Map();
    return {
      add(bytes) {
        const type = B().imageType(bytes);
        if (!MIME_EXT[type]) return null;
        const token = "data:" + type + ";base64," + btoa("carryon-" + waiting.size);
        waiting.set(token, { bytes, type });
        return token;
      },
      get: (token) => waiting.get(token),
    };
  }

  // What a file is, from its name and first bytes: one of KINDS, "backup"
  // (a Carry-on backup zip), "clip" (a clip sent as a file), "pdf", "zip"
  // (any other zip, or a broken one), or null.
  async function kindOf(file) {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const ext = EXTS[extOf(file.name)] || extOf(file.name);
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "pdf";
    if (head[0] === 0x50 && head[1] === 0x4b) {
      let entries;
      try { entries = await B().zipEntries(file); } catch (e) { return "zip"; }
      if (entries.has("library.json")) return "backup";
      if (entries.has("META-INF/container.xml")) return "epub";
      if ([...entries.keys()].some((n) => PICTURE.test(n))) return "cbz";
      return "zip";
    }
    if (ext === "html" || /^\s*<(!doctype|html|head|body|meta)/i.test(decode(head))) {
      const text = await file.text();
      return /<meta\s+name="carry-on-page"/i.test(text) ? "clip" : "html";
    }
    if (ext === "md" || ext === "txt") return ext;
    if (/^text\//.test(file.type || "")) return "txt";
    return null;
  }

  // ---- EPUB ----

  const dirOf = (path) => path.replace(/[^/]*$/, "");
  function resolve(from, href) {
    const parts = (dirOf(from) + href.split("#")[0]).split("/");
    const out = [];
    for (const p of parts) {
      if (p === "..") out.pop();
      else if (p && p !== ".") out.push(p);
    }
    try { return decodeURIComponent(out.join("/")); } catch (e) { return out.join("/"); }
  }

  async function fromEpub(file, out) {
    const entries = await B().zipEntries(file);
    const read = async (path) => {
      const e = entries.get(path);
      if (!e) throw new FileError("This EPUB is missing a part (" + path + ").");
      return B().zipRead(file, e);
    };
    const xml = async (path) => new DOMParser().parseFromString(decode(await read(path)), "application/xml");
    const container = await xml("META-INF/container.xml");
    const rootfile = container.getElementsByTagName("rootfile")[0];
    const opfPath = rootfile && rootfile.getAttribute("full-path");
    if (!opfPath) throw new FileError("This EPUB has no table of its parts.");
    const opf = await xml(opfPath);
    const first = (tag) => { const n = opf.getElementsByTagNameNS("*", tag)[0]; return n ? n.textContent.replace(/\s+/g, " ").trim() : ""; };
    const manifest = new Map();
    for (const item of opf.getElementsByTagNameNS("*", "item")) {
      manifest.set(item.getAttribute("id"), { path: resolve(opfPath, item.getAttribute("href") || ""), type: item.getAttribute("media-type") || "", props: item.getAttribute("properties") || "" });
    }
    const spine = [...opf.getElementsByTagNameNS("*", "itemref")]
      .map((r) => manifest.get(r.getAttribute("idref")))
      .filter((it) => it && /html/.test(it.type) && entries.has(it.path));
    if (!spine.length) throw new FileError("This EPUB has no chapters Carry-on can read.");
    const chapterOf = new Map(spine.map((it, i) => [it.path, i]));
    const pics = pictures();
    const picAt = new Map();
    const picture = async (path) => {
      if (!picAt.has(path)) {
        let token = null;
        try { if (entries.has(path)) token = pics.add(await read(path)); } catch (e) { token = null; }
        picAt.set(path, token);
      }
      return picAt.get(path);
    };

    const book = out.createElement("div");
    for (const [i, it] of spine.entries()) {
      const text = decode(await read(it.path));
      let doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
      // Named entities (&nbsp;) aren't XML: read it as HTML instead.
      if (doc.getElementsByTagName("parsererror").length || !doc.body) doc = new DOMParser().parseFromString(text, "text/html");
      const body = doc.body;
      if (!body) continue;
      // A cover page drawn as an SVG holding one picture.
      for (const svg of [...body.getElementsByTagNameNS("*", "svg")]) {
        const image = svg.getElementsByTagNameNS("*", "image")[0];
        const href = image && (image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
        if (!href) continue;
        const img = doc.createElementNS(body.namespaceURI || "http://www.w3.org/1999/xhtml", "img");
        img.setAttribute("src", href);
        img.setAttribute("alt", "");
        svg.replaceWith(img);
      }
      for (const img of [...body.getElementsByTagNameNS("*", "img")]) {
        const token = await picture(resolve(it.path, img.getAttribute("src") || ""));
        if (token) img.setAttribute("src", token);
        else img.remove();
      }
      // Ids are made the book's own, and a link to another chapter, or a
      // footnote in one, becomes a jump within the clip.
      const own = (id) => "c" + i + "-" + id;
      for (const n of [...body.querySelectorAll("[id]")]) n.setAttribute("id", own(n.getAttribute("id")));
      for (const a of [...body.getElementsByTagNameNS("*", "a")]) {
        const h = a.getAttribute("href") || "";
        if (/^(https?|mailto):/i.test(h)) continue;
        const [path, frag] = h.split("#");
        const to = path ? chapterOf.get(resolve(it.path, path)) : i;
        if (to == null) a.removeAttribute("href");
        else a.setAttribute("href", "#" + (frag ? "c" + to + "-" + frag : "c" + to));
      }
      const section = out.createElement("section");
      section.id = "c" + i;
      const { root, images } = C.save.cleanSaved(body, out);
      // cleanSaved hands data: pictures back instead of keeping them.
      for (const im of images) im.el.setAttribute("src", im.data);
      section.append(...root.childNodes);
      if (section.textContent.trim() || section.querySelector("img")) book.append(section);
    }
    const coverItem = [...manifest.values()].find((it) => /cover-image/.test(it.props))
      || manifest.get((opf.querySelector('meta[name="cover"]') || { getAttribute: () => null }).getAttribute("content"));
    const cover = coverItem && /^image\//.test(coverItem.type) ? await picture(coverItem.path) : null;
    const creators = [...opf.getElementsByTagNameNS("*", "creator")].map((n) => n.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
    const spineEl = opf.getElementsByTagNameNS("*", "spine")[0];
    return {
      body: book, pics, cover, title: first("title"), byline: creators.join(", "), lang: first("language"),
      dir: spineEl && spineEl.getAttribute("page-progression-direction") === "rtl" ? "rtl" : "",
    };
  }

  // ---- Markdown and text ----

  const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // The Markdown most notes use: headings, paragraphs, lists, quotes,
  // code, rules, links, pictures by address, emphasis. Raw HTML in it is
  // shown as text.
  function inline(s) {
    const code = [];
    s = escHtml(s).replace(/`([^`]+)`/g, (m, c) => "\u0000" + (code.push("<code>" + c + "</code>") - 1) + "\u0000");
    s = s.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, alt, src) => '<img alt="' + alt + '" src="' + src + '">')
      .replace(/\[([^\]]+)\]\((\S+?)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, t, href) => '<a href="' + href + '">' + t + "</a>")
      .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1">$1</a>')
      .replace(/(\*\*|__)(?=\S)(.+?\S)\1/g, "<strong>$2</strong>")
      .replace(/(^|[^\w*])\*(?=\S)(.+?\S)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_(?=\S)(.+?\S)_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~(?=\S)(.+?\S)~~/g, "<del>$1</del>");
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => code[i]);
  }

  function markdown(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [];
    const flush = () => { if (para.length) out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^\s*$/.test(line)) { flush(); continue; }
      if ((m = line.match(/^\s{0,3}(```|~~~)/))) {
        flush();
        const body = [];
        while (++i < lines.length && !lines[i].trim().startsWith(m[1])) body.push(lines[i]);
        out.push("<pre><code>" + escHtml(body.join("\n")) + "</code></pre>");
        continue;
      }
      if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr>"); continue; }
      if (/^\s{0,3}>/.test(line)) {
        flush();
        const quote = [];
        for (; i < lines.length && /^\s{0,3}>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i--;
        out.push("<blockquote>" + markdown(quote.join("\n")) + "</blockquote>");
        continue;
      }
      if ((m = line.match(/^(\s*)([-*+]|\d{1,9}[.)])\s+/))) {
        flush();
        const ordered = /\d/.test(m[2]);
        const items = [];
        for (; i < lines.length; i++) {
          const l = lines[i];
          const im = l.match(/^\s*([-*+]|\d{1,9}[.)])\s+(.*)$/);
          if (im && /\d/.test(im[1]) === ordered) items.push(im[2]);
          else if (items.length && /^\s{2,}\S/.test(l)) items[items.length - 1] += " " + l.trim();
          else break;
        }
        i--;
        const start = ordered ? parseInt(m[2], 10) : 1;
        out.push((ordered ? (start !== 1 ? '<ol start="' + start + '">' : "<ol>") : "<ul>")
          + items.map((t) => "<li>" + inline(t.replace(/^\[[ xX]\]\s+/, "")) + "</li>").join("") + (ordered ? "</ol>" : "</ul>"));
        continue;
      }
      // A heading underlined with === or ---.
      if (para.length === 0 && i + 1 < lines.length && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
        out.push(/=/.test(lines[i + 1]) ? "<h1>" + inline(line.trim()) + "</h1>" : "<h2>" + inline(line.trim()) + "</h2>");
        i++;
        continue;
      }
      para.push(line.trim());
    }
    flush();
    return out.join("\n");
  }

  // Plain text: blank lines part paragraphs. A paragraph whose lines were
  // broken to fit a width (a Project Gutenberg book) flows again; one of
  // short lines (a poem, an address) keeps its breaks.
  function plain(text) {
    return text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.replace(/^\n+|\s+$/g, "")).filter(Boolean).map((p) => {
      const lines = p.split("\n");
      const wrapped = lines.length > 1 && lines.slice(0, -1).every((l) => l.length >= 45 && l.length <= 100);
      return "<p>" + (wrapped ? escHtml(lines.map((l) => l.trim()).join(" ")) : lines.map((l) => escHtml(l)).join("<br>")) + "</p>";
    }).join("\n");
  }

  // ---- HTML ----

  // A web page saved to the phone: the article, as saving reads one, or
  // the whole body when there's no article to find. Pictures by address
  // stay as links; ones beside the file on the phone can't come along.
  function fromHtml(text, name) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    let body = doc.body;
    let title = (doc.querySelector("title") || {}).textContent || "";
    if (typeof window.Readability === "function") {
      try {
        const article = new window.Readability(doc.cloneNode(true), { charThreshold: 500, keepClasses: false }).parse();
        if (article && article.textContent && article.textContent.trim().length >= 500) {
          body = new DOMParser().parseFromString(article.content, "text/html").body;
          title = article.title || title;
        }
      } catch (e) { /* the whole body, then */ }
    }
    return { body, title: title.replace(/\s+/g, " ").trim() || baseName(name), lang: doc.documentElement.getAttribute("lang") || "" };
  }

  // ---- CBZ ----

  async function fromCbz(file, out, name) {
    const entries = await B().zipEntries(file);
    const names = [...entries.keys()].filter((n) => PICTURE.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n)).sort(naturally);
    if (!names.length) throw new FileError("There are no pictures in this comic.");
    let title = "";
    const info = [...entries.keys()].find((n) => /(^|\/)ComicInfo\.xml$/i.test(n));
    if (info) {
      try {
        const x = new DOMParser().parseFromString(decode(await B().zipRead(file, entries.get(info))), "application/xml");
        const get = (t) => ((x.getElementsByTagName(t)[0] || {}).textContent || "").trim();
        title = get("Title") || [get("Series"), get("Number") && "#" + get("Number")].filter(Boolean).join(" ");
      } catch (e) { title = ""; }
    }
    const root = out.createElement("div");
    root.className = "co-body co-comic";
    const panels = names.map((n) => {
      const img = out.createElement("img");
      img.setAttribute("alt", "");
      root.append(img);
      return { img, read: () => B().zipRead(file, entries.get(n)) };
    });
    return { root, panels, title: title || baseName(name) };
  }

  // ---- Bringing one in ----

  // Writes a page's pictures one at a time: into images/ in the app, into
  // the page as data: addresses in a browser. The first becomes the card's
  // picture unless it's told which is the cover.
  function picturesOut(id) {
    const res = { bytes: 0, thumb: null, n: 0 };
    res.put = async (img, b, type, cover) => {
      const rel = "images/" + res.n++ + "." + MIME_EXT[type];
      if (C.platform.native) {
        await S().writeBytes(id, rel, b);
        img.setAttribute("src", rel);
      } else {
        img.setAttribute("src", "data:" + type + ";base64," + S().toBase64(b));
      }
      res.bytes += b.length;
      if (cover || !res.thumb) {
        res.thumb = rel;
        if (!C.platform.native) await S().writeThumb(id, img.getAttribute("src"));
      }
    };
    return res;
  }

  // The clip's body from the file: { root, title, byline, lang, dir },
  // its pictures handed to `pics` as they're found.
  async function content(file, kind, out, pics, onProgress) {
    if (kind === "cbz") {
      const got = await fromCbz(file, out, file.name);
      // Each page straight to its file, so a big comic never sits in memory.
      for (const [i, p] of got.panels.entries()) {
        let b = null;
        try { b = await p.read(); } catch (e) { b = null; }
        const type = b && B().imageType(b);
        if (MIME_EXT[type]) await pics.put(p.img, b, type);
        else p.img.remove();
        if (onProgress) onProgress(i + 1, got.panels.length, "pictures");
      }
      if (!pics.n) throw new FileError("There are no pictures in this comic Carry-on can show.");
      return { root: got.root, title: got.title };
    }
    let got;
    if (kind === "epub") got = await fromEpub(file, out);
    else {
      const text = decode(new Uint8Array(await file.arrayBuffer()));
      if (kind === "html") got = fromHtml(text, file.name);
      else {
        const body = new DOMParser().parseFromString(kind === "md" ? markdown(text) : plain(text), "text/html").body;
        const h = kind === "md" && body.querySelector("h1");
        if (h && h === body.firstElementChild) h.remove();
        got = { body, title: h ? h.textContent.trim() : baseName(file.name) };
      }
    }
    const { root, images } = C.save.cleanSaved(got.body, out);
    if (!root.textContent.trim() && !root.querySelector("img")) throw new FileError("There's nothing to read in this file.");
    // The book's stand-ins are swapped for their bytes, and any real data:
    // picture (an HTML file can carry them) decoded.
    const list = [];
    for (const { el: img, data: src } of images) {
      const kept = got.pics && got.pics.get(src);
      if (kept) { list.push({ img, ...kept, cover: src === got.cover }); continue; }
      const b = Uint8Array.from(atob(src.split(",")[1].replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      const type = B().imageType(b);
      if (MIME_EXT[type]) list.push({ img, bytes: b, type });
      else img.remove();
    }
    // A cover the book never shows on a page still makes the card.
    const cover = got.cover && !list.some((x) => x.cover) && got.pics.get(got.cover);
    if (cover) list.unshift({ img: out.createElement("img"), ...cover, cover: true });
    for (const [i, x] of list.entries()) {
      await pics.put(x.img, x.bytes, x.type, x.cover);
      if (onProgress) onProgress(i + 1, list.length, "pictures");
    }
    return { root, title: got.title, byline: got.byline, lang: got.lang, dir: got.dir };
  }

  // Makes a clip of `file`, `kind` from kindOf. Resolves to the clip's
  // index entry, or { already } when `has(name, size)` says it's here.
  async function bring(file, kind, { has, onProgress } = {}) {
    if (!KINDS[kind]) throw new FileError("Carry-on can't open this kind of file.");
    if (has && has(file.name, file.size)) return { already: true };
    const id = C.save.newId();
    const out = document.implementation.createHTMLDocument("");
    const ext = kind === "epub" || kind === "cbz" || !EXTS[extOf(file.name)] ? kind : extOf(file.name);
    const pics = picturesOut(id);
    let got;
    try {
      got = await content(file, kind, out, pics, onProgress);
    } catch (e) {
      await S().removePage(id);
      if (!(e instanceof FileError)) console.error(e);
      throw e instanceof FileError ? e : new FileError("Carry-on couldn't read this " + KINDS[kind] + " file. It may be damaged.");
    }
    const { root } = got;
    const words = root.textContent;
    const meta = {
      id, url: "", title: (got.title || baseName(file.name)).slice(0, 300), site: KINDS[kind], byline: (got.byline || "").slice(0, 200), licence: null,
      savedAt: Date.now(), minutes: kind === "cbz" ? Math.max(1, Math.round(pics.n / 10)) : C.save.readingMinutes(words),
      lang: (got.lang || "").slice(0, 20), dir: got.dir || C.save.textDir(out, words), mode: "full", next: "", prev: "", at: 0, finished: false,
      images: root.querySelectorAll("img").length, missing: 0, imageBytes: pics.bytes,
      file: { name: file.name.slice(0, 200), kind, ext, size: file.size },
    };
    if (kind === "cbz") meta.comic = true;
    if (pics.thumb) meta.thumb = pics.thumb;
    try {
      const html = C.save.savedPageHtml(meta, root, out);
      const text = C.save.plainText(root);
      const kept = await S().writeOriginal(id, ext, file, (n, total) => onProgress && onProgress(n, total, "file"));
      meta.bytes = pics.bytes + kept + await S().writePage(id, html, meta) + S().bytesOf(text);
      await S().writeText(id, text);
    } catch (e) {
      await S().removePage(id);
      throw new FileError("Couldn't keep this file on " + (C.platform.native ? "the phone" : "this browser") + ". Free some space and try again.");
    }
    return meta;
  }

  C.files = { KINDS, kindOf, bring, markdown, plain, FileError };
})();
