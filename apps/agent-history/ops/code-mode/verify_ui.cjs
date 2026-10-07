const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4398";
  const output = process.argv[3] || "/private/tmp/agentlab-code-mode-ui";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height, colorScheme] of [[1440, 1000, "light"], [390, 844, "light"], [320, 740, "light"], [390, 844, "dark"]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/capabilities/code-mode.html`, { waitUntil: "networkidle" });
      assert.equal(await page.locator("[data-node]").count(), 23);
      assert.equal(await page.locator("[data-node]:visible").count(), 1);
      assert.equal(await page.locator("#overview").isVisible(), true);
      await page.locator(".brand img").evaluate((image) => image.decode());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-top.png`) });
      await page.locator("#programTab").click();
      assert.equal(await page.locator("#programExample").isVisible(), true);
      await page.keyboard.press("ArrowLeft");
      assert.equal(await page.locator("#directExample").isVisible(), true);
      if (width <= 680) await page.locator(".cm-tree > summary").click();
      await page.locator('.cm-tree a[href="#implementations"]').click();
      await page.locator("#implementations").waitFor({ state: "visible" });
      await page.locator('#implementations a[href="#codex"]').click();
      await page.locator("#codex").waitFor({ state: "visible" });
      assert.equal(await page.locator("#cmParentLink").getAttribute("href"), "#implementations");
      await page.locator("#codex .cm-deeper summary").click();
      const trigger = page.locator('#codex [data-evidence="CM-05 CM-06 CM-08"]');
      await trigger.click();
      await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
      assert.match(await page.locator("#articleEvidenceContent").textContent(), /V8/);
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-evidence.png`) });
      await page.keyboard.press("Escape");
      await page.locator('#articleEvidence[aria-hidden="true"]').waitFor();
      assert.ok(await trigger.evaluate((node) => node === document.activeElement));
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-branch.png`) });
      const ids = await page.locator("[data-node]").evaluateAll((nodes) => nodes.map((node) => node.id));
      for (const id of ids) {
        await page.evaluate((hash) => { location.hash = hash; }, id);
        await page.locator(`#${id}`).waitFor({ state: "visible" });
        assert.equal(await page.locator("[data-node]:visible").count(), 1, id);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id);
      }
      await page.evaluate(() => { location.hash = "sandbox"; });
      await page.locator("#sandbox").waitFor({ state: "visible" });
      for (const summary of await page.locator("#sandbox .cm-deeper summary").all()) await summary.click();
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-sandbox.png`) });
      await page.goBack();
      await page.locator("#sources").waitFor({ state: "visible" });
      await page.goForward();
      await page.locator("#sandbox").waitFor({ state: "visible" });
      assert.deepEqual(errors, []);
      results.push({ width, colorScheme, nodes: ids.length, errors, drawer: "passed", history: "passed", tabs: "passed" });
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${base}/capabilities.html?study=code-mode`, { waitUntil: "networkidle" });
    await page.locator("#researchLegacyLink").waitFor({ state: "visible" });
    assert.equal(await page.locator("#researchLegacyLink").getAttribute("href"), "/capabilities/code-mode.html");
    await page.goto(`${base}/capabilities/code-mode.html?evidence=CM-03`, { waitUntil: "networkidle" });
    await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
    assert.match(await page.locator("#articleEvidenceTitle").textContent(), /成功后提交/);
    await page.goto(`${base}/capabilities/code-mode.html#training`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#training").isVisible(), true);
    assert.equal(await page.locator("[data-node]:visible").count(), 1);
    await page.goto(`${base}/capabilities/code-mode.html#%bad`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#overview").isVisible(), true);
    await page.close();
    const noJs = await browser.newPage({ javaScriptEnabled: false });
    await noJs.goto(`${base}/capabilities/code-mode.html`);
    assert.equal(await noJs.locator("[data-node]:visible").count(), 23);
    await noJs.close();
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ base, results, researchEntry: "passed", deepLink: "passed", noJs: "passed" }, null, 2));
    console.log(JSON.stringify({ base, viewports: results.length, researchEntry: "passed", deepLink: "passed", noJs: "passed" }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
