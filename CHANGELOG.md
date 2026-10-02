# Changelog

All notable changes to Carry-on. Newest first.

## [0.3.0] - 2026-10-02

### Added
- Share to Carry-on (Android): share a page from Chrome or any app and it
  is saved straight away. Sharing a page you already saved opens it.
- Settings, from the button at the top of the library: theme, how images
  are saved (previews, full images, links only), storage used by each
  page, the version and "Check for updates".
- Motion: the reader and Settings slide in over the library on a spring,
  new cards and the update bar settle into place, save progress fills
  smoothly, and changing theme cross-fades. With Reduce Motion on, all of
  it becomes a short fade.

### Changed
- The theme now follows the phone's light or dark setting until you pick
  one in Settings ("System", Paper by day and Night by night).

## [0.2.0] - 2026-10-02

### Added
- Saving: paste a link (or a message with a link in it) and the page is
  saved for offline reading. Wikipedia articles come through Wikipedia's
  own API with the CC BY-SA licence line; other pages are reduced to the
  article.
- Image previews are saved with each page and the full image loads in
  their place when you're online. A preview that couldn't be saved shows
  the image's description and "Image loads when you're online".
- Videos (YouTube, Vimeo, Wikipedia) become a card with a saved thumbnail
  that opens the video when you're back online.
- The reader: the saved page in your theme, an Offline pill, Original to
  open the page in your browser, and Delete.
- Library cards with save progress, reading time, size and whether the
  page is fully offline.
- The Android app updates itself: when a newer version is released, a bar
  above the link box offers to download it and opens Android's installer.
  On iPhone the bar opens the release page for AltStore or SideStore.

### Changed
- An Android build signed with a keystore that has no "carryon" key now
  stops with a message saying so, instead of failing inside the signer.

## [0.1.0] - 2026-10-02

### Added
- The app shell: an empty library, the Paper, Sepia and Night themes, and
  the bundled reading fonts.
- Android and iOS builds from the same files, started from LifeLog's
  workflows.
