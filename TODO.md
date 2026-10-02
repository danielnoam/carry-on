todo:

## Prove the core (do first)

- Spike on a phone build: save five hard pages with CapacitorHttp,
  Readability and `Filesystem.downloadFile`: a Wikipedia article, a news
  site behind Cloudflare, a Medium post, a JavaScript-only page, and a page
  with YouTube embeds. Record what fails in NOTES.md before building on it.
- Check on a phone what 0.2.0 could only check in a desktop browser with
  Capacitor mocked: `Filesystem.downloadFile` into `pages/<id>/images/`,
  the page folder as the reader's `<base>` under its CSP, and links
  leaving through AppLauncher.

## Saving

- Hidden WebView render for pages that build themselves with JavaScript
  (empty shells are detected and refused with a message since 0.2.0).
- Previews from pages other than Wikipedia are whatever srcset width is
  nearest 480 px, or the original when there's no srcset; resize big ones
  on the device.
- Commons images: keep each image's own credit line (author, licence).

## Capture

- Android share target: an intent filter added by tools/android-manifest.js
  (which exists since 0.2.0, for the updater).
- iOS share extension, with the Safari JavaScript preprocessing file to
  hand over the rendered HTML.

## Library and reader

- Retry for missing previews (the card says how many are missing).
- Reader top bar: Aa (text size steps, theme), hide on scroll down;
  tapping an image opens it full screen.
- Library chips (All, Unread, Wikipedia, Articles) and search.
- Settings: theme, save setting (stored as `carryon.images`: previews,
  full, links; saving already honours it), storage used per page and in
  total.
- Export one page as a self-contained HTML file; import it back.

## Before shipping to other people

- Decide: desktop browser version in v1 (adds the optional worker)?
- Decide: Apple Developer Program now, or Android-first?
- Name checks: App Store, Play, trademark search for "Carry-on".
- Privacy policy stating nothing is collected; store data forms.
- Real app icon assets (icon.svg is the mark; @capacitor/assets makes the
  sizes in CI).
