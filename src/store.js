// Carry-on: where saved pages live. One directory per page under the app's
// data directory, `pages/<id>/` with page.html, meta.json and images/, plus
// library.json listing them (docs/PROPOSAL.md, "Store and read").
//
// In a browser there is no directory: page.html goes to IndexedDB and the
// index to localStorage, and images stay links (downloadTo returns null).
(function () {
  const P = window.CarryOn.platform;
  const FS = () => P.plugin("Filesystem");
  const DIR = "DATA";
  const INDEX_KEY = "carryon.library";

  const bytesOf = (text) => new Blob([text]).size;

  // The data directory as a URL the WebView can load, so a page directory can be
  // the reader's <base> and a card can show its preview. null in a browser.
  let dataUrl = null;
  const ready = (async () => {
    if (!FS()) return;
    try {
      const { uri } = await FS().getUri({ path: "", directory: DIR });
      const cap = window.Capacitor;
      dataUrl = (cap && cap.convertFileSrc ? cap.convertFileSrc(uri) : uri).replace(/\/?$/, "/");
    } catch (e) { dataUrl = null; }
  })();

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("carryon", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("pages");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pages", mode);
      const req = fn(tx.objectStore("pages"));
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function readIndex() {
    if (FS()) {
      try {
        const { data } = await FS().readFile({ path: "library.json", directory: DIR, encoding: "utf8" });
        return JSON.parse(data);
      } catch (e) { return []; }
    }
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { return []; }
  }

  async function writeIndex(pages) {
    const text = JSON.stringify(pages);
    if (FS()) {
      await FS().writeFile({ path: "library.json", data: text, directory: DIR, encoding: "utf8" });
      return;
    }
    try { localStorage.setItem(INDEX_KEY, text); } catch (e) { /* not kept */ }
  }

  async function writePage(id, html, meta) {
    if (FS()) {
      const base = "pages/" + id + "/";
      await FS().writeFile({ path: base + "page.html", data: html, directory: DIR, encoding: "utf8", recursive: true });
      await FS().writeFile({ path: base + "meta.json", data: JSON.stringify(meta, null, 1), directory: DIR, encoding: "utf8", recursive: true });
    } else {
      await idbDo("readwrite", (s) => s.put(html, id));
    }
    return bytesOf(html);
  }

  async function readPage(id) {
    if (FS()) {
      const { data } = await FS().readFile({ path: "pages/" + id + "/page.html", directory: DIR, encoding: "utf8" });
      return data;
    }
    return idbDo("readonly", (s) => s.get(id));
  }

  async function removePage(id) {
    if (FS()) {
      try { await FS().rmdir({ path: "pages/" + id, directory: DIR, recursive: true }); } catch (e) { /* already gone */ }
      return;
    }
    try { await idbDo("readwrite", (s) => { s.delete(id + ":text"); return s.delete(id); }); } catch (e) { /* already gone */ }
  }

  // The page's words as plain text (text.txt), for searching the library.
  // null when it was saved before 0.16.0 and hasn't been read for it yet.
  async function writeText(id, text) {
    if (FS()) {
      await FS().writeFile({ path: "pages/" + id + "/text.txt", data: text, directory: DIR, encoding: "utf8", recursive: true });
    } else {
      await idbDo("readwrite", (s) => s.put(text, id + ":text"));
    }
  }
  async function readText(id) {
    try {
      if (FS()) return (await FS().readFile({ path: "pages/" + id + "/text.txt", directory: DIR, encoding: "utf8" })).data;
      const t = await idbDo("readonly", (s) => s.get(id + ":text"));
      return typeof t === "string" ? t : null;
    } catch (e) { return null; }
  }

  // Downloads `url` into the page's directory; resolves to the file's size.
  // Throws where there is no directory, so callers keep the link instead.
  async function download(id, rel, url) {
    if (!FS()) throw new Error("no directory");
    const path = "pages/" + id + "/" + rel;
    await P.downloadTo(url, path);
    const { size } = await FS().stat({ path, directory: DIR });
    if (!size) throw new Error("empty download");
    return size;
  }

  // Deletes one file in a page's directory; resolves to the bytes freed.
  async function removeFile(id, rel) {
    if (!FS()) return 0;
    const path = "pages/" + id + "/" + rel;
    try {
      const { size } = await FS().stat({ path, directory: DIR });
      await FS().deleteFile({ path, directory: DIR });
      return size || 0;
    } catch (e) { return 0; }
  }

  // Redraws a downloaded image that's much wider than `max` at `max` px:
  // JPEG, or PNG when it has see-through parts (a logo, a diagram). Keeps
  // whichever file is smaller. Animated GIFs and SVGs are left alone. The
  // file is served from the app's own origin, so the canvas can be read.
  // Resolves to { rel, bytes } of the file kept. One at a time, so four
  // big photos aren't decoded at once.
  let drawing = Promise.resolve();
  function shrink(id, rel, size, max) {
    const turn = drawing.then(() => shrinkNow(id, rel, size, max));
    drawing = turn;
    return turn;
  }
  async function shrinkNow(id, rel, size, max) {
    const dir = pageDirUrl(id);
    const same = { rel, bytes: size };
    if (!dir || /\.(gif|svg)$/i.test(rel)) return same;
    try {
      const img = new Image();
      img.src = dir + rel;
      await img.decode();
      if (img.naturalWidth <= max * 1.25) return same;
      const w = max, h = Math.max(1, Math.round(img.naturalHeight * max / img.naturalWidth));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      const clear = !/\.jpe?g$/i.test(rel) && seeThrough(ctx.getImageData(0, 0, w, h).data);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, clear ? "image/png" : "image/jpeg", 0.82));
      if (!blob || blob.size >= size) return same;
      const out = rel.replace(/\.[^./]*$/, "") + "s." + (clear ? "png" : "jpg");
      await FS().writeFile({ path: "pages/" + id + "/" + out, data: await base64(blob), directory: DIR, recursive: true });
      await removeFile(id, rel);
      return { rel: out, bytes: blob.size };
    } catch (e) { return same; }
  }

  function seeThrough(px) {
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
    return false;
  }

  function base64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // The URL a page's relative paths (images/3.jpg) resolve against.
  function pageDirUrl(id) {
    return dataUrl ? dataUrl + "pages/" + id + "/" : null;
  }

  window.CarryOn.store = { ready, readIndex, writeIndex, writePage, readPage, removePage, writeText, readText, download, removeFile, shrink, pageDirUrl, bytesOf };
})();
