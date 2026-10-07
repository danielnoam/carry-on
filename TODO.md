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

## Files: your own files, and where Waypage keeps everything (Daniel, 6 Oct 2026)

Decided: PDFs through pdf.js, locked down; three places for files, the
app's private storage the default and recommended. "Files" is the name
for what you bring in. Order: what you open first, since it can
be tried in the browser; the folder setting after, since it is mostly
native code.

### Still open on files and where Waypage keeps them

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
- **Read aloud across clips (1.4.0, Daniel, 7 Oct):** reading goes on
  outside the reader with a bar along the bottom, and Read next at the
  end; 1.4.1 opens the clip from the card at the paragraph being read.
  Open: a Read next that goes on by itself, as a setting.
- **Watched folders (1.4.0, Daniel, 7 Oct; their own page, Content, in
  1.4.1):** a list now, with a look-now arrow per folder. Open: looking
  in many folders is one after the other; a slow memory card in one
  holds the rest.
- **On mobile data (1.4.1, Daniel, 7 Oct):** Save or Wait for Wi-Fi in
  Saving, Sync or Wait for Wi-Fi in Sync; Android only, since only the
  WebView reports the connection type. Open: iOS has no way to tell from
  the web layer (a Network plugin would).

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
