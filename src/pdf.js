// Waypage: PDFs (0.32.0). A PDF is read by pdf.js, but never in the app's
// own page: a script there could reach the Capacitor plugins and every
// saved clip. So pdf.js runs in an iframe with `sandbox="allow-scripts"`
// and no `allow-same-origin`, which gives it an opaque origin of its own,
// behind a CSP that lets it load nothing from the network. The app hands
// it the library's text and the file's bytes by postMessage; the frame
// makes blob: URLs of its own for the library and its worker, since a
// module or worker can't be loaded across origins (NOTES.md, 0.32.0).
//
// What comes back is the PDF's words, laid out as paragraphs, so a PDF
// reads like any other clip: themes, type, search, read aloud, where you
// were. A PDF with no words in it (a scan, a comic) comes back as its
// pages drawn as pictures instead.
(function () {
  const C = window.Waypage;
  const LIB = "src/vendor/pdf.min.mjs";
  const WORKER = "src/vendor/pdf.worker.min.mjs";
  const CSP = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; " +
    "connect-src blob: data:; img-src blob: data:; style-src 'unsafe-inline'";

  // Everything below runs inside the sandbox, as text, so it can't be
  // reached from the app's page and can't reach back except by message.
  const BOOT = String.raw`
const post = (m, t) => parent.postMessage(m, "*", t || []);
let busy = false;
addEventListener("message", async (e) => {
  const job = e.data;
  if (!job || job.kind !== "read" || busy) return;
  busy = true;
  try { post(await read(job)); }
  catch (err) { post({ error: String((err && err.message) || err) }); }
  busy = false;
});

async function read(job) {
  const url = (text, type) => URL.createObjectURL(new Blob([text], { type }));
  const lib = await import(url(job.lib, "text/javascript"));
  lib.GlobalWorkerOptions.workerSrc = url(job.worker, "text/javascript");
  const doc = await lib.getDocument({
    data: job.bytes,
    isEvalSupported: false,
    disableAutoFetch: true,
    enableScripting: false,
    enableXfa: false,
    useSystemFonts: false,
    standardFontDataUrl: null,
    cMapUrl: null,
    verbosity: 0,
  }).promise;
  const count = Math.min(doc.numPages, job.maxPages || 2000);
  const meta = await doc.getMetadata().catch(() => null);
  const info = (meta && meta.info) || {};
  const out = { title: String(info.Title || "").trim(), byline: String(info.Author || "").trim(), pages: doc.numPages };

  // The words, page by page: items grouped into lines by their place on
  // the page, lines into paragraphs by the gap between them.
  const pages = [];
  let words = 0;
  for (let n = 1; n <= (job.draw ? 0 : count); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const lines = linesOf(content.items);
    words += lines.reduce((t, l) => t + l.text.length, 0);
    pages.push(lines);
    page.cleanup();
    post({ progress: n, of: count, stage: "words" });
  }
  // About 40 letters a page is a scan with a stray label on it, not a
  // document with words in it.
  if (!job.draw && words / count >= 40) {
    out.blocks = blocksOf(pages);
    return out;
  }
  out.images = [];
  const many = Math.min(count, job.maxDraw || 400);
  for (let n = 1; n <= many; n++) {
    const page = await doc.getPage(n);
    const first = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(0.3, (job.width || 1000) / first.width));
    const view = page.getViewport({ scale });
    const canvas = new OffscreenCanvas(Math.round(view.width), Math.round(view.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // "print" draws in one go: the screen's way waits on animation
    // frames, which a frame kept out of sight never gets.
    await page.render({ canvasContext: ctx, viewport: view, intent: "print" }).promise;
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.78 });
    out.images.push(new Uint8Array(await blob.arrayBuffer()));
    page.cleanup();
    post({ progress: n, of: many, stage: "pages" });
  }
  return out;
}

// One page's text items as lines: items sharing a baseline, in reading
// order, with a space where the gap between two items asks for one.
function linesOf(items) {
  const rows = new Map();
  for (const it of items) {
    const s = it.str;
    if (!s || !it.transform) continue;
    const y = Math.round(it.transform[5] * 2) / 2;
    const row = rows.get(y) || [];
    row.push({ x: it.transform[4], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 0, s });
    rows.set(y, row);
  }
  const ys = [...rows.keys()].sort((a, b) => b - a);
  const out = [];
  for (const y of ys) {
    const row = rows.get(y).sort((a, b) => a.x - b.x);
    let text = "";
    let last = null;
    for (const it of row) {
      if (last) {
        const gap = it.x - (last.x + last.w);
        if (gap > Math.max(1, last.h * 0.18) && !/\s$/.test(text) && !/^\s/.test(it.s)) text += " ";
      }
      text += it.s;
      last = it;
    }
    text = text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const h = Math.max(...row.map((it) => it.h), 0);
    out.push({ y, h, x: Math.min(...row.map((it) => it.x)), text });
  }
  return out;
}

// Every page's lines as blocks: headings, paragraphs and page marks, with
// the running heads and page numbers that repeat through the document
// left out.
function blocksOf(pages) {
  const heights = pages.flat().map((l) => l.h).filter(Boolean).sort((a, b) => a - b);
  const body = heights[Math.floor(heights.length / 2)] || 10;
  const seen = new Map();
  for (const lines of pages) {
    for (const l of [lines[0], lines[lines.length - 1]]) {
      if (!l) continue;
      const key = l.text.replace(/\d+/g, "#");
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  const repeats = (l) => seen.get(l.text.replace(/\d+/g, "#")) >= Math.max(3, pages.length * 0.4);
  const blocks = [];
  let para = null;
  const flush = () => { if (para && para.s.trim()) blocks.push(para); para = null; };
  for (const [i, lines] of pages.entries()) {
    if (i) { flush(); blocks.push({ t: "page", n: i + 1 }); }
    let before = null;
    for (const [j, l] of lines.entries()) {
      const edge = j === 0 || j === lines.length - 1;
      if (edge && (repeats(l) || /^[ivxlcdm\d]+$/i.test(l.text))) { before = l; continue; }
      const gap = before ? before.y - l.y : 0;
      const head = l.h > body * 1.22 && l.text.length < 120;
      if (head) { flush(); blocks.push({ t: "h", s: l.text }); before = l; continue; }
      const apart = before && (gap > l.h * 1.7 || Math.abs(l.x - before.x) > l.h * 0.9);
      if (!para || apart) { flush(); para = { t: "p", s: "" }; }
      if (para.s) {
        // A word broken across two lines is put back together.
        if (/[a-zÀ-ɏ]-$/.test(para.s)) para.s = para.s.slice(0, -1);
        else para.s += " ";
      }
      para.s += l.text;
      before = l;
    }
  }
  flush();
  return blocks;
}
post({ ready: true });
`;

  let source = null;
  async function sources() {
    if (!source) {
      const get = async (path) => {
        const r = await fetch(path);
        if (!r.ok) throw new Error("missing " + path);
        return r.text();
      };
      source = { lib: await get(LIB), worker: await get(WORKER) };
    }
    return source;
  }

  // Runs one PDF through the sandbox. `bytes` is the file; onProgress is
  // told ({ done, total, stage }) as pages are read. Resolves to
  // { title, byline, pages, blocks } or { title, byline, pages, images }.
  // `draw` skips the words and draws the pages, for a scan read from its
  // file each time it's opened.
  async function read(bytes, onProgress, { draw = false } = {}) {
    const { lib, worker } = await sources();
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px";
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP + '">'
      + "<script type=\"module\">" + BOOT + "<\/script>";
    const copy = bytes.slice(0);
    try {
      return await new Promise((resolve, reject) => {
        const stop = setTimeout(() => done(null, new Error("This PDF took too long to read.")), 180000);
        function done(res, err) {
          clearTimeout(stop);
          removeEventListener("message", onMessage);
          frame.remove();
          if (err) reject(err); else resolve(res);
        }
        function onMessage(e) {
          if (e.source !== frame.contentWindow) return;
          const m = e.data || {};
          if (m.ready) { frame.contentWindow.postMessage({ kind: "read", draw, lib, worker, bytes: copy.buffer }, "*", [copy.buffer]); return; }
          if (m.progress) { if (onProgress) onProgress(m.progress, m.of, m.stage); return; }
          if (m.error) { done(null, new Error(m.error)); return; }
          done(m);
        }
        addEventListener("message", onMessage);
        document.body.append(frame);
      });
    } finally {
      frame.remove();
    }
  }

  C.pdf = { read, BOOT, CSP };
})();
