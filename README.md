# Waypage

Save a web page to your phone and read it with no connection: on a plane,
in a tunnel, anywhere. Text is kept whole, images keep a small preview
with a link to the full size, and videos keep a thumbnail that plays when
you're back online. Every saved page links back to the original.

Plain HTML, CSS and JS with no build step and no dependencies. The same
files run in a browser (GitHub Pages) and, wrapped by
[Capacitor](https://capacitorjs.com), as the Android and iOS apps.

**Status:** saving and reading work: paste a link, read it offline.
Sharing to the app from other apps is next (see TODO.md).

## Run it

`node server.js` (or double-click `start.cmd` on Windows) and open
<http://localhost:5173>.

## The phone apps

- **Android:** `.github/workflows/android.yml` builds an APK on every push
  and publishes a release `app-v<version>` when `APP_VERSION` is new and
  the signing secrets are set (`ANDROID_KEYSTORE_B64`,
  `ANDROID_KEYSTORE_PASSWORD`, key alias `carryon`, kept from before the rename). Without them it still
  builds a test APK but publishes nothing.
- **iOS:** `.github/workflows/ios.yml` builds an unsigned `Waypage.ipa`
  on a Mac runner and attaches it to the same release. Install it with
  AltStore or SideStore; shipping to other people needs Apple's developer
  programme.
- **Locally:** `npm install`, `npm run android:sync`, then open `android/`
  in Android Studio.

## Layout

```
index.html          app shell
src/fonts.css       the bundled fonts, for the app and the reader
src/styles.css      tokens, themes, layout (see DESIGN.md)
src/reader.css      the saved page inside the reader's sandboxed iframe
src/platform.js     browser vs app: native fetch, downloads, opening links
src/store.js        page folders and the library index (IndexedDB in a browser)
src/save.js         link to saved page: Wikipedia adapter, Readability,
                    the allowlist cleaner, image previews, video cards
src/reader.js       shows a saved page in the sandboxed iframe
src/motion.js       the springs from DESIGN.md, for screens, cards and bars
src/app.js          version, state, the library, reader and Settings
src/vendor/         Mozilla Readability 0.6.0 (Apache-2.0)
src/fonts/          Source Serif 4, Instrument Sans (OFL)
native/share/       Capacitor plugin: Android's share sheet into the app
sw.js               offline cache for the web copy; its ASSETS list is
                    also what goes into the app
tools/              build-www (copies the app into www/), Android and iOS
                    project patches, APK signing
test/               node test/run-all.js
design/             the design canvas's artboards, for reference
docs/PROPOSAL.md    architecture, storage, legal and store decisions
```

## Notes files

- **TODO.md** the work still to do
- **NOTES.md** why things are the way they are
- **DROPPED.md** what was decided against, and why
- **CHANGELOG.md** what each version shipped
