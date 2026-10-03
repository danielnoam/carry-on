// Carry-on: where this copy of the app is running, a browser or the
// Android/iOS app built from these same files, and the few things that
// differ between them. Adapted from LifeLog's src/platform.js (0.227.0).
//
// The one that matters most: in the app, page fetches go through
// CapacitorHttp, which is native networking and not subject to CORS, so any
// page can be read without a server. In a browser they fall back to fetch,
// which CORS blocks for most sites. See docs/PROPOSAL.md.
//
// `build` is app-build.json, written into the bundle by tools/build-www.js.
// It only exists inside the app; in a browser it is null.
(function () {
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  const os = native ? String((cap.getPlatform && cap.getPlatform()) || "android") : "web";
  const plugin = (name) => (native && cap.Plugins && cap.Plugins[name]) || null;

  if (native) document.documentElement.classList.add("native");

  let build = null;
  const ready = native
    ? fetch("app-build.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => { build = b; return b; })
        .catch(() => null)
    : Promise.resolve(null);

  // Links that leave the app (the original page, a store link) open in the
  // phone's own browser, not inside the app's WebView, which has no address
  // bar and where back would put the whole app away.
  const isOutside = (url) => {
    try {
      const u = new URL(String(url), location.href);
      return /^https?:$/.test(u.protocol) && u.origin !== location.origin;
    } catch (e) { return false; }
  };
  const nativeOpen = window.open.bind(window);
  function openOutside(url) {
    const L = plugin("AppLauncher");
    if (L) {
      Promise.resolve(L.openUrl({ url: String(url) }))
        .then((r) => { if (r && r.completed === false) nativeOpen(url, "_blank"); })
        .catch(() => nativeOpen(url, "_blank"));
      return true;
    }
    nativeOpen(url, "_blank");
    return true;
  }
  if (native) {
    window.open = (url, target, features) => (isOutside(url) ? (openOutside(url), null) : nativeOpen(url, target, features));
    document.addEventListener("click", (e) => {
      const a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || a.hasAttribute("download") || !isOutside(a.href)) return;
      e.preventDefault();
      openOutside(a.href);
    }, true);
  }

  // The WebView's own browser string with the app named after it: some news
  // sites (ynet among them) never answer a request that doesn't look like a
  // browser, and Wikipedia's rule is only that the app is named.
  const USER_AGENT = (navigator.userAgent ? navigator.userAgent + " " : "") +
    "Carry-on (offline reader; https://github.com/danielnoam/carry-on)";

  // Native requests have no deadline of their own, so a site that holds the
  // connection open would leave "Saving" up for good.
  const PAGE_TIMEOUT = 30000;
  const FILE_TIMEOUT = 20000;
  function deadline(promise, ms) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new TypeError("Timed out")), ms); }),
    ]).finally(() => clearTimeout(timer));
  }

  // A page's HTML as text, plus the final URL after redirects. Throws a
  // TypeError on a network failure, like fetch does, so callers handle both
  // homes the same way.
  async function fetchText(url, opts = {}) {
    const http = plugin("CapacitorHttp");
    const headers = { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", ...(opts.headers || {}) };
    if (http) {
      let res;
      try {
        res = await deadline(http.request({ url, method: "GET", headers, responseType: "text",
          connectTimeout: PAGE_TIMEOUT / 2, readTimeout: PAGE_TIMEOUT }), PAGE_TIMEOUT + 5000);
      } catch (e) {
        throw new TypeError("Failed to fetch (" + ((e && e.message) || e) + ")");
      }
      const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      return { status: res.status, url: res.url || url, text: body };
    }
    delete headers["User-Agent"];
    const res = await deadline(fetch(url, { headers }), PAGE_TIMEOUT);
    return { status: res.status, url: res.url || url, text: await res.text() };
  }

  // A page that builds itself with JavaScript, drawn in a hidden WebView by
  // native/share's PageRender plugin: { text, url } of the HTML it ended up
  // with. null where there's no such plugin (iOS for now, a browser) or the
  // page never drew.
  async function render(url) {
    const R = plugin("PageRender");
    if (!R) return null;
    try {
      const res = await deadline(R.render({ url, timeoutMs: 20000 }), 30000);
      return res && res.html ? { text: res.html, url: res.url || url } : null;
    } catch (e) {
      return null;
    }
  }

  // A page (one self-contained HTML file) to the print screen, where Save as
  // PDF is one of the printers: native/share's Print plugin in the app,
  // whose WebView ignores window.print(). In a browser, a hidden frame
  // that runs no scripts prints it.
  async function printHtml(name, html) {
    const P = plugin("Print");
    if (P) { await P.print({ html, name }); return; }
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-same-origin allow-modals");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0";
    await new Promise((done) => { f.onload = done; f.srcdoc = html; document.body.append(f); });
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
  }

  // Downloads a file (an image preview, a video thumbnail) straight to disk
  // in the app's data folder, natively: no CORS, and the bytes never cross
  // the JavaScript bridge as base64. Resolves to a URL the WebView can load.
  // null in a browser, which has no folder to write to.
  async function downloadTo(url, path, page) {
    const FS = plugin("Filesystem");
    if (!FS) return null;
    // The page's own site as Referer, as a browser sends it (its origin,
    // not the whole address).
    const headers = { "User-Agent": USER_AGENT };
    try { if (page) headers.Referer = new URL(page).origin + "/"; } catch (e) { /* no referer */ }
    await deadline(FS.downloadFile({ url, path, directory: "DATA", recursive: true, headers,
      connectTimeout: FILE_TIMEOUT / 2, readTimeout: FILE_TIMEOUT }), FILE_TIMEOUT + 5000);
    const { uri } = await FS.getUri({ path, directory: "DATA" });
    return cap.convertFileSrc ? cap.convertFileSrc(uri) : uri;
  }

  // A file out of the app (an exported page): written to the cache and
  // handed to the share sheet. false when the plugins aren't there, so the
  // caller falls back to a download link.
  async function saveAndShare(filename, text) {
    const FS = plugin("Filesystem");
    if (!FS || !plugin("Share")) return false;
    const { uri } = await FS.writeFile({ path: filename, data: text, directory: "CACHE", encoding: "utf8" });
    return shareFile(uri, filename);
  }

  // The share sheet, with a file already on disk or with a link. Putting
  // the sheet away isn't an error. false where there's no share sheet.
  async function share(what) {
    const SH = plugin("Share");
    try {
      if (SH) await SH.share(what);
      else if (navigator.share) await navigator.share({ title: what.title, url: what.url });
      else return false;
    } catch (e) {
      if (!/cancel|abort/i.test(String(e && (e.name + " " + e.message) || e))) throw e;
    }
    return true;
  }
  const shareFile = (uri, name) => share({ title: name, files: [uri], dialogTitle: "Save or send " + name });
  const shareLink = (title, url) => share({ title, url, dialogTitle: "Share " + title });

  // A file handed to a browser's downloads (the web copy has no share sheet
  // for files).
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---- updating the app in place (0.2.0, from LifeLog's 0.179.0) ----
  // Downloads the release's APK into the app's cache, reporting progress, and
  // hands it to Android's installer: no browser tab, no Downloads folder.
  // Android asks once whether Carry-on may install apps, then to install.
  // Signed with the same key (alias carryon), it installs over the top and
  // keeps every saved page. The download names the tag, not `latest`, so a
  // release published mid-download can't swap the file. Resolves to the
  // file's uri so a dismissed installer can be reopened without downloading
  // again; null where there's no in-app installer (iOS, a browser).
  const APK_MIME = "application/vnd.android.package-archive";
  const repo = () => (build && build.repo) || null;
  async function downloadUpdate(version, onProgress) {
    const FS = plugin("Filesystem");
    if (os !== "android" || !FS || !plugin("FileOpener") || !repo()) return null;
    const url = "https://github.com/" + repo() + "/releases/download/app-v" + version + "/CarryOn.apk";
    const path = "CarryOn-" + version + ".apk";
    const listener = await FS.addListener("progress", (p) => {
      if (onProgress && p && p.contentLength > 0) onProgress(Math.min(1, p.bytes / p.contentLength));
    });
    try {
      await FS.downloadFile({ url, path, directory: "CACHE", progress: true });
    } finally {
      if (listener && listener.remove) listener.remove();
    }
    return (await FS.getUri({ path, directory: "CACHE" })).uri;
  }
  function openInstaller(uri) {
    return plugin("FileOpener").openFile({ path: uri, mimeType: APK_MIME });
  }
  // APKs for versions already installed have done their job.
  async function clearOldUpdates(currentVersion, isNewer) {
    const FS = plugin("Filesystem");
    if (!FS) return;
    try {
      const { files } = await FS.readdir({ path: "", directory: "CACHE" });
      for (const f of files || []) {
        const name = typeof f === "string" ? f : f.name;
        const m = /^CarryOn-(\d+\.\d+\.\d+)\.apk$/.exec(name || "");
        if (m && !isNewer(m[1], currentVersion)) await FS.deleteFile({ path: name, directory: "CACHE" });
      }
    } catch (e) { /* nothing to tidy */ }
  }

  window.CarryOn = window.CarryOn || {};
  window.CarryOn.platform = {
    native,
    os,
    ios: os === "ios",
    android: os === "android",
    ready,
    get build() { return build; },
    plugin,
    // Whether this copy can fetch any page itself (the app) or is limited by
    // CORS (a browser).
    get canFetchPages() { return !!plugin("CapacitorHttp"); },
    fetchText,
    render,
    get canRender() { return !!plugin("PageRender"); },
    downloadTo,
    openOutside,
    saveAndShare,
    shareFile,
    shareLink,
    printHtml,
    download,
    downloadUpdate,
    openInstaller,
    clearOldUpdates,
    releasesUrl() { return repo() ? "https://github.com/" + repo() + "/releases/latest" : null; },
    apkUrl() { return repo() ? "https://github.com/" + repo() + "/releases/latest/download/CarryOn.apk" : null; },
  };
})();
