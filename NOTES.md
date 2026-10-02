# Notes

Why things are the way they are, newest first. Each entry starts with a
bold title and its version so a search finds it.

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
