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

## Next: a favourite collection

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

## Your files, where you want them, and a reader for any file (Daniel, 5 Oct 2026)

Not reorganising the library (that's fine as it is). Two things:

- **Choose where Carry-on keeps its files** (Settings): pages, pictures,
  collections, everything it saves, in a folder you pick on the phone,
  so you can see and copy them.
  - iOS: the app's folder shows in Files under On My iPhone (LifeLog's
    UIFileSharingEnabled), which is most of it.
  - Android: the app's own storage is private. A public folder
    (Documents/Carry-on, as LifeLog's phone backup) is visible to Files
    and a PC; a folder you pick anywhere goes through Android's folder
    picker, whose files the reader can't load directly, so they'd be read
    through a native plugin. Moving an existing library there is a copy,
    with a check before the old one goes.
- **Open outside files as they are,** in readers of Carry-on's own, never
  converted: the original file is kept and is what's read. Each gets the
  library's marks: where you are, tags, collections, favourites, sync.
  - **EPUB:** its chapters' XHTML and its own CSS, shown in the same
    sandboxed reader (no scripts), with its table of contents, scroll or
    pages.
  - **PDF:** needs a renderer. pdf.js is the usual one, but it is a
    dependency (CLAUDE.md says none) and runs scripts, so it can't live in
    the sandboxed reader. The other way is the phone's own renderer
    (Android PdfRenderer, iOS PDFKit) drawing each page as you reach it.
    Decide which.
  - **Markdown, text, HTML:** shown as they are (Markdown drawn as
    formatting, HTML sandboxed like a saved page).
  - **Images and comic archives (CBZ)** in the comics reader.
  - From the share sheet, Files, or a drop on the desktop.

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

## Next: sync, what's left after 0.30.1

0.30.0 syncs the library and each page's text; pictures sync as each
page's mode and every device fetches its own (Daniel, 5 Oct 2026), so
the planned 0.31.0 (images through the Git Data API) is not needed.
0.30.1 added feeds, the step-by-step setup and the setup code.

- **Try it on Daniel's two phones:** save on one and read on the other;
  delete on one and confirm it stays gone; tag on both offline, then
  sync.

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
