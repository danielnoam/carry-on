// Adds what Waypage needs to the generated iOS project, and stamps the
// version. From LifeLog's tools/ios-project.js, without its widgets and
// Face ID entries.
//
//   node tools/ios-project.js
//
// Info.plist gains ITSAppUsesNonExemptEncryption = false (the app uses only
// the system's HTTPS), which spares a question on every TestFlight upload,
// and the "audio" background mode, so Read aloud (0.27.0) goes on with the
// screen locked, and NSCameraUsageDescription for scanning sync's setup
// code (0.30.1): on iOS the scanner plugin opens the camera itself, and iOS
// closes an app that does that without saying why. UIFileSharingEnabled
// and LSSupportsOpeningDocumentsInPlace (0.33.0) show the app's Documents
// folder, where the library already is, in the Files app as "Waypage".
// The oldest iOS goes from the template's 15.0 to 15.5, in the project and
// the Podfile alike: Google's ML Kit, which the scanner is built on, needs
// 15.5, and pod install refuses a project asking for less than a pod.
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
  ["UIBackgroundModes", "<array>\n\t\t<string>audio</string>\n\t</array>"],
  ["NSCameraUsageDescription", "<string>Waypage uses the camera to read the sync setup code from your other device.</string>"],
  ["UIFileSharingEnabled", "<true/>"],
  ["LSSupportsOpeningDocumentsInPlace", "<true/>"],
];
const MIN_IOS = "15.5";

function raiseMinIos(podfile) {
  if (!/platform :ios, '[\d.]+'/.test(podfile)) throw new Error("Podfile has no platform :ios line");
  return podfile.replace(/platform :ios, '[\d.]+'/, "platform :ios, '" + MIN_IOS + "'");
}

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
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = " + build + ";")
    .replace(/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g, "IPHONEOS_DEPLOYMENT_TARGET = " + MIN_IOS + ";");
}

if (require.main === module) {
  const app = path.resolve(__dirname, "..", "ios", "App");
  const plist = path.join(app, "App", "Info.plist");
  const pbx = path.join(app, "App.xcodeproj", "project.pbxproj");
  const v = appVersion();
  fs.writeFileSync(plist, patchPlist(fs.readFileSync(plist, "utf8")));
  fs.writeFileSync(pbx, stampPbxproj(fs.readFileSync(pbx, "utf8"), v));
  const podfile = path.join(app, "Podfile");
  fs.writeFileSync(podfile, raiseMinIos(fs.readFileSync(podfile, "utf8")));
  console.log("ios: Info.plist has " + PLIST.length + " Waypage key(s); version " + v + " (" + versionCode(v) + "); iOS " + MIN_IOS + " and later");
}
module.exports = { patchPlist, stampPbxproj, raiseMinIos, PLIST, MIN_IOS };
