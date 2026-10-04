# TODO

The work, one release at a time, in this order (Daniel, 2 Oct 2026). Each
release is small enough to ship, try on the phone and move on. When one
ships, its section leaves this file and its items go to CHANGELOG.md. A
new ask goes into the release it fits, or a new one, and the order is
Daniel's to change.

Decisions every release keeps:

- A page has **any number of tags** and is in **one folder at most**.
- A folder is an **ordered set**: a name on the page (`folder`) plus its
  place (`folderAt`), no separate folders file. Reordering rewrites
  `folderAt`; a folder exists while a page names it.
- Saved HTML stays untrusted: sandboxed iframe, no `allow-scripts`, strict
  CSP. Anything new that renders saved content (EPUB, comics reader,
  export) keeps to that.
- No build step, no dependencies. Anything that looks like it needs a
  library (zip, EPUB) is written small in src/, or is a native plugin in
  native/ beside share.

Items marked **(new)** were gaps found when this order was written, not
asks from Daniel.

---

## Rename to Offprint (Daniel, 4 Oct 2026)

The app becomes **Offprint**, store title "Offprint: Offline Reader". An
offprint is a separate copy of one article, which is what the app makes,
and it fits collections shown as books better than a name about planes.
Before this release, check Offprint against the Play Store, the App Store
and a trademark search.

- **What the user sees changes:** `appName` in capacitor.config.json, the
  iOS display name, `name`/`short_name` in manifest.json, the `<title>`,
  every "Carry-on" in the app's text, the Wikipedia `Api-User-Agent`,
  the release titles, README and DESIGN.md.
- **What stays, or installed copies break:** the app ID
  `io.github.danielnoam.carryon` (a new ID is a new app, and the in-app
  updater can't install over it), the `carryon` key alias, and the
  `carryon.*` storage keys (renaming them loses settings).
- **The APK's file name:** installed copies download `CarryOn.apk`
  (src/platform.js `apkUrl`). Publish both `CarryOn.apk` and
  `Offprint.apk` for a while, or keep the old file name.
- **The repo name** (danielnoam/carry-on) is in installed copies'
  updater too. Renaming it relies on GitHub's redirect, so keep the name
  unless there's a reason to change it.

## 0.28.0 and 0.29.0: Sync through a private GitHub repo

Split in two because it's the riskiest work and loses data if wrong.

**0.28.0, the index and text.** A fine-grained token for one repo, kept on
the device. Sync `library.json` and each `page.html` + `meta.json`
through the contents API with `sha` for conflicts, as LifeLog's
src/storage.js does. Deletes become tombstones in `library.json` so they
don't come back from the other device. The other device re-downloads
previews from the original links. Reuses the 0.18.0 backup format.

**0.29.0, images.** Push `images/` through the Git Data API (blobs, one
tree and one commit per save), since the contents API stops at 1 MB and
broke LifeLog's sync. Decide first whether the repo's growth (0.5 to 1.5
MB per illustrated page, far more for comics) is acceptable, or whether
comics folders stay off sync.

**What syncs of the images (Daniel, 3 Oct 2026).** Each page syncs its
images as one of three: **Links** (none, the other device loads them
online), **Previews** (the small local copies) or **Full images**.
- Two defaults in Settings: one for collections, one for pages not in a
  collection.
- A collection can override it from inside its own screen; a page not
  in a collection can override it from the page.
- A page in a collection always follows its collection (its default or
  its override), never its own.
- Anything not overridden follows the default, so changing a default
  changes everything that never picked its own.
This also answers the repo-size question above: a comics collection can
sync as Links.

The token is per device and stays in the app; for anyone but Daniel sync
stays optional, with 0.18.0's backup as the no-account way.

**Daniel's phones:** two devices; save on one, read on the other; delete on
one and confirm it stays gone; edit tags offline on both and sync.

**Depends on:** 0.18.0 (format, merge-by-URL rules).

## A browser release (Daniel, 3 Oct 2026)

A release of its own for the web copy, as a first-class way to use
Carry-on rather than a preview of the app: what works without the
phone's native fetch (CORS stops most sites, so saving needs the
stateless server PROPOSAL.md allows, or saving stays app-only and the
browser reads what sync brings), install as a PWA, and storage limits
(IndexedDB quota, eviction).

**Decided (Daniel, 4 Oct 2026): no server.** The browser reads
everything, saves Wikipedia (its API allows CORS), and gets other pages
from the phone through a backup file (later sync). A fetch worker or a
browser extension can come later.

## RSS feeds (Daniel, 3 Oct 2026)

Follow a site's RSS or Atom feed and save its new posts: add a feed by
its link (or find it from a page's `<link rel="alternate">`), check it
like collections are checked for new chapters, and save new items into a
collection named after the feed, or list them to pick from. Settings per
feed: save automatically or just show what's new.

- **A sidebar** (Daniel, 3 Oct 2026). A menu button at the left of the
  bar opens a side panel with Library and RSS feeds, and whatever comes
  later. The bar stays the same in both views (Search, Downloads,
  Settings on the right), only its title changes.

---

## Waiting on a decision, not on a release slot

- **More sites (Daniel, 3 Oct 2026, "see what other sites we can
  support"):** Wattpad (text arrives in pieces from its API), and the
  comic sites Webtoon and Tapas (episode lists through their APIs).
  Each is a rule in `SITES`; slot them when wanted, with a page source
  from the phone to build the fixture from.

- **Downloads in the background on iOS (0.27.9).** Android keeps saving
  with the app away; iOS gives the page in progress about half a minute,
  then waits for the app to open. Going further means saving in Swift
  around background `URLSession` downloads (the page, then its images),
  a second copy of the saving code. Decide whether it's worth it.

- **iOS share extension** (with Safari's JavaScript preprocessing file,
  which is also iOS's only route to script-built pages). An extension
  needs its own app ID and an App Group, which sideloading with a free
  Apple account (AltStore, SideStore) makes painful: free accounts get
  3 app IDs. Decide on the Apple Developer Program first; slot it after.
- **A new name (Daniel, 3 Oct 2026).** Find a different name for the
  app. Check it against the App Store, Play and trademarks, and the
  domain; then the app ID, store title, icons and repo follow.
- **Before shipping to other people:** desktop browser version (and its
  worker) in v1 or not; Apple Developer Program or Android first; name
  checks (App Store, Play, trademark); privacy policy and store data
  forms; real icon assets via @capacitor/assets in CI. These are a
  release of their own once Daniel decides the two open questions.
