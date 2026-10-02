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

- **Library card (Now):** reading line "9 min", "6 min left" with a 3 px
  accent line under the status, or "Finished". Site line with
  favicon, serif title, then status: a progress bar and "Saving · 14 of 31
  image previews", or "9 min · 1.4 MB · Offline ready", or "Text saved · 3
  previews missing · Retry".
- **Reader top bar:** back, an "Offline" pill when there is no connection,
  "Original" with an arrow (opens the source in the phone's browser), and
  "Aa" for text size and theme. Hides on scroll down, returns on scroll up.
  Now: back, Offline, Original, Aa and ⋯ (This page); hiding is Target.
- **Aa sheet (Now):** rises from the bottom on the sheet spring, the one
  soft shadow, no scrim. Rows: text size (A, five dots, A), spacing and
  font as segmented controls, theme as four swatches. Tapping the page or
  back closes it.
- **Page sheet (Now):** ⋯ opens it in the Aa sheet's place. Tags as
  round chips (accent fill, × to remove), an "Add a tag" field, then
  "+ tag" chips for tags used elsewhere, most used first. "Delete this
  page" last, as a full-width row in the warn colour.
- **Folder card (Now):** the first page's picture with two sheets
  peeking behind it, "Folder · 12 pages · 3 read", the folder's name as
  the title, then "Start:", "Continue:" or "Next:" and the page, or "All
  read". The thin accent line shows pages read out of the folder.
- **Folder screen (Now):** pushed like Settings. The count, a full-width
  primary button to carry on, then the pages as a numbered group; the
  next one's number is in the accent.
- **Next in a folder (Now):** at the end of the page, after the licence,
  a bordered block "Next in Novel" over the title in the accent serif. In
  ⋯, Previous and Next side by side, dimmed when there's none.
- **Save several (Now):** a pushed screen. "Links" with the links one a
  line in an editable box and a count under it, "Folder" with None and
  each folder as chips plus a "New folder" field, a note that pages keep
  the links' order, then a full-width "Save 4 pages into Novel". Saving
  goes back to the library, where the queued cards say "Waiting · into
  Novel" until their turn.
- **Saving card (Now):** a 12 px ring turning (accent arc on the line
  colour) before the status, a bar that sweeps while the page downloads
  and fills as images land, and "Getting the page · 12 s" once it passes
  five seconds. A page that builds itself says "Letting the page draw
  itself" while it's drawn. Reduced motion: both breathe instead.
- **Reader bar and progress (Now):** the bar slides up out of the way
  while reading on down (control spring), and back on a scroll up, at the
  top or the end, or with a sheet up. A 3 px accent line along the bottom
  fills with the position, from the page's start side; it's decoration
  (aria-hidden), the page itself being the content. Reduced motion: the
  bar appears and disappears without sliding.
- **Save next (Now):** "Save next" with 1, 5 and 10 as chips, in ⋯ and
  at the end of a folder's list, when the last page has a next link.
- **Updates (Now):** a Settings section: "This version", a status row
  (spinner while checking or downloading; "Carry-on 0.12.0 is out" in the
  accent with Update / 42% / Install, or Get it on iOS), what's in it as
  the release's headed lists, Check for updates, and What's new. The
  library's bar says "Carry-on 0.12.0 is out" with View, or "Updated to
  0.11.0" with What's new, and an × to put it away.
- **What's new (Now):** a pushed screen; each version a serif heading
  with its date, "You have this" by the installed one, then its Added /
  Changed / Fixed as small overlines over bulleted sentences.
- **Filter chips (Now):** under the library's meta line, scrolling edge
  to edge: All, Unread, Finished, then #tags. The chosen one is filled
  with the accent; tapping it again goes back to All. Hidden while the
  library is empty. Chips are 36 px to the eye and 44 px to the touch.
- **Image figure (Now):** saved preview, caption, "Full size online" on the
  right. Online, the full image replaces the preview in place; a tap opens
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
online", "Offline ready", "3 previews missing". Buttons are verbs ("Save",
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
