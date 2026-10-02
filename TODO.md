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

## 0.18.0: Export and import, one page and the whole library

**Goal:** a page can leave the app, and the library survives a new phone
or an uninstall.

**Items**
- Share from the reader through the share sheet: the link, or the page
  as a file.
- Export a page as a self-contained HTML file (images inlined as data
  URLs), which Carry-on can import back.
- **(new)** Back up the whole library to one file and restore it.
  DROPPED.md says v1 is "per device with export and import", but neither
  exists yet: today an uninstall loses everything. This also defines the
  format sync (0.23.0) reuses.
- PDF: the phone's print to PDF. **Check first:** Android's WebView
  ignores `window.print()`, so this needs a small native call to
  `PrintManager` in native/share (and `UIPrintInteractionController` on
  iOS). If that's more than a day, move PDF after EPUB.

**Steps**
1. Self-contained HTML: page.html with previews as data URLs, plus a
   `<meta>` block with the index entry (title, url, savedAt, tags, folder
   name and place). Import reads only that block and the body, then runs
   the body through the same allowlist cleaning as a fetched page.
2. Library backup: a zip (store-only, written by a ~100-line helper, no
   library) of `library.json` and every page directory. Restore merges by
   URL, never overwrites a newer copy. Save it with Filesystem and hand
   it to the share sheet.
3. Share sheet: @capacitor/share, already in package.json.
4. PDF via the native print call, if step 0 says it's small.

**Daniel's phone:** export a page, send it to himself, import it back;
back up the library, uninstall, reinstall, restore, and check reading
positions, tags and folder order came back.

**Depends on:** nothing left (the 0.14.0 glossary in NOTES.md names
the format's fields).

---

## 0.19.0: EPUB of one page (after the WebToEpub research)

**Goal:** a saved page reads on an e-reader.

**Items**
- Research WebToEpub first: how it finds a chapter list (per-site parsers
  against its generic one), collects chapters, and packs the EPUB
  (structure, cover, table of contents, images). Outcome: a NOTES.md entry
  saying what Carry-on borrows, and a yes or no on "Save all chapters" for
  0.20.0. No code ships from the research alone.
- Export a page as EPUB 3 from the reader's ⋯.

**Steps**
1. Read WebToEpub's parser and packer code; write the NOTES entry.
2. EPUB writer in src/: mimetype stored first and uncompressed, then
   META-INF/container.xml, content.opf, nav.xhtml, one XHTML chapter,
   images. Reuse 0.18.0's zip helper.
3. The page is already clean HTML with local images, so this is mostly
   converting it to XHTML (self-closing tags, escaped entities) and
   packaging. Include the Wikipedia licence line and the original link.
4. Validate with epubcheck in the test run (or in CI if it needs Java).

**Daniel's phone:** open the EPUB in an e-reader app (and on a Kindle via
Send to Kindle, which accepts EPUB) with Hebrew and with images.

**Depends on:** 0.18.0 (zip helper, share sheet).

---

## 0.20.0: Whole folders as books

**Goal:** a web novel goes from a table of contents page to one EPUB.

**Items**
- Export a whole folder as one EPUB: chapters in folder order, a table of
  contents, the first page's image or a generated title card as cover.
- "Save all chapters" from a table-of-contents page (if the 0.19.0
  research says a generic finder is good enough): list the chapter links
  it found, in Save several, for Daniel to check before saving.

**Steps**
1. Folder EPUB: one XHTML per page, nav from page titles.
2. Chapter list finder: the largest run of same-host links in one list
   or table whose text looks like chapters (numbers in order); hand them
   to Save several with a new folder named after the page.
3. Warn when a list is long (over 50) before saving.

**Daniel's phone:** a real web novel with 30+ chapters, from its contents
page to an EPUB on an e-reader.

**Depends on:** 0.19.0 (EPUB writer, research).

---

## 0.21.0: Comics and manga

**Goal:** a chapter that is a column of images saves and reads well.

**Items**
- Image-chapter mode: spot pages that are mostly one column of large
  images, keep those images in order, drop the rest.
- Full-size images for those pages, whatever the image setting.
- A comics reader: images edge to edge, no gaps, pinch zoom (the 0.14.0
  viewer's zoom).
- Folders for series and next-chapter following, as today.
- Show the folder's size, and warn before "Save next 10" when the last
  chapters were large ("about 300 MB").

**Steps**
1. Detection: when Readability finds little text, count `<img>` (and
   lazy `data-src`) taller than wide and over ~600 px wide in document
   order; if they dominate, save as an image chapter.
2. Images: send the page URL as Referer when downloading (many sites block
   hotlinking without it); scripts that lazy-load fall back to the 0.12.0
   hidden-WebView drawing, which may need scrolling to trigger loads.
3. Reader: a separate CSS layout for image chapters in the same sandboxed
   iframe; no new trust surface.
4. Store listing and in-app text never name aggregator sites.

**Daniel's phone:** two or three real sites, one that lazy-loads; a 10
chapter "Save next" with the size warning; reading in the plane case
(airplane mode).

**Depends on:** 0.17.0 (full-size per save, folder size), 0.14.0
(zoom), 0.12.0 (drawing).

---

## 0.22.0: Read aloud

**Goal:** listen to a saved page, offline.

**Items**
- A player in the reader: play and pause, speed, skip by paragraph,
  following along in the text.

**Steps**
1. Native TTS in native/share: Android `TextToSpeech`, iOS
   `AVSpeechSynthesizer`, both offline with the phone's voices. Events for
   each utterance's start so the reader can highlight it.
2. Split the page into paragraphs in reader.js; speak one at a time.
3. **Decide with Daniel:** keep reading with the screen off? That needs an
   Android foreground service and a media notification, which is a lot
   more work. Default plan: screen on only, in this release.

**Daniel's phone:** English and Hebrew voices (Hebrew needs the voice
data installed on the phone), speed changes, skip, and what happens when
the screen locks.

**Depends on:** nothing; can move earlier if wanted more than export.

---

## 0.23.0 and 0.24.0: Sync through a private GitHub repo

Split in two because it's the riskiest work and loses data if wrong.

**0.23.0, the index and text.** A fine-grained token for one repo, kept on
the device. Sync `library.json` and each `page.html` + `meta.json`
through the contents API with `sha` for conflicts, as LifeLog's
src/storage.js does. Deletes become tombstones in `library.json` so they
don't come back from the other device. The other device re-downloads
previews from the original links. Reuses the 0.18.0 backup format.

**0.24.0, images.** Push `images/` through the Git Data API (blobs, one
tree and one commit per save), since the contents API stops at 1 MB and
broke LifeLog's sync. Decide first whether the repo's growth (0.5 to 1.5
MB per illustrated page, far more for comics) is acceptable, or whether
comics folders stay off sync.

The token is per device and stays in the app; for anyone but Daniel sync
stays optional, with 0.18.0's backup as the no-account way.

**Daniel's phones:** two devices; save on one, read on the other; delete on
one and confirm it stays gone; edit tags offline on both and sync.

**Depends on:** 0.18.0 (format, merge-by-URL rules).

---

## Waiting on a decision, not on a release slot

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
