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

## Rename to Waypage (Daniel, 5 Oct 2026)

The app becomes **Waypage**, store title "Waypage: Offline Reader": a page
for the way, keeping Carry-on's sense of reading on the go without tying
the name to planes. Offprint was dropped: "Offprint: Web to PDF & EPUB"
is already on the App Store. Web searches found no reading app called
Waypage; waypage.com is a landing-page builder, so the domain is
taken and the store listing should lean on "Offline Reader". Before this
release, search Waypage in the Play Store and the App Store by hand.

**Everything is renamed (Daniel, 5 Oct 2026),** not only what's shown.
This replaces the earlier "display name only" plan. Nothing here has
started; it waits for Daniel's go.

What gets the new name, and what each one breaks:

- **App ID** `io.github.danielnoam.carryon` → `io.github.danielnoam.waypage`
  (capacitor.config.json, the Java packages in native/, widgets, share
  target, notification channels). Android and iOS treat a new ID as a
  different app: it installs beside Carry-on, starts with an empty
  library, and Carry-on's updater can't install over it. The library has
  to be carried across (sync, or a backup file).
- **Signing key alias** `carryon` → `waypage`, with secrets Daniel adds.
  Harmless only because the app ID changes too: an existing install can
  never take an update signed with a different key.
- **iOS bundle ID and name:** a new app in AltStore/SideStore as well.
- **GitHub repo** danielnoam/carry-on → danielnoam/waypage. GitHub
  redirects the API and release downloads, so installed copies' updater
  keeps working, as long as no new repo takes the old name. GitHub Pages
  does not redirect: the web copy moves from /carry-on/ to /waypage/, and
  setup links and QR codes made before point at the old address.
- **The APK** `CarryOn.apk` → `Waypage.apk` (and the IPA). Installed
  Carry-on looks for `CarryOn.apk`; after the bridge release it looks for
  Waypage instead.
- **Storage keys** `carryon.*` → `waypage.*`, and the IndexedDB name. The
  app starts empty anyway (new ID), but the web copy at /waypage/ shares
  danielnoam.github.io's storage with /carry-on/: it copies the old keys
  over once, then uses only the new ones.
- **The sync repo** `carryon-data` → `waypage-data`. Waypage looks for
  waypage-data, then carryon-data, and renames it (GitHub redirects the
  old name for Carry-on copies still syncing).
- **Text:** every "Carry-on" in the app, the User-Agent and Wikipedia
  `Api-User-Agent`, manifest.json, `<title>`, release titles, README,
  DESIGN.md, CLAUDE.md, NOTES.md, the skills, the store title "Waypage:
  Offline Reader".
- **The Claude project** and its memory, renamed by Daniel in the app.

A safe order:

1. **Bridge release, the last Carry-on.** Its updater learns the new
   repo, the `Waypage.apk` name and the new app ID. When Waypage is out it
   says so: "Carry-on is now Waypage. Install it, then bring your
   library", and makes a backup file (or relies on sync when it's on).
2. **Rename the repo** to danielnoam/waypage; check that the old API and
   release URLs redirect and that the web copy is up at /waypage/.
3. **Waypage 1.0:** new app ID, key alias, bundle ID, file names, storage
   keys with the web copy's one-time copy, sync repo lookup, all text.
   Releases publish `Waypage.apk` and the IPA.
4. **On Daniel's phones:** install Waypage beside Carry-on, bring the
   library over by sync or backup, check pictures, positions and feeds,
   then uninstall Carry-on.
5. **Store listings** and the Claude project name last, once it all runs.

## Naming (Daniel, 5 Oct 2026)

Library · Clips (web saves) · Files (imports) · Collections · Feeds ·
Tags. 0.30.7 renamed "pages" to "clips" in everything shown; storage
keys, file paths and sync keep "page". The files release names imported
documents Files. With Waypage, the set stays.

## Files: your own files, and where Carry-on keeps everything (Daniel, 6 Oct 2026)

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
  Carry-on, Documents/Carry-on, or a folder you pick; moving between them
  (NOTES.md, 0.33.0).

### Still open on files

- **iOS, reading from a file where it is:** a Files plugin for iOS
  (UIDocumentPicker and a security-scoped bookmark), so the choice shows
  there too. Until then iOS always copies, and "Open a file" is the only
  way in; Open in from Files and Mail wants document types in Info.plist
  and the app's open-URL event.
- **Exporting a clip that reads from a file:** its pictures are slots, so
  an EPUB or HTML export of one would come out without them. The Export
  tile is hidden on those clips for now; filling the slots first would
  let it work.
- **A PDF's own pages:** a scanned PDF is drawn once at about 1000 px and
  kept as pictures, or, read from where it is, every page is drawn again
  each time it's opened, which is slow for a long one. Drawing as you
  reach them, and keeping where you are by page, would suit a long one
  better.
- **Sync of a big file's clip:** over 20 MB of pictures a copy keeps them
  on the device it was opened on. GitHub's contents API takes up to
  100 MB a file (reads over 1 MB need the blob API), so the cap could go
  up once it's clear how slow a 100 MB page is to write.

### Still open on where Carry-on keeps its files (0.33.0 shipped it)

- **iOS: a folder you pick,** kept as a security-scoped bookmark. 0.33.0
  only shows the app's own storage in the Files app (On My iPhone).
- **A cleaner reinstall for Documents/Carry-on:** Android won't let a
  reinstalled app read the files its last install made there, so the
  setting says to pick that folder with the third option. Spotting a
  library left there at first start would save the reader the trip.
- **Moving a big library is file by file over the bridge:** fine for
  hundreds of megabytes; a native copy would be quicker for gigabytes.

## The iOS release (Daniel, 5 Oct 2026)

Everything iOS still lacks that Android has, in one release. Most of it
needs the **Apple Developer Program** ($99 a year): an extension or widget
needs its own app ID and an App Group, and a free Apple account through
AltStore or SideStore gets 3 app IDs and re-signs every 7 days. Decide
on the program first; this release comes after.

- **Share extension,** with Safari's JavaScript preprocessing file, which
  is also iOS's only route to script-built pages. Puts Carry-on in the
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

---

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
