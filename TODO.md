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

## 0.26.0: Folders, the reader and polish

**Goal:** the folder screen, the reader's bars and every button feel
finished, and a Blogger serial saves as whole chapters.

**Items** (Daniel, 3 Oct 2026)
- **Export, not EPUB:** the folder's EPUB tile becomes "Export" and asks
  which kind: EPUB, one HTML file, or PDF (print). The page sheet's
  "Send" (HTML) and "Send as EPUB" fold into the same Export, which
  also answers the doubled buttons below.
- **Series tools together:** "New chapters", Save previous (backfill)
  and Save next (forward fill) move out of the page list into one
  "Chapters" button at the top of the folder, opening a sheet with all
  three.
  - **Refresh saved chapters (new to the plan):** save chapters again
    that are already in the folder, to switch them between Links,
    Previews and Full images, or to pick up an author's edits. Keeps
    each page's place and read position.
- **Link a folder to its contents page:** a folder can remember the
  story's page (a Royal Road fiction page, an AO3 work), set when it was
  made from one or picked later. New chapters are then read from that
  list, which also catches chapters inserted in the middle, and the
  folder's tile and header show a book icon instead of the folder icon.
- **Reader bars:** scrolling up no longer brings the bars back; a tap on
  the page shows them and any scroll hides them again.
- **The ⋯ sheet repeats itself:** Share, Send and Original at the top,
  then "Send as EPUB" and Print under More. Send and Send as EPUB merge
  into Export; each action appears once.
- **Pressed states everywhere:** no browser blue outline or grey flash
  on tap (`-webkit-tap-highlight-color` and focus rings only for a
  keyboard, `:focus-visible`), and every button, chip, row and tile gets
  a pressed state (the 0.97 scale and a token tint) with a
  reduced-motion answer.
- **The options button beside Save** (three lines) gets the same
  shape, height and fill as Save, as a pair.
- **Unread and Finished show folders, not their pages:** filtering
  keeps folders as tiles (those with unread pages, or all read) and
  lists only pages in no folder, instead of every chapter loose.
- **Blogger serials** (thezombieknight.blogspot.com): a chapter is
  spread over several posts, and the blog has a "full chapters" page
  (/p/blog-page_19.html) linking each chapter. A Blogger rule in
  `SITES`: a /p/ page full of post links is a contents page; a post's
  text is `.post-body`; next and previous are the "Newer Post" and
  "Older Post" links (`#blog-pager-newer-link`, which the next-word
  match misses today). Needs a page source of both pages from the
  phone to check what "full chapter" links point at.

**Steps**
1. Export sheet (EPUB, HTML, PDF) shared by the folder and ⋯.
2. Folder "Chapters" sheet with New chapters, Save previous, Save next
   and Refresh; `refresh(p, mode)` re-saves in place under the same id.
3. `folder.source` on its pages' index entries (no folders file); the
   check reads the list from the source when there is one.
4. Reader: tap toggles the bars, scroll in either direction hides them.
5. CSS: tap highlight off, `:focus-visible` only, pressed state on every
   control; the options button restyled.
6. Library filters keep folders.
7. Blogger rule and a fixture from the sent page sources.

**Daniel's phone:** export a folder each way; refresh a folder to full
images; link a folder to its Royal Road page; read with the bars
hiding; tap through every screen looking for a blue outline.

**Depends on:** nothing.

---

## 0.27.0: Read aloud

**Goal:** listen to a saved page, offline.

**Items**
- A player in the reader: play and pause, speed, skip by paragraph,
  following along in the text.
- **Its own button in the reader's top bar** (Daniel, 3 Oct 2026): one
  tap starts reading, another stops. The voice settings (voice, speed)
  live in the Aa sheet with the other reading settings, not on the
  button.

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

The token is per device and stays in the app; for anyone but Daniel sync
stays optional, with 0.18.0's backup as the no-account way.

**Daniel's phones:** two devices; save on one, read on the other; delete on
one and confirm it stays gone; edit tags offline on both and sync.

**Depends on:** 0.18.0 (format, merge-by-URL rules).

---

## Waiting on a decision, not on a release slot

- **More sites (Daniel, 3 Oct 2026, "see what other sites we can
  support"):** Wattpad (text arrives in pieces from its API), and the
  comic sites Webtoon and Tapas (episode lists through their APIs).
  Each is a rule in `SITES`; slot them when wanted, with a page source
  from the phone to build the fixture from.

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
