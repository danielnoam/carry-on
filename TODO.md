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

## Speed (Daniel, 6 Oct 2026; 1.2.0 and 1.2.1 did two passes)

1.2.0 made the library's redraw and sync's merge cheap in a big library
(NOTES.md, 1.2.0). Left for when the phone still feels slow:

- Done in 1.2.1: the first draw a screen at a time, library.json a few
  times a run instead of once a page, sync's merge on a worker.
- **`inert` on the library** restyles every card when a screen opens or
  closes (30 to 60 ms at 4x); a focus trap instead would avoid it. Left
  as it is (NOTES.md, 1.2.1): the cost lands after the animation.

## Naming (Daniel, 5 Oct 2026)

Library · Clips (web saves) · Files (imports) · Collections · Feeds ·
Tags. 0.30.7 renamed "pages" to "clips" in everything shown; storage
keys, file paths and sync keep "page". The files release names imported
documents Files. With Waypage, the set stays.

## Files: your own files, and where Waypage keeps everything (Daniel, 6 Oct 2026)

Decided: PDFs through pdf.js, locked down; three places for files, the
app's private storage the default and recommended. "Files" is the name
for what you bring in (Naming). Order: what you open first, since it can
be tried in the browser; the folder setting after, since it is mostly
native code.

### Done: 0.31.0 to 0.33.0

- **0.31.0:** EPUB, Markdown, text, HTML and CBZ, opened from Save's list
  button, a drop on the desktop, or Android's Open with and Share; the
  Files part and its sidebar entry (NOTES.md, 0.31.0).
- **0.32.0:** PDFs through pdf.js in a frame with no origin; the choice
  between a copy and reading from the file where it is; the system's
  picker; copies syncing with their pictures under 20 MB; the second copy
  of the file 0.31.0 kept is gone (NOTES.md, 0.32.0).
- **0.32.1, 0.32.2:** PDFs really read from where they are; every kind of
  file asks.
- **0.33.0:** where your library is, in Settings under Storage: inside
  Waypage, Documents/Waypage, or a folder you pick; moving between them
  (NOTES.md, 0.33.0).

### Still open on files and where Waypage keeps them

1.1.0 shipped the watched folder, long PDFs drawn as you reach them,
sync of a file's pictures up to 100 MB, and the way back to a library in
Documents/Waypage after a reinstall.

- **Moving a big library is file by file over the bridge:** fine for
  hundreds of megabytes; a native copy would be quicker for gigabytes.

## The iOS release (Daniel, 5 Oct 2026)

Everything iOS still lacks that Android has, in one release. Most of it
needs the **Apple Developer Program** ($99 a year): an extension or widget
needs its own app ID and an App Group, and a free Apple account through
AltStore or SideStore gets 3 app IDs and re-signs every 7 days. Decide
on the program first; this release comes after.

- **Share extension,** with Safari's JavaScript preprocessing file, which
  is also iOS's only route to script-built pages. Puts Waypage in the
  share sheet, as Android has since 0.3.0.
- **Widgets (WidgetKit):** Keep reading, Feeds and Favourites, as on
  Android since 0.29.0 and 0.29.2.
- **Feeds checked with the app closed.** Android checks and notifies
  (0.28.4); iOS checks only while the app is open. Background refresh
  runs when iOS decides, so it may come late; worth trying once the rest
  is in.
- **Downloads in the background (0.27.9).** Android keeps saving with the
  app away; iOS gives the page in progress about half a minute, then
  waits for the app to open. Going further means saving in Swift around
  background `URLSession` downloads (the page, then its images), a second
  copy of the saving code. The heaviest item: last, or dropped if the
  half minute is enough in practice.
- **iOS, reading from a file where it is:** a Files plugin for iOS
  (UIDocumentPicker and a security-scoped bookmark), so the choice shows
  there too. Until then iOS always copies, and "Open a file" is the only
  way in; Open in from Files and Mail wants document types in Info.plist
  and the app's open-URL event.
- **iOS: a folder you pick,** kept as a security-scoped bookmark. 0.33.0
  only shows the app's own storage in the Files app (On My iPhone).
- **Try it on an iPhone:** the setup-code scanner (0.30.1, needs the
  camera prompt), Read aloud with the screen locked, and the updater's
  "Get it" link.

## Sync: done for now (Daniel, 6 Oct 2026)

0.30.0 syncs the library and each page's text; pictures sync as each
page's mode and every device fetches its own. 0.30.1 added feeds, 0.30.9
favourite collections and 0.30.10 when Feeds was last looked at. Kept
per device on purpose: settings (theme, reading type, layout, read aloud,
the images default) and the new-chapter checks, which leave out chapters
sync brings in. No sync with the app closed (Daniel: not needed).
1.3.0 (Daniel, 7 Oct): the place in a clip syncs as a spot in the text,
a furthest-read toast on open, sync at once on close, a cheap ETag poll
every minute in front. Open: a device name in that toast ("on your
phone"), which needs a name per device in the library.

---

## Big screens: a browser and PC layout (Daniel, 7 Oct 2026)

Daniel asked for a design for big screens, to use in a browser and on a
PC. Five artboards are on the canvas and in `design/UI-Big-*.dc.html`
(DESIGN.md §5 "Big screens"): one sidebar always open at 1024 px and
wider, the save field at the top, the reader with a contents rail and
keyboard hints, a two-column collection, Feeds, and a two-pane Settings.
Open: Daniel's word on the direction, then build it in passes (sidebar
and library first, reader rail and keys, settings panes). The web copy
already runs in a browser; what it saves there is limited by CORS until
the fetch worker above exists.

## Waiting on a decision, not on a release slot

- **Saving any site in a browser: a server, later (Daniel, 4 Oct
  2026).** A stateless fetch worker behind a token, rate-limited, storing
  nothing, so the browser can save (and follow feeds from) sites that
  don't allow CORS. Not slotted yet.
- **Before shipping to other people:** desktop browser version (and its
  worker) in v1 or not; Apple Developer Program or Android first; name
  checks (App Store, Play, trademark); privacy policy and store data
  forms; real icon assets via @capacitor/assets in CI. These are a
  release of their own once Daniel decides the two open questions.
