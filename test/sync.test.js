// Sync's merge (0.30.0): `node test/sync.test.js`. Two devices changing
// the library at once, against the last library both saw.
const assert = require("assert");

global.window = { CarryOn: { platform: {} } };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
require("../src/sync.js");
const S = window.CarryOn.sync;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

const page = (id, more) => ({ id, url: "https://example.com/" + id, title: "Page " + id, savedAt: 100, at: 0, finished: false, ...more });
const lib = (pages, more) => ({ pages, deleted: {}, files: {}, ...more });
const ids = (r) => r.pages.map((p) => p.id).sort();
const NOW = 1e12;

test("the first sync sends everything; joining a library adds both sides", () => {
  assert.deepStrictEqual(ids(S.merge(null, lib([page("a1b2")]), null, NOW)), ["a1b2"]);
  assert.deepStrictEqual(ids(S.merge(null, lib([page("c3d4")]), lib([page("a1b2")]), NOW)), ["a1b2", "c3d4"]);
});

test("a page deleted on one device is deleted, and stays deleted", () => {
  const base = lib([page("a1b2"), page("c3d4")]);
  const r = S.merge(base, lib([page("c3d4")]), base, NOW);
  assert.deepStrictEqual(ids(r), ["c3d4"]);
  assert.ok(r.deleted.a1b2);
  // The other device, which still has it, takes the deletion.
  const r2 = S.merge(base, lib([page("a1b2"), page("c3d4")]), r, NOW);
  assert.deepStrictEqual(ids(r2), ["c3d4"]);
  // A device joining fresh doesn't bring it back.
  const r3 = S.merge(null, lib([page("a1b2")]), r, NOW);
  assert.deepStrictEqual(ids(r3), ["c3d4"]);
});

test("a page whose text hasn't come down yet isn't taken for a deletion", () => {
  const base = lib([page("a1b2")]);
  const r = S.merge(base, { pages: [], waiting: ["a1b2"] }, base, NOW);
  assert.deepStrictEqual(ids(r), ["a1b2"]);
});

test("different fields changed on each side both stay", () => {
  const base = lib([page("a1b2")]);
  const r = S.merge(base, lib([page("a1b2", { folder: "Trips", folderAt: 5 })]), lib([page("a1b2", { fav: true, favAt: 9 })]), NOW);
  assert.strictEqual(r.pages[0].folder, "Trips");
  assert.strictEqual(r.pages[0].fav, true);
  assert.strictEqual(r.pages[0].favAt, 9);
});

test("tags merge: added on either side stay, removed on either side go", () => {
  const base = lib([page("a1b2", { tags: ["planes", "history"] })]);
  const r = S.merge(base, lib([page("a1b2", { tags: ["planes", "history", "trips"] })]), lib([page("a1b2", { tags: ["planes", "maps"] })]), NOW);
  assert.deepStrictEqual(r.pages[0].tags.sort(), ["maps", "planes", "trips"]);
});

test("where you are goes with whichever device read last", () => {
  const base = lib([page("a1b2", { at: 0.1, readAt: 10 })]);
  const r = S.merge(base, lib([page("a1b2", { at: 0.6, readAt: 30 })]), lib([page("a1b2", { at: 0.3, readAt: 20, finished: false })]), NOW);
  assert.strictEqual(r.pages[0].at, 0.6);
  assert.strictEqual(r.pages[0].readAt, 30);
});

test("a page saved again wins its content from the newer copy", () => {
  const base = lib([page("a1b2", { title: "Old" })]);
  const r = S.merge(base, lib([page("a1b2", { title: "Old", tags: ["x"] })]), lib([page("a1b2", { title: "New", savedAt: 200, minutes: 9 })]), NOW);
  assert.strictEqual(r.pages[0].title, "New");
  assert.strictEqual(r.pages[0].savedAt, 200);
  assert.deepStrictEqual(r.pages[0].tags, ["x"]);
});

test("one address saved on both devices becomes one page, keeping both sides' marks", () => {
  const l = page("a1b2", { url: "https://example.com/same", savedAt: 100, tags: ["mine"], at: 0.5, readAt: 50 });
  const r = page("c3d4", { url: "https://example.com/same", savedAt: 200, fav: true, favAt: 7 });
  const m = S.merge(null, lib([l]), lib([r]), NOW);
  assert.deepStrictEqual(ids(m), ["c3d4"]);
  assert.deepStrictEqual(m.pages[0].tags, ["mine"]);
  assert.strictEqual(m.pages[0].fav, true);
  assert.strictEqual(m.pages[0].at, 0.5);
  assert.ok(m.deleted.a1b2);
});

test("this device's pictures and sizes never go up", () => {
  const m = S.merge(null, lib([page("a1b2", { thumb: "images/1.jpg", bytes: 9, missing: 1, cover: "images/c.jpg" })]), null, NOW);
  for (const k of ["thumb", "bytes", "missing", "cover"]) assert.ok(!(k in m.pages[0]), k);
});

test("old tombstones are let go after 90 days", () => {
  const m = S.merge(null, lib([]), lib([], { deleted: { old1: NOW - 91 * 864e5, new1: NOW - 864e5 } }), NOW);
  assert.deepStrictEqual(Object.keys(m.deleted), ["new1"]);
});

test("nothing changed merges to the same library, so nothing is written", () => {
  const remote = lib([page("a1b2", { tags: ["t"] }), page("c3d4", { savedAt: 50 })], { files: { a1b2: { at: 100, sha: "x" } } });
  const m = S.merge(remote, lib([page("a1b2", { tags: ["t"] }), page("c3d4", { savedAt: 50 })]), remote, NOW);
  assert.strictEqual(JSON.stringify(m.pages), JSON.stringify(remote.pages));
  assert.deepStrictEqual(m.files, remote.files);
});

console.log("\n" + passed + " passed");
