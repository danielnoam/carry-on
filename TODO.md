todo:

## Prove the core (do first)

- Spike on a phone build: save five hard pages with CapacitorHttp,
  Readability and `Filesystem.downloadFile`: a Wikipedia article, a news
  site behind Cloudflare, a Medium post, a JavaScript-only page, and a page
  with YouTube embeds. Record what fails in NOTES.md before building on it.

## Saving

- Hidden WebView render for pages that build themselves with JavaScript
  (empty shells are detected and refused with a message since 0.2.0).
- Previews from pages other than Wikipedia are whatever srcset width is
  nearest 480 px, or the original when there's no srcset; resize big ones
  on the device.
- Commons images: keep each image's own credit line (author, licence).

## Capture

- Check the Android share target on a phone (Chrome, and an app that
  shares "Title https://…").
- iOS share extension, with the Safari JavaScript preprocessing file to
  hand over the rendered HTML.

## Library and reader

- Retry for missing previews (the card says how many are missing).
- Reader top bar: an Aa button for quick changes while reading: font,
  theme, text size and line spacing, the same settings also in Settings
  (Reading section). Hide the bar on scroll down; tapping an image opens
  it full screen.
- Reading progress: remember where each page was left, and show how much
  is left under each library card (e.g. "6 min left", a thin progress
  line), "Finished" once read to the end.
- Categories: give a page one or more categories, filter the library by
  them (with the chips below).
- Batch saving: paste several links at once (or share several); they save
  one after another in the library's saving cards, and can all go into a
  category or folder chosen up front. Decide first whether folders and
  categories are one thing: if a page can have several categories, a
  folder is just a category, and two systems would confuse.
- Naming pass: one vocabulary for what the app holds, used the same way in
  the code, the UI and the docs (a saved page, its previews, a capture, the
  library, a category or folder). Write it as a glossary in NOTES.md, then
  rename functions and labels that don't match it (save.js `clean`,
  `localise`, `pageHtml`; app.js `takeShared`, `cover`).
- Read aloud: a player in the reader that reads the page with the phone's
  text-to-speech (works offline), following along in the text, with
  play/pause, speed and skip by paragraph. On Android the WebView's
  speechSynthesis is unreliable, so likely a small native TTS plugin in
  native/ beside the share target.
- Library chips (All, Unread, Wikipedia, Articles) and search.
- Export one page as a self-contained HTML file; import it back.

## Sync

- Sync saved pages to a private GitHub repo, like LifeLog's sync
  (src/storage.js there: a fine-grained token for one repo, the contents
  API, `sha` for conflicts, offline edits merged on the next sync). Daniel
  asked for it on 2 Oct 2026, reviving the DROPPED.md entry. Open points:
  - Images. The contents API reads files up to 1 MB inline (LifeLog's sync
    broke at 1 MB, see its NOTES.md), and a repo of previews grows fast:
    about 0.5 to 1.5 MB per illustrated page. Options: sync `library.json`
    and each `page.html` + `meta.json` and re-download previews on the other
    device; or also push `images/` through the Git Data API (blobs and one
    tree per save, not one commit per file).
  - Deletes have to sync too (a tombstone in `library.json`), or a page
    deleted on one phone comes back from the other.
  - The token is per device and stays in the app; for anyone but Daniel
    this stays optional, with export and import as the no-account way.

## Before shipping to other people

- Decide: desktop browser version in v1 (adds the optional worker)?
- Decide: Apple Developer Program now, or Android-first?
- Name checks: App Store, Play, trademark search for "Carry-on".
- Privacy policy stating nothing is collected; store data forms.
- Real app icon assets (icon.svg is the mark; @capacitor/assets makes the
  sizes in CI).
