# Notes

Why things are the way they are, newest first. Each entry starts with a
bold title and its version so a search finds it.

- **Site rules (0.25.0).** `SITES` in src/save.js holds a rule for
  each serial-fiction site the general reader gets wrong, matched by
  host and tried before it: `contents` (this page lists chapters),
  `list` (the chapter list from any chapter, for Find chapters),
  `chapter` (the text, title, series and author, and next or previous
  where the site has no link for them) and `fetch`/`clean` (the address
  fetched and the one kept). The selectors come from WebToEpub's
  parsers (read for facts, not copied); the sandbox can't reach the
  sites, so each rule is tested against a fixture in the e2e suite
  built to the same markup, and "Send page source" exists so a page
  that breaks can be handed over and a fixture made from it. Royal Road
  hides a "stolen from Royal Road" line among the paragraphs with a
  class its inline `<style>` sets to `display: none`, which a DOMParser
  document doesn't apply: `removeHidden` removes what top-level rules
  hide (rules inside `@media` are left alone). Its fiction page lists
  every chapter in `window.chapters`, read without running the script.
  AO3 asks adults to click through, so its pages are fetched with
  `view_adult=true` and kept without it, which is how next links name
  them. A page from a rule keeps `series` (the story's name) in its
  meta, which names its folder instead of guessing from the title.
- **New chapters (0.25.0).** A folder is a series when its pages link to
  each other by next or previous. Its last page's next link is read
  again from the site, since the one kept at save time is "" when it was
  the newest chapter; a new one replaces it, so the folder's Save next
  row appears, and the walk on from it counts up to 10. Results live in
  `carryon.newChapters` by folder name, `{ at, count }`; the count
  shown is that less the folder's pages saved since, and nothing once
  the last page's next is saved, so it never needs writing back. The
  daily check runs a moment after launch and when the phone comes back
  online, one folder at a time, skipping any checked in the last day.
- **Fonts, Hebrew fonts and themes (0.24.0).** The new fonts are Google
  Fonts' own Latin subsets (variable 400 to 700 where the family has
  one), so 13 families add under 1 MB. The four Hebrew faces carry only
  Hebrew letters (their unicode-range says so), and `--reader-font`
  lists the picked Latin font, then a Hebrew one, then a generic: the
  browser takes each letter from the first face that has it, so a mixed
  page needs nothing else. With Hebrew on Auto, a serif picks Frank Ruhl
  Libre and a sans picks Heebo; System leaves Hebrew to the phone.
  OpenDyslexic's licence reserves its name for unmodified files, so it
  ships as released (regular and bold, about 100 KB each, no subset)
  and italics are slanted by the browser. Themes are token sets like
  the first three and pass the same contrast test; Auto keeps a light
  and a dark pick in `carryon.themeAuto` (Paper and Night by default).
  Font, Hebrew and theme pickers scroll sideways in Aa so the sheet
  leaves the page visible while you change it.
- **Size and spacing are numbers (0.24.0).** `size` is px (14 to 32)
  and `spacing` a multiple of the size (1.20 to 2.20); old prefs, a
  step index and a word, are mapped on load (step 2 is 19 px, "normal"
  1.60), so nobody's page changes on update.
- **Comics are chosen, not guessed (0.23.2).** 0.22.0 looked for a
  column of four or more big pictures on every page and saved those as
  comics at full size. On real sites that fired on articles with photo
  galleries, so Daniel's saves came out as the wrong kind. Now `save()`
  takes `kind` ("article" by default, "comic" from Save with options),
  a comic never goes through the contents-page check (its chapter menu
  looks like one), and its image setting is whatever was picked (Full
  is preselected). With no clear column, a comic keeps every picture
  that could be a panel. Save next carries `kind` and `mode` from the
  page it follows.
- **Where filled-in chapters go (0.23.1).** With "Skip pages already
  saved" on, a new link's place comes from its neighbours in the list
  that are already in the folder: between them (an even share of the
  gap), just before the next one, or just after the last one; links with
  no neighbour in the folder go at the end as before. Before this, every
  new page went at the end, so filling in chapters 1 to 40 under 41 to
  60 put them after 60. "Sort by chapter" repairs folders saved that
  way, using `chapterNumber` (title first, then address); pages with no
  number keep their order, at the end.
- **A run is one card (0.23.0).** A run of saves into a folder (Save
  next 5 or more, Save several with two or more new links) has a `run`
  object: counts, the page in progress, paused and stopped. The library
  draws one card for it from start to end, keyed by the run, so pages
  coming and going don't move what's below; its pages' own cards stay
  hidden until it ends, failures included, which then show with Try
  again. Pause is checked before each next page, never mid-page, so a
  half-saved page is never left behind. Runs live in memory: closing
  the app ends them, as before.
- **Skip pages already saved (0.23.0).** On by default in Save several:
  saving a contents page again into the same folder should only fetch
  what's missing and leave the rest alone. Off, the old behaviour stays
  available: already-saved pages move into the folder at the list's
  place, which reorders a folder to match a contents page.
- **Storage opens in place (0.23.0).** Groups open and close in the
  Storage section rather than pushing a screen: one level of disclosure
  keeps Back simple, and the open groups are remembered until the app
  closes.
- **The bar token (0.23.0).** `--bar` is the reader's top bar, its foot
  and the status-bar strip: #EDE8DF on Paper, #E7DAC0 on Sepia (darker
  than the page) and #181C22 on Night (lighter, since darker than
  #0F1216 wouldn't show). Muted text on it is 5.6, 4.8 and 6.6 to 1.
- **How an image chapter is recognised (0.22.0).** After lazy pictures
  are resolved, the page's pictures that could be panels are kept: an
  http address, not a tracking pixel, at least 400 × 200 when the page
  says its size, and nothing in the address, class or alt that reads
  like page furniture (logo, avatar, icon, banner, ad, thumb, spinner…).
  Each is counted against its four nearest ancestors; the chosen box is
  the nearest one holding at least 80% of the fullest box's count, so an
  ad beside the column doesn't pull the choice out to the whole page. It
  needs four pictures and 60% of them, and less than 120 characters of
  text per picture, or the page is an illustrated article. Image chapters
  always save full size: a 480 px preview of a page of speech bubbles is
  unreadable. Script-drawn chapters with no pictures in their HTML are
  not covered yet unless the hidden-WebView drawing kicks in.
- **Referer is the page's origin (0.22.0).** Pictures are downloaded with
  `Referer: https://site/`, the origin as browsers send it across sites
  by default, not the full address. It is sent for every save, not only
  image chapters: many news and image hosts check it too.
- **A tap and a double tap on a panel (0.22.0).** A tap on text shows or
  hides the bar; on an image chapter the whole screen is pictures, so a
  single tap waits 280 ms for a second one: one tap is the bar, two open
  the viewer to zoom. Pinch zoom stays in the viewer, so the reader's
  iframe keeps its fixed scale.
- **The size warning (0.22.0).** Save next or previous 5, 10 or All
  averages the folder's three most recently saved pages; at 5 MB or more
  each it asks first, with the total for a number and the size each for
  All. One more never asks.
- **How a contents page is recognised (0.21.0).** Before Readability
  runs, the page's same-site links are grouped by the list, table or
  block they sit in, and the group with the most links that carry a
  chapter number ("Chapter 12", "Ch. 3.5", "פרק 4", "7. …", or
  /chapter-9 in the address) wins, if it has three and they are at least
  half the group. A page is a contents page when that list has five or
  more and more than 40% of its words are links (WebToEpub's scanner
  uses the same 40%); then nothing is saved and Save several opens with
  the list. Lists stay in the page's order, turned around when the
  numbers mostly go down (newest first); they are not sorted, since
  "1.01 … 1.10" numbering sorts wrong as numbers. A contents page with a
  long description saves as an article, so Save several has "Find
  chapters on this page" for one link. Not covered: contents split over
  several pages, or drawn by scripts; Save next and previous, All cover
  those.
- **A long run is one card (0.21.0).** More than three waiting saves for
  the same folder show as "N pages waiting to go into …" with Stop,
  instead of a card each; Stop drops the waiting ones and keeps what
  saved. Links already saved still move into the run's folder, as Save
  several always did.
- **Covers are the first picture or a drawn title card (0.21.0).** The
  title card is drawn on a canvas at 1200 × 1800 in the Paper colours
  and the bundled type, right to left for Hebrew, and saved as a JPEG in
  the book only. A folder's book also opens on a cover page; one page's
  book doesn't, since its first screen already shows the title.

- **What Carry-on takes from WebToEpub (0.20.0).** WebToEpub (the
  browser extension that packs web novels into EPUBs) was read before
  writing the EPUB export. It is GPLv3, so no code is copied: epub.js is
  written from the EPUB 3.3 spec, and only these ideas come from it.
  `mimetype` first and stored; both nav.xhtml and toc.ncx, since older
  readers and Kindle's conversion still read the NCX;
  `dcterms:modified` without milliseconds; the legacy `<meta
  name="cover">` (name before content, for Nook) beside the
  `cover-image` property; chapters built in an XHTML-namespaced document
  and serialised with XMLSerializer, then parsed back as XML to prove
  they're well-formed; numbered file names; no WebP (it warns that
  readers may not show it), so epub.js turns WebP into JPEG on a canvas.
  Where it differs: EPUB 3 always (WebToEpub defaults to EPUB 2), a
  `urn:uuid` identifier rather than the address, and no SVG cover page,
  since one article doesn't need a cover screen. epubcheck 5.4 passes
  English and Hebrew pages and a two-page book in the e2e run; it isn't
  in `node test/run-all.js`, which has no Java.
- **"Save all chapters" from a contents page: yes, for 0.21.0, as a
  list to check (0.20.0).** WebToEpub's generic finder takes every link
  on the page in order, with no host or container logic, and is usable
  only because the user filters it, picks a range and ticks boxes; its
  427 per-site parsers exist for contents split over several pages or
  drawn by scripts, and for finding the text. Carry-on already finds the
  text (Readability, and the hidden WebView for script-built pages), so
  it needs only the list: same-host links, the largest group of sibling
  links, sorted by chapter number, shown in Save several to check
  before saving. It won't follow a contents page split over several
  pages; Save next and Save previous, All cover those series instead.
- **Saving runs one page at a time, half a second apart (0.20.0).**
  "All" could mean hundreds of chapters, so pages come in one after
  another with a 500 ms pause (what WebToEpub uses), and Stop ends the
  run after the page being saved. Previous pages get `folderAt` just
  below the first page's, so they go in front without renumbering the
  folder. Pages saved before 0.20.0 never looked for a previous link
  (`prev` is missing, not ""), so a folder reads its first page's from
  the original once, quietly, when it opens.
- **PDF goes through the phone's print screen, not a PDF writer
  (0.20.0).** Android's WebView ignores `window.print()`, so
  native/share has a Print plugin on both platforms (PrintManager with a
  WebView's print adapter; UIPrintInteractionController with a
  WKWebView's print formatter on iOS). The page goes in as the same
  one-file HTML as Send, pictures inlined, laid out in a WebView of its
  own with JavaScript and the network off and a CSP that allows only
  `data:` images. The web copy prints it from a frame sandboxed without
  scripts. Neither plugin can be tried off a phone.
- **The folder's tools moved to the top (0.20.0).** Daniel asked for
  them at the top, where a long folder doesn't hide them. They are the page
  sheet's tiles, so a folder and a page look alike; Save previous sits
  above the list and Save next below it, where those pages will go.

- **The UI rework follows sketches Daniel picked (0.19.0).** The design
  canvas has the 0.19.0 rows: library A (sections) over B (tabs), the
  grouped ⋯ and the Settings menu. Daniel's AI design guide was checked
  against them: its Apple HIG, spring motion, 8-point spacing and WCAG
  AA rules were already DESIGN.md's; its React, Tailwind, shadcn and
  Framer Motion defaults don't apply under the no-build rule.
- **Picking several is a history entry, and so is the library's sheet
  (0.19.0).** Back leaves picking, and a sheet over picking is its own
  entry with `select: true`, so back from Tags lands on picking, not the
  library. Picks are painted onto the cards already there (`paintPicks`)
  instead of re-rendering, so focus stays on the card that was tapped.
  Going forward in history onto a sheet steps back off it, as the image
  viewer does, since its contents can't be rebuilt from the entry.
- **A long press is our own timer, plus `contextmenu` (0.19.0).**
  Android's WebView fires `contextmenu` on a long press, iOS's doesn't,
  and a mouse fires it on right-click. A 480 ms timer that a 10 px move
  cancels covers touch everywhere; whichever of the two comes first
  opens the menu and the click that follows is swallowed. Cards can't be
  text-selected or called out, so the press doesn't select the title.
- **"Last read" needs `readAt` (0.19.0).** Opening a page stamps
  `readAt`, which Continue reading, the "Last read" order and the
  folders' order use. Pages read before 0.19.0 don't have it, so they
  sort by when they were saved until they're opened again. Backups keep
  it.
- **Tapping the page toggles the bar, scrolling still moves it (0.19.0).**
  A tap on text (not a link, an image or a selection) hides or shows the
  bar; scrolling down still hides it and up brings it back. Jumping to a
  heading counts as scrolling down, so the bar is away after a jump.
- **On a desktop, Settings' section sits beside its menu (0.19.0).** At
  900 px and wider the section screen starts 360 px in and the menu stays
  usable; picking another entry swaps the section in place (one history
  entry) instead of pushing another.

- **The core works on a phone (2 Oct 2026).** Daniel saved Wikipedia
  and ynet on the Android build and shared pages into the app from
  Chrome, so the on-device fetch (CapacitorHttp, Readability,
  `Filesystem.downloadFile`) and the share target are proven. Pages that
  build themselves with JavaScript still fail; that's its own TODO item.

- **A backup is a plain zip (0.18.0).** It holds `carry-on.json`
  (format 1, the app version, the date), `library.json`, and every
  `pages/<id>/` directory as it is on disk. Entries are stored, not
  compressed, since pictures are already compressed and stored entries
  are simpler to write and read. The writer streams to the app's cache
  with `Filesystem.appendFile` about 1 MB at a time, and restore reads the
  picked file through `Blob.slice` from its central directory. So a
  library of hundreds of megabytes is never held in memory or sent across
  the bridge whole. A zip re-made with a computer's own tool (deflated)
  still restores where `DecompressionStream` exists. Sync (0.28.0)
  reuses this format.
- **Restore never trusts the file (0.18.0).** Index entries go through
  `backup.cleanMeta`, which keeps only the fields Carry-on writes, with
  their types. Page ids must look like ours, file names must be
  page.html, text.txt or `images/<name>`, and meta.json is rewritten from
  the cleaned entry. A page already in the library is replaced only by a
  copy saved later (`savedAt`), and the old directory is deleted first,
  so a reused id can't lose the new files.
- **A sent page is HTML with its entry in a `<meta>` (0.18.0).** It opens
  in any browser, which is the point of sending it. Back in Carry-on,
  only that `<meta>` and the article body are read, and the body goes
  through `save.cleanSaved`: the fetch allowlist plus Carry-on's own
  `co-` classes and image attributes. Pictures must be `data:` PNG, JPEG,
  GIF or WebP (no SVG) or https. The header and licence line are written
  again from the entry, not taken from the file.
- **Import uses a plain file input (0.18.0).** Capacitor's WebView
  answers `<input type="file">` with the system picker on Android and iOS,
  so no plugin is needed. It has no `accept`, because Android filters by
  MIME type and phones disagree about a zip's type.
- **PDF moved to the EPUB release (0.18.0).** It needs native print calls on both
  platforms that can only be tested on the phones (TODO.md, 0.20.0).

- **Previews are redrawn on the phone (0.17.0).** Sites other than
  Wikipedia often serve one huge image with no smaller size. After it
  downloads, `store.shrink` draws it on a canvas at 480 px and keeps the
  result only if it's smaller. That's JPEG at 0.82, or PNG when any pixel
  is see-through, since JPEG would put a black box behind a logo. Only
  images wider than 600 px are redrawn, so Wikimedia's 500 px thumbnails
  aren't encoded twice. GIFs (they may be animated) and SVGs are left
  alone. The file is read through Capacitor's file server, which is the
  app's own origin, so the canvas isn't tainted. One image is drawn at a
  time, so four big photos are never decoded at once.
- **Commons credits come from the page's own wiki (0.17.0).** One
  `action=query&prop=imageinfo&iiprop=extmetadata` call per 50 files, on
  the article's wiki, which also knows files hosted locally rather than
  on Commons. Images under 100 px wide (flags, icons) are skipped. If the
  call fails, the page saves without credits, never with an error.
  Credits are kept out of text.txt, so a search for a photographer
  doesn't match every page with their photo.
- **"Save full images" keeps the card's preview (0.17.0).** It replaces
  every other preview it upgrades, so the library doesn't decode a
  1280 px image for a 64 px thumbnail. A page saved with full images is
  never swapped to the online copy, which is the same file.
- **Old pages learn their next link on first use (0.17.0).** A page
  saved before 0.10.0 has no `next` at all, while a newer page with none
  has `""`. So `follow()` reads the original once when `next` is
  undefined and records what it finds, `""` included, so it never asks
  again.

- **Search keeps each page's words in text.txt (0.16.0).** Saving
  writes `pages/<id>/text.txt` (IndexedDB key `<id>:text` in a browser)
  beside page.html: the article only, a line per block (`save.plainText`).
  The library reads them all into memory the first time a search needs
  text, so later searches don't touch the disk; a page saved before
  0.16.0 is read from its page.html once and gets its text.txt then.
  Titles, sites, tags and folders match on every keystroke; the text
  after 300 ms still. Matching folds both sides: NFKD, then every
  combining mark dropped (niqqud, harakat, Latin accents) plus the
  Arabic tatweel, then lower case; every word typed must be present,
  in any order. A search lists pages, not folder cards, and a text
  match shows its sentence (cut to about 150 characters around the
  first word). No index structure: a few hundred pages of text is a
  few megabytes, and `includes` over that is instant.

- **Reordering hands out the folder's own places (0.15.0).** A move
  takes the folder's `folderAt` values in order, nudges any equal ones
  apart by a millisecond, swaps the two pages and gives the places back
  in the new order, so no other page moves and no folders file is
  needed. Up and down buttons rather than drag: 44 px targets that work
  with a screen reader, a keyboard and reduced motion without extra
  work; they only show in Reorder mode, so a folder of fifty chapters
  isn't a column of arrows. Focus stays on the moved page's button.
  Removing a folder only clears `folder` and `folderAt`; deleting it
  removes each page directory, then writes the index once. Save several
  over a folder keeps the folder in its history entry (`{view:
  "batch", folder}`) so back returns to the folder screen.
  `replaceChildren` turns a null into the text "null", unlike `el()`;
  `fill()` drops them (a stray "null" had shown in ⋯ since 0.8.0).

- **The image viewer lives in the app, not the page (0.14.0).** The
  saved page can't run scripts, so reader.js catches the tap on an
  `<img>` (as it does links) and hands the app its on-screen rect, its
  current source, its `data-full` (https only) and its caption; the
  viewer is an overlay in the app's own document. Its own history entry
  (`image: true` on the reader's state) means Android's back closes it.
  Zoom is done by hand with pointer events (two pointers pinch, one pans
  when zoomed, else drags to dismiss past 120 px or a fast flick), the
  wheel on desktop, and a double tap toggles 2.5×; panning is clamped so
  the image always covers the stage. Opening animates the image from its
  rect in the page (a FLIP with the sheet spring); reduced motion fades.
  An image already swapped to its full version in the page is shown as
  is, so offline it comes from the WebView's cache.

- **Glossary (0.14.0).** One word per thing, in the code, the interface
  and these docs:
  - **Saved page:** a page kept on the phone; its **index entry** is its
    line in `library.json` (title, url, tags, folder, place read).
  - **Page directory:** `pages/<id>/` on disk, holding `page.html`,
    `meta.json` and `images/` (`store.pageDirUrl`). Never "folder".
  - **Folder:** an ordered collection of saved pages, one per page at
    most (`folder`, `folderAt` on the index entry). **Tag:** a label, any
    number per page.
  - **Preview:** the small copy of an image kept on disk; **full image:**
    the original, loaded from its link when online.
  - **Saving** a page: fetch (or **draw**, for script-built pages),
    **rebuild** it from the allowlist (`save.rebuild`), **save its images**
    (`saveImages`), write the **saved page HTML** (`savedPageHtml`).
  - **Library:** the list of saved pages. **Screens** are pushed over it
    and popped (`pushScreen`, `popScreen`); **sheets** rise from the
    bottom of the reader.
  - **Shared:** a link sent from another app's share sheet, saved
    straight away (`saveShared`).

- **The reader bar floats; the page makes room for it (0.13.0).** The
  bar is absolutely placed over the iframe, which now fills the screen,
  and reader.js sets `--co-top` (the bar's height) on the page, which
  reader.css adds to the body's top padding and to `scroll-padding-top`.
  Shrinking the iframe instead would reflow the page on every hide.
  Scrolling reports twice: `onScroll` every frame (the progress line and
  the bar), `onPosition` after 150 ms still (the saved place, as
  before). The bar hides after 12 px down past its own height and comes
  back after 12 px up, at the end (≥ 99.9%), and whenever a sheet opens.
  On a phone a strip the colour of the page stays over the status bar.
  Reduced motion: the global 1 ms rule makes it appear and disappear
  without sliding.

- **Script-built pages are drawn in a hidden WebView (0.12.0).** When
  Readability finds under 250 characters, or the title is a browser
  check, save.js asks native/share's PageRender plugin to draw the page:
  a second WebView behind the app's own (alpha 0, so it never takes a
  touch), scripts and DOM storage on, images off, no Capacitor bridge, no
  JavaScript interfaces, no file access, http(s) navigation only. It
  waits for the body text to reach 500 characters and hold still for two
  polls 0.7 s apart, or 20 s, then hands back `outerHTML`, which goes
  through the same Readability and cleaning as any page, so the saved
  copy keeps no scripts. It runs only after a plain fetch fails, because
  drawing costs seconds and data the fetch doesn't. Not on iOS: there
  the Safari share extension's preprocessing file is the planned route.
  The e2e test mocks the plugin; the Java has only run on Daniel's phone.

- **Updates live in Settings; the bar only points there (0.11.0).** One
  `upd` state (phase, latest, notes, progress, the downloaded APK) drives
  both Settings' Updates section and the library's bar, so a download
  started in Settings shows in the bar too. The release's notes are its
  CHANGELOG.md section (the workflow writes them), so "What's in 0.12.0"
  needs no second source. What's new reads the bundled CHANGELOG.md
  (now in sw.js's ASSETS, so it's in the app and the offline web copy)
  with a small parser: `## [x] - date`, `### Kind`, `- item` with
  indented lines joined. "Updated to x" shows once, keyed on
  `carryon.seenVersion`; an install that predates the key but has pages
  counts as an update.

- **Next links are found at save time (0.10.0).** save.js reads the
  page's next link before Readability strips navigation: `rel="next"`
  first, then a link whose words are a "next" phrase in a few languages
  (`isNextText`), always on the same host and never the page itself, so a
  sponsor's "Next" doesn't count. Stored as `next` in the index. Following
  saves one page at a time and reads each new page's `next`, stopping at
  a page with none, one already seen, or a failure. Pages saved earlier
  have no `next`.

- **Saving progress shows it's alive (0.10.0).** The page download has no
  size to measure, so the bar sweeps (indeterminate) until the text is in,
  then counts a tenth for the text and the rest by images. The status
  adds the seconds after five, ticking each second. Under reduced motion
  the spinner and bar breathe (opacity) instead of moving.

- **Saving several runs one page at a time (0.9.0).** In order, so a
  folder's pages get rising `folderAt` and the folder reads in the order
  of the links, and so a phone on a weak connection isn't fetching ten
  pages and their images at once. A paste goes through a text field,
  which drops line breaks, so links are also split where the next
  `https://` starts. Two or more links open the Save several screen; one
  link saves straight away as before.

- **Folders are a name on the page, not a record of their own (0.8.0).**
  Each index entry may carry `folder` (its name) and `folderAt` (when it
  joined); a folder's order is `folderAt`, falling back to `savedAt`, so
  batch saving will order chapters just by saving them in turn. No
  separate folders file means nothing to keep in step: a folder exists
  while a page names it. Names match ignoring case, like tags. (Until
  0.14.0 store.js also said "folder" for a page's directory on disk.) Next and previous replace the
  reader's history entry rather than pushing one, so back leaves for the
  folder however many chapters were read. The "Next in …" link is added
  by reader.js after the page loads and only that element is honoured,
  so a saved page can't fake one.

- **Tags and filters (0.7.0).** Tags live in the library index as
  `tags` (an array of strings) on each entry, so filtering never opens a
  page's folder. Matching is case-insensitive, and a new tag takes the
  spelling of one already in use. The filter is a single value
  (`carryon.filter`: all, unread, finished or `#tag`); a tag filter whose
  last page loses the tag falls back to All. "Unread" means never scrolled
  past the first 2%, the same line the card uses for "min left". The Aa
  and ⋯ sheets share one element and one history entry: tapping the other
  button swaps the sheet in place, so back still leaves in one step, and
  the reader bar sits above the sheet's tap-catcher so its buttons work
  while a sheet is up.

- **A library card is a div with a stretched button (0.6.0).** Retry has
  to sit on the card, and a button can't hold another, so `.card-open`
  is an empty button covering the card (labelled with the title) and
  Retry is raised above it. Missing images now keep the preview address
  they failed on (`data-preview`); pages saved earlier retry with the full
  image's, narrowed to 500 px when it's Wikimedia's.

- **Reading position lives in the library index (0.5.0).** Each entry
  gets `at` (0 to 1, how far down the page) and `finished` (read to the
  end once, sticky). A fraction, not pixels, so a change of text size or
  phone still lands near the same place. Written 1.5 s after scrolling
  stops and when the reader closes, so a page isn't rewritten on every
  scroll. A card whose line changes is rebuilt in place rather than
  re-animated.

- **Direction falls back to the letters (0.4.0).** `textDir` in
  src/save.js takes `dir="rtl"` on <html> or <body>, then a right-to-left
  `lang`, then counts Hebrew and Arabic letters against Latin and Cyrillic
  in the article's text. ynet's markup carries no direction, so 0.3.1
  saved it left to right. The reader runs the same check on a page with no
  `dir`, which covers pages saved before.

- **Reading settings are tokens too (0.4.0).** Text size, spacing and font
  are `--reader-fs`, `--reader-lh` and `--reader-font` on the app's :root,
  copied into the sandboxed page with the theme's colours, so the reader
  needs no script of its own. Sizes are 16, 18, 19, 21, 24 px (19 is the
  design's body size, so the default stays put); line height is the size
  times 1.4, 1.58 or 1.8. The Aa sheet is a history entry, so Android's
  back closes it before the page, and it has no scrim so each change shows
  on the text as it's made. One builder makes the controls for the sheet
  and for Settings.

- **Page requests carry the WebView's browser string (0.3.1).** The app
  name alone as User-Agent made some sites (ynet) never answer, and with no
  deadline on native requests a save sat on "Saving" for good. Now the
  User-Agent is the WebView's own plus "Carry-on (…)", which still names
  the app as Wikipedia asks, and every fetch and download has a deadline
  (`deadline()` in src/platform.js) on top of the native timeouts, which
  not every plugin version honours.
- **Failed saves stay as cards (0.3.1).** A toast is gone before anyone
  looks back at the phone, which read as "nothing happened". The failed
  card keeps the reason until Try again or Remove; it isn't stored, so it
  goes on restart.

- **Sharing into the app is a small local plugin (0.3.0).** native/share
  follows LifeLog's native/widgets: a Capacitor plugin in this repo,
  installed with a `file:` dependency, so `cap sync` picks it up with no
  generated project to edit. tools/android-manifest.js adds the SEND
  `text/plain` intent filter to MainActivity in CI. The plugin keeps one
  pending share, from the launch intent or `onNewIntent`, until the app
  asks with `take()`, so a share that arrives before the library has
  loaded isn't lost; it then clears the intent so a rotation doesn't
  save it twice.
- **Springs are pre-sampled `linear()` curves (0.3.0).** No animation
  library, per "no dependencies": src/motion.js holds DESIGN.md's two
  springs sampled into CSS `linear()` and runs them with the Web
  Animations API, with a cubic-bezier for WebViews without `linear()`.
  Under prefers-reduced-motion every animation is a 120 ms fade. Screens
  are a history stack (`{view: "reader"}`, `{view: "settings"}`) so
  Android's back button pops them; the library under a screen is
  `inert`, not hidden, so it can drift back as the screen leaves.
- **Settings are built from data (0.3.0).** `SETTINGS` in src/app.js
  lists each group and its options; adding a later setting (reading
  font, text size) is an entry there, not new markup.
- **"System" is the default theme (0.3.0).** Paper by day and Night by
  night, following the phone, until a theme is picked. Reading at night
  on a plane is the main case, and a white page is the worst thing to
  open there.

- **The app updates itself, as LifeLog does (0.2.0).** On launch the app
  asks GitHub for the latest `app-v*` release; if it's newer, "Update"
  downloads that tag's CarryOn.apk into the cache with
  `Filesystem.downloadFile` and opens Android's installer through
  capawesome's FileOpener. The manifest needs `REQUEST_INSTALL_PACKAGES`
  (tools/android-manifest.js) or Android refuses the hand-off. It only
  installs over a build signed with the same key, which is why the
  workflow publishes nothing without the `carryon` keystore. LifeLog's
  NOTES.md (0.179.0) has the history, including why downloadFile is used
  despite being deprecated.

- **The reader's iframe keeps allow-same-origin (0.2.0).** Without
  `allow-scripts` nothing in the page can run, so same-origin only lets
  src/reader.js reach in: copy the theme tokens onto it, catch taps on
  links (an in-page `#ref` scrolls, anything else opens in the phone's
  browser via AppLauncher; a link must never navigate the iframe), and
  swap previews for full images. The page's own CSP is `default-src
  'none'` plus images, the app's stylesheets and fonts. The two are only
  dangerous together; test/save.test.js fails if `allow-scripts` appears.
- **Cleaning is an allowlist that rebuilds the page (0.2.0).** src/save.js
  never copies the fetched DOM: it creates each kept element afresh with
  only the attributes named in `ATTRS`, so an `on*` handler, `style`,
  `srcdoc` or a `javascript:` link can't come through by being forgotten.
  `style` goes entirely (along with anything it hid), which is why
  Wikipedia infoboxes lose their colours.
- **Wikimedia thumbnails at 500 and 1280 px, not 480 (0.2.0).** Wikimedia
  pre-renders and caches a fixed set of widths and rate-limits tools that
  ask for others, so the preview is the 500 px step and the full image the
  1280 px step, capped at the file's own width.
- **Page titles prefer og:title or the page's one h1 (0.2.0).**
  Readability keeps "Headline | Site" for short headlines.
- **Saved pages in a browser go to IndexedDB, images stay links (0.2.0).**
  The web copy can save Wikipedia (its API allows CORS) but has no folder
  for images; its cards say "Text offline · images online".

- **Started from LifeLog (0.1.0).** The build tooling (tools/build-www.js,
  android-version.js, sign-apk.sh, ios-project.js and both workflows) and
  `src/platform.js`'s app-vs-browser handling come from
  danielnoam/lifelog at 0.227.0, trimmed of LifeLog-only parts (widgets,
  QR scanner, phone backup). Its NOTES.md has the history
  behind each of them; search there before "fixing" something that looks
  arbitrary in those files.
- **No server for the phone app (0.1.0).** `CarryOn.platform.fetchText`
  uses CapacitorHttp in the app, which is native networking and not
  subject to CORS; LifeLog proved this in its 0.215.0. In a browser it
  falls back to `fetch`, which CORS blocks for most sites: the web copy
  can read saved pages but can't save new ones until a worker or an
  extension exists. See docs/PROPOSAL.md.
- **CapacitorHttp is called directly, not via the global fetch patch
  (0.1.0).** `CapacitorHttp.enabled` in capacitor.config.json would move
  every fetch in the app, including loading its own files, onto the native
  stack. LifeLog made the same call for the same reason.
- **Images are previews plus links (0.1.0).** Daniel's choice, matching
  how videos are handled: a ~480 px preview on disk, the full image's URL
  kept. Links-only was considered and set aside as the default because on
  a plane a map or diagram becomes an empty box; it stays as a setting.
- **Fonts are bundled, Latin subset (0.1.0).** Source Serif 4 and
  Instrument Sans from Google Fonts, OFL. Other scripts fall back to the
  system font through unicode-range, so Hebrew or Arabic pages still read
  well without shipping megabytes of glyphs. Hebrew got its own bundled
  faces in 0.24.0.
- **Readability is vendored at 0.6.0 (0.1.0).** One file, Apache-2.0, the
  same parser Firefox Reader View uses. Vendored rather than installed to
  keep the no-build rule.
