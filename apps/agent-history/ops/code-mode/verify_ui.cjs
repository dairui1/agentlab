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
      assert.equal(await page.locator("[data-article-section]").count(), 4);
      await page.locator(".brand img").evaluate((image) => image.decode());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-top.png`) });
      const trigger = page.locator('[data-evidence="CM-05 CM-06"]');
      await trigger.click();
      await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
      assert.match(await page.locator("#articleEvidenceContent").textContent(), /V8/);
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-evidence.png`) });
      await page.keyboard.press("Escape");
      await page.locator('#articleEvidence[aria-hidden="true"]').waitFor();
      assert.ok(await trigger.evaluate((node) => node === document.activeElement));
      await page.locator("#judgment").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-bottom.png`) });
      assert.deepEqual(errors, []);
      results.push({ width, colorScheme, errors, drawer: "passed" });
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${base}/capabilities.html?study=code-mode`, { waitUntil: "networkidle" });
    await page.locator("#researchLegacyLink").waitFor({ state: "visible" });
    assert.equal(await page.locator("#researchLegacyLink").getAttribute("href"), "/capabilities/code-mode.html");
    await page.goto(`${base}/capabilities/code-mode.html?evidence=CM-03`, { waitUntil: "networkidle" });
    await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
    assert.match(await page.locator("#articleEvidenceTitle").textContent(), /成功后提交/);
    await page.close();
    const noJs = await browser.newPage({ javaScriptEnabled: false });
    await noJs.goto(`${base}/capabilities/code-mode.html`);
    assert.equal(await noJs.locator("[data-article-section]").count(), 4);
    await noJs.close();
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ base, results, researchEntry: "passed", deepLink: "passed", noJs: "passed" }, null, 2));
    console.log(JSON.stringify({ base, viewports: results.length, researchEntry: "passed", deepLink: "passed", noJs: "passed" }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
