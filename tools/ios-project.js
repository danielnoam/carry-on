// Adds what Carry-on needs to the generated iOS project, and stamps the
// version. From LifeLog's tools/ios-project.js, without its widgets, QR
// scanner and Face ID entries.
//
//   node tools/ios-project.js
//
// Info.plist gains ITSAppUsesNonExemptEncryption = false (the app uses only
// the system's HTTPS), which spares a question on every TestFlight upload.
// project.pbxproj gets MARKETING_VERSION = APP_VERSION and
// CURRENT_PROJECT_VERSION = the same number Android's versionCode is.
//
// Idempotent, and fails loudly if what it edits isn't where it expects.
const fs = require("fs");
const path = require("path");
const { appVersion } = require("./build-www");
const { versionCode } = require("./android-version");

const PLIST = [
  ["ITSAppUsesNonExemptEncryption", "<false/>"],
];

function patchPlist(xml) {
  let out = xml;
  for (const [key, value] of PLIST) {
    if (out.includes("<key>" + key + "</key>")) continue;
    const end = out.lastIndexOf("</dict>");
    if (end < 0 || !/<plist\b/.test(out)) throw new Error("Info.plist has no top-level <dict>");
    out = out.slice(0, end) + "\t<key>" + key + "</key>\n\t" + value + "\n" + out.slice(end);
  }
  return out;
}

function stampPbxproj(src, v) {
  const build = versionCode(v);
  if (!/MARKETING_VERSION = [^;]+;/.test(src) || !/CURRENT_PROJECT_VERSION = [^;]+;/.test(src)) {
    throw new Error("project.pbxproj has no MARKETING_VERSION / CURRENT_PROJECT_VERSION to stamp");
  }
  return src
    .replace(/MARKETING_VERSION = [^;]+;/g, "MARKETING_VERSION = " + v + ";")
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = " + build + ";");
}

if (require.main === module) {
  const app = path.resolve(__dirname, "..", "ios", "App");
  const plist = path.join(app, "App", "Info.plist");
  const pbx = path.join(app, "App.xcodeproj", "project.pbxproj");
  const v = appVersion();
  fs.writeFileSync(plist, patchPlist(fs.readFileSync(plist, "utf8")));
  fs.writeFileSync(pbx, stampPbxproj(fs.readFileSync(pbx, "utf8"), v));
  console.log("ios: Info.plist has " + PLIST.length + " Carry-on key(s); version " + v + " (" + versionCode(v) + ")");
}
module.exports = { patchPlist, stampPbxproj, PLIST };
