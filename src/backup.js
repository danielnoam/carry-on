// Carry-on: pages leaving the app and coming back (0.18.0). One page as a
// self-contained HTML file, and the whole library as one zip: library.json
// plus every page directory, stored without compression (pictures are
// already compressed), written and read by the small zip code below.
//
// Anything read back is untrusted: index entries keep only the fields
// Carry-on writes, file names only the shapes it makes, and an imported
// page's HTML goes through save.cleanSaved.
(function () {
  const C = window.CarryOn;
  const S = () => C.store;

  // ---- The index entry ----

  const ID = /^[a-z0-9]{4,24}$/;
  const LOCAL = /^images\/[A-Za-z0-9._-]{1,80}$/;
  const httpUrl = (v) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v.slice(0, 2000) : "");
  const text = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

  // An entry from a file, down to the fields an index entry has. null when
  // it has no address to call home.
  function cleanMeta(m, id) {
    if (!m || typeof m !== "object" || !httpUrl(m.url)) return null;
    const out = {
      id, url: httpUrl(m.url), title: text(m.title, 300) || httpUrl(m.url), site: text(m.site, 100), byline: text(m.byline, 200),
      licence: m.licence === "wikipedia" ? "wikipedia" : null, savedAt: num(m.savedAt) || Date.now(), minutes: Math.max(1, Math.round(num(m.minutes)) || 1),
      lang: text(m.lang, 20), dir: m.dir === "rtl" ? "rtl" : "", mode: ["previews", "full", "links"].includes(m.mode) ? m.mode : "previews",
      images: num(m.images), missing: num(m.missing), bytes: num(m.bytes),
      at: Math.min(1, Math.max(0, num(m.at))), finished: m.finished === true,
    };
    if (num(m.readAt)) out.readAt = num(m.readAt);
    if (m.comic === true) out.comic = true;
    if (typeof m.next === "string") out.next = httpUrl(m.next);
    if (typeof m.prev === "string") out.prev = httpUrl(m.prev);
    if (httpUrl(m.requested)) out.requested = httpUrl(m.requested);
    if (typeof m.thumb === "string" && (LOCAL.test(m.thumb) || httpUrl(m.thumb))) out.thumb = m.thumb;
    const tags = Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === "string").map((t) => t.replace(/\s+/g, " ").trim().slice(0, 32)).filter(Boolean) : [];
    if (tags.length) out.tags = [...new Set(tags)].slice(0, 50);
    const folder = text(m.folder, 32).replace(/\s+/g, " ").trim();
    if (folder) { out.folder = folder; out.folderAt = num(m.folderAt) || out.savedAt; }
    return out;
  }

  // ---- Zip, stored ----

  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const utf8 = (s) => new TextEncoder().encode(s);

  // Entries go out as they're added; `sink(bytes)` takes them in order.
  function zipWriter(sink) {
    const dir = [];
    let offset = 0, pending = [], pendingSize = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    async function put(bytes, force) {
      if (bytes.length) { pending.push(bytes); pendingSize += bytes.length; }
      if (pendingSize < (force ? 1 : 1 << 20)) return;
      const all = new Uint8Array(pendingSize);
      let at = 0;
      for (const b of pending) { all.set(b, at); at += b.length; }
      pending = []; pendingSize = 0;
      await sink(all);
    }
    function header(sig, size) {
      const b = new Uint8Array(size);
      const v = new DataView(b.buffer);
      v.setUint32(0, sig, true);
      return [b, v];
    }
    return {
      async add(name, bytes) {
        const n = utf8(name), crc = crc32(bytes);
        const [h, v] = header(0x04034b50, 30);
        v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(8, 0, true);
        v.setUint16(10, time, true); v.setUint16(12, date, true); v.setUint32(14, crc, true);
        v.setUint32(18, bytes.length, true); v.setUint32(22, bytes.length, true); v.setUint16(26, n.length, true);
        dir.push({ n, crc, size: bytes.length, offset });
        offset += 30 + n.length + bytes.length;
        await put(h); await put(n); await put(bytes);
      },
      async finish() {
        let size = 0;
        for (const e of dir) {
          const [h, v] = header(0x02014b50, 46);
          v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x800, true);
          v.setUint16(12, time, true); v.setUint16(14, date, true); v.setUint32(16, e.crc, true);
          v.setUint32(20, e.size, true); v.setUint32(24, e.size, true); v.setUint16(28, e.n.length, true);
          v.setUint32(42, e.offset, true);
          await put(h); await put(e.n);
          size += 46 + e.n.length;
        }
        const [h, v] = header(0x06054b50, 22);
        v.setUint16(8, dir.length, true); v.setUint16(10, dir.length, true);
        v.setUint32(12, size, true); v.setUint32(16, offset, true);
        await put(h);
        await put(new Uint8Array(0), true);
      },
    };
  }

  const bytesOf = async (blob, from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer());

  // The entries of a zip held in a Blob (a picked File), read from its
  // central directory without loading the whole file. Map of name → entry.
  async function zipEntries(blob) {
    const tail = await bytesOf(blob, Math.max(0, blob.size - 65557), blob.size);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { end = i; break; }
    }
    if (end < 0) throw new Error("not a zip");
    const ev = new DataView(tail.buffer, end);
    const count = ev.getUint16(10, true), size = ev.getUint32(12, true), start = ev.getUint32(16, true);
    const cd = await bytesOf(blob, start, start + size);
    const v = new DataView(cd.buffer);
    const out = new Map();
    for (let i = 0, p = 0; i < count && p + 46 <= cd.length; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true);
      const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen));
      out.set(name, { method: v.getUint16(p + 10, true), packed: v.getUint32(p + 20, true), size: v.getUint32(p + 24, true), offset: v.getUint32(p + 42, true) });
      p += 46 + nameLen + extra + note;
    }
    return out;
  }

  async function zipRead(blob, e) {
    const h = await bytesOf(blob, e.offset, e.offset + 30);
    const v = new DataView(h.buffer);
    if (v.getUint32(0, true) !== 0x04034b50) throw new Error("bad entry");
    const from = e.offset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
    const raw = await bytesOf(blob, from, from + e.packed);
    if (e.method === 0) return raw;
    // A backup someone re-zipped with their computer's own tool.
    if (e.method === 8 && typeof DecompressionStream === "function") {
      const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(out).arrayBuffer());
    }
    throw new Error("unsupported entry");
  }

  // ---- The whole library ----

  const today = () => new Date().toISOString().slice(0, 10);

  // Writes the backup and resolves to { uri } in the app (a file in its
  // cache, for the share sheet) or { blob } in a browser.
  async function exportLibrary(pages, onProgress) {
    const native = C.platform.native;
    const name = "carry-on-backup-" + today() + ".zip";
    const file = native ? await S().cacheFile(name) : null;
    const parts = [];
    const zip = zipWriter(native ? (b) => file.append(b) : (b) => { parts.push(b); });
    await zip.add("carry-on.json", utf8(JSON.stringify({ format: 1, app: C.version, made: Date.now(), pages: pages.length })));
    await zip.add("library.json", utf8(JSON.stringify(pages)));
    let done = 0;
    for (const p of pages) {
      if (native) {
        for (const rel of await S().listFiles(p.id)) {
          try { await zip.add("pages/" + p.id + "/" + rel, await S().readBytes(p.id, rel)); } catch (e) { /* gone since listing */ }
        }
      } else {
        const html = await S().readPage(p.id).catch(() => null);
        if (html) await zip.add("pages/" + p.id + "/page.html", utf8(html));
        const words = await S().readText(p.id);
        if (words != null) await zip.add("pages/" + p.id + "/text.txt", utf8(words));
      }
      if (onProgress) onProgress(++done, pages.length);
    }
    await zip.finish();
    return native ? { uri: await file.uri(), name } : { blob: new Blob(parts, { type: "application/zip" }), name };
  }

  const PAGE_FILE = /^(page\.html|meta\.json|text\.txt|images\/[A-Za-z0-9._-]{1,80})$/;

  // Merges a backup into the library: a page not here is added, one here
  // already is replaced only by a copy saved later, never the other way.
  // `same(a, b)` says whether two addresses are the same page. Resolves to
  // { pages, added, replaced, kept } where `pages` is the new index.
  async function restoreLibrary(blob, current, same, onProgress) {
    let entries;
    try { entries = await zipEntries(blob); } catch (e) { throw new Error("This file isn't a Carry-on backup."); }
    const indexEntry = entries.get("library.json");
    let list;
    try { list = JSON.parse(new TextDecoder().decode(await zipRead(blob, indexEntry))); } catch (e) { list = null; }
    if (!indexEntry || !Array.isArray(list)) throw new Error("This file isn't a Carry-on backup.");
    const pages = [...current];
    const taken = new Set(pages.map((p) => p.id));
    let added = 0, replaced = 0, kept = 0, done = 0;
    for (const raw of list) {
      const from = raw && typeof raw.id === "string" && ID.test(raw.id) ? raw.id : null;
      const meta = from && entries.has("pages/" + from + "/page.html") && cleanMeta(raw, from);
      if (meta) {
        const i = pages.findIndex((p) => same(p.url, meta.url));
        if (i >= 0 && (pages[i].savedAt || 0) >= meta.savedAt) kept++;
        else {
          if (i >= 0) { await S().removePage(pages[i].id); taken.delete(pages[i].id); }
          let id = from;
          while (taken.has(id)) id = C.save.newId();
          meta.id = id;
          taken.add(id);
          await restorePage(blob, entries, from, meta);
          if (i >= 0) { pages[i] = meta; replaced++; } else { pages.push(meta); added++; }
        }
      }
      if (onProgress) onProgress(++done, list.length);
    }
    pages.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return { pages, added, replaced, kept };
  }

  async function restorePage(blob, entries, from, meta) {
    const prefix = "pages/" + from + "/";
    const html = entries.get(prefix + "page.html");
    if (!C.platform.native) {
      const page = new TextDecoder().decode(await zipRead(blob, html));
      await S().writePage(meta.id, page, meta);
      const words = entries.get(prefix + "text.txt");
      if (words) await S().writeText(meta.id, new TextDecoder().decode(await zipRead(blob, words)));
      return;
    }
    for (const [name, e] of entries) {
      if (!name.startsWith(prefix)) continue;
      const rel = name.slice(prefix.length);
      if (!PAGE_FILE.test(rel) || rel === "meta.json") continue;
      await S().writeBytes(meta.id, rel, await zipRead(blob, e));
    }
    await S().writeBytes(meta.id, "meta.json", utf8(JSON.stringify(meta, null, 1)));
  }

  // ---- One page ----

  const dataUrl = (bytes, type) => "data:" + type + ";base64," + S().toBase64(bytes);
  // What a picture is, from its first bytes: a file named .jpg after its
  // address may well hold a WebP.
  function imageType(b) {
    if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    return null;
  }

  // The page as one HTML file: its saved pictures inlined, its index entry
  // in a <meta> for importing it back. Resolves to { name, html }.
  async function exportPage(p) {
    const doc = new DOMParser().parseFromString(await S().readPage(p.id), "text/html");
    for (const img of doc.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src");
      if (!LOCAL.test(src)) continue;
      try {
        const bytes = await S().readBytes(p.id, src);
        const type = imageType(bytes);
        if (!type) throw new Error("not a picture");
        img.setAttribute("src", dataUrl(bytes, type));
      } catch (e) {
        img.removeAttribute("src");
        if (img.hasAttribute("data-full")) img.className = "co-missing";
      }
    }
    const keep = { ...p };
    delete keep.id; delete keep.thumb; delete keep.bytes;
    const m = doc.createElement("meta");
    m.name = "carry-on-page";
    m.content = JSON.stringify(keep);
    doc.head.prepend(m);
    const charset = doc.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    doc.head.prepend(charset);
    const slug = p.title.replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Page";
    return { name: slug + ".html", html: "<!doctype html>\n" + doc.documentElement.outerHTML };
  }

  // A page file back into the library. Resolves to its new index entry,
  // or to { already } with the address when `has(url)` says it's saved;
  // throws an Error whose message says what's wrong with the file.
  async function importPage(html, has) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tag = doc.querySelector('meta[name="carry-on-page"]');
    let raw = null;
    try { raw = tag && JSON.parse(tag.getAttribute("content")); } catch (e) { raw = null; }
    const id = C.save.newId();
    const meta = cleanMeta(raw, id);
    if (!meta) throw new Error("This file wasn't sent from Carry-on, so it can't be opened here.");
    if (has && has(meta.url)) return { already: meta.url };
    const out = document.implementation.createHTMLDocument("");
    const { root, images } = C.save.cleanSaved(doc.body, out);
    if (!root.textContent.trim()) throw new Error("This page file is empty.");
    let bytes = 0, thumb = null;
    for (const [i, im] of images.entries()) {
      const [head, b64] = im.data.split(",");
      const ext = (head.match(/image\/(\w+)/) || [])[1].replace("jpeg", "jpg");
      if (!C.platform.native) { im.el.setAttribute("src", im.data); continue; }
      const bin = Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      const rel = "images/" + i + "." + ext;
      await S().writeBytes(id, rel, bin);
      bytes += bin.length;
      im.el.setAttribute("src", rel);
      if (!thumb && !im.el.closest(".co-video")) thumb = rel;
    }
    Object.assign(meta, { missing: root.querySelectorAll("img.co-missing").length, images: root.querySelectorAll("img").length });
    if (thumb) meta.thumb = thumb;
    const page = C.save.savedPageHtml(meta, root, out);
    const words = C.save.plainText(root);
    meta.bytes = bytes + await S().writePage(id, page, meta) + S().bytesOf(words);
    await S().writeText(id, words);
    return meta;
  }

  C.backup = { cleanMeta, crc32, zipWriter, zipEntries, zipRead, exportLibrary, restoreLibrary, exportPage, importPage, imageType };
})();
