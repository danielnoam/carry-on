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
text size is adjustable in five steps from 16 to 24 px (Target).

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

- **Library card (Now in design, Target in code):** site line with
  favicon, serif title, then status: a progress bar and "Saving · 14 of 31
  image previews", or "9 min · 1.4 MB · Offline ready", or "Text saved · 3
  previews missing · Retry".
- **Reader top bar:** back, an "Offline" pill when there is no connection,
  "Original" with an arrow (opens the source in the phone's browser), and
  "Aa" for text size and theme. Hides on scroll down, returns on scroll up.
- **Image figure:** saved preview, caption, "Full size online" on the
  right. Online, the full image replaces the preview in place; a tap opens
  it full screen. No preview saved: dashed border, image glyph, the page's
  alt text, "Image loads when you're online".
- **Video figure:** local thumbnail, play glyph (dimmed offline), title and
  site, "Plays when you're back online". Online: "Tap to play on
  YouTube", opening the original. Nothing autoplays.
- **Save setting:** radio list: "Previews and links" (default, about 30 KB
  an image), "Full images" (about 150 KB, for maps and diagrams), "Links
  only".
- **Licence footer:** on every page whose licence asks for it, e.g. "Text
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
