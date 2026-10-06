---
name: waypage-design
description: Waypage's design language applied: how to build or change any UI in Waypage (danielnoam/waypage) so it matches DESIGN.md. Tokens and the Paper/Sepia/Night themes, type and space scales, the library card, reader bar, image and video figures, copy voice and accessibility. Use whenever adding or restyling a screen, control or user-facing text.
---

# Building Waypage UI

1. Read `DESIGN.md` first; the design canvas
   (https://claude.ai/artifact/5zi1VCs3WcLSTLJCw7iasC, copies in
   `design/`) shows each component drawn out.
2. Colors: only `var(--token)` from `src/styles.css`. A new color is a new
   token in all three themes, and `node test/contrast.test.js` passes.
3. Sizes: font sizes from the `--fs-*` scale, spacing from `--s-1`…`--s-9`,
   radii from `--r-*`. No one-off pixel values except where DESIGN.md
   names them (48px inputs, 44px targets).
4. Type: reading text and titles in `var(--serif)`, controls and meta in
   `var(--sans)`.
5. Build from the helpers in `src/app.js` (`el`, `toast`); real buttons,
   links and labelled inputs; `aria-label` on icon-only buttons.
6. Motion: springs per DESIGN.md §4, and a reduced-motion answer for every
   animation.
7. Copy: short and about the reader's situation ("Plays when you're back
   online"); buttons are verbs; errors say what to do next.
8. Check at 390px and ~1280px in Paper, Sepia and Night before calling it
   done.
