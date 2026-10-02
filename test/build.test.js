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

console.log("\n" + passed + " passed");
