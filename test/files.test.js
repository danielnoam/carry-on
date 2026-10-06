// Your own files' pure parts (0.31.0): `node test/files.test.js`. Reading
// an EPUB or a comic needs a browser (the e2e run covers those); these
// are the Markdown and plain-text rules.
const assert = require("assert");

global.window = { CarryOn: { platform: {} } };
require("../src/files.js");
const F = window.CarryOn.files;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

test("Markdown's blocks: headings, paragraphs, lists, quotes, code, rules", () => {
  const html = F.markdown("# Title\n\nSome *soft* and **bold** words,\njoined.\n\n- one\n- two\n\n3. three\n4. four\n\n> quoted\n\n```\n<b>raw</b>\n```\n\n---\n\nSub\n---");
  assert.ok(html.includes("<h1>Title</h1>"));
  assert.ok(html.includes("<p>Some <em>soft</em> and <strong>bold</strong> words, joined.</p>"));
  assert.ok(html.includes("<ul><li>one</li><li>two</li></ul>"));
  assert.ok(html.includes('<ol start="3"><li>three</li><li>four</li></ol>'));
  assert.ok(html.includes("<blockquote><p>quoted</p></blockquote>"));
  assert.ok(html.includes("<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>"));
  assert.ok(html.includes("<hr>"));
  assert.ok(html.includes("<h2>Sub</h2>"));
});

test("Markdown's links and pictures; raw HTML stays text", () => {
  const html = F.markdown("See [the site](https://example.com) and ![a map](https://example.com/m.png). <script>x</script> `a*b*c`");
  assert.ok(html.includes('<a href="https://example.com">the site</a>'));
  assert.ok(html.includes('<img alt="a map" src="https://example.com/m.png">'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<code>a*b*c</code>"));
  assert.ok(!html.includes("<script>"));
});

test("plain text: lines broken to a width flow again, short lines keep their breaks", () => {
  const wrapped = "It was the best of times, it was the worst of times, it was the age of\nwisdom, it was the age of foolishness, it was the epoch of belief, it\nwas the epoch of incredulity.";
  const poem = "Roses are red,\nviolets are blue.";
  const html = F.plain(wrapped + "\n\n" + poem + "\r\n\r\n<tag>");
  assert.ok(html.includes("<p>It was the best of times, it was the worst of times, it was the age of wisdom, it was"));
  assert.ok(html.includes("<p>Roses are red,<br>violets are blue.</p>"));
  assert.ok(html.includes("<p>&lt;tag&gt;</p>"));
});

console.log(passed + " passed");
