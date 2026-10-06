# Notes

Why things are the way they are, newest first. Each entry starts with a
bold title and its version so a search finds it.

- **Where your library is (0.33.0).** Three places, Daniel's call: inside
  the app (default; private, quickest, gone on uninstall), Documents/
  Carry-on (Android 11+, plain files through Capacitor's Filesystem with
  directory DOCUMENTS; no permission needed from 11 for files the app
  makes), and a folder you pick (Android's folder access, so no file
  paths: the Files plugin writes through DocumentsContract, and the
  WebView reads it at `/_carryon_folder_/`, answered by a
  BridgeWebViewClient the plugin sets in `load()`, which keeps
  page-relative `images/3.jpg` working as the reader's <base>). store.js
  has one backend per place and every read and write goes through it.
  Moving copies every file, writes the joined index, reads it back, and
  only then switches and clears the old place; a library already in the
  new place is joined, never replaced. A place that can't be reached
  reads as an empty library, so sync refuses to run then (an empty
  library sent up would look like every clip deleted). On iOS Capacitor's
  DATA is already Documents, so the plist keys show it in Files instead.
- **Every file asks (0.32.2).** 0.32.0 asked only where reading from the
  file saved space (pictures). Daniel's rule is about where a file lives,
  not its size: anything you bring in is either a clip (copy, syncs) or a
  file (Files, this device). So every kind asks; for text the words are
  kept either way. Every way in tries for lasting access: the system
  picker, `getAsFileSystemHandle` on a drop (asked for inside the drop
  event, or it's gone), and `takePersistableUriPermission` on a file
  opened or shared with Carry-on (works when the sender granted it). With
  none, the second row is shown disabled rather than hidden, so the
  choice never silently disappears.
- **A PDF read from where it is, and drawn for print (0.32.1).** 0.32.0
  asked "copy or read from where it is" for a PDF and then copied anyway,
  on the reasoning that once its words are out there's nothing to come
  back for. That broke the promise of the question: the PDF landed in
  Clips, synced, and its delete said it would leave the phone. Now a PDF
  with words keeps those words (they're what search and read aloud need,
  and they're small) and the link; a scan keeps slots (`page:N`) and
  draws its pages from the file each time it's opened. Pages are drawn
  with pdf.js's `intent: "print"`: the screen intent waits on
  requestAnimationFrame, which Chromium never runs in a frame kept out of
  sight, so in 0.32.0 a scanned PDF hung on its first page.
- **pdf.js in a frame with no origin (0.32.0).** A PDF is read by
  Mozilla's pdf.js (vendored, Apache 2.0, like Readability), but never in
  the app's own page: a script in a PDF could otherwise reach the
  Capacitor plugins and every saved clip. It runs in an iframe with
  `sandbox="allow-scripts"` and no `allow-same-origin`, so it has an
  opaque origin, behind a CSP that allows nothing but blob: and inline.
  An opaque origin sends `Origin: null`, and a module or a worker won't
  load across origins, so the app passes the library's **text** in by
  postMessage and the frame makes blob: URLs of its own for pdf.js and
  its worker. `isEvalSupported: false`, scripting and XFA off. What comes
  back is words, not a viewer: lines are grouped by their place on the
  page into paragraphs, broken words rejoined, running heads and page
  numbers dropped, bigger type read as a heading. Under about 40 letters
  a page it's a scan, and the pages come back drawn as JPEGs instead.
- **A copy, or reading from the file where it is (0.32.0).** Daniel,
  6 Oct 2026. A copy is an ordinary clip: pictures beside it, no second
  copy of the file (0.31.0 kept one, which doubled a comic). Reading from
  the file keeps no pictures at all: each one is a slot (`data-in`, its
  place inside the file) filled from the file when the clip opens, so a
  400 MB comic costs a thumbnail. That needs a permission that outlives
  the app, which only the system's own picker grants
  (`takePersistableUriPermission`, or a stored handle in Chrome on a
  computer); what the WebView's `<input type="file">` hands over is
  readable once, so Open with and Share can only ever copy. It only saves
  anything where the pictures are the file, so the question is asked for
  a comic, a book or a PDF and nothing else. A PDF is read once into
  words or pages, so there's nothing in the file to come back for: a PDF
  is always a copy. The permission (`link` on the entry) is this device's
  own, so it never syncs and a linked clip stays where it was opened.
- **A file of your own is a clip, its original kept beside it (0.31.0, in
  part undone by 0.32.0).**
  An EPUB, Markdown, text or HTML file is rebuilt through the same
  allowlist as a saved page (`save.cleanSaved`) and read in the same
  sandboxed reader, so it gets the themes, type, pages mode, read aloud,
  search and contents with no second reader. The book's own CSS is
  dropped for that reason, and its scripts never reach the page. Each
  chapter is a `<section id="cN">`, its ids prefixed `cN-`, so links
  between chapters and footnotes become jumps within the clip. A CBZ is
  a `.co-comic` page, its pictures in natural name order (2 before 10).
  The file itself goes beside the clip as `original.<ext>`, written a
  megabyte at a time (an IndexedDB Blob in a browser): Share sends it on,
  a backup carries it, and the storage setting (0.32) will move it. The
  entry has `url: ""` and `file: { name, kind, ext, size }`; name and
  size say whether a file is already in. Book pictures wait behind
  stand-in `data:` addresses while the page is cleaned, so a book's
  pictures are never held as base64 text. Sync leaves files out until
  their size limits are settled (TODO, Files).
- **What sync leaves per device (0.30.10).** Daniel, 6 Oct 2026:
  settings stay on each device (a phone and a tablet want different type
  and themes), and nothing syncs while the app is closed. When Feeds was
  last looked at does sync (`feedsSeen` in library.json, the latest wins),
  and it only changes when there was something new to clear, so an open
  river doesn't write to GitHub on every sync. New-chapter counts aren't
  synced: each device checks for itself, and the count already drops
  chapters saved anywhere once sync brings them in.
- **A favourite collection is a mark on its clips (0.30.9).** There is no
  collections file: a collection is the clips whose `folder` names it.
  So its favourite is `folderFav` (and `folderFavAt`) on each of its
  clips, and any one carrying it makes the collection a favourite. That
  way it follows a rename, and goes through backup and sync, merged field
  by field, with no new file. A clip moving into a collection takes that
  collection's mark, or loses its own. Favourites in the library shows the
  favourite collections, then every favourite clip, in a collection or
  not; the sidebar lists favourite collections first.
- **Why the fades didn't fade, and the lag on Collections (0.30.8).**
  A spring's curve is 90% of the way there in its first fifth, and the
  fades rode the same curve as the movement, so opacity went from 0 to 1
  in two or three frames. Fades now run as their own animation with a
  plain ease (`run()` in motion.js takes a fade beside the frames).
  Collections and Clips used a view transition, which holds the screen
  still while it takes its pictures (140–270 ms on a 4x slower CPU), then
  animates the groups' size on the main thread; the whole new list also
  gave each card its own arrive animation, 250 at once. Now the library
  fades through (out 90 ms, redraw while it is blank, in 210 ms) and only
  a handful of fresh cards animate. `inert` on the library, which
  restyles every card, waits 300 ms (`afterSettle`) instead of the first
  frame, which put a 50–60 ms stall right at the start of the sidebar.
- **Why animations stuttered (0.30.4).** Not the animations: the work
  before them. Opening anything set `inert` on the screen underneath and
  moved focus, and in a library of a few hundred pages each restyled
  every card, 100 to 170 ms at a phone's speed, before the first frame;
  Back redrew the whole library first. Now the animation starts, then
  that work runs (`afterStart`, or once it ends), library cards off
  screen skip style and layout (`content-visibility: auto`), and screens,
  sheets and the sidebar carry `will-change: transform` so they aren't
  promoted to layers and flattened back around each move. The zoom from
  a card dropped its clip-path, which Chrome can't run on the GPU, and the
  library no longer drifts under a pushed screen (it is the page itself,
  so moving it repainted it). e2e/perf.js times tap to first frame on a
  4x slower CPU.
- **Sync pause (0.30.4).** Pause is kept in the sync config and checked
  between pages: what was sent or brought in stays, pages not brought in
  yet stay waiting. The downloads notification carries a running sync, so
  Android's data-sync service keeps it going in the background.
- **Sync, links only (0.30.3).** A device set to Links only sends no page
  text and reads none: pages new to it come back as `fromLinks` from
  sync.run and are saved again from their URLs, under the library's id
  and savedAt, so the next sync sees the same page and not a new one. A
  device with Pages too also saves from the link any page GitHub has no
  text for (it came from a links-only device), then sends that text up
  itself. In a browser only Wikipedia can be fetched, so other pages wait
  there. The setting is per device, kept in the sync config, since one
  device might be short of space and another not.
- **Growing out of the card (0.30.3).** The tap's card is remembered
  from a capture-phase click on `.card-open`, for a second and a half
  (opening a page reads its file first); pushScreen then zooms instead of
  sliding, and popScreen shrinks back to the same rectangle. A uniform
  scale keeps the text undistorted; clip-path crops the screen to the
  card's height while it's small.
- **Pictures never downloaded on Android (0.30.2).** @capacitor/filesystem
  8's Android downloadFile (LegacyFilesystemImplementation) opens a
  FileOutputStream on the path and ignores `recursive`, so a download into
  a folder that doesn't exist fails with ENOENT. A new page's
  pages/<id>/images/ never exists when its pictures download, so every
  picture of every page failed and was kept as a link, which the reader
  shows online; it looked like it worked. platform.downloadTo now makes
  the folder first (FS.mkdir, recursive). e2e/dirs.js mocks the failure.
  Pages saved before 0.30.2 fetch their missing pictures once
  (carryon.picturesHealed). The e2e mocks never caught it because their
  downloadFile wrote anywhere.
- **Sync setup and feeds (0.30.1).** Step 2 links to GitHub's
  fine-grained token form filled in by URL (name, description,
  expires_in=none, contents=write, administration=write; documented
  since Aug 2025). Which repos it covers can't be filled in, so the step
  says to pick All repositories; Administration is what lets Carry-on
  make carryon-data. No expiry because a token that runs out in 30 days
  stops sync without anyone noticing. Another device joins with
  LifeLog's setup link, the web copy's address plus `#t=<token>` (a
  browser never sends the part after # to a server), shown as a QR code
  drawn by src/qr.js (LifeLog's encoder, so the token never goes to a
  QR service). A phone camera opens the link in the browser, which turns
  sync on in the web copy; the app reads the code with
  @capacitor-mlkit/barcode-scanning (Google's scanner on Android, so no
  camera permission; iOS needs NSCameraUsageDescription and iOS 15.5).
  The token field also takes the whole link. Feeds sync as settings
  only (url, title, link, icon, mode, images, folder, days, addedAt) in
  library.json's `feeds`, merged by address against the base like
  pages; an unfollow is a tombstone in `feedsGone`, and following again
  later (a newer addedAt) lifts it. Posts never go: each device checks
  its feeds itself. A device on 0.30.0 sends no feeds and leaves them
  as they are.
- **Sync (0.30.0).** src/sync.js, after LifeLog's src/storage.js, which
  Daniel says works well. A private repo `carryon-data` holds
  library.json ({ pages, deleted, files }) and pages/<id>.html. Each sync
  reads library.json, merges three ways against the last library this
  device wrote or read (the base, in localStorage), sends any page text
  GitHub lacks, writes library.json with its sha, and on a 409 merges
  again with what the other device wrote (LifeLog's 0.180.0 lesson:
  never write over a stale sha). Field rules: content fields go with the
  copy saved last, reading (at, finished, readAt) with the copy read
  last, tags merge as sets, anything else takes the side that changed.
  One address saved on two devices becomes one page. Deletions are
  tombstones kept 90 days, so a device joining later doesn't bring a page
  back. Pictures never go up (Daniel, 5 Oct 2026): outgoing HTML has its
  local pictures marked missing, keeping data-full/data-preview, and the
  other device fetches them with retryMissing in its page's mode. A
  video's picture now keeps its address in data-thumb for this. Pictures
  that can't be fetched again (a Tapas panel's signed link lasts an hour)
  stay missing there. Two traps found in testing: the sync must settle
  its result without awaiting anything, or a change made meanwhile is
  written over; and the app must update its page objects in place,
  because the open page, an open menu and the position timer hold them.
  Synced HTML isn't re-cleaned: it's the user's own repo, written by the
  app, and the reader's sandbox is the guard either way.
- **Favourites (0.29.2).** A mark on the page (`fav`, with `favAt` for
  the widget's order) in library.json, kept by backups and by saving a
  page again. Pages only: a collection isn't stored anywhere of its own
  (it exists while a page names it), so a favourite collection would need
  a file for collections first. The Favourites widget shows the four
  favourited last; its header opens the library showing Favourites.
- **WEBTOON, Tapas and Wattpad (0.29.1).** Built from pages Daniel saved
  from each site, since this environment can't reach them. WEBTOON:
  `comic(url)` says its /viewer pages are comics, so they save as comics
  (full pictures) whatever was picked; the list page shows ten episodes a
  page and is read with `&page=N` until nothing new. Tapas keeps comics
  and novels at the same /episode/ addresses, so `comic(url, html)` looks
  at the fetched page (og:type `comicpanda:webcomic_episode`); next and
  previous come from the episode's data-next-id/data-prev-id. Its series
  page shows twenty episodes and the rest come from
  `/series/<id>/episodes?page=N&sort=OLDEST` as JSON with the list's HTML
  in data.body; that address is from how Tapas's own page loads more and
  isn't checked against the live site, so if it fails the twenty are
  kept. The page's own series id is in its tracking data
  (data-tiara-page-meta-id), skipping the recommended series beside it.
  Wattpad sends a chapter's first page only; the new `prepare(html, url)`
  hook fetches the rest from the part's text_url before the page is read.
- **Quicker page turns (0.29.1).** The WebView's smooth scroll took most
  of a second for a screen's width, and a second tap during it read the
  half-scrolled position. A turn is now a 220 ms ease-out on
  requestAnimationFrame, and while it runs `page()` is the page it is
  going to, so taps add up.
- **One-row Keep reading (0.29.1).** On Android 12 and later the widget
  hands the launcher a layout per size (RemoteViews from a SizeF map);
  before that it picks from the height it was given, on every resize.
- **Back opens the sidebar (0.29.0).** Daniel meant the phone's own Back
  gesture, not a swipe inside the app. With @capacitor/app's backButton
  listener the app decides: history to step back through goes back as
  before; at the top of the library or Feeds Back opens the sidebar, and
  Back with the sidebar opened that way puts the app away, so Back still
  leaves the app. Android can't tell which edge Back came from. The
  0.28.2 swipe from anywhere went: it fought reading sideways rows and
  the system gesture. iOS and browsers have no Back to use, so a swipe
  from the left 24 px opens it there.

- **Pages (0.29.0).** The reader's page gets CSS columns, one a screen
  wide: the column is as wide as the reading measure allows, centred,
  and the gap is twice the side margin, so a column and its gap are
  exactly one screen and page n is scrollX = n × width. The frame's
  root has overflow hidden, so only src/reader.js moves it (taps at the
  outer thirds, a sideways swipe, arrow keys); nothing runs inside the
  sandboxed page. Position is the page over the last page, so `at`
  works for both layouts and switching keeps the place. Comic chapters
  always scroll. Images are capped to a page's height and figures don't
  split across pages.

- **Widgets (0.29.0).** Plain AppWidgetProviders drawing RemoteViews from
  what the app hands over (Widgets plugin, preferences), so they show
  nothing the app hasn't worked out: the page read last that isn't
  finished, and the three newest unsaved posts. Handed over when the app
  goes to the background and after feeds change; the closed app's feed
  checks refresh the count. A tap opens the app with an address naming
  what to show (carryon-widget://page/<id>, …/post, …/feeds). Colours are
  Paper and Night tokens as resources, by the phone's dark mode, since a
  widget can't know the app's theme. Going to the background saves the
  reading position only when one is pending: writing the index from a
  library that hadn't loaded yet would empty it.

- **Feeds checked with the app closed (0.28.4).** Daniel picked "check
  and notify" over saving in the background: the app's JavaScript doesn't
  run with the app closed, so saving there would mean a second copy of
  the saving code in Java. FeedCheckJob is a JobScheduler job (built in,
  no WorkManager dependency), every 3 hours with a network, kept across
  restarts. It only reads each feed and compares its posts' ids (guid or
  id, and the link) with the ones the app hands over in feeds.json after
  every change; a post none of whose ids is known is new. The ids it
  announced go in feeds-told.json, so a post that the app and the job
  spell differently is announced once at most, never every run. What's
  waiting stays in preferences until the app takes it (on start, on
  coming back, or the notification's tap), marks those feeds due and
  reads them itself. Android 13 asks for notifications on the first
  follow, or on the first launch for feeds followed before. iOS has no
  equivalent worth building: background refresh runs when iOS decides,
  often not for days.

- **Feeds in backups (0.28.3).** A backup gains `feeds.json` beside
  `library.json`; older backups simply have none, and older versions
  ignore it, so the format number stays 1. A restored feed comes back
  with its posts (and which ones were already tried) but unchecked, so
  it's read again soon after. A feed followed already isn't touched:
  its settings here are newer than any backup's. Feeds from a file are
  cleaned like pages: http(s) addresses only, known values only.

- **Gestures (0.28.2).** The sidebar opens on a swipe to the right from
  anywhere in the list, not only from the edge: Android's gesture
  navigation keeps the left edge for Back, so an edge swipe would rarely
  reach the app. Rows that scroll sideways (chips, the collections
  shelf) keep their swipes. Pull to check is drawn by the app (a gap
  with a ring over the list) since a WebView has no native refresh
  control; it starts only at the very top, and Check now stays for a
  mouse, where pulling isn't possible. Holding a feed reuses the 480 ms
  long press of the library's cards. The page turn fades the reader out
  before the next page loads, and in once it has, so the swap itself is
  never seen (up and from the bottom since 0.30.3).

- **Reading a post without saving it (0.28.1).** Daniel asked for a tap on
  a post to show it in the app. `C.save.preview` runs the same reading
  pipeline as a save with pictures as links and writes nothing; the
  reader shows it under a `preview:` id, so its position isn't kept and
  forward navigation to it steps back instead of opening a missing page.
  Its ⋯ is a small sheet with Save and Browser, since tags, collection
  and delete make no sense for a page that isn't kept. The sidebar shows
  three collections and three feeds, the ones touched last, so it stays
  short; the library and the chips list the rest. Select left the
  library's tools because a long press already starts it.

- **Feeds, one river (0.28.0).** Daniel picked the river from three drawn
  options (a list of feeds, one river, feeds as collections). Feeds are
  fetched like pages (CapacitorHttp, no CORS), parsed with DOMParser's
  XML mode (which runs nothing) into plain text, and kept in
  localStorage (`carryon.feeds`): only id, link, title, date and when it
  was first seen per post, at most 100 per feed. Posts a feed drops stay
  while they're inside its window, so a busy feed doesn't lose the
  morning's posts by evening. "New" for the sidebar's pill means first
  seen after Feeds was last open (`carryon.feedsSeen`), so it clears by
  looking, not by saving everything. A feed set to Save them marks each
  post `tried` once queued, so a post that fails isn't retried on every
  check. Saving goes through the existing `savePage`/`saveAll`, oldest
  first, so a feed's collection reads in order and runs show in
  Downloads; one feed's saves wait for the last one's. Checks happen
  only while the app is open (every 15 minutes it looks for feeds not
  checked in 3 hours); background checks would need native work like the
  iOS downloads question. In a browser most feeds can't be read (CORS),
  and the error says to follow in the app. Feeds aren't in backups yet.

- **The browser release, with no server (0.27.12).** Daniel chose no
  server: a fetch proxy means hosting, accounts and an open proxy's abuse
  and legal exposure, and an extension is a second codebase. So the
  browser reads, saves Wikipedia (CORS allowed), and gets everything else
  from the phone by backup. A browser has no directory for pictures, so a
  restore puts them into the page HTML as `data:` URLs (the reader's CSP
  already allows `data:`), and each page's card picture is kept as its
  own IndexedDB key (`<id>:thumb`) read once at start-up; `p.thumb`
  stays the phone's relative path so a backup made in the browser goes
  back to the phone unchanged. The index moved to IndexedDB because a
  phone's library can outgrow localStorage's ~5 MB, which failed
  silently. `navigator.storage.persist()` is asked after a save or a
  restore, and from Storage; Chrome decides without asking, Firefox asks.
  The install offer (`beforeinstallprompt`) is kept for an Install row in
  About rather than the browser's own banner. `imageBytes` now survives a
  backup (`cleanMeta` dropped it).
- **A collection is a book page (0.27.11).** Daniel picked it from three
  drawn options: the seven tiles above the chapters read as a toolbox,
  not a book. Its tools went into a ⋯ popover rather than a sheet,
  since every entry leads somewhere else. Rename, Reorder, Story page and
  Export stay in-place modes of the screen (no history entry), with the
  bar's Cancel, Save or Done, so Back still means leave the collection.
  Dragging uses pointer events on the handle alone, with `touch-action:
  none` there and nowhere else, so the list still scrolls; the arrows
  stay for keyboards and screen readers and the handle is hidden from
  them. What's saved needs pictures apart from the rest: saving records
  `imageBytes` from the bytes it already counted, and pages saved before
  are measured once from their `images/` files (readdir's sizes) when
  What's saved first shows them. In a browser pictures are always links,
  so nothing there needs measuring.
- **Search behind its button, Select beside Order (0.27.10).** Daniel:
  the field needn't always show now the bar has a Search button, and
  Select didn't belong with the app's places (Search, Downloads,
  Settings). Select acts on the list, so it sits with Show and Order. The
  field closes when it loses focus empty, not on every blur, so a typed
  search survives scrolling and opening a page.
- **Downloads, and saving in the background (0.27.9).** Daniel asked for
  saving to move out of the library into a screen of its own and to keep
  going with the app closed or the phone locked. The TODO thought that
  meant moving the fetching into native code. It doesn't on Android:
  Capacitor never pauses the WebView's timers (`handlePause(keepRunning)`
  with KeepRunning on), so the JS loop keeps running as long as the
  process does; what stops it is Android freezing or killing a
  background app. So `DownloadService` is only a foreground service of
  type dataSync with a partial wake lock (leased 10 minutes, renewed by
  each progress update) and a progress notification with Stop, started
  by `Downloads.update()` while anything downloads and ended by `stop()`.
  Chromium still slows a hidden page's timers to about once a second,
  which only stretches the half-second pause between pages. Android 13
  asks for notifications at the first download; refused, the saving
  still goes on, only the notification is hidden. Android 15 caps
  dataSync at six hours a day (`onTimeout` ends it). A swipe away from
  Recents can still end it on some phones. iOS can't run the app's own
  work in the background at all, short of rewriting the saving in Swift
  around background `URLSession` downloads, so its plugin holds a
  background task: the page in progress gets the half minute iOS
  allows, and the loop picks up when the app comes back. Untested on a
  phone from here: the CI builds it, Daniel's phone is the test.
  In the app, Save again (`refreshFolder`) became a run of jobs that know
  the page they replace (`job.again`), so it shows, pauses and stops like
  any other run, and Try again on any failed page re-runs the same job
  (`retryJob`), keeping its collection, place and tags, instead of
  saving the link anew. Finished entries (`state.finished`) last the
  session only: they're a receipt, not history. The plan's "dot while
  downloading" became the ring alone, since a dot on the ring's start
  read as clutter; the dot is kept for failures.
- **Blogger chapters cut at their headings (0.27.8).** The Zombie
  Knight Saga posts by length, so a post can hold the end of one chapter
  and the start of the next, and carries both labels. Each chapter starts
  under a heading line ("Chapter Two: …") followed by a short line
  linking to its own label ("Click to display entire chapter at once").
  `trimToChapter()` uses those label links as anchors: everything before
  the chapter's own heading goes (with it the blog's note to new
  readers), and everything from the next chapter's heading on. A blog
  without such links is left as it was.
- **Three library layouts (0.27.7).** Daniel asked for all three
  directions from the design canvas, Shelf by default, chosen in
  Settings, Appearance (`carryon.layout`). They share one renderer and
  one set of cards: `#libraryView[data-layout]` restyles them, and only
  One list builds differently, putting each collection's tile among the
  pages (keyed `t:<name>`) and adding group overlines (`h:g:<group>`).
  To order collections alongside pages, `asItem()` turns one into a
  page-like item (newest `savedAt`, latest `readAt`, total `minutes`,
  first page's `site`) for the same `BY` comparators. The filter chips
  became one Show dropdown beside Order, moved over the whole library
  (in `#libTools`, under search), because the old row sat between
  Collections and Pages yet filtered both, and its tag row grew with
  every tag. `dropdown()` gained `{ head }` entries for the Tags heading.
  The bar is its own sticky element (`#topBar`), not inside the header,
  since a sticky element only sticks within its parent. The list rows'
  cover is absolutely placed, not a grid row: a grid with `1fr` rows
  around a spanning 96 px cover grew 23 px taller than the cover.
- **Covers and site icons (0.27.6).** A collection's cover is its
  story page's `og:image` (Royal Road and Scribble Hub put the cover
  there), read whenever the page is: linking it, a check for new
  chapters, a Save several with a story page, or once a session on
  opening a linked collection with none. It is kept small (preview
  width) in `pages/_covers/` and named on every page of the collection
  as `cover` (with `coverFrom`, the link, so it isn't fetched again);
  collections have no file of their own. Backups don't carry
  `_covers/`, so a tile whose cover fails to load drops it and reads it
  again. A page's icon is the largest `<link rel=icon>` or apple touch
  icon up to 256 px, else `/favicon.ico`, kept as `icon.*` beside the
  page at save; pages saved before try the site's `/favicon.ico` while
  online, and the site's first letter stands in when nothing loads.
- **Dropdowns on Save with options (0.27.5).** Daniel found the rows of
  collection and tag chips too much. Both are now `dropdown()` as a form
  field (`.field-pick`), which gained `placeholder` (shown in `--muted`
  when nothing is picked, for "Add a tag") and `set(value)` (so Find
  chapters can pick a collection or switch to New collection… with the
  name filled in). "New collection…" and "New tag…" open the same text
  fields as before. The page's own ⋯ sheets keep their chips: they show
  one page's few tags, not a whole library's.
- **The stuck library (0.27.4).** Daniel: a tap on a collection or page
  sometimes left everything stuck. `popScreen` hid the screen when its
  slide-out animation ended, so back then a tap on the same collection
  within about half a second re-pushed it (library made inert) and then
  the old animation finished and hid it: the library showed but was
  inert. Each push is now counted and a pop only hides the screen if it
  wasn't pushed again since. A second tap on a page while its file is
  still loading is also ignored, so it can't push two reader entries.
- **Where reading aloud could still end early (0.27.3).** Daniel's
  saved Zombie Knight chapter (copied to the e2e as zk-ch1.html) has
  each post's lines inside one `<span>` with `<br>`s, so 0.27.2's
  wrapping saw an inline element holding breaks and skipped it whole;
  `wrapLoose` now splits inside such inline wrappers. Looking for the
  same kind of hole: text beside a nested block (a Scribble Hub
  author's note is a blockquote with a heading `p` and loose text after
  it; an `li` with a sublist) was never read either, since the outer
  block isn't a leaf and its text sat inside a block; such text is now
  wrapped too. Closed `<details>` (spoilers) are skipped, the summary
  read. The browser engine ended the whole reading on any piece's error;
  now only "not-allowed" ends it and other errors move on, like the
  Android watchdog.
- **Reading text with no paragraphs (0.27.2).** Blogger posts (the
  Zombie Knight serial) keep their text straight in a `<div>` between
  `<br>`s, so `readable()` found no `p` past the byline and the reading
  ended there, and a selection there had no block for "Read from here".
  The reader now wraps each run of such text between line breaks in an
  inline `span.co-run` (no change on screen, `box-decoration-break:
  clone` so its light wraps cleanly) and reads those as blocks. Done in
  the reader rather than at save so pages already saved are fixed too.
- **Why reading aloud stopped at gaps (0.27.1).** Daniel heard it stop
  partway. Not reproducible off a phone, so three likely causes are all
  fixed: a block with no letters or digits ("* * *" scene breaks in
  serials) is no longer sent, since some engines say nothing back for a
  piece they can't voice; SpeechService gives every piece a deadline of
  8 s plus 160 ms a character (at 1×) and goes on if the engine never
  reports it done; and a transient loss of audio focus (a notification,
  another app) now pauses and resumes on regaining focus instead of
  staying paused. "Read from here" takes the selection's block and its
  offset (`selectionSpot` in reader.js), finds the selected word nearest
  that offset in the block's spoken text, and starts the reading there,
  the block split in two pieces.
- **Read aloud goes on with the screen off (0.27.0).** Daniel chose
  screen-off reading over a simpler screen-on version. So the native side
  owns the reading, not the page: the app sends the whole page as pieces
  of up to 600 characters (sentences, cut after a comma when one runs
  long), and native/share's Speech plugin reads them in order. On Android
  that is SpeechService, a foreground service of type mediaPlayback with
  the TextToSpeech engine, a partial wake lock, audio focus, and a media
  session with a notification for previous, play or pause, next and
  stop. On iOS the rest of the page is queued in AVSpeechSynthesizer at
  once (so it reads on while the app is suspended) under the "audio"
  background mode, with lock-screen commands. The page only listens:
  "progress" events say which piece started, the reader lights that
  piece's block, and on coming back from the lock screen it asks
  `state()` where the reading got to. A browser uses speechSynthesis
  one piece at a time while the page is open. Pause on Android stops the
  engine and starts the piece again on play; iOS pauses at a word.
  Android 11 only finds the TTS engine with the TTS_SERVICE `<queries>`
  entry in native/share's manifest. None of this can be tried off a
  phone.
- **The read-aloud light (0.27.0).** The block being read gets
  `--preview` behind it, the color an image's empty box has, so no new
  token; the contrast test now checks ink and accent on it, which made
  Solarized's `--preview` a shade lighter.
- **Blogger serials and the feed (0.26.0).** A serial on Blogger puts a
  chapter in several posts ("Page 1" to "Page 14") under a label like
  `ch1`, and its contents page is plain text with no links. The rule in
  `SITES` reads the blog's JSON feed instead of its pages: a label page
  becomes `/feeds/posts/default/-/<label>?alt=json`, its posts joined
  oldest first into one chapter, with next and previous being the
  neighbouring `chN` labels that exist; the home or a contents page
  lists every `chN` label from the summary feed's categories. A single
  post reads `.post-body` and the Newer and Older Post links. Written
  from saved copies of thezombieknight; the sandbox can't reach the
  real site, so the first real save is the test.
- **A collection's story page and Save again (0.26.0).** `source` is
  kept on each of the collection's index entries (there is no file for
  collections), so it travels with backups. With a source, the check
  reads its chapter list and keeps it as `all`, so "Save N" saves the
  missing ones, wherever they sit. Save again re-saves each page with
  `save()` and copies its place, order, tags and read state onto the
  new entry before removing the old file; a failed page keeps its old
  copy.
- **Our own dropdown (0.26.0).** The system `<select>` drew a different
  menu on Android, iOS and desktop, none in the app's type or themes.
  `dropdown()` in app.js is a listbox button: arrows, Home, End and
  Escape work, a tap outside closes it, and its rows are 44px.
- **Reader bars on tap (0.26.0).** Bars that came back on any scroll up
  popped in while reading back a paragraph. Now only a tap brings them
  back; any scroll of more than 12px hides them, measured from where
  the tap left the page. They still show at the top, at the end and
  under a sheet.
- **Pressed states (0.26.0).** `--press` is a translucent tint per
  theme, laid over a control's own fill as a background image, so one
  rule fits accent buttons and plain rows alike. Rows and choices only
  tint; small controls also scale to 0.97, which reduced motion drops.
- **Export and saving to the device (0.25.2).** One Export in the page
  sheet replaces Send, Send as EPUB, Print and Send page source. A file
  is written to the cache, then either handed to native/share's FileSave
  (Android's ACTION_CREATE_DOCUMENT, copied in on a thread; iOS's
  document picker for exporting, as a copy) or to the share sheet. A
  build without FileSave falls back to the share sheet, a browser to a
  download. PDF stays the print screen's Save as PDF: making a PDF in
  JavaScript would need a library. Markdown (`exportMarkdown` in
  backup.js) walks the saved page's blocks; images use `data-full`, the
  site's address, because the local preview can't go with the file.
- **Telling a contents page from a page (0.25.1).** A chapter word
  must stand alone ("Sep 12" was "ep 12", and /2025/sep/03/ in an
  address was episode 3), and the share of linked text is counted
  without nav, header, footer and aside, with at most 3,000 characters
  of other text. 0.25.0 took news stories under a big menu, with dated
  related links, for lists of chapters. A guess can still be wrong, so
  Save with options opened from one offers "Save it as one page
  instead", which saves with `asPage` and skips both the guess and the
  site rules' `contents`.
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
