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

## 0.23.0: Saving runs, storage by folder, and the reader's bars

**Goal:** a long run into a folder can be paused and doesn't make the
screen jump; Storage stays short however much is saved; the reader's
bars stand apart from the page.

**Items** (Daniel, 3 Oct 2026)
- **Pause** beside Stop for a run into a folder (Save next 10 or All,
  Save several, a contents page): the run waits after the page it is on
  and Resume carries on from the next link. Stop still drops the rest.
- **No jumping while a run saves.** Today each page gets its own saving
  card as its turn comes and the card goes when it's saved, so
  everything below moves up and down. A run into a folder becomes one
  card from start to end, the same height throughout: the folder's name,
  "3 of 10 saved · 7 waiting", the ring for the page in progress, Pause
  and Stop. A failed page shows on that card with Try again, not as a
  card of its own.
- **Leave out what's already there.** Save several gets "Skip pages
  already saved" (on by default), with the count ("8 already saved").
  Today a link that's already saved isn't downloaded again, but it is
  moved into the folder and to the run's place in it, and moved out of
  any other folder it was in. With the box ticked those pages stay where
  they are; unticked keeps today's behaviour, which is how you reorder a
  folder to match a contents page.
- **Darker bars in the reader.** The top bar and the foot a step darker
  than the page in Paper and Sepia, and a step lighter in Night, as a
  token per theme (`--bar`), checked for AA against the bar's text.
- **Storage by folder** (Daniel, 3 Oct 2026). Settings › Storage shows
  folders first, one row each with its page count and size, biggest
  first, and "Not in a folder" as one more row. Tapping a row pushes
  that group's pages as a list, biggest first, each with its size and
  Delete as today. The total stays at the top.

**Steps**
1. Pause: a `paused` set beside `stopping`; `saveAll` and `follow` wait
   on a promise between pages while paused. A paused run survives
   leaving the folder screen but not closing the app (as today).
2. The run card replaces `QUEUE_CARDS`: one card per running folder
   whatever the count, fixed height, the counts updating in place.
3. Skip already saved: the Save several screen counts `savedAs` matches
   as the links are edited; the box only shows when there is at least
   one.
4. `--bar` in DESIGN.md's color table for each theme, used by
   `.reader-bar` and the reader foot; check the "Offline" pill and the
   progress line on it.
5. Storage: `storageGroup` builds folder rows from `allFolders()` and
   `sizeOf(folderPages(name))`; the pushed list reuses today's page
   rows. A pushed screen like the folder screen, so Back returns to
   Storage.

**Daniel's phone:** pause a 10 chapter run, leave the app in the
background, resume; save a contents page twice into the same folder with
the box on and off; check the bars in all three themes; open Storage
and a folder in it.

**Depends on:** nothing.

---

## 0.24.0: Read aloud

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

## 0.25.0 and 0.26.0: Sync through a private GitHub repo

Split in two because it's the riskiest work and loses data if wrong.

**0.25.0, the index and text.** A fine-grained token for one repo, kept on
the device. Sync `library.json` and each `page.html` + `meta.json`
through the contents API with `sha` for conflicts, as LifeLog's
src/storage.js does. Deletes become tombstones in `library.json` so they
don't come back from the other device. The other device re-downloads
previews from the original links. Reuses the 0.18.0 backup format.

**0.26.0, images.** Push `images/` through the Git Data API (blobs, one
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
