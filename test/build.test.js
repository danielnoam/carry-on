// The native build's tools and the release bookkeeping: `node test/build.test.js`.
//
// No Android SDK or Mac here, but the ways a build quietly breaks can be
// checked without one: a bundle missing a file the page or its CSS loads,
// a versionCode that doesn't go up, and a version that disagrees with
// CHANGELOG.md or the ?v= on index.html's tags.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { build, assetList, referencedByIndex, appVersion } = require("../tools/build-www.js");
const { versionCode } = require("../tools/android-version.js");
const manifest = require("../tools/android-manifest.js");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "carryon-www-")), "www");
build(out);

test("every file index.html loads is in the bundle", () => {
  for (const f of referencedByIndex()) assert.ok(fs.existsSync(path.join(out, f)), f + " missing");
});

test("every file a stylesheet in src/ loads is in sw.js's ASSETS", () => {
  const assets = assetList();
  for (const f of fs.readdirSync(path.join(ROOT, "src")).filter((n) => n.endsWith(".css"))) {
    assert.ok(assets.includes("src/" + f), "src/" + f + " not in ASSETS");
    const css = fs.readFileSync(path.join(ROOT, "src", f), "utf8");
    for (const [, url] of css.matchAll(/url\("([^"]+)"\)/g)) {
      assert.ok(assets.includes("src/" + url), "src/" + url + " (from " + f + ") not in ASSETS");
    }
  }
});

test("every script in src/ is in sw.js's ASSETS", () => {
  const assets = assetList();
  for (const f of fs.readdirSync(path.join(ROOT, "src")).filter((n) => n.endsWith(".js"))) {
    assert.ok(assets.includes("src/" + f), "src/" + f + " not in ASSETS");
  }
});

test("the bundle carries app-build.json with the version", () => {
  const info = JSON.parse(fs.readFileSync(path.join(out, "app-build.json"), "utf8"));
  assert.strictEqual(info.version, appVersion());
});

test("the app's index.html is marked native and edge to edge", () => {
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.ok(/viewport-fit=cover/.test(html));
  assert.ok(/<html[^>]*class="native"/.test(html));
});

test("CHANGELOG.md's newest entry is APP_VERSION", () => {
  const m = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8").match(/^## \[([^\]]+)\]/m);
  assert.ok(m, "no version heading");
  assert.strictEqual(m[1], appVersion());
});

test("every ?v= in index.html is APP_VERSION", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const vs = [...html.matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
  assert.ok(vs.length > 0);
  for (const v of vs) assert.strictEqual(v, appVersion());
});

test("versionCode goes up with every version", () => {
  assert.strictEqual(versionCode("0.1.0"), 1000);
  assert.ok(versionCode("0.2.0") > versionCode("0.1.9"));
  assert.ok(versionCode("1.0.0") > versionCode("0.999.999"));
  assert.throws(() => versionCode("0.1"));
});

test("the manifest gains REQUEST_INSTALL_PACKAGES for the updater, once", () => {
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="Carry-on">\n    </application>\n</manifest>\n';
  const once = manifest.patch(xml);
  assert.ok(/<manifest[^>]*>\s*<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" \/>/.test(once));
  assert.strictEqual(manifest.patch(once), once);
  assert.throws(() => manifest.patch("<nothing/>"));
});

test("android.yml patches the manifest and the updater's plugin is installed", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  assert.ok(/npx cap add android\s+node tools\/android-manifest\.js/.test(yml));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.devDependencies["@capawesome-team/capacitor-file-opener"]);
});

test("the updater downloads the asset the workflow publishes", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  const platform = fs.readFileSync(path.join(ROOT, "src", "platform.js"), "utf8");
  assert.ok(/gh release create "app-v\$V" CarryOn\.apk/.test(yml));
  assert.ok(platform.includes('"/releases/download/app-v" + version + "/CarryOn.apk"'));
});

console.log("\n" + passed + " passed");
