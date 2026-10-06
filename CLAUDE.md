# Waypage

An offline reader: save a web page (a Wikipedia article, a news story) to
the phone, read it with no connection, on a plane, with a link back to the
original. Plain HTML, CSS and JS with **no build step and no
dependencies**, served as static files and wrapped by Capacitor for
Android and iOS. Started from LifeLog (danielnoam/lifelog), which it
borrows its stack, build workflows and native-fetch trick from.

## Before anything

- `git pull --ff-only` first.
- Read **docs/PROPOSAL.md** before changing architecture: it records why
  there is no server, how a page is captured and stored, and the legal and
  store rules the design keeps to. **TODO.md** is the work, **NOTES.md**
  why things are the way they are, **DROPPED.md** what was decided against.

## Decisions already made (2026-10-02)

- **Name:** Waypage (was Carry-on until 1.0.0, 6 Oct 2026). Store title
  "Waypage: Offline Reader". The repo was danielnoam/carry-on; GitHub
  redirects the old name. The signing key keeps its alias `carryon`.
- **No server for the phone app.** Pages and images are fetched on the
  device with CapacitorHttp and `Filesystem.downloadFile`, which CORS
  doesn't apply to (LifeLog does the same since its 0.215.0). A server is
  only for a desktop browser version, which is undecided; if it ever
  exists it is stateless, authenticated, rate-limited and stores nothing.
- **Images are saved like videos:** a small local preview (about 480 px
  wide, ~30 KB) plus the link to the full image, which loads when online.
  Settings offer "Full images" (for maps and diagrams) and "Links only".
  Videos are never downloaded: thumbnail plus link, plays when online.
- **Saved HTML is untrusted.** It is rendered in a sandboxed iframe with no
  `allow-scripts` and a strict CSP, never in the app's own document: a
  script there could reach the Capacitor plugins.
- **Look:** Apple HIG as the rulebook, Motion-style springs, vanilla JS.
  Themes Paper (default), Sepia, Night. Reading type Source Serif 4,
  interface type Instrument Sans, both bundled. See DESIGN.md.
- **Wikipedia** goes through its REST API, with a User-Agent naming the
  app, and every saved Wikipedia page shows "CC BY-SA 4.0, Wikipedia
  contributors" and the original link.

## Design references

- Proposal doc: https://claude.ai/code/artifact/5c6cf847-cd85-4c91-a466-2da95fbde60b
  (copied into docs/PROPOSAL.md)
- Design canvas: https://claude.ai/artifact/5zi1VCs3WcLSTLJCw7iasC
  (its artboards are copied into design/, open them for the exact markup)

## UI work

- **DESIGN.md** is the design language. Colors are tokens, sizes come from
  the scales, every animation has a reduced-motion answer, touch targets
  are 44px, and every theme (Paper, Sepia, Night) is checked for WCAG AA.

## Shipping

- Use the `release-checklist` skill for every change: version bump (three
  places), CHANGELOG.md, notes files, `node test/run-all.js`, verify at
  phone and desktop width, then commit and push straight to `main`.
- `main` is production. A push deploys the web copy, and a new
  `APP_VERSION` publishes the APK and IPA. Check the runs went green.
