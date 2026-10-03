# Carry-on design language

A quiet reading app: the page is the product and the chrome gets out of
its way. Apple's Human Interface Guidelines are the rulebook (minimal
chrome, large targets, soft depth, generous space); motion is spring-based
and never blocks input. Every rule here is **Now** (in the code) or
**Target** (agreed, not built yet). The design canvas the values came
from: https://claude.ai/artifact/5zi1VCs3WcLSTLJCw7iasC, with its
artboards copied into `design/`.

## 1. Color (Now, `src/styles.css`)

Every color is a token on `:root`, redefined per theme on
`[data-theme]`. No hex values outside the token block.

| Token | Paper (default) | Sepia | Night | Use |
| --- | --- | --- | --- | --- |
| `--bg` | #F7F4EE | #F1E7D3 | #0F1216 | Page ground |
| `--surface` | #FFFFFF | #F8F0DF | #171B21 | Cards, bars, inputs |
| `--ink` | #1C1B19 | #2B2118 | #E6E2D9 | Text |
| `--muted` | #5E5A53 | #6B5A45 | #9AA1AB | Meta text, captions |
| `--accent` | #2F5D8A | #8A4B22 | #8DB4E2 | Links, primary button, progress |
| `--accent-ink` | #FFFFFF | #FFFFFF | #0F1216 | Text on an accent fill |
| `--line` | #E4DED3 | #E0D2B8 | #252B33 | Borders, dividers |
| `--preview` | #D9E2EA | #E3D5BC | #232A33 | Empty image preview |
| `--ok` | #1F6F5C | #3F6B2E | #7CC4A8 | "Offline ready" |
| `--warn` | #8A4B22 | #8A4B22 | #E0A46E | "Previews missing", retry |
| `--video` | #3A4048 | #4A3F33 | #262C34 | Video card ground behind the thumbnail |
| `--on-video` | #FFFFFF | #FFFFFF | #FFFFFF | Play glyph |
| `--scrim` | black 55% | black 55% | black 55% | Play button disc |
| `--viewer` | #0B0D10 | #0B0D10 | #0B0D10 | Behind a full-screen image (with `--on-video` for its controls) |
| `--shadow` | black 8% | brown 10% | black 45% | The one soft shadow: a screen pushed over the library |

Night is for a dim cabin: no pure white text, no pure black ground.
"System" follows the phone's light or dark setting (Paper or Night).

Contrast: text tokens (`--ink`, `--muted`, `--accent`, `--ok`, `--warn`)
meet WCAG AA (4.5:1) on `--bg` and `--surface` in every theme. Check with a
contrast script before changing any value.

## 2. Type (Now)

Two families, both bundled in `src/fonts` (OFL), Latin subset. Other
scripts (Hebrew, Arabic, CJK) fall back to the system font by
`unicode-range`, which is intended.

| Role | Family | Size / line | Weight |
| --- | --- | --- | --- |
| Article title | Source Serif 4 | 32 / 38 | 700 |
| Article heading | Source Serif 4 | 22 / 28 | 600 |
| Body | Source Serif 4 | 19 / 30 | 400 |
| Screen title | Source Serif 4 | 28 / 34 | 700 |
| Card title | Source Serif 4 | 18 / 23 | 600 |
| Label, button | Instrument Sans | 15 / 20 | 500–600 |
| Meta, caption | Instrument Sans | 13 / 18 | 400 |
| Overline | Instrument Sans | 13 / 18 | 600, caps, 0.08em |

Body text runs at about 65 characters a line (`max-width: 38rem`). Reader
text size is adjustable in five steps (16, 18, 19, 21, 24 px), line
spacing in three (1.4, 1.58, 1.8 times the size), and the font between
Source Serif 4 and Instrument Sans (Now).

## 3. Space, shape, depth (Now)

- Spacing on an 8-point grid: 4, 8, 12, 16, 24, 32, 40, 56, 72
  (`--s-1` … `--s-9`). Phone side gutter 16 px; reader gutter 20 px.
- Radius: 8 (swatches, small), 12 (figures, inputs, buttons), 16 (cards).
  Chips are fully round.
- Depth comes from `--line` borders and grounds, not shadows. One soft
  shadow is allowed on sheets that float over content (Target).

## 4. Motion (Target)

- Springs, not durations: stiffness 400, damping 32 for sheets and cards;
  stiffness 600, damping 40 for small controls. Motion's plain-JS
  `animate()` if a library is ever added; CSS `linear()` spring curves
  until then.
- Nothing animates text the reader is reading.
- `prefers-reduced-motion: reduce`: springs become a 120 ms opacity fade.

## 5. Components

- **Library (Now):** title, then Select (a tick in a circle) and
  Settings (a gear) as 44 px icons; the count; search, always open.
  Without a search the library is in sections, each with an overline:
  "Continue reading" (the started page read last, one card; Settings,
  Appearance, Library can turn it off), "Folders" (a row of tiles that
  scrolls sideways on a phone and wraps on a desktop), then the filter
  chips, then "Pages" or "Pages in no folder · N" with the order on the
  right ("Newest saved", "Last read", "Longest", "Site", a quiet select
  with an arrows icon). A filter lists every page it matches, folder
  pages too, under "Unread · 4" or "#trip · 3"; a search lists pages
  only, under "Found · 2". At 900 px and wider the pages are two
  columns.
- **Library card (Now):** thumbnail, site line (site, folder, #tags),
  serif title, then the reading line ("9 min", "6 min left" with a 3 px
  accent line, or "Finished") and the size. A status only when it needs
  a look: "2 previews missing · Retry" in warn, or "Images online".
- **Folder tile (Now):** 136 px wide, its first picture (or a folder
  glyph on `--preview`), the name in the serif, "3 of 12 read" and a thin
  accent line.
- **Picking (Now):** the library and folder screens get a circle at
  each card's top end (24 px, a 2 px muted ring), filled with the accent
  and a tick once picked, and the card's border turns accent. A bar over
  the top: Cancel, "3 pages picked", Select all (or Pick none), accent
  text buttons. A bar along the bottom: Tags, Folder, Mark read (or
  unread), Delete (warn), icon over label, 56 px, dimmed until something
  is picked.
- **Library sheet (Now):** a long press (or right-click) on a page: the
  sheet from the bottom over a `--scrim` dim, with the page's title and
  facts, then the same groups as ⋯ plus Open first and Select under More.
  For picked pages it holds Tags (chips on all filled, on some dashed
  with "2/5", a New tag field, Done) or Folder (each folder as a chip, a
  New folder field, "Take out of their folders").
- **Reader top bar (Now):** back, an "Offline" pill when there is no
  connection, then Contents (a list icon, only when the page has two or
  more headings), Aa and ⋯. A tap on the text hides and shows it;
  scrolling down hides it and up brings it back.
- **Reader foot (Now):** with the bar up, a meta-size line over the
  progress line: the heading of the part being read on the start side,
  "12 min left" (or "End") on the end side. It slides down with the bar.
- **Contents sheet (Now):** the page's h2s, h3s indented, as rows in a
  group; the part being read in the accent with a 3 px accent rule on its
  start edge. A tap jumps there, just under the bar.
- **Aa sheet (Now):** rises from the bottom on the sheet spring, the one
  soft shadow, no scrim. Rows: text size (A, five dots, A), spacing and
  font as segmented controls, theme as four swatches. Tapping the page or
  back closes it.
- **Page sheet (Now):** ⋯ opens it in the Aa sheet's place, in groups
  in the order they're used. Share, Send and Original as three tiles (72 px,
  accent icon over the label). "This page": tags as round chips (accent
  fill, × to remove), an "Add a tag" field, then "+ tag" chips for tags
  used elsewhere; the folder the same way. "Series": Previous and Next
  side by side, and Save previous and Save next. "More": a group of rows,
  Send as EPUB, Print or save as PDF, Mark as read or unread, Save full
  images (counting "Saving full images, 3 of 12"),
  then "Delete this page" in the warn colour. The sheet scrolls past 76%
  of the screen.
- **Settings (Now):** a menu of three groups: Appearance and Saving (the
  current choice on the right), Storage and backup (the total), Updates
  and About (the version). Each row ends with a chevron and pushes its
  own screen. A new version adds an accent-bordered "Carry-on 0.20.0 is
  out" card with View above the groups. At 900 px and wider the menu
  stays on the left (360 px) and the section fills the rest.
- **Storage and backup (Now):** the total in the title size, the page
  count, "Pages by size" (tap one to read it), then Backup.
- **Backup (Now):** under Storage on its screen: two
  accent rows, "Back up the library" (counting "Backing up, 12 of 80")
  and "Restore or open a file" (opening the system picker), then a
  footnote saying what a backup holds and that the copy saved last wins.
  The result is a toast, such as "Restored 12 pages. 3 already here were
  kept."
- **Folder screen (Now):** pushed like Settings. The count, the
  folder's tools, a full-width primary button to carry on, Save
  previous, then the pages as a numbered group (the next one's number in
  the accent), then Save next.
- **Next in a folder (Now):** at the end of the page, after the licence,
  a bordered block "Next in Novel" over the title in the accent serif. In
  ⋯, Previous and Next side by side, dimmed when there's none.
- **Save several (Now):** a pushed screen. "Links" with the links one a
  line in an editable box and a count under it, "Folder" with None and
  each folder as chips plus a "New folder" field, a note that pages keep
  the links' order, "Tags", then "Images" as a Previews / Full / Links
  segmented control set to the Settings choice (app only), then a
  full-width "Save 4 pages into Novel". Saving
  goes back to the library, where the queued cards say "Waiting · into
  Novel" until their turn.
- **Saving card (Now):** a 12 px ring turning (accent arc on the line
  colour) before the status, a bar that sweeps while the page downloads
  and fills as images land, and "Getting the page · 12 s" once it passes
  five seconds. A page that builds itself says "Letting the page draw
  itself" while it's drawn. Reduced motion: both breathe instead.
- **Reader bar and progress (Now):** the bar and the foot slide out of
  the way (control spring). A 3 px accent line along the bottom fills
  with the position, from the page's start side; it's decoration
  (aria-hidden), the page itself being the content. Reduced motion: the
  bar appears and disappears without sliding.
- **Library search (Now):** always there once something is saved: a
  44 px field on `--surface` under the library's count, magnifier inside
  on the start side, × to clear on the end side once there's text.
  Escape clears. Results are page cards;
  a text match adds its sentence in muted meta type under the title,
  two lines at most. None found: "Nothing matches “…”." (with " in
  Finished" and the like when a filter is on) and Clear search.
- **Folder screen tools (Now):** above the pages, the page sheet's tiles
  (64 px, accent icon over the label) three to a row on a phone and six
  in one row from 600 px: Add pages, Select, Reorder (dimmed with one
  page), Rename, EPUB, Remove (icon and label in the warn colour).
  Reorder swaps them for "Move pages with the arrows." and Done, and
  shows a chevron up and down (44 px, accent; disabled ones in
  `--line`) on each row. Remove asks in place: "Remove the
  folder, keep its N pages", "Delete the folder and its N pages" (warn,
  then a system confirm), Cancel.
- **Find chapters (Now):** in Save several, under the count, a small
  button "Find chapters on this page" while the box holds one link; it
  reads "Finding chapters…" while it looks, then the box holds the
  chapters and the folder field the novel's name.
- **Waiting card (Now):** more than three saves waiting for one folder
  show as one card: the site, "48 pages waiting to go into Skyward" in
  the card's title type, and Stop as a quiet button in the warn colour.
- **Book cover (Now):** a book's first picture, or a 1200 × 1800 title
  card: Paper's background, a 160 × 12 accent rule, the title in Source
  Serif 4 semibold (88 px, smaller to fit), the site in Instrument Sans
  at the foot in the muted colour; mirrored for right to left.
- **Save several button (Now):** a list icon (44 px) after Save in the
  save bar.
- **Image viewer (Now):** a tapped image fills the screen on `--viewer`,
  growing from where it sat (sheet spring), its caption below in
  `--on-video`, × top right on a `--scrim` disc (44 px). Pinch or double
  tap zooms (up to 5×), a swipe down fades the ground as it goes and
  closes past 120 px. Reduced motion: it fades in and out, and zoom
  steps without easing.
- **Save next and previous (Now):** "Save next" with 1, 5, 10 and All
  as chips, in ⋯ and under a folder's list, when the last page has a
  next link; "Save previous" the same above the list, for the first
  page. While a run saves, the chips dim and Stop (warn colour) joins
  them. Pages come one at a time, half a second apart.
- **Switch (Now):** 52 × 32, a `--muted` knob in a `--muted` outline
  when off; on, the track fills with the accent and the knob, in
  `--accent-ink`, slides to the end (mirrored right to left). A focus
  ring like every control's; the whole row is the target. Reduced motion: the knob
  moves without sliding.
- **Updates (Now):** a Settings screen: "This version", a status row
  (spinner while checking or downloading; "Carry-on 0.12.0 is out" in the
  accent with Update / 42% / Install, or Get it on iOS), what's in it as
  the release's headed lists, Check for updates, and What's new. The
  library's bar says "Carry-on 0.12.0 is out" with View, or "Updated to
  0.11.0" with What's new, and an × to put it away.
- **What's new (Now):** a pushed screen; each version a serif heading
  with its date, "You have this" by the installed one, then its Added /
  Changed / Fixed as small overlines over bulleted sentences.
- **Filter chips (Now):** under the library's meta line, scrolling edge
  to edge: All, Unread, Finished, then "Tags ▾", which opens a second row
  of #tags. The chosen one is filled with the accent (a chosen tag shows
  on the Tags chip with ×); tapping it again goes back to All. Hidden while the
  library is empty. Chips are 36 px to the eye and 44 px to the touch.
- **Image figure (Now):** saved preview, caption, "Full size online"
  floated to the end of the caption's first line. A credit, when the
  source gives one, goes on its own line under the caption, in meta size
  and muted. Online, the full image replaces the preview in place; a tap opens
  it full screen. No preview saved: dashed border, image glyph, the page's
  alt text, "Image loads when you're online".
- **Video figure (Now):** local thumbnail, play glyph (dimmed offline), title and
  site, "Plays when you're back online". Online: "Tap to play on
  YouTube", opening the original. Nothing autoplays.
- **Save setting:** radio list: "Previews and links" (default, about 30 KB
  an image), "Full images" (about 150 KB, for maps and diagrams), "Links
  only".
- **Licence footer (Now):** on every page whose licence asks for it, e.g. "Text
  from Wikipedia, CC BY-SA 4.0, by Wikipedia contributors. Read the
  original".

## 6. Voice

Short, plain, about the reader's situation: "Plays when you're back
online", "3 previews missing", "2 pages picked". Buttons are verbs ("Save",
"Retry"). Errors say what happened and what to do: "Couldn't reach this
page. Check the link, or try again when you're online."

## 7. Accessibility

- Touch targets at least 44 × 44 px.
- Real `<button>`, `<a href>`, `<input>` with `<label>`; `aria-label` on
  icon-only buttons.
- Focus is always visible (`:focus-visible` ring in `--accent`).
- The reader respects the system text size as a floor.
- Every theme is checked; colors that must be told apart also differ in
  lightness.
