// Adds what Carry-on needs to the generated AndroidManifest.xml. From
// LifeLog's tools/android-manifest.js, without its scanner and storage
// entries.
//
//   node tools/android-manifest.js
//
// - REQUEST_INSTALL_PACKAGES, for the in-app updater (0.2.0): without it,
//   Android refuses to install an APK that an app hands it. Play restricts
//   this permission; a sideloaded app is exactly what it's for. The user still
//   approves each install on Android's own screen, and once, in Settings,
//   whether Carry-on may install apps at all.
//
// Idempotent, and fails loudly if a tag it needs can't be found.
const fs = require("fs");
const path = require("path");

const ENTRIES = [
  { inside: "manifest", xml: '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />' },
];

function patch(xml) {
  let out = xml;
  for (const { inside, xml: entry } of ENTRIES) {
    const name = entry.match(/android:name="([^"]+)"/)[1];
    if (out.includes('android:name="' + name + '"')) continue;
    const at = out.search(inside === "application" ? /<application\b[^>]*>/ : /<manifest\b[^>]*>/);
    if (at < 0) throw new Error("no <" + inside + "> tag in AndroidManifest.xml");
    const end = out.indexOf(">", at) + 1;
    out = out.slice(0, end) + "\n    " + (inside === "application" ? "    " : "") + entry + out.slice(end);
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
