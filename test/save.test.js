// Saving's pure parts and the reader's sandbox: `node test/save.test.js`.
// The DOM-heavy parts (Readability, cleaning, the iframe) need a browser;
// these are the rules that decide what gets fetched and how it's shown.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = { CarryOn: { platform: {} } };
global.addEventListener = () => {};
require("../src/save.js");
require("../src/reader.js");
const S = window.CarryOn.save;
const R = window.CarryOn.reader;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

test("Wikipedia links, desktop and mobile, become the REST API's host and title", () => {
  assert.deepStrictEqual(S.wikipediaPage("https://en.wikipedia.org/wiki/Boeing_747"), { host: "en.wikipedia.org", title: "Boeing_747" });
  assert.deepStrictEqual(S.wikipediaPage("https://de.m.wikipedia.org/wiki/K%C3%B6ln#Geschichte"), { host: "de.wikipedia.org", title: "Köln" });
  assert.deepStrictEqual(S.wikipediaPage("https://en.wikipedia.org/w/index.php?title=Great circle&oldid=1"), { host: "en.wikipedia.org", title: "Great_circle" });
  assert.deepStrictEqual(S.wikipediaPage("https://en.wikipedia.org/wiki/AC/DC"), { host: "en.wikipedia.org", title: "AC/DC" });
});

test("non-articles and other sites don't take the Wikipedia path", () => {
  assert.strictEqual(S.wikipediaPage("https://en.wikipedia.org/wiki/Special:Random"), null);
  assert.strictEqual(S.wikipediaPage("https://en.wikipedia.org/wiki/Talk:Boeing_747"), null);
  assert.strictEqual(S.wikipediaPage("https://www.wikipedia.org/"), null);
  assert.strictEqual(S.wikipediaPage("https://example.com/wiki/Boeing_747"), null);
  assert.strictEqual(S.wikipediaPage("not a url"), null);
});

test("Wikimedia thumbnails move to the standard widths, never past the file", () => {
  const t = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Plane.jpg/220px-Plane.jpg";
  assert.strictEqual(S.wikimediaThumb(t, 500, 4000), "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Plane.jpg/500px-Plane.jpg");
  assert.strictEqual(S.wikimediaThumb(t, 1280, 900), "https://upload.wikimedia.org/wikipedia/commons/a/ab/Plane.jpg");
  const svg = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Map.svg/220px-Map.svg.png";
  assert.strictEqual(S.wikimediaThumb(svg, 1280, 600), "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Map.svg/600px-Map.svg.png");
  assert.strictEqual(S.wikimediaThumb("https://example.com/a.jpg", 500, 0), "https://example.com/a.jpg");
});

test("srcset: the preview is the first candidate at least 480 wide", () => {
  const c = S.parseSrcset("a-320.jpg 320w, a-640.jpg 640w, a-1280.jpg 1280w", "https://news.example/story/");
  assert.strictEqual(S.pickWidth(c, 480), "https://news.example/story/a-640.jpg");
  assert.strictEqual(S.pickWidth(c, 4000), "https://news.example/story/a-1280.jpg");
  assert.strictEqual(S.pickWidth(S.parseSrcset("x.jpg 1x, x@2x.jpg 2x", "https://a.b/"), 480), "https://a.b/x.jpg");
  assert.strictEqual(S.pickWidth([], 480), null);
});

test("YouTube and Vimeo embeds are recognised", () => {
  assert.strictEqual(S.youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"), "dQw4w9WgXcQ");
  assert.strictEqual(S.youtubeId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.strictEqual(S.youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.strictEqual(S.youtubeId("https://example.com/embed/x"), null);
  assert.strictEqual(S.vimeoId("https://player.vimeo.com/video/76979871"), "76979871");
});

test("tracking pixels are spotted, real images aren't", () => {
  assert.ok(S.isTrackingPixel("1", "1", "https://a.b/x.gif"));
  assert.ok(S.isTrackingPixel(null, null, "https://www.facebook.com/tr?id=1"));
  assert.ok(!S.isTrackingPixel("640", "480", "https://a.b/photo.jpg"));
});

test("image files keep a sensible extension", () => {
  assert.strictEqual(S.extOf("https://a.b/x.JPEG?w=480"), "jpg");
  assert.strictEqual(S.extOf("https://a.b/x.webp"), "webp");
  assert.strictEqual(S.extOf("https://a.b/image?id=3"), "jpg");
});

test("reading time rounds to whole minutes, at least one", () => {
  assert.strictEqual(S.readingMinutes("word ".repeat(2300)), 10);
  assert.strictEqual(S.readingMinutes("short"), 1);
});

test("links worded as the next chapter are recognised, other links aren't", () => {
  for (const t of ["Next", "Next chapter", "  Next Chapter »", "Next ›", "next page →", "הפרק הבא", "Siguiente", "下一章"]) assert.ok(S.isNextText(t), t);
  for (const t of ["Previous", "Next week's issue", "Chapter 2", "Read next: ten more", "", null]) assert.ok(!S.isNextText(t), String(t));
});

test("chapter numbers come from the link's words, or its address", () => {
  assert.strictEqual(S.chapterNumber("Chapter 12: The Fall"), 12);
  assert.strictEqual(S.chapterNumber("Ch. 3.5"), 3.5);
  assert.strictEqual(S.chapterNumber("פרק 4 - ההתחלה"), 4);
  assert.strictEqual(S.chapterNumber("7. A long night"), 7);
  assert.strictEqual(S.chapterNumber("The Fall", "https://x.example/novel/chapter-9"), 9);
  assert.strictEqual(S.chapterNumber("About us", "https://x.example/about"), null);
  assert.strictEqual(S.chapterNumber("2024 in review"), null);
});

test("the chapter list is the group with the most numbered links, in reading order", () => {
  const L = (n, w = "Chapter ") => ({ url: "https://x.example/c" + n, text: w + n });
  const nav = [{ url: "https://x.example/", text: "Home" }, { url: "https://x.example/about", text: "About" }, { url: "https://x.example/c9", text: "Latest" }];
  const chapters = [1, 2, 3, 4, 5, 6].map((n) => L(n));
  assert.deepStrictEqual(S.pickChapters([nav, chapters]).map((l) => l.url), chapters.map((l) => l.url));
  assert.deepStrictEqual(S.pickChapters([[...chapters].reverse()]).map((l) => l.url), chapters.map((l) => l.url), "newest first is turned around");
  assert.deepStrictEqual(S.pickChapters([[L(1), L(2), L(1), L(3), L(4)]]).length, 4, "repeats count once");
  assert.deepStrictEqual(S.pickChapters([nav, [L(1), L(2)]]), [], "two links aren't a list");
  assert.deepStrictEqual(S.pickChapters([[L(1), L(2), L(3), ...["a", "b", "c", "d", "e", "f", "g"].map((w) => ({ url: "https://x.example/" + w, text: w }))]]), [], "mostly unnumbered isn't chapters");
});

test("panels are big pictures, not page furniture", () => {
  assert.ok(S.isPanel("https://cdn.example/ch1/01.jpg", null, null, ""));
  assert.ok(S.isPanel("https://cdn.example/ch1/01.webp", "800", "1200", "page 1"));
  assert.ok(!S.isPanel("https://cdn.example/logo.png", null, null, ""));
  assert.ok(!S.isPanel("https://cdn.example/a.jpg", "120", "120", ""));
  assert.ok(!S.isPanel("https://cdn.example/a.jpg", null, null, "user avatar"));
  assert.ok(!S.isPanel("data:image/gif;base64,R0lGOD", null, null, ""));
});

test("the panels are the pictures most of which share one box", () => {
  const P = (n, path) => ({ src: "https://cdn.example/" + n + ".jpg", path });
  const col = [1, 2, 3, 4, 5, 6].map((n) => P(n, ["fig" + n, "reader", "main", "body"]));
  const g = S.comicGroup([P("ad", ["side", "aside", "main", "body"]), ...col, P(3, ["fig3", "reader", "main", "body"])]);
  assert.strictEqual(g.key, "reader", "the nearest box holding them, not one further out");
  assert.deepStrictEqual(g.srcs, col.map((p) => p.src), "in order, each once");
  assert.strictEqual(S.comicGroup(col.slice(0, 3)), null, "three pictures aren't a chapter");
  const scattered = [1, 2, 3, 4, 5, 6].map((n) => P(n, ["p" + n, "s" + (n % 3)]));
  assert.strictEqual(S.comicGroup(scattered), null, "pictures spread over an article aren't a column");
});

test("links worded as the previous chapter are recognised, other links aren't", () => {
  for (const t of ["Previous", "Prev", "« Previous Chapter", "‹ Prev", "← previous page", "הפרק הקודם", "Anterior", "上一章"]) assert.ok(S.isPrevText(t), t);
  for (const t of ["Next", "Previously on the show", "Chapter 1", "Previous issues: 12", "", null]) assert.ok(!S.isPrevText(t), String(t));
});

test("the reader's CSP allows no scripts, frames, forms or connections", () => {
  assert.ok(/default-src 'none'/.test(R.CSP));
  assert.ok(!/script-src|unsafe-eval|connect-src|frame-src|child-src/.test(R.CSP));
  assert.ok(/form-action 'none'/.test(R.CSP));
});

test("the reader's iframe is sandboxed without allow-scripts", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const m = html.match(/<iframe[^>]*id="readerFrame"[^>]*>/);
  assert.ok(m, "no reader iframe");
  const sandbox = (m[0].match(/sandbox="([^"]*)"/) || [])[1];
  assert.ok(sandbox != null, "iframe has no sandbox attribute");
  assert.ok(!/allow-scripts|allow-top-navigation|allow-popups|allow-forms/.test(sandbox), "sandbox too loose: " + sandbox);
});

console.log("\n" + passed + " passed");
