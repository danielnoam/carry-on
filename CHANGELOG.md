# Changelog

All notable changes to Carry-on. Newest first.

## [0.13.0] - 2026-10-02

### Added
- A thin line along the bottom of the reader shows how far through the
  page you are. It fills from the right on Hebrew and Arabic pages.

### Changed
- The reader's top bar slides away while you read on down, and comes
  back when you scroll up a little, reach the top or the end, or open Aa
  or ⋯.

## [0.12.0] - 2026-10-02

### Added
- Pages that build themselves with JavaScript can be saved on Android.
  When a page comes back as an empty shell, or a browser check, Carry-on
  lets it draw itself out of sight, then saves the text it drew. The
  card says "Letting the page draw itself" meanwhile. The saved copy is
  still plain text and images, with no scripts. iOS still says it can't
  save these yet.

## [0.11.0] - 2026-10-02

### Added
- Settings has an Updates section: the version you have, whether a newer
  one is out (checked at each launch, or with Check for updates), and the
  update itself, with its download progress and what's in it.
- What's new: every version's changes, from Settings. After an update,
  the library says "Updated to 0.11.0" with a What's new button, once.

### Changed
- The library's update bar now only tells you a new version is out; View
  opens Settings at Updates, where the download and install happen. It
  can be dismissed with ×.

## [0.10.0] - 2026-10-02

### Added
- Follow a site's "next chapter" link. Pages now remember their next
  link when saved (rel="next", or a link worded Next, Next chapter, הפרק
  הבא and the like, on the same site). At the end of such a page, "Next
  on …" saves the next page and opens it.
- "Save next 1 · 5 · 10" in ⋯ and on a folder's screen follows the chain,
  saving each page into the folder in order, and says when it reached
  the last one. A page not yet in a folder starts one named after the
  series ("The Long Road - Chapter 1" makes "The Long Road").
- Rename a folder, from the bottom of its screen.

### Changed
- A saving card now shows it's working: a turning spinner, a bar that
  sweeps while the page downloads and then fills as images are saved, and
  the seconds it has taken once past five ("Getting the page · 12 s").

## [0.9.0] - 2026-10-02

### Added
- Save several pages at once: paste (or share) more than one link and
  "Save several" opens with them one a line, to check or edit, and a
  folder to save them into (none, one you have, or a new one).
- They save one after another; the rest show "Waiting" until their turn.
  Pages in a folder keep the order of the links, and a link you'd
  already saved joins the folder instead of saving twice. One message
  sums up how it went; a link that failed keeps its card with Try again,
  which saves it into the same folder.

## [0.8.0] - 2026-10-02

### Added
- Folders, for pages read in order like a web novel's chapters. In ⋯,
  put a page in a new folder or one you already have; a page is in one
  folder at most, in the order you added it.
- The library shows a folder as one card, with how many pages are read
  and which is next. Its screen lists the pages in order with a Start or
  Continue button.
- Next and previous inside a folder: a "Next in …" link at the end of
  the page, and both directions in ⋯. The page changes in place, so back
  still returns to the folder.
- Unread, Finished and tag filters list a folder's pages one by one,
  each card naming its folder.

## [0.7.0] - 2026-10-02

### Added
- Tags: ⋯ in the reader opens "This page", where you add tags (type one
  and press Enter, or tap one you've used before) and remove them. A page
  can have any number. They show on its library card.
- Filter chips above the library: All, Unread, Finished and one for each
  tag. The choice is remembered.

### Changed
- Delete moved from the reader's top bar into the ⋯ sheet, so it's
  harder to hit by accident.

## [0.6.0] - 2026-10-02

### Added
- Retry on a library card whose previews are missing: it downloads them
  again into the page, and the card turns "Offline ready" once they're
  all there. Shown only when you're online.

## [0.5.0] - 2026-10-02

### Added
- Reading progress: a page reopens where you left it, and its library card
  says how much is left ("6 min left") with a thin line, or "Finished"
  once you've read to the end. A finished page opens at the top again.

## [0.4.0] - 2026-10-02

### Added
- Aa in the reader: a sheet rises from the bottom with text size (five
  steps), line spacing (tight, normal, loose), font (serif or sans) and
  theme. Changes show on the page as you make them; tap the page or go
  back to close it.
- Settings has a Reading section with the same text size, spacing and
  font, and a sample line to judge them by.

### Fixed
- Hebrew pages that don't label their own direction (ynet) are now saved
  right to left, judged by their letters. Pages already saved without it
  open right to left too.

## [0.3.1] - 2026-10-02

### Fixed
- Saving a page from some news sites (ynet among them) stayed on "Saving"
  forever. Requests now look like the phone's browser, a site that doesn't
  answer gives up after 30 seconds, and an image after 20.
- A save that fails now stays in the library as a card with the reason,
  "Try again" and "Remove", instead of a message that was gone in three
  seconds.
- Hebrew and other right-to-left pages are saved and read right to left,
  in the reader and on their library card.
- A page's own headline no longer appears twice at the top of the saved
  page.

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
