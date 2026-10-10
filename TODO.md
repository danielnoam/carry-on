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

## Next (Daniel, 10 Oct 2026)

Daniel tried the untested list on his phones; the stores wait.

- **Split src/app.js.** 8,500 lines in one file. Into a few plain script
  files loaded in order (library, reader, sheets, settings, highlights),
  each an IIFE on `window.Waypage` like the rest: still no build step.
  Nothing changes for the reader; the tests must pass unchanged.
- **Save highlights from Settings.** Every highlight in the library as
  one file, from Settings: Markdown grouped by clip (title, link, each
  highlight and its note), the same shape as the clip's Copy all.
- **Footnotes in a sheet.** A tap on a note mark ([1], a Wikipedia
  reference) opens that note in a small sheet over the page instead of
  jumping to the list at the end (reader.js, the `#` links). Any jump
  that stays in the page leaves a way back to where you were.
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

## Files: your own files, and where Waypage keeps everything (Daniel, 6 Oct 2026)

Decided: PDFs through pdf.js, locked down; three places for files, the
app's private storage the default and recommended. "Files" is the name
for what you bring in. Order: what you open first, since it can
be tried in the browser; the folder setting after, since it is mostly
native code.

### Still open on files and where Waypage keeps them

- **Moving a big library is file by file over the bridge:** fine for
  hundreds of megabytes; a native copy would be quicker for gigabytes.
- **Saving from email (1.10.0, Daniel, 9 Oct):** shared text becomes a
  clip, and .eml files open. Open: try both on a phone, Gmail's Share
  on selected text especially; on iOS a long passage goes through the
  waypage:// address, so check a long email arrives whole.
- **Brightness while reading (1.10.0, Daniel, 9 Oct):** try on both
  phones, iOS especially (the level from before should come back when
  you leave Waypage). Open: a way back to the phone's own level without
  turning the swipe off.

## iOS, after 1.6.0

1.6.0 built everything iOS lacked that could be built without an iPhone
(see NOTES.md, "The iOS release"). CI proves it compiles; nothing has run
on a phone yet. Left:

- **Try it on an iPhone,** each one for the first time: the share sheet
  (does Waypage come to the front, or does the link wait for the next
  open?), the three widgets and their taps, Open in from Files and Mail,
  reading a book from where it is, a library in an iCloud Drive folder,
  watched folders, a feed notification (iOS runs the check when it
  likes; Background App Refresh must be on), Wait for Wi-Fi, a
  script-built page saving. From before: the setup-code scanner, Read
  aloud with the screen locked, the updater's "Get it" link, and Go on
  to the next clip with the screen locked.
- **The Apple Developer Program (Daniel's decision).** Nothing in 1.6.0
  needs it, but a free Apple account through AltStore or SideStore has 3
  active apps, AltStore itself and each app extension included: Waypage
  with its share extension and widgets is 3 on its own, so a free account
  has to drop the extensions (AltStore offers to) or another app. The
  program lifts that, ends the 7-day re-signing, and is the way to
  TestFlight and the App Store.
- **A collection widget on iOS.** Android's asks which collection; on iOS
  that is an App Intent configuration (iOS 17).
- **Downloads in the background (0.27.9).** Still the half minute iOS
  gives the page in progress. Going further means saving in Swift around
  background `URLSession` downloads, a second copy of the saving code:
  only if the half minute turns out not to be enough.

---

## Saving signed in: what 1.8.0 left

- **Pages drawn by script, signed in, on iOS.** iOS's PageRender keeps
  nothing between pages (a non-persistent data store), so a signed-in
  site whose article only appears after its scripts run still saves as
  the start there. Copying the site's cookies into that store before the
  page loads would do it. Android's PageRender already shares them.
- **"Sign in with Google" in the sign-in browser.** Google refuses sign-in
  in embedded browsers, so a site whose only sign-in is Google's can't be
  signed in to. Email and password sign-ins work. Not worth working
  around: the way around is against Google's terms.
- **Privacy forms**, when the store listings are written: sign-in cookies
  stay on the phone and go only to their own site.

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
