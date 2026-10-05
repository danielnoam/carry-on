// Carry-on: the library kept in step between devices through a private
// GitHub repo (0.30.0), the way LifeLog syncs (its src/storage.js).
//
// The repo holds library.json, every page's index entry with tags,
// collections, favourites and where the reader is, and pages/<id>.html,
// each page's text. Pictures never go: a page's HTML goes up with its
// pictures marked missing, and the other device downloads its own from
// the original links, as Links, Previews or Full images like the page
// was saved (Daniel, 5 Oct 2026).
//
// Two devices changing the library at once are merged against the last
// library both saw (the base), field by field, so neither writes over the
// other; a stale write (409) is merged again and retried, never forced.
(function () {
  const C = window.CarryOn;
  const API = "https://api.github.com";
  const CFG_KEY = "carryon.sync";        // { owner, repo, branch, token, sha, at, links }
  const BASE_KEY = "carryon.syncBase";   // the library.json last written or read
  const WAIT_KEY = "carryon.syncWaiting"; // ids whose text hasn't come down yet
  const REPO = "carryon-data";
  const LOCAL = /^images\//;
  const KEEP_DELETED = 90 * 24 * 3600 * 1000;

  // Fields that are this device's own: its pictures, their sizes, and a
  // collection's cover (each device finds its own).
  const DEVICE = ["thumb", "bytes", "imageBytes", "missing", "cover", "coverFrom"];
  // Fields that come with the page's text, so the copy saved last wins
  // them all together.
  const CONTENT = ["url", "title", "site", "byline", "licence", "savedAt", "minutes", "lang", "dir", "mode", "images",
    "comic", "next", "prev", "requested", "series", "source"];
  // Every field an index entry can carry through a backup or sync
  // (backup.cleanMeta); anything else on a page stays on its device.
  const SYNCED = new Set(["id", "url", "title", "site", "byline", "licence", "savedAt", "minutes", "lang", "dir", "mode", "images",
    "at", "finished", "readAt", "comic", "next", "prev", "requested", "tags", "folder", "folderAt", "source", "series", "fav", "favAt"]);
  // Where the reader is, which goes with whichever device read last.
  const READING = ["at", "finished", "readAt"];

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const keep = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } };
  let cfg = load(CFG_KEY, null);

  // ---- Merging (pure, tested in test/sync.test.js) ----

  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const share = (p) => { const o = { ...p }; for (const k of DEVICE) delete o[k]; return o; };

  // Tags: what both have, and what either added; a tag either removed goes.
  function mergeTags(b, l, r) {
    const key = (t) => String(t).toLowerCase();
    const B = new Set((b || []).map(key)), L = new Map((l || []).map((t) => [key(t), t])), R = new Map((r || []).map((t) => [key(t), t]));
    const out = [];
    for (const [k, t] of L) if (R.has(k) || !B.has(k)) out.push(t);
    for (const [k, t] of R) if (!L.has(k) && !B.has(k)) out.push(t);
    return out;
  }

  // One page changed on both sides since the base.
  function mergeEntry(b, l, r) {
    b = b || {};
    const out = {};
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    const pick = (k) => (same(l[k], r[k]) || !same(l[k], b[k]) ? l[k] : r[k]);
    const contentFrom = (r.savedAt || 0) > (l.savedAt || 0) ? r : l;
    const readFrom = (r.readAt || 0) > (l.readAt || 0) ? r : l;
    for (const k of keys) {
      if (CONTENT.includes(k)) out[k] = !same(l.savedAt, r.savedAt) ? contentFrom[k] : pick(k);
      else if (READING.includes(k)) out[k] = same(l[k], r[k]) ? l[k] : same(l[k], b[k]) ? r[k] : same(r[k], b[k]) ? l[k] : readFrom[k];
      else if (k === "tags") out[k] = mergeTags(b.tags, l.tags, r.tags);
      else out[k] = pick(k);
    }
    for (const k of Object.keys(out)) if (out[k] === undefined || (k === "tags" && !out[k].length)) delete out[k];
    // A favourite's time goes with the mark.
    if (!out.fav) delete out.favAt;
    return out;
  }

  // Two copies of one address, saved separately on two devices: the one
  // saved last stays, with the other's tags, favourite and reading.
  function oneCopyEach(pages, deleted, now, same) {
    const kept = [];
    for (const p of pages) {
      const i = kept.findIndex((x) => same(x.url, p.url));
      if (i < 0) { kept.push(p); continue; }
      const [win, lose] = (p.savedAt || 0) > (kept[i].savedAt || 0) ? [{ ...p }, kept[i]] : [{ ...kept[i] }, p];
      const tags = mergeTags([], win.tags, lose.tags);
      if (tags.length) win.tags = tags;
      if (lose.fav && !win.fav) { win.fav = true; win.favAt = lose.favAt; }
      if ((lose.readAt || 0) > (win.readAt || 0)) for (const k of READING) { if (lose[k] === undefined) delete win[k]; else win[k] = lose[k]; }
      if (!win.folder && lose.folder) { win.folder = lose.folder; win.folderAt = lose.folderAt; }
      kept[i] = win;
      deleted[lose.id] = now;
    }
    return kept;
  }

  // Followed feeds (0.30.1): what's followed and how, never the posts,
  // which each device checks for itself. Keyed by the feed's address.
  const FEED = ["url", "title", "link", "icon", "mode", "images", "folder", "days", "addedAt"];
  const feedShare = (f) => { const o = {}; for (const k of FEED) if (f[k] != null && f[k] !== "") o[k] = f[k]; return o; };
  // An unfollow is kept like a deleted page; following the same address
  // again later (a newer addedAt) brings it back.
  function mergeFeeds(base, local, remote, gone, now) {
    const B = new Map((base || []).map((f) => [f.url, f]));
    const L = new Map((local || []).map((f) => [f.url, feedShare(f)]));
    const R = new Map((remote || []).map((f) => [f.url, f]));
    for (const u of B.keys()) if (!L.has(u)) gone[u] = gone[u] || now;
    if (remote) for (const u of B.keys()) if (!R.has(u) && !gone[u]) gone[u] = now;
    const out = [];
    for (const u of new Set([...L.keys(), ...R.keys()])) {
      const l = L.get(u), r = R.get(u);
      const newest = Math.max((l && l.addedAt) || 0, (r && r.addedAt) || 0);
      if (gone[u] && newest > gone[u] && !B.has(u)) delete gone[u];
      if (gone[u]) continue;
      if (l && r) {
        const b = B.get(u) || {}, f = {};
        for (const k of FEED) { const v = same(l[k], r[k]) || !same(l[k], b[k]) ? l[k] : r[k]; if (v !== undefined) f[k] = v; }
        out.push(f);
      } else out.push(l || r);
    }
    for (const [u, at] of Object.entries(gone)) if (now - at > KEEP_DELETED) delete gone[u];
    return out.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0) || (a.url < b.url ? -1 : 1));
  }

  // base, local and remote are library files ({ pages, deleted, files });
  // base and remote may be null (never synced, nothing on GitHub yet).
  // Resolves to the merged file. `same(a, b)` says two addresses are one
  // page.
  function merge(base, local, remote, now = Date.now(), sameUrl = (a, b) => a === b) {
    const B = new Map(((base && base.pages) || []).map((p) => [p.id, p]));
    const L = new Map(local.pages.map((p) => [p.id, share(p)]));
    const R = new Map(((remote && remote.pages) || []).map((p) => [p.id, p]));
    const deleted = { ...((remote && remote.deleted) || {}) };
    for (const [id, at] of Object.entries((base && base.deleted) || {})) if (!deleted[id]) deleted[id] = at;
    // Gone from here since the base: deleted on this device.
    for (const id of B.keys()) if (!L.has(id) && !(local.waiting || []).includes(id)) deleted[id] = deleted[id] || now;
    // Gone from GitHub since the base, without a tombstone: deleted there.
    if (remote) for (const id of B.keys()) if (!R.has(id) && !deleted[id]) deleted[id] = now;
    const pages = [];
    for (const id of new Set([...L.keys(), ...R.keys()])) {
      if (deleted[id]) continue;
      const l = L.get(id), r = R.get(id);
      if (l && r) pages.push(same(l, r) ? l : mergeEntry(B.get(id), l, r));
      else if (l) pages.push(l);
      else pages.push(r);
    }
    for (const [id, at] of Object.entries(deleted)) if (now - at > KEEP_DELETED) delete deleted[id];
    const out = oneCopyEach(pages, deleted, now, sameUrl).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0) || (a.id < b.id ? -1 : 1));
    const files = {};
    const fromRemote = (remote && remote.files) || {};
    for (const p of out) if (fromRemote[p.id]) files[p.id] = fromRemote[p.id];
    const doc = { format: 1, pages: out, deleted, files };
    // A device from before 0.30.1 sends no feeds: they stay as they were.
    if (local.feeds) {
      const gone = { ...((remote && remote.feedsGone) || {}) };
      for (const [u, at] of Object.entries((base && base.feedsGone) || {})) if (!gone[u]) gone[u] = at;
      doc.feeds = mergeFeeds(base && base.feeds, local.feeds, remote && remote.feeds, gone, now);
      doc.feedsGone = gone;
    } else if (remote && remote.feeds) { doc.feeds = remote.feeds; doc.feedsGone = remote.feedsGone || {}; }
    return doc;
  }

  // ---- GitHub ----

  const b64encode = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64decode = (s) => decodeURIComponent(escape(atob(s.replace(/\s/g, ""))));
  const headers = (extra) => Object.assign({ Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, extra || {});
  const contents = (path) => API + "/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path;

  class SyncError extends Error {}
  async function fail(r) {
    let msg = "";
    try { msg = (await r.json()).message || ""; } catch (e) { /* none */ }
    const e = new SyncError(r.status === 401 ? "GitHub didn't accept the token. Make a new one and connect again."
      : (r.status === 403 || r.status === 429) && /rate limit/i.test(msg) ? "GitHub asked Carry-on to slow down. Sync tries again in a few minutes."
      : r.status === 403 || r.status === 404 ? "The token can't reach the " + REPO + " repo. Give it Contents: Read and write on that repo."
      : r.status >= 500 ? "GitHub isn't answering right now. Sync tries again later."
      : "GitHub said: " + (msg || r.status));
    e.status = r.status;
    return e;
  }
  async function call(url, opts) {
    let r;
    try { r = await fetch(url, Object.assign({ cache: "no-store" }, opts)); }
    catch (e) { throw new SyncError("You're offline. Sync tries again when you're back online."); }
    return r;
  }

  // { data, sha } or null. Files past 1 MB come as a blob, as in LifeLog.
  async function readJson(path) {
    const r = await call(contents(path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers({ Accept: "application/vnd.github.object+json" }) });
    if (r.status === 404) return null;
    if (!r.ok) throw await fail(r);
    const j = await r.json();
    let b64 = j.content;
    if (!b64 && j.size) {
      const br = await call(API + "/repos/" + cfg.owner + "/" + cfg.repo + "/git/blobs/" + j.sha, { headers: headers() });
      if (!br.ok) throw await fail(br);
      b64 = (await br.json()).content;
    }
    if (!b64) return null;
    return { data: JSON.parse(b64decode(b64)), sha: j.sha };
  }
  async function readText(path) {
    const r = await call(contents(path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers({ Accept: "application/vnd.github.raw" }) });
    if (r.status === 404) return null;
    if (!r.ok) throw await fail(r);
    return r.text();
  }
  async function write(path, text, sha, message) {
    const body = { message, content: b64encode(text), branch: cfg.branch };
    if (sha) body.sha = sha;
    const r = await call(contents(path), { method: "PUT", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!r.ok) throw await fail(r);
    return (await r.json()).content.sha;
  }
  async function remove(path, sha) {
    const r = await call(contents(path), { method: "DELETE", headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "Remove " + path, sha, branch: cfg.branch }) });
    if (!r.ok && r.status !== 404 && r.status !== 409 && r.status !== 422) throw await fail(r);
  }

  // Connecting: whose token it is, and the repo, made private if missing.
  // ---- Setting up (0.30.1) ----

  // GitHub's page for a new key, filled in: a fine-grained token that never
  // expires (sync shouldn't stop in a month), allowed to make the repo
  // (Administration) and write it (Contents). Which repos it reaches can't
  // be filled in, so the steps say to pick All repositories.
  const KEY_URL = "https://github.com/settings/personal-access-tokens/new?name=Carry-on+sync" +
    "&description=Keeps+Carry-on%27s+library+in+step+through+a+private+repo+called+" + REPO +
    "&expires_in=none&contents=write&administration=write";
  // Another device joins from a link to the web copy with the token after
  // the # (which a browser never sends to the server), as LifeLog's setup
  // link does; the app takes the same link from a QR code or pasted.
  const tokenIn = (text) => {
    const m = /[#&]t=([^&\s]+)/.exec(String(text || ""));
    try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
  };
  const setupLink = (base) => (cfg ? base + "#t=" + encodeURIComponent(cfg.token) : null);

  async function connect(token) {
    const was = cfg;
    cfg = { token: String(tokenIn(token) || token || "").trim(), repo: REPO, branch: "main" };
    try {
      if (!cfg.token) throw new SyncError("Paste the token first.");
      const me = await call(API + "/user", { headers: headers() });
      if (!me.ok) throw await fail(me);
      cfg.owner = (await me.json()).login;
      const repo = await call(API + "/repos/" + cfg.owner + "/" + REPO, { headers: headers() });
      if (repo.ok) cfg.branch = (await repo.json()).default_branch || "main";
      else if (repo.status === 404) {
        const made = await call(API + "/user/repos", { method: "POST", headers: headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: REPO, private: true, auto_init: true, description: "Carry-on's library" }) });
        if (!made.ok) throw new SyncError("Carry-on couldn't make its " + REPO + " repo. Make the token again with All repositories picked under Repository access, then connect.");
        cfg.branch = (await made.json()).default_branch || "main";
      } else throw await fail(repo);
      if (was && was.links) cfg.links = true;
      keep(CFG_KEY, cfg);
      keep(BASE_KEY, null);
      keep(WAIT_KEY, null);
      return cfg.owner + "/" + REPO;
    } catch (e) {
      cfg = was;
      throw e;
    }
  }
  function disconnect() {
    cfg = null;
    keep(CFG_KEY, null);
    keep(BASE_KEY, null);
    keep(WAIT_KEY, null);
  }

  // ---- A page's text going up and coming down ----

  // The page's HTML with its pictures marked missing: the other device
  // gets them from the site itself.
  function outgoing(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of doc.querySelectorAll("img[src]")) {
      // A local picture, or one a browser keeps inside the page.
      const src = img.getAttribute("src");
      if (!LOCAL.test(src) && !(/^data:/.test(src) && (img.hasAttribute("data-full") || img.hasAttribute("data-thumb")))) continue;
      img.removeAttribute("src");
      img.className = "co-missing";
    }
    for (const v of doc.querySelectorAll("video[poster]")) if (LOCAL.test(v.getAttribute("poster"))) v.removeAttribute("poster");
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  // A page from GitHub, ready to keep: pictures as links where this device
  // keeps none (a browser, or a page saved as Links), else left missing for
  // the downloads after. Resolves to { html, missing }.
  function incoming(html, entry) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const asLinks = !C.platform.native || entry.mode === "links";
    let missing = 0;
    for (const img of doc.querySelectorAll("img.co-missing")) {
      const url = img.getAttribute("data-preview") || img.getAttribute("data-full") || img.getAttribute("data-thumb") || "";
      if (asLinks && /^https?:/.test(url)) { img.setAttribute("src", url); img.removeAttribute("class"); }
      else missing++;
    }
    return { html: "<!doctype html>\n" + doc.documentElement.outerHTML, missing };
  }

  // ---- A sync ----

  let running = null;
  let last = { at: (cfg && cfg.at) || 0, error: "" };
  // Where a sync is: { stage: "check" | "up" | "down", done, total }.
  let progress = null;

  // Brings this device and GitHub level. `getPages()` is the library now;
  // `setPages(list)` takes the result; `sameUrl(a, b)` says two addresses
  // are one page. onProgress({ stage, done, total }). Resolves to
  // { up, down, removed, downloads, fromLinks } with `downloads` the pages
  // whose pictures this device fetches next and `fromLinks` the pages it
  // saves itself from their links; throws SyncError.
  function run({ getPages, setPages, getFeeds, setFeeds, sameUrl, onProgress }) {
    if (!cfg) return Promise.resolve(null);
    if (running) return running;
    const told = (p) => { progress = p; if (onProgress) onProgress(p); };
    running = (async () => {
      try {
        const res = await once(getPages, setPages, sameUrl || ((a, b) => a === b), told, getFeeds, setFeeds);
        last = { at: Date.now(), error: "" };
        cfg.at = last.at;
        keep(CFG_KEY, cfg);
        return res;
      } catch (e) {
        last = { at: last.at, error: e instanceof SyncError ? e.message : "Sync stopped: " + (e && e.message ? e.message : e) };
        throw e;
      } finally { running = null; progress = null; }
    })();
    // Told once `running` is set, so what it draws says Syncing.
    if (!progress) told({ stage: "check", done: 0, total: 0 });
    return running;
  }

  async function once(getPages, setPages, sameUrl, onProgress, getFeeds, setFeeds) {
    const before = getPages().map((p) => ({ ...p }));
    const feedsBefore = getFeeds ? getFeeds().map(feedShare) : null;
    const snapshot = new Map(before.map((p) => [p.id, JSON.stringify(p)]));
    // What GitHub would hold of each page, so the two compare like for like.
    const view = before.map((p) => share(C.backup.cleanMeta(p, p.id) || p));
    const uploaded = {};
    const waiting = load(WAIT_KEY, []);
    // Links only (0.30.3): this device sends no text and takes none; pages
    // new to it are saved again from their links, here.
    const links = !!cfg.links;
    let up = 0;
    let merged, remote;
    for (let tries = 0; ; tries++) {
      remote = await readJson("library.json");
      if (remote && (!remote.data || !Array.isArray(remote.data.pages))) throw new SyncError("The library.json on GitHub isn't Carry-on's. Move it away and sync again.");
      const remoteDoc = remote && clean(remote.data);
      merged = merge(load(BASE_KEY, null), { pages: view, waiting, feeds: feedsBefore }, remoteDoc, Date.now(), sameUrl);
      for (const [id, f] of Object.entries(uploaded)) if (merged.pages.some((p) => p.id === id && p.savedAt === f.at)) merged.files[id] = f;
      // Text this device has and GitHub doesn't: every page saved here, or
      // saved again since.
      const mine = new Map(before.map((p) => [p.id, p]));
      const todo = links ? [] : merged.pages.filter((p) => mine.has(p.id) && mine.get(p.id).savedAt === p.savedAt && (!merged.files[p.id] || merged.files[p.id].at !== p.savedAt));
      for (const [i, p] of todo.entries()) {
        if (onProgress) onProgress({ stage: "up", done: i, total: todo.length });
        let html;
        try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
        if (!html) continue;
        const was = merged.files[p.id] || (remoteDoc && remoteDoc.files && remoteDoc.files[p.id]);
        let sha;
        try { sha = await write("pages/" + p.id + ".html", outgoing(html), was && was.sha, "Page: " + p.title.slice(0, 60)); }
        catch (e) {
          if (e.status !== 409 && e.status !== 422) throw e;
          // There already, under a sha this device didn't know.
          const now = await call(contents("pages/" + p.id + ".html") + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers() });
          if (!now.ok) throw await fail(now);
          sha = await write("pages/" + p.id + ".html", outgoing(html), (await now.json()).sha, "Page: " + p.title.slice(0, 60));
        }
        merged.files[p.id] = uploaded[p.id] = { at: p.savedAt, sha };
        up++;
      }
      // Text of deleted pages goes too.
      const gone = Object.entries((remoteDoc && remoteDoc.files) || {}).filter(([id]) => merged.deleted[id]);
      for (const [id, f] of gone) await remove("pages/" + id + ".html", f.sha).catch(() => {});
      if (remote && same(merged, remoteDoc)) break;
      try {
        await write("library.json", JSON.stringify(merged), remote && remote.sha, "Library: " + merged.pages.length + " pages");
        break;
      } catch (e) {
        // Another device wrote first: merge with what it wrote, and again.
        if ((e.status !== 409 && e.status !== 422) || tries >= 3) throw e;
      }
    }
    keep(BASE_KEY, merged);

    // This device catches up: new pages' text comes down; deleted ones go.
    // `decided` is what each page becomes (null: removed).
    const decided = new Map();
    const want = [];
    const stillWaiting = [];
    const fromLinks = [];
    const at = new Map(before.map((p) => [p.id, p]));
    for (const m of merged.pages) {
      const have = at.get(m.id);
      // Saved again elsewhere, with links only: the copy here stays.
      if (have && (have.savedAt === m.savedAt || links)) {
        const next = { ...m };
        for (const k of Object.keys(have)) if (DEVICE.includes(k) || !SYNCED.has(k)) next[k] = have[k];
        decided.set(m.id, next);
      } else if (!links && merged.files[m.id] && merged.files[m.id].at === m.savedAt) want.push({ m, have });
      else if (!have) {
        stillWaiting.push(m.id);
        // No text on GitHub (its device syncs links only) or not wanted.
        if (links || !merged.files[m.id]) fromLinks.push(m);
      }
    }
    for (const id of Object.keys(merged.deleted)) if (at.has(id)) decided.set(id, null);
    let down = 0;
    const downloads = [];
    for (const [i, { m, have }] of want.entries()) {
      if (onProgress) onProgress({ stage: "down", done: i, total: want.length });
      let html = null;
      try { html = await readText("pages/" + m.id + ".html"); } catch (e) { html = null; }
      if (!html) { if (!have) stillWaiting.push(m.id); continue; }
      const got = incoming(html, m);
      if (have) await C.store.removePage(m.id);
      const meta = { ...m, missing: got.missing };
      meta.bytes = await C.store.writePage(m.id, got.html, meta);
      decided.set(m.id, meta);
      if (got.missing) downloads.push(meta);
      down++;
    }
    // Settled at once, with nothing awaited, so a change made while this
    // sync ran is kept (and sent next time) rather than written over.
    const live = getPages();
    const out = [];
    for (const p of live) {
      const d = decided.get(p.id);
      if (!snapshot.has(p.id) || !decided.has(p.id)) out.push(p);
      else if (snapshot.get(p.id) !== JSON.stringify(p)) {
        if (d && d.savedAt !== p.savedAt) { const both = { ...p }; for (const k of CONTENT.concat(DEVICE)) { if (d[k] === undefined) delete both[k]; else both[k] = d[k]; } out.push(both); }
        else out.push(p);
      } else if (d) out.push(d);
    }
    for (const [id, d] of decided) if (d && !live.some((p) => p.id === id)) out.push(d);
    const kept = new Set(out.map((p) => p.id));
    const gone = [...decided].filter(([id, d]) => d === null && !kept.has(id)).map(([id]) => id);
    out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    keep(WAIT_KEY, stillWaiting.length ? stillWaiting : null);
    // Feeds the same way: one changed here while this ran keeps this
    // device's version, which goes up next time.
    if (setFeeds && merged.feeds) {
      const was = new Map(feedsBefore.map((f) => [f.url, JSON.stringify(f)]));
      const live = new Map(getFeeds().map((f) => [f.url, feedShare(f)]));
      const changed = (u) => was.has(u) && live.has(u) && was.get(u) !== JSON.stringify(live.get(u));
      const list = [];
      for (const m of merged.feeds) {
        if (changed(m.url)) list.push(live.get(m.url));
        else if (live.has(m.url) || !was.has(m.url)) list.push(m);
      }
      for (const [u, f] of live) if (!was.has(u) && !list.some((m) => m.url === u)) list.push(f);
      setFeeds(list);
    }
    await setPages(out);
    for (const id of gone) await C.store.removePage(id);
    return { up, down, removed: gone.length, downloads, fromLinks };
  }

  // A library file from GitHub, down to what Carry-on writes.
  function clean(doc) {
    const pages = [];
    for (const raw of doc.pages) {
      const id = raw && typeof raw.id === "string" && /^[a-z0-9]{4,24}$/.test(raw.id) ? raw.id : null;
      const m = id && C.backup.cleanMeta(raw, id);
      if (!m) continue;
      for (const k of DEVICE) delete m[k];
      pages.push(m);
    }
    const deleted = {}, files = {};
    for (const [id, at] of Object.entries(doc.deleted || {})) if (typeof at === "number") deleted[id] = at;
    for (const [id, f] of Object.entries(doc.files || {})) if (f && typeof f.at === "number" && typeof f.sha === "string") files[id] = { at: f.at, sha: f.sha };
    const out = { format: 1, pages, deleted, files };
    if (Array.isArray(doc.feeds)) {
      out.feeds = doc.feeds.map((f) => C.backup.cleanFeed(f)).filter(Boolean).map(feedShare);
      out.feedsGone = {};
      for (const [u, at] of Object.entries(doc.feedsGone || {})) if (typeof at === "number") out.feedsGone[u] = at;
    }
    return out;
  }

  C.sync = {
    merge, mergeTags, mergeFeeds, outgoing, incoming, connect, disconnect, run, SyncError, KEY_URL, tokenIn, setupLink,
    get on() { return !!cfg; },
    get account() { return cfg ? cfg.owner + "/" + cfg.repo : ""; },
    get running() { return !!running; },
    get last() { return last; },
    get progress() { return progress; },
    get links() { return !!(cfg && cfg.links); },
    set links(v) { if (!cfg) return; if (v) cfg.links = true; else delete cfg.links; keep(CFG_KEY, cfg); },
  };
})();
