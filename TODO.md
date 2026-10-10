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

---

## Next: four releases, in this order (Daniel, 10 Oct 2026)

Daniel tried everything that was untested on his phones, and asked for
all of these, grouped into releases that fit together.

### 1.14.0: app.js in parts

Nothing new to see; every release after it is easier to check.

- **Split src/app.js.** 8,500 lines in one file. Into a few plain script
  files loaded in order (library, reader, sheets, settings, highlights),
  each an IIFE on `window.Waypage` like the rest: still no build step.
  Nothing changes for the reader; the tests must pass unchanged.

### 1.15.0: reading

The reader, on a plane.

- **Brightness:** a way back to the phone's own level without turning
  the swipe off.
- **Footnotes in a sheet.** A tap on a note mark ([1], a Wikipedia
  reference) opens that note in a small sheet over the page instead of
  jumping to the list at the end (reader.js, the `#` links). Any jump
  that stays in the page leaves a way back to where you were.
- **Find in this clip.** Search words inside the open clip from the
  reader's bar or ⋯: matches marked in the frame, a count, next and
  previous, the reader moving to each (in pages, the page it's on).
  Done in the app's document against the frame's text, since the frame
  runs no script.
- **Links inside a clip (Daniel, 10 Oct).** A tap on a link to another
  page opens a small sheet, Open and Save for later, instead of going
  straight to the browser (reader.js, `openOutside`). Save for later
  offline waits and saves when the phone is back online, like any save
  that failed; the toast says so. A link already saved opens that clip.

### 1.16.0: getting around

The sidebar, the app icon and your highlights.

- **Favourites in the sidebar (Daniel, 10 Oct).** Under Library, the
  favourite collections and then the favourite clips, in place of the
  three collections used last (renderSide, SIDE_MAX). A tap opens the
  collection or the clip. Up to 6, then "All favourites" (the library's
  Favourites filter); none, and the section isn't there. Below them,
  Collections, Clips and Files, each opening its part of the library
  (openPart "collections", "pages", "files"); Files only when there are
  files.
- **App icon shortcuts.** A long press on the icon: Continue reading,
  Search, and Save the copied link. Android through static shortcuts in
  the manifest, iOS through Quick Actions; each opens a waypage:// address
  the app already takes, like a widget's tap.
- **Save highlights from Settings.** Every highlight in the library as
  one file, from Settings: Markdown grouped by clip (title, link, each
  highlight and its note), the same shape as the clip's Copy all.

### 1.17.0: saving and sync

When a page is gone, and a big library's first sync.

- **The archived copy when a page is gone.** A save that fails because
  the page is missing or refuses (404, 410, 403) offers the Wayback
  Machine's copy (archive.org's availability API, then the snapshot,
  saved like any page, with its archive date and the original link). A
  clip whose original is gone gets the same from its ⋯ menu.
- **A faster first sync.** Sending is one Contents PUT per clip and per
  picture pack, one after another, each its own commit. Send in batches
  of about 50 clips through the Git Data API instead: the clips' text
  inline in one tree request, picture packs as blobs a few at a time,
  then one commit and one ref update. A ref that moved under it (another
  device synced) gets the tree and commit made again on the new head,
  blobs kept. `waypage.syncSent` moves on per batch, so a cut-off sync
  resumes from the last batch. Time a first sync on a phone before and
  after; pictures stay bound by GitHub's ~80 writes a minute.

---

## Smaller, open

- **Moving a big library** is file by file over the bridge: fine for
  hundreds of megabytes; a native copy would be quicker for gigabytes.
- **A collection widget on iOS.** Android's asks which collection; on iOS
  that is an App Intent configuration (iOS 17).
- **Pages drawn by script, signed in, on iOS.** iOS's PageRender keeps
  nothing between pages (a non-persistent data store), so a signed-in
  site whose article only appears after its scripts run still saves as
  the start there. Copying the site's cookies into that store before the
  page loads would do it. Android's PageRender already shares them.
- **Downloads in the background on iOS (0.27.9).** Still the half minute
  iOS gives the page in progress. Going further means saving in Swift
  around background `URLSession` downloads, a second copy of the saving
  code: only if the half minute turns out not to be enough.

---

## Parked: the stores (Daniel, 10 Oct 2026: "we don't care for stores for now")

- **Before shipping to other people:** desktop browser version (and its
  worker) in v1 or not; Apple Developer Program or Android first; name
  checks (App Store, Play, trademark); privacy policy and store data
  forms (sign-in cookies stay on the phone and go only to their own
  site); real icon assets via @capacitor/assets in CI.
- **The Apple Developer Program.** A free Apple account through AltStore
  or SideStore has 3 active apps, extensions included, so Waypage with
  its share extension and widgets fills it; the program lifts that, ends
  the 7-day re-signing, and is the way to TestFlight and the App Store.
- **Saving any site in a browser: a server (Daniel, 4 Oct 2026).** A
  stateless fetch worker behind a token, rate-limited, storing nothing,
  so the browser can save (and follow feeds from) sites that don't allow
  CORS. Only with a desktop browser version.
