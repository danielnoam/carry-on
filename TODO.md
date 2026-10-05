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

## Next: widgets on iOS, and a favourite collection

- Every widget on iOS (WidgetKit) waits on the Apple Developer Program,
  like the share extension.
- A favourite collection, or a widget for one collection, needs
  collections stored in a file of their own first.

## Rename to Waypage (Daniel, 5 Oct 2026)

The app becomes **Waypage**, store title "Waypage: Offline Reader": a page
for the way, keeping Carry-on's sense of reading on the go without tying
the name to planes. Offprint was dropped: "Offprint: Web to PDF & EPUB"
is already on the App Store. Web searches found no reading app called
Waypage; waypage.com is a landing-page builder, so the domain is
taken and the store listing should lean on "Offline Reader". Before this
release, search Waypage in the Play Store and the App Store by hand.

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
  `Waypage.apk` for a while, or keep the old file name.
- **The repo name** (danielnoam/carry-on) is in installed copies'
  updater too. Renaming it relies on GitHub's redirect, so keep the name
  unless there's a reason to change it.

## Next: sync, what's left after 0.30.0

0.30.0 syncs the library and each page's text; pictures sync as each
page's mode and every device fetches its own (Daniel, 5 Oct 2026), so
the planned 0.31.0 (images through the Git Data API) is not needed.

- **Feeds in sync.** The feeds you follow are on each device on their
  own; they could join library.json.
- **Setting up the second device with a link** (LifeLog's one-link
  setup) instead of pasting the token again.
- **Try it on Daniel's two phones:** save on one and read on the other;
  delete on one and confirm it stays gone; tag on both offline, then
  sync.

---

## Waiting on a decision, not on a release slot

- **Feeds on iOS with the app closed.** Android checks them and notifies
  (0.28.4); iOS checks only while the app is open. Background refresh
  there runs when iOS decides. Decide whether it's worth trying.
- **Saving any site in a browser: a server, later (Daniel, 4 Oct
  2026).** A stateless fetch worker behind a token, rate-limited, storing
  nothing, so the browser can save (and follow feeds from) sites that
  don't allow CORS. Not slotted yet.
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
- **Before shipping to other people:** desktop browser version (and its
  worker) in v1 or not; Apple Developer Program or Android first; name
  checks (App Store, Play, trademark); privacy policy and store data
  forms; real icon assets via @capacitor/assets in CI. These are a
  release of their own once Daniel decides the two open questions.
