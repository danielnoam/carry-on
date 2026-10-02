todo:

## Prove the core (do first)

- Spike on a phone build: save five hard pages with CapacitorHttp,
  Readability and `Filesystem.downloadFile`: a Wikipedia article, a news
  site behind Cloudflare, a Medium post, a JavaScript-only page, and a page
  with YouTube embeds. Record what fails in NOTES.md before building on it.
- The sandboxed reader: `page.html` in an iframe with no `allow-scripts`,
  a strict CSP, the reader CSS injected. Build this before any styling.

## Saving

- Wikipedia adapter: `/api/rest_v1/page/html/{title}`, User-Agent naming
  the app, licence line, Commons thumbnails at 480 px.
- Generic path: fetch, Readability, clean (scripts, iframes, forms,
  handlers, pixels), resolve lazy images.
- Image previews and links per the save setting; video cards with local
  thumbnails.
- Page folder: `page.html`, `images/`, `meta.json`; library index JSON.
- Empty-shell detection, then a hidden WebView render.

## Capture

- Android share target (intent filter via a tools/android-manifest.js like LifeLog's, added to android.yml after `cap add android`).
- iOS share extension, with the Safari JavaScript preprocessing file to
  hand over the rendered HTML.
- Paste a link (the library's bottom bar).

## Library and reader

- Library cards with save progress, sizes, retry for missing previews.
- Reader top bar (Offline pill, Original, Aa), text size steps, themes.
- Settings: theme, save setting, storage used per page and in total.
- Export one page as a self-contained HTML file; import it back.

## Before shipping to other people

- Decide: desktop browser version in v1 (adds the optional worker)?
- Decide: Apple Developer Program now, or Android-first?
- Name checks: App Store, Play, trademark search for "Carry-on".
- Privacy policy stating nothing is collected; store data forms.
- Real app icon assets (icon.svg is the mark; @capacitor/assets makes the
  sizes in CI).
