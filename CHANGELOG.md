# Changelog

All notable changes to Carry-on. Newest first.

## [0.28.4] - 2026-10-05

### Added
- On Android, feeds are read every few hours with the app closed, and a
  notification says when there are new posts. Tapping it opens Feeds,
  which reads those feeds again. Posts set to save themselves still save
  when the app is open.

## [0.28.3] - 2026-10-05

### Added
- Backups include the feeds you follow, with their settings and posts.
  Restoring follows any that aren't followed here and leaves the others
  as they are.

## [0.28.2] - 2026-10-04

### Added
- Swipe right in the library or Feeds to open the sidebar.
- Pull down at the top to check for what's new: Feeds checks its feeds,
  the library checks collections that follow a series for new chapters.
- Hold a feed (its chip or its row in the sidebar) for its settings and
  Check now.

### Changed
- A collection with new chapters shows "+2" on its cover.
- Tapping the next chapter at the end of a page turns to it with a
  slide.
- The Add a feed chip is gone from Feeds; the field at the bottom does
  that. On a touch screen, Check now gives way to pulling down.

## [0.28.1] - 2026-10-04

### Changed
- Tap a post in Feeds to read it in Carry-on without saving it; its ⋯
  saves it. The new button beside + opens it in the browser.
- The sidebar lists your three latest collections under Library and your
  three latest feeds under Feeds.
- In Feeds, the field at the bottom follows a site or feed instead of
  saving a link.
- The Select button is gone from the library: long-press a page and pick
  Select, or long-press a collection.

## [0.28.0] - 2026-10-04

### Added
- Follow a site's feed. Add a feed from the new sidebar (the menu button
  at the left of the bar): a site's address is enough, Carry-on finds its
  RSS, Atom or JSON feed.
- Feeds shows every new post in one list, by day, with chips for each
  feed. Tap + to save a post, or Save all for a day; saved posts go into
  a collection named after the feed.
- Set a feed to save its new posts by itself, and pick its pictures, its
  collection and how old a post can be before it's skipped. Feeds are
  checked every few hours while the app is open and online.

## [0.27.12] - 2026-10-04

### Changed
- The web copy is a reader of its own. Open a backup from your phone and
  its pages read here with their pictures, offline. In a browser,
  Wikipedia saves directly; other sites say to save on the phone and
  bring the page over with a backup.
- A browser keeps the library in IndexedDB instead of localStorage, which
  held only about 5 MB.

### Added
- Install Carry-on from About, where the browser offers it (on an iPhone,
  About says how: Share, then Add to Home Screen).
- Storage in a browser shows the space used and asks the browser to keep
  your pages rather than clear them when space runs low.

## [0.27.11] - 2026-10-04

### Changed
- A collection opens as a book page: its cover, how much you've read and
  the time left, Continue, new chapters to save, then its chapters with a
  tick on the ones you've read. Its tools moved into the ⋯ menu.
- Rename happens in place on the title, Reorder lets you drag chapters by
  a handle (the arrows are still there), and Remove asks in a sheet.

### Added
- What's saved, for a collection and in Storage: how much of its size is
  pictures and how much is text, which pictures are kept as links, with
  Save again to switch them.

## [0.27.10] - 2026-10-04

### Changed
- Search stays out of the way until you tap its button in the bar. It
  stays open while something is typed in it, and a second tap or Escape
  puts it away.
- Select moved out of the bar to beside Order, with the other tools for
  the list.

## [0.27.9] - 2026-10-04

### Added
- Downloads, a screen of its own behind a new button in the library's
  bar: what's downloading, pages that couldn't be saved, and what
  finished since you opened the app, each with Open. A collection being
  saved is one card with Pause and Stop, its failed pages inside it with
  Try again. The button's ring fills as everything downloads, and a
  warning dot stays while a failed page waits.
- On Android, saving keeps going with the app put away or the phone
  locked, with a progress notification that has Stop. iOS lets the page
  in progress finish for about half a minute; the rest goes on when you
  open the app again.

### Changed
- Saving cards left the library, which now shows only saved pages.
- Save again on a collection shows in Downloads like any other download,
  with Pause and Stop.

## [0.27.8] - 2026-10-04

### Fixed
- A Blogger serial that splits its posts by length (like The Zombie
  Knight Saga) no longer saves the end of the previous chapter at the
  start of a chapter and the start of the next one at its end. The
  "Click to display entire chapter at once" line is gone too. Use Save
  again on chapters saved before.

## [0.27.7] - 2026-10-03

### Added
- Three looks for the library, picked in Settings, Appearance, Library
  layout: Shelf (the default: collections as a row of book covers,
  pages listed under them), One list (collections and pages together,
  grouped by date or site) and Grid (covers three across, pages as
  picture cards).
- The library's top bar stays while you scroll, with a Search button
  that takes you up to the search field.

### Changed
- The filter capsules are now one Show dropdown (All pages, Unread,
  Finished, your tags) beside the order, over the whole library.
- The order applies to collections too: by their newest page, the one
  read last, their length or their site.
- Continue reading shows only when nothing is filtered.
- A collection with no picture gets a cover drawn from its name.

## [0.27.6] - 2026-10-03

### Added
- A collection linked to its story page shows the story's cover, like
  a Royal Road book cover, kept on the phone so it shows offline.
- A page with no picture of its own shows its site's icon, or the
  site's first letter when there's no icon.

## [0.27.5] - 2026-10-03

### Changed
- Save with options picks the collection from a dropdown (None, your
  collections, or New collection…) instead of a row of buttons.
- Its tags are a dropdown too: the tags you have, or New tag…. The ones
  picked show above it, each with × to take it off.

## [0.27.4] - 2026-10-03

### Fixed
- Going back and quickly tapping the same collection or page again no
  longer leaves the library stuck, taking no taps until you leave and
  come back.

## [0.27.3] - 2026-10-03

### Fixed
- Reading aloud no longer stops partway through a Blogger chapter whose
  lines are all inside one block, like The Zombie Knight.
- It reads an author's note's text and a list item that has a sublist,
  which it skipped before.
- It skips a closed spoiler instead of reading it out.
- In a browser, a line the voice can't say is skipped instead of ending
  the reading.

## [0.27.2] - 2026-10-03

### Fixed
- Reading aloud reads pages whose text isn't split into paragraphs, like
  Blogger serials, instead of stopping after the title and author. "Read
  from here" works on those lines too.

## [0.27.1] - 2026-10-03

### Added
- Select a word and tap "Read from here" to start reading aloud from it.

### Changed
- The read-aloud controls are in the middle of the bar along the bottom,
  which stays up while it reads.
- The reading progress line along the bottom is thicker.

### Fixed
- Reading aloud no longer stops at a line with no words, like a scene
  break ("* * *"), or when the phone's engine skips a piece without
  saying so; after a short pause it goes on.
- A notification sound or another app's short sound pauses the reading
  only while it plays, then it goes on by itself.

## [0.27.0] - 2026-10-03

### Added
- Read aloud: the speaker button in the reader's top bar reads the page
  with your phone's own voices, offline, from the paragraph on screen.
  The paragraph being read is lit up and the page follows along.
- A small player while it reads: previous paragraph, pause or play,
  next paragraph. Tap the speaker again to stop.
- It keeps reading with the screen off. Pause, skip or stop it from the
  lock screen or the notification.
- Voice and speed for reading aloud are in Aa. The voice is kept for
  each language, so a Hebrew page and an English one can each have
  their own.

### Changed
- The page no longer puts the reader's bars away when it scrolls itself
  to follow the voice.

## [0.26.0] - 2026-10-03

### Added
- Blogger serials save as whole chapters: a chapter spread over several
  posts (a label like "ch12") becomes one page, read from the blog's
  feed, and the blog's home or contents page lists every chapter.
- A collection's Chapters button: look for new chapters, save previous
  or next ones, link it to the story's page, and save its pages again.
- Link a collection to its story page (a Royal Road fiction page, an
  AO3 work). New chapters come from its chapter list, which also finds
  chapters added in between, and the collection shows a book icon.
- Save again: download a collection's pages again with other pictures
  or the author's edits. Each keeps its place, tags and read position.
- Export a whole collection as EPUB, one HTML file, PDF or Markdown,
  then save it to your phone or send it.

### Changed
- Folders are now called collections.
- The library's sort is our own menu, not the system's.
- The reader's bars: a tap on the page shows them, and any scroll hides
  them again. Scrolling up no longer brings them back.
- Every button, chip, row and tile answers a press, with no grey flash
  or blue outline. The options button beside Save matches it.
- Unread and Finished keep collections whole, as tiles, and list only
  the pages in no collection.

## [0.25.2] - 2026-10-03

### Added
- Export a page as PDF, HTML, EPUB, Markdown or the site's page source,
  from Export in the page's ⋯ menu. Save it to your phone (Android asks
  where; on iPhone it goes to Files) or send it.
- Markdown export: the page's text with its headings, lists, quotes,
  tables and links, for a notes app. Pictures link to the full image on
  the site.

### Changed
- ⋯ is shorter: Send, Send as EPUB, Print and Send page source are now
  all in Export.

## [0.25.1] - 2026-10-03

### Fixed
- Ordinary pages, like a news story, no longer get taken for a list of
  chapters. Dates such as "Sep 12" and a site's menus counted as
  chapter links.
- When a page is read as a list of chapters, Save with options now
  offers "Save it as one page instead".

## [0.25.0] - 2026-10-03

### Added
- New chapters: a folder saved with Save next or from a chapter list
  can look for chapters after its last one. Tap Check under the
  folder's chapters, or let it check by itself once a day when you're
  online (Settings, Appearance, Library). A folder with new chapters
  shows "2 new" on its tile, and Save next saves them.
- Royal Road, Archive of Our Own, Scribble Hub and FanFiction.net save
  just the chapter, with the author's notes kept and set apart, and
  without menus or comments. A story's own page gives every chapter,
  even when the site lists them over several pages.
- "Send page source" in a page's ⋯ menu sends the original page as a
  file, for a site that saves badly.

### Fixed
- Royal Road chapters no longer include the hidden lines saying the
  story was taken from Royal Road.
- Archive of Our Own works marked for adults save instead of saving the
  "this work could have adult content" notice.
- FanFiction.net chapters know their next chapter.

## [0.24.0] - 2026-10-03

### Added
- Ten fonts to read in: Source Serif, Literata, Lora, Merriweather,
  EB Garamond, Instrument Sans, Inter, Atkinson Hyperlegible,
  OpenDyslexic and your phone's own System font. All work offline.
- Hebrew fonts: Frank Ruhl Libre, David Libre, Assistant and Heebo. A
  Hebrew page uses the one matching your font's style, or the one you
  pick under "Hebrew" in Aa.
- Six more themes: Slate, Solarized, High contrast, Black, Dusk and
  Solarized Dark. Auto can switch between any light and any dark theme
  (Settings, Appearance).
- Margins: Narrow, Normal or Wide.
- "Reset text" puts size, spacing, margins and fonts back.

### Changed
- Text size is a slider from 14 to 32 px (the small and large A still go
  one step at a time), and line spacing a slider from 1.20 to 2.20.
  Both show their value.
  Your current size and spacing carry over.

## [0.23.2] - 2026-10-03

### Changed
- Comics are chosen, not guessed: a plain Save always saves an article.
  To save a comic, tap the options button next to Save (it takes the
  link you typed), pick "Comic" under "Save as", then Previews, Full or
  Links. Save next keeps a comic's choice for the chapters after it.
- "Save several" is now "Save with options", with "Save as" and
  "Images" right under the links.

### Fixed
- Articles with several big pictures no longer save as comics.

## [0.23.1] - 2026-10-03

### Fixed
- Filling in chapters with Save several now puts them in the list's
  order among the chapters already in the folder, instead of at the
  end.

### Added
- "Sort by chapter" while reordering a folder puts its pages in order by
  the chapter number in their titles or addresses.

## [0.23.0] - 2026-10-03

### Added
- Pause a run of saves into a folder, from its card or beside Save next.
  It waits after the page in progress, and Resume carries on from there.
- Save several skips pages you already have, and says how many. Untick
  it to move them into the folder in the list's order instead.
- Settings › Storage is grouped by folder, biggest first, with pages in
  no folder as one more group. Tap a group to see its pages by size.

### Changed
- A run of saves is one card from start to end, "3 of 10 saved", that
  keeps its height, so the library no longer jumps as each page comes
  and goes. Pages that fail show on their own cards once the run ends.
- The reader's top bar and foot are a step darker than the page in Paper
  and Sepia, and a step lighter in Night.

## [0.22.0] - 2026-10-03

### Added
- Comics and manga: a chapter that is a column of pictures saves as an
  image chapter, its panels in order and full size whatever the image
  setting, without the site's logo, ads or thumbnails.
- Image chapters read edge to edge with no gaps. A tap shows or hides
  the bar, a double tap opens the panel to zoom.
- Save next 5, 10 or All asks first when the last chapters were large:
  "about 7.3 MB each, so 10 more is about 73 MB".
- Image chapters keep their layout in a book.

### Changed
- Pictures are fetched with the page's site as Referer, as a browser
  does, so sites that refuse pictures linked from elsewhere let them
  through.

## [0.21.0] - 2026-10-03

### Added
- Paste a web novel's contents page and Carry-on lists its chapters in
  Save several, oldest first, with a folder named after the novel, for
  you to check before saving. In Save several, one link offers "Find
  chapters on this page" for contents pages that also carry a long
  description.
- Books get a cover: the first picture, or a title card with the title
  and the site. A folder's book opens on its cover.
- A list over 50 pages asks before saving, and a long run waits as one
  card, "48 pages waiting to go into Skyward", with Stop.

### Changed
- Pages in a long run save half a second apart, so the site isn't
  hammered.

## [0.20.0] - 2026-10-02

### Added
- Send a page as an EPUB book from the reader's ⋯ (or a long press in
  the library), for an e-reader app or a Kindle through Send to Kindle.
  Its pictures, contents, language and right-to-left direction come
  along, with the Wikipedia licence line and the link to the original.
  A folder's EPUB tile makes one book of all its pages, in order.
- Print or save as PDF from the same menu, through the phone's own
  print screen (Save as PDF is one of its printers).
- Save previous: a folder's first page offers to save the pages before
  it, and they go in front.
- "All" next to 1, 5 and 10 saves every next (or previous) page there
  is, with Stop to end it early.
- Settings, Appearance can turn off Continue reading.

### Changed
- A folder's tools are at the top, as tiles: Add pages, Select,
  Reorder, Rename, EPUB and Remove.
- Search is always at the top of the library, and All, Unread and
  Finished sit below the folders, just above the pages.

### Fixed
- A card's Retry no longer draws over the save bar when scrolling.

## [0.19.0] - 2026-10-02

### Added
- Pick several pages and change them together. "Select" (the tick
  icon in the library, or in a folder) turns taps into picks; a bar along
  the bottom then adds or removes tags, moves them into a folder, marks
  them read or unread, or deletes them. A long press on a folder picks
  all its pages.
- Press and hold a page in the library or a folder for its menu without
  opening it: open, share, send, the original, tags, folder, mark as
  read, select, full images and delete. Right-click does the same on a
  computer.
- Contents in the reader: the list icon jumps to any heading of a long
  page, with the part you're in marked.
- Tap the text to hide the reader's bar, and tap again to bring it back.
  While the bar is up, the bottom shows the part you're reading and the
  minutes left.

### Changed
- The library is in sections: Continue reading (the page you read last),
  Folders as a row of tiles, then your pages. A sort menu orders them by
  newest saved, last read, longest or site. Tags sit behind their own
  chip so Unread and Finished stay in reach. Search opens from its icon,
  and Settings has a gear.
- Cards only mention offline when something needs a look ("2 previews
  missing", "Images online"); "Offline ready" is gone from every card.
- Settings is a short menu: Appearance (theme and reading type
  together), Saving, Storage and backup, Updates and About, each on its
  own screen. On a computer the menu stays on the left.
- The reader's ⋯ is in groups: Share, Send and Original at the top, then
  this page's tags and folder, the series, and the rest. Original moved
  there from the bar.

## [0.18.0] - 2026-10-02

### Added
- Back up the whole library to one file: Settings, Backup, "Back up the
  library" makes a file with every page, its pictures, tags, folders and
  where you were, and hands it to the share sheet so you can keep it in
  your files, a cloud drive or an email. "Restore or open a file" brings
  it back on a new phone or after reinstalling. When a page is in both,
  the copy saved last is kept.
- Share a page from ⋯: "Share link" sends its address, and "Send as a
  file" sends the page itself as one HTML file, with its pictures inside,
  that opens in any browser. Opened in Carry-on, it comes back into the
  library with its tags and folder.

## [0.17.0] - 2026-10-02

### Added
- Big pictures are made smaller on the phone. A preview wider than the
  screen needs is redrawn at 480 px, so a news site's 3 MB photo takes
  about 40 KB. Logos and diagrams with see-through parts stay sharp
  PNGs.
- Wikipedia pictures carry their own credit under the caption, like
  "Jane Doe, CC BY-SA 4.0", and in the full-screen view.
- Save full images for one page: ⋯ swaps its previews for the full
  pictures, for a map, a diagram or a comic. Save several has the same
  choice for everything it saves, without changing Settings.
- Each folder shows its size, on its card and on its screen.
- Save next works on pages saved before 0.10.0: the first time, it
  looks at the original page for the next link.

### Fixed
- A caption with a link in it was spread out in pieces across the line.
- Pages saved with full images no longer download each picture again
  when you read them online.

## [0.16.0] - 2026-10-02

### Added
- Search your library. Titles, sites, tags and folders match as you
  type, and a moment later the words of every saved page too, with the
  sentence they're in shown on the card. Every word you type has to be
  there. Case, accents, Hebrew niqqud and Arabic harakat don't matter,
  so "שלום" finds "שָׁלוֹם". The filter chips still apply.

## [0.15.0] - 2026-10-02

### Added
- Reorder a folder: Reorder on its screen puts up and down buttons on
  each page; Done puts them away. Next and Previous follow the new order.
- Remove a folder, keeping its pages in the library, or delete it with
  all its pages (asked once more first).
- Add pages from a folder's screen: Save several opens with that folder
  picked, and you're back on the folder when it's done.
- A Save several button beside Save, so you don't need to paste a list
  first.
- Tags in Save several, given to every page it saves.

### Fixed
- A stray "null" under a page's controls in ⋯, and at the end of a
  folder with no next link.

## [0.14.0] - 2026-10-02

### Added
- Tap an image in a saved page to see it full screen. Pinch or double-tap
  to zoom, drag to look around, and swipe down, tap ×, or go back to
  close it. It shows the full image when you're online and the saved
  preview when you're not, with its caption underneath.

### Changed
- Behind the scenes, the code now uses the same names for things as the
  app and its notes do. Nothing you'd notice.

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
