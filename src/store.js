// Carry-on: where saved pages live. One folder per page under the app's
// data directory, `pages/<id>/` with page.html, meta.json and images/, plus
// library.json listing them (docs/PROPOSAL.md, "Store and read").
//
// In a browser there is no folder: page.html goes to IndexedDB and the
// index to localStorage, and images stay links (downloadTo returns null).
(function () {
  const P = window.CarryOn.platform;
  const FS = () => P.plugin("Filesystem");
  const DIR = "DATA";
  const INDEX_KEY = "carryon.library";

  const bytesOf = (text) => new Blob([text]).size;

  // The data folder as a URL the WebView can load, so a page folder can be
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
    try { await idbDo("readwrite", (s) => s.delete(id)); } catch (e) { /* already gone */ }
  }

  // Downloads `url` into the page's folder; resolves to the file's size.
  // Throws where there is no folder, so callers keep the link instead.
  async function download(id, rel, url) {
    if (!FS()) throw new Error("no folder");
    const path = "pages/" + id + "/" + rel;
    await P.downloadTo(url, path);
    const { size } = await FS().stat({ path, directory: DIR });
    if (!size) throw new Error("empty download");
    return size;
  }

  // The URL a page's relative paths (images/3.jpg) resolve against.
  function folderUrl(id) {
    return dataUrl ? dataUrl + "pages/" + id + "/" : null;
  }

  window.CarryOn.store = { ready, readIndex, writeIndex, writePage, readPage, removePage, download, folderUrl, bytesOf };
})();
