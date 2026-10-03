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

## 0.24.0: Reading type and themes

**Goal:** the page reads the way you like it: more fonts, more themes,
and size and spacing set exactly rather than from a few steps.

**Items** (Daniel, 3 Oct 2026)
- **More fonts**, all bundled so they work offline, each OFL:
  - Source Serif 4 (today's serif) and Instrument Sans (today's sans).
  - Serifs: Literata (drawn for long reading on screens), Lora,
    Merriweather (sturdy, for small sizes and Night), EB Garamond
    (bookish).
  - Sans: Inter, Atkinson Hyperlegible (drawn for legibility).
  - OpenDyslexic, for readers who find it easier.
  - Hebrew: Frank Ruhl Libre and David Libre (serif), Assistant and
    Heebo (sans). A Hebrew page uses the Hebrew font matching the
    chosen one's style, since the Latin fonts have no Hebrew letters,
    or a Hebrew font can be picked outright. **(new)**
  - "System": the phone's own reading font, nothing to bundle.
  Shown as a list of rows in the Aa sheet and Settings, each name set
  in its own font.
- **Text size, exactly:** a slider from 14 to 32 px in 1 px steps, with
  the A− and A+ buttons kept for one step at a time, and the size shown
  ("19 px").
- **Line spacing, exactly:** a slider from 1.2 to 2.2 in 0.05 steps in
  place of Tight / Normal / Loose, showing the value ("1.60").
- **Margins (new):** narrow, normal or wide, since a bigger size or a
  wider line changes how long a line feels.
- **More themes (new),** beside Paper, Sepia and Night:
  - Light: **Slate** (cool grey), **Solarized Light**, **High contrast**
    (black on white, for bright sun).
  - Dark: **Black** (true black, saves battery on OLED screens),
    **Dusk** (warm brown-grey, softer than Night at bedtime),
    **Solarized Dark**.
  - **Auto:** pick one light and one dark theme and follow the phone's
    light/dark setting.
  Shown as swatches in the Aa sheet and Settings, the whole app (not
  only the page) takes the theme.
- A preview line in Settings, as today, follows every change; Reset puts
  the defaults back.

**Steps**
1. Fonts: subset Latin woff2 files (and Hebrew ones) in src/fonts with
   their OFL texts; `@font-face` with `font-display: swap`; the reader's
   font stack puts the Hebrew face after the chosen one, so mixed pages
   work. Regular and italic only, Latin (and Hebrew) subsets; the total
   added comes to roughly 1.5 MB, so check the APK size.
2. Prefs: `size` becomes px and `spacing` a number, with old saved
   prefs (a step index, "tight"/"normal"/"loose") mapped on load.
3. Sliders: native `input type="range"`, 44 px tall to touch, styled
   with the tokens; changes paint the open page live, as today.
4. EPUB export keeps using generic serif/sans (readers pick their own).
5. Themes: each is a full token set in styles.css (`[data-theme=…]`,
   including `--bar` and `--preview`), the status bar colour and the
   sandboxed page's CSS follow it, and `prefers-color-scheme` drives
   Auto. Every theme passes WCAG AA for text, links and controls.
6. Check every font in every theme at phone and desktop width, and
   right to left.

**Daniel's phone:** read the same page in each font and theme; drag
size and spacing while reading; a Hebrew page in each font; switch the
phone to dark mode with Auto on.

**Depends on:** nothing.

---

## 0.25.0: Read aloud

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

## 0.26.0 and 0.27.0: Sync through a private GitHub repo

Split in two because it's the riskiest work and loses data if wrong.

**0.26.0, the index and text.** A fine-grained token for one repo, kept on
the device. Sync `library.json` and each `page.html` + `meta.json`
through the contents API with `sha` for conflicts, as LifeLog's
src/storage.js does. Deletes become tombstones in `library.json` so they
don't come back from the other device. The other device re-downloads
previews from the original links. Reuses the 0.18.0 backup format.

**0.27.0, images.** Push `images/` through the Git Data API (blobs, one
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
