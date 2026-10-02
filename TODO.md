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

- Reader top bar: hide on scroll down, back on scroll up; tapping an image
  opens it full screen.
- Folders, next steps: rename a folder, reorder its pages (drag, or move
  up and down), and delete a whole folder at once.
- Batch saving: paste several links at once (or share several); they save
  one after another, in order, optionally into a folder (new or existing)
  and with tags chosen up front.
- Follow "next chapter": from one saved chapter, offer to save the next N
  by following the page's next link (rel="next", or a link named Next or
  Next chapter) into the same folder. Only for sites that link chapters.
- Naming pass: one vocabulary for what the app holds, used the same way in
  the code, the UI and the docs (a saved page, its previews, a capture, the
  library, a tag, a folder). Write it as a glossary in NOTES.md, then
  rename functions and labels that don't match it (save.js `clean`,
  `localise`, `pageHtml`; app.js `takeShared`, `cover`).
- Read aloud: a player in the reader that reads the page with the phone's
  text-to-speech (works offline), following along in the text, with
  play/pause, speed and skip by paragraph. On Android the WebView's
  speechSynthesis is unreliable, so likely a small native TTS plugin in
  native/ beside the share target.
- Search the library (titles, sites, tags, then the text).
- Export a page from the reader: as PDF (the phone's print to PDF), EPUB
  (for e-readers; the page is already clean HTML with local images, so
  it's mostly packaging), a self-contained HTML file that can be imported
  back, or shared through the share sheet as one of those or as the link.

## Updates

- An Updates section in Settings: the version you have, "Check for
  updates", and when a newer one is out, its download and install right
  there (the library's update bar stays as the nudge that sends you to it).
- An in-app changelog: what's new in each version, readable from Settings,
  shown once after an update installs. Built from CHANGELOG.md so it's
  written in one place.

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
