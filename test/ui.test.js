// The app itself, driven in a browser (1.7.0): `node test/ui.test.js`.
// Starts server.js, saves test/fixtures/article.html (same origin, so the
// browser's fetch can reach it), reads it, highlights it, searches for it,
// and opens the app in every theme at phone and desktop width, failing on
// any error the page logs. Needs Playwright with a Chromium; where there
// is none it says so and passes, since the app has no dependencies and
// this is a check for a machine that has it, not a requirement.
const assert = require("assert");
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
const frameText = (p) => p.frameLocator("#readerFrame").locator("body");

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const p = await page(browser, 390);

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
