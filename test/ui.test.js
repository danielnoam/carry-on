// The app itself, driven in a browser (1.7.0, 1.8.0): `node test/ui.test.js`.
// Starts server.js, saves test/fixtures/article.html (same origin, so the
// browser's fetch can reach it), reads it, highlights it, searches for it,
// and opens the app in every theme at phone and desktop width, failing on
// any error the page logs. Needs Playwright with a Chromium; where there
// is none it says so and passes, since the app has no dependencies and
// this is a check for a machine that has it, not a requirement.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function playwright() {
  const tries = ["playwright", "/opt/node-tools/node_modules/playwright"];
  if (process.env.PLAYWRIGHT_MODULE) tries.unshift(process.env.PLAYWRIGHT_MODULE);
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}

const pw = playwright();
if (!pw) {
  console.log("  skip - Playwright isn't installed here (set PLAYWRIGHT_MODULE to its path)");
  process.exit(0);
}

let passed = 0;
const fails = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { fails.push(name); console.error("  FAIL - " + name); console.error("    " + String(e.message).split("\n")[0]); process.exitCode = 1; }
}

const PORT = 5300 + Math.floor(Math.random() * 500);
const ROOT = "http://localhost:" + PORT + "/";
const ARTICLE = ROOT + "test/fixtures/article.html";
const PICTURES = ROOT + "test/fixtures/pictures.html";
const THEMES = ["paper", "sepia", "night"];

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

// A page that collects what goes wrong in it.
async function page(browser, width, theme) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 800 }, serviceWorkers: "block" });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem("waypage.theme", JSON.stringify(t)); } catch (e) { /* none */ } }, theme);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  // Playwright reaching into the sandboxed frame is itself a blocked script,
  // and saving looks for the test site's icon, which it hasn't got.
  p.on("console", (m) => { if (m.type() === "error" && !/^Blocked script execution in .about:srcdoc/.test(m.text()) && !/favicon/.test(m.location().url || "")) p.errors.push(m.text() + (m.location().url ? " (" + m.location().url + ")" : "")); });
  p.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) p.errors.push(r.status() + " " + r.url()); });
  await p.goto(ROOT);
  await p.waitForSelector("#saveUrl");
  return p;
}
// Waits until fn (run in the page) is true. waitForFunction doesn't wait
// for a promise it is handed.
async function until(p, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (!(await p.evaluate(fn, arg))) {
    if (Date.now() - t0 > ms) throw new Error("timed out: " + String(fn).slice(0, 80));
    await p.waitForTimeout(200);
  }
}
const frameText = (p) => p.frameLocator("#readerFrame").locator("body");

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const p = await page(browser, 390);

    await test("the library says it's opening before it's read", async () => {
      const html = await (await fetch(ROOT)).text();
      assert.ok(/class="lib-loading/.test(html));
    });

    await test("the empty library loads with no errors", async () => {
      await p.waitForTimeout(300);
      assert.deepStrictEqual(p.errors, [], p.errors.join(" | "));
    });

    await test("a link saves and shows as a card", async () => {
      await p.fill("#saveUrl", ARTICLE);
      await p.press("#saveUrl", "Enter");
      await p.locator(".page-card .card-title", { hasText: "The Long Haul Flight" }).waitFor({ timeout: 10000 });
    });

    await test("the clip opens in the reader, its text in the sandboxed frame", async () => {
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await p.locator("#readerView:not([hidden])").waitFor();
      await frameText(p).getByText("oceanic track").waitFor();
      const sandbox = await p.getAttribute("#readerFrame", "sandbox");
      assert.ok(sandbox !== null && !/allow-scripts/.test(sandbox), "sandbox: " + sandbox);
      assert.strictEqual(await frameText(p).getByText("Copyright example").count(), 0, "the site's footer was kept");
    });

    await test("selected words can be highlighted", async () => {
      await p.frameLocator("#readerFrame").locator("p", { hasText: "marmalade" }).evaluate((el) => {
        const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes("marmalade sky"));
        const at = t.data.indexOf("marmalade sky");
        const r = el.ownerDocument.createRange();
        r.setStart(t, at);
        r.setEnd(t, at + "marmalade sky".length);
        const sel = el.ownerDocument.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      await p.locator(".read-here .sel-mark:not([hidden])").click();
      const marks = p.frameLocator("#readerFrame").locator("mark.co-mark");
      await marks.first().waitFor();
      assert.strictEqual((await marks.allTextContents()).join(""), "marmalade sky");
    });

    await test("a tap on a highlight opens it, and a note keeps", async () => {
      await p.frameLocator("#readerFrame").locator("mark.co-mark").first().click();
      await p.locator("#readingSheet:not([hidden]) .mark-note-field").fill("Dawn over the ocean");
      await p.locator("#readingSheet .export-back", { hasText: "All highlights" }).click();
      await p.locator("#readingSheet .mark-note", { hasText: "Dawn over the ocean" }).waitFor();
      await p.goBack();
      await p.locator("#readingSheet").waitFor({ state: "hidden" });
    });

    await test("the highlight is still there after the app restarts", async () => {
      await p.reload();
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      const marks = p.frameLocator("#readerFrame").locator("mark.co-mark.co-noted");
      await marks.first().waitFor();
      assert.strictEqual((await marks.allTextContents()).join(""), "marmalade sky");
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("Highlights in the sidebar lists every highlight, and a tap opens the clip", async () => {
      await p.click("#sideBtn");
      await p.locator("#sidebar .side-item", { hasText: "Highlights" }).click();
      await p.locator("#sidebar").waitFor({ state: "hidden" });
      assert.strictEqual(await p.textContent("#placeTitle"), "Highlights");
      const row = p.locator("#highlights .mark-row", { hasText: "marmalade sky" });
      await row.locator(".mark-note", { hasText: "Dawn over the ocean" }).waitFor();
      await p.fill("#highlights .hl-search input", "zeppelinxyz");
      await p.locator("#highlights .hl-none").waitFor();
      await p.fill("#highlights .hl-search input", "dawn");
      await row.click();
      await p.locator("#readerView:not([hidden])").waitFor();
      await p.frameLocator("#readerFrame").locator("mark.co-mark").first().waitFor();
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
      assert.strictEqual(await p.textContent("#placeTitle"), "Highlights");
      await p.click("#sideBtn");
      await p.locator("#sidebar .side-item", { hasText: "Library" }).click();
      await p.locator("#sidebar").waitFor({ state: "hidden" });
    });

    await test("Translate opens the selected words on the web, and there is no Look up (1.11.1)", async () => {
      await p.evaluate(() => { window.__opened = []; window.Waypage.platform.openOutside = (u) => window.__opened.push(u); });
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await frameText(p).getByText("oceanic track").waitFor();
      await p.frameLocator("#readerFrame").locator("p", { hasText: "oceanic track" }).evaluate((el) => {
        const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes("oceanic"));
        const r = el.ownerDocument.createRange();
        r.setStart(t, t.data.indexOf("oceanic"));
        r.setEnd(t, t.data.indexOf("oceanic") + "oceanic".length);
        const sel = el.ownerDocument.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      await p.locator(".read-here .sel-translate:not([hidden])").click();
      const opened = await p.evaluate(() => window.__opened);
      assert.ok(/translate\.google\.com\/.*text=oceanic$/.test(opened[0] || ""), "opened " + opened);
      assert.strictEqual(await p.locator(".read-here .sel-look").count(), 0);
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("the Highlights button lists them, and words already highlighted can be unhighlighted", async () => {
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      const marks = p.frameLocator("#readerFrame").locator("mark.co-mark");
      await marks.first().waitFor();
      // The bar may have slid away for reading, as it does on a scroll.
      await p.locator("#readerMarks").evaluate((b) => b.click());
      await p.locator("#readingSheet:not([hidden]) .mark-quote", { hasText: "marmalade sky" }).waitFor();
      await p.goBack();
      await p.locator("#readingSheet").waitFor({ state: "hidden" });
      await p.frameLocator("#readerFrame").locator("mark.co-mark").first().evaluate((mk) => {
        const r = mk.ownerDocument.createRange();
        r.selectNodeContents(mk);
        const sel = mk.ownerDocument.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      const btn = p.locator(".read-here .sel-mark:not([hidden])");
      await btn.getByText("Remove highlight").waitFor();
      await btn.click();
      await p.waitForFunction(() => !document.getElementById("readerFrame").contentDocument.querySelector("mark.co-mark"));
      await p.locator(".read-here").waitFor({ state: "hidden" });
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("search finds a clip by words in its text, and not by others", async () => {
      await p.click("#searchBtn");
      await p.fill("#librarySearch", "waypoints");
      await p.waitForTimeout(700);
      assert.strictEqual(await p.locator(".library .page-card:visible").count(), 1);
      await p.fill("#librarySearch", "zeppelinxyz");
      await p.waitForTimeout(700);
      assert.strictEqual(await p.locator(".library .page-card:visible").count(), 0);
      await p.click("#searchClear");
    });

    await test("a paywalled article saves, and says it's only the start", async () => {
      await p.fill("#saveUrl", ROOT + "test/fixtures/paywalled.html");
      await p.press("#saveUrl", "Enter");
      const card = p.locator(".page-card", { hasText: "Inside the Night Shift" }).first();
      await card.waitFor({ timeout: 10000 });
      await card.getByText("Only the start").waitFor();
      await card.click();
      await frameText(p).locator(".co-cut").getByText("Read the rest on").waitFor();
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("nothing went wrong along the way", async () => {
      assert.deepStrictEqual(p.errors, [], p.errors.join(" | "));
    });
    await p.context().close();

    await test("a library of 400 clips draws every card, in steps", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const list = [];
        for (let i = 0; i < 400; i++) list.push({ id: "big" + String(i).padStart(4, "0"), url: "https://example.com/" + i, title: "Clip " + i, site: "example.com", savedAt: 1e12 - i, minutes: 3, mode: "links", at: 0, finished: false });
        await window.Waypage.store.writeIndex(list);
      });
      await q.reload();
      await q.locator(".page-card").first().waitFor();
      await q.waitForFunction(() => document.querySelectorAll(".library .page-card").length >= 400, null, { timeout: 15000 });
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a collection's new-chapters badge saves them without opening it", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async (next) => {
        const list = [0, 1].map((i) => ({ id: "ser" + i, url: "https://example.com/ch" + i, title: "Chapter " + (i + 1), site: "example.com", savedAt: 1000 + i, minutes: 3, mode: "links", at: 0, finished: false, folder: "Series A", folderAt: i, next }));
        await window.Waypage.store.writeIndex(list);
        localStorage.setItem("waypage.newChapters", JSON.stringify({ "series a": { count: 1, at: 2000 } }));
      }, ARTICLE);
      await q.reload();
      const pip = q.locator(".tile-new").first();
      await pip.waitFor();
      assert.strictEqual(await pip.getAttribute("aria-label"), "Save 1 new clip of Series A");
      await pip.click();
      await until(q, async () => (await window.Waypage.store.readIndex()).length === 3);
      assert.ok(await q.evaluate(() => document.getElementById("readerView").hidden), "the collection or reader opened");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Report a problem lists a failed save and opens an issue without the address's query", async () => {
      const q = await page(browser, 390);
      await q.evaluate(() => { window.__opened = []; window.Waypage.platform.openOutside = (u) => window.__opened.push(u); });
      await q.fill("#saveUrl", ROOT + "test/fixtures/nothing-here.html?token=secret"); await q.press("#saveUrl", "Enter");
      await until(q, () => window.Waypage.platform.log.list().length > 0);
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Report a problem" }).click();
      await q.locator(".report-log").waitFor();
      const log = await q.locator(".report-log").innerText();
      assert.ok(/localhost/.test(log), "the failed save isn't listed: " + log);
      await q.fill(".report-field", "Saving fails");
      await q.locator(".row", { hasText: "Open an issue" }).click();
      const url = await q.evaluate(() => window.__opened[0] || "");
      assert.ok(url.startsWith("https://github.com/danielnoam/waypage/issues/new?"), url);
      const body = decodeURIComponent(url);
      assert.ok(/Saving fails/.test(body) && /Waypage \d/.test(body), "the report says what and which version");
      assert.ok(!/secret/.test(body), "the token was left in");
      const errs = q.errors.filter((e) => !/nothing-here/.test(e));
      assert.deepStrictEqual(errs, [], errs.join(" | "));
      await q.context().close();
    });

    await test("a Pocket export imports with its tags, archived clips finished", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waypage-"));
      const file = path.join(dir, "ril_export.html");
      fs.writeFileSync(file, '<!DOCTYPE html><html><head><title>Pocket Export</title></head><body><h1>Unread</h1><ul><li><a href="' + ARTICLE + '" time_added="1700000100" tags="travel,air">The Long Haul Flight</a></li></ul><h1>Read Archive</h1><ul><li><a href="' + PICTURES + '" time_added="1700000000" tags="">Clouds</a></li></ul></body></html>');
      const q = await page(browser, 390);
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Storage" }).click();
      await q.locator("#backupSection input[type=file]").setInputFiles(file);
      await q.locator(".import-sheet").waitFor();
      await q.locator(".import-sheet .seg-item", { hasText: "All" }).click();
      await q.locator(".import-go").click();
      await until(q, async () => (await window.Waypage.store.readIndex()).length === 2, null, 20000);
      const got = await q.evaluate(async () => (await window.Waypage.store.readIndex()).map((x) => [x.url, x.tags || [], !!x.finished]));
      const art = got.find((x) => x[0] === ARTICLE), pic = got.find((x) => x[0] === PICTURES);
      assert.deepStrictEqual(art && art[1], ["travel", "air"]);
      assert.strictEqual(art[2], false);
      assert.strictEqual(pic && pic[2], true, "the archived one is finished");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    await test("Storage offers to make room from finished clips with pictures", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async (url) => {
        await window.Waypage.store.writeIndex([{ id: "room1", url, title: "Clouds From Above", site: "localhost", savedAt: 1000, minutes: 1, mode: "previews", images: 1, imageBytes: 30000, bytes: 33000, finished: true }]);
      }, PICTURES);
      await q.reload();
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Storage" }).click();
      const go = q.locator(".room-go");
      await go.waitFor();
      assert.strictEqual(await go.isDisabled(), false);
      assert.ok(/1 clip you've finished/.test(await go.innerText()));
      assert.strictEqual(await q.locator(".room-big .row").count(), 1);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    for (const width of [390, 1280]) {
      for (const theme of THEMES) {
        await test("opens at " + width + " px in " + theme + " with no errors", async () => {
          const q = await page(browser, width, theme);
          await q.waitForTimeout(300);
          assert.strictEqual(await q.evaluate(() => document.documentElement.dataset.theme), theme);
          const over = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          assert.ok(over <= 0, "scrolls sideways by " + over + " px");
          assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
          await q.context().close();
        });
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("\n" + passed + " passed" + (fails.length ? ", " + fails.length + " failed" : ""));
})().catch((e) => { console.error(e); process.exitCode = 1; });
