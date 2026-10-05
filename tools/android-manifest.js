// Adds what Carry-on needs to the generated AndroidManifest.xml. From
// LifeLog's tools/android-manifest.js, without its storage entries.
//
//   node tools/android-manifest.js
//
// - REQUEST_INSTALL_PACKAGES, for the in-app updater (0.2.0): without it,
//   Android refuses to install an APK that an app hands it. Play restricts
//   this permission; a sideloaded app is exactly what it's for. The user still
//   approves each install on Android's own screen, and once, in Settings,
//   whether Carry-on may install apps at all.
//
// - An intent filter on MainActivity for text shared from another app
//   (0.3.0): it's what puts Carry-on in Chrome's share sheet. A share
//   arrives as ACTION_SEND with the link in EXTRA_TEXT, which
//   native/share's ShareTarget plugin hands to the page.
//
// - The ML Kit meta-data that has Play services fetch its barcode scanner
//   when the app is installed (0.30.1, sync's setup code), so the first
//   scan doesn't wait for it. The scanner is Google's own screen, which is
//   why Carry-on needs no camera permission.
//
// Idempotent, and fails loudly if a tag it needs can't be found.
const fs = require("fs");
const path = require("path");

const ENTRIES = [
  { inside: "manifest", xml: '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />' },
  { inside: "application", xml: '<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui"/>' },
  {
    inside: "main-activity",
    xml: '<intent-filter>\n' +
      '                <action android:name="android.intent.action.SEND" />\n' +
      '                <category android:name="android.intent.category.DEFAULT" />\n' +
      '                <data android:mimeType="text/plain" />\n' +
      '            </intent-filter>',
  },
];
const TAGS = {
  manifest: /<manifest\b[^>]*>/,
  application: /<application\b[^>]*>/,
  "main-activity": /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/,
};
const INDENT = { manifest: "    ", application: "        ", "main-activity": "            " };

function patch(xml) {
  let out = xml;
  for (const { inside, xml: entry } of ENTRIES) {
    const name = entry.match(/android:name="([^"]+)"/)[1];
    if (out.includes('android:name="' + name + '"')) continue;
    const m = TAGS[inside].exec(out);
    if (!m) throw new Error("no <" + inside + "> tag in AndroidManifest.xml");
    const end = m.index + m[0].length;
    out = out.slice(0, end) + "\n" + INDENT[inside] + entry + out.slice(end);
  }
  return out;
}

if (require.main === module) {
  const file = path.resolve(__dirname, "..", "android", "app", "src", "main", "AndroidManifest.xml");
  const before = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, patch(before));
  const n = ENTRIES.length;
  console.log("android: manifest " + (before === patch(before) ? "already has" : "gained") + " " + n + " Carry-on entr" + (n === 1 ? "y" : "ies"));
}
module.exports = { patch, ENTRIES };
