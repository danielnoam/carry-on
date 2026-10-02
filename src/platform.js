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

  const USER_AGENT = "Carry-on (offline reader; https://github.com/danielnoam/carry-on)";

  // A page's HTML as text, plus the final URL after redirects. Throws a
  // TypeError on a network failure, like fetch does, so callers handle both
  // homes the same way.
  async function fetchText(url, opts = {}) {
    const http = plugin("CapacitorHttp");
    const headers = { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", ...(opts.headers || {}) };
    if (http) {
      let res;
      try {
        res = await http.request({ url, method: "GET", headers, responseType: "text" });
      } catch (e) {
        throw new TypeError("Failed to fetch (" + ((e && e.message) || e) + ")");
      }
      const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      return { status: res.status, url: res.url || url, text: body };
    }
    delete headers["User-Agent"];
    const res = await fetch(url, { headers });
    return { status: res.status, url: res.url || url, text: await res.text() };
  }

  // Downloads a file (an image preview, a video thumbnail) straight to disk
  // in the app's data folder, natively: no CORS, and the bytes never cross
  // the JavaScript bridge as base64. Resolves to a URL the WebView can load.
  // null in a browser, which has no folder to write to.
  async function downloadTo(url, path) {
    const FS = plugin("Filesystem");
    if (!FS) return null;
    await FS.downloadFile({ url, path, directory: "DATA", recursive: true, headers: { "User-Agent": USER_AGENT } });
    const { uri } = await FS.getUri({ path, directory: "DATA" });
    return cap.convertFileSrc ? cap.convertFileSrc(uri) : uri;
  }

  // A file out of the app (an exported page): written to the cache and
  // handed to the share sheet. false when the plugins aren't there, so the
  // caller falls back to a download link.
  async function saveAndShare(filename, text) {
    const FS = plugin("Filesystem");
    const SH = plugin("Share");
    if (!FS || !SH) return false;
    const { uri } = await FS.writeFile({ path: filename, data: text, directory: "CACHE", encoding: "utf8" });
    try {
      await SH.share({ title: filename, files: [uri], dialogTitle: "Save or send " + filename });
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message || e))) throw e;
    }
    return true;
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
    downloadTo,
    openOutside,
    saveAndShare,
  };
})();
