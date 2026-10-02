# Notes

Why things are the way they are, newest first. Each entry starts with a
bold title and its version so a search finds it.

- **The core works on a phone (2 Oct 2026).** Daniel saved Wikipedia
  and ynet on the Android build and shared pages into the app from
  Chrome, so the on-device fetch (CapacitorHttp, Readability,
  `Filesystem.downloadFile`) and the share target are proven. Pages that
  build themselves with JavaScript still fail; that's its own TODO item.

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
  while a page names it. Names match ignoring case, like tags. "Folder"
  in store.js (`folderUrl`) still means a page's directory on disk; the
  naming pass should split the two. Next and previous replace the
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
  well without shipping megabytes of glyphs.
- **Readability is vendored at 0.6.0 (0.1.0).** One file, Apache-2.0, the
  same parser Firefox Reader View uses. Vendored rather than installed to
  keep the no-build rule.
