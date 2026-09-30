const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4397";
  const output = process.argv[3] || "/private/tmp/agentlab-raven-ui";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height, colorScheme] of [[1440, 1000, "light"], [1024, 900, "light"], [390, 844, "light"], [320, 740, "light"], [390, 844, "dark"]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const name = `${width}-${colorScheme}`;
      await page.goto(`${base}/capabilities/raven.html`, { waitUntil: "networkidle" });
      await page.locator(".raven-title img").evaluate((img) => img.decode());
      assert.match(await page.title(), /Raven/);
      assert.equal(await page.locator("[data-article-section]").count(), 10);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      assert.ok(dimensions.page <= dimensions.viewport, `${name}: horizontal page overflow`);
      await page.screenshot({ path: path.join(output, `${name}-top.png`) });
      await page.locator("#validation").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${name}-middle.png`) });
      await page.locator('#validation [data-evidence="RV-07"]').click();
      await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
      assert.match(await page.locator("#articleEvidenceContent").textContent(), /not_supplied/);
      assert.ok((await page.locator("#articleEvidenceContent .article-evidence-source").getAttribute("href")).includes("e6c0344cb7ce00db25d554e4bb671ec1909a8f9f"));
      await page.screenshot({ path: path.join(output, `${name}-evidence.png`) });
      await page.keyboard.press("Escape");
      await page.locator('#articleEvidence[aria-hidden="true"]').waitFor();
      assert.equal(await page.locator('#validation [data-evidence="RV-07"]').evaluate((node) => node === document.activeElement), true);
      await page.locator("#sources").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${name}-bottom.png`) });
      assert.deepEqual(errors, [], name);
      results.push({ viewport: [width, height], colorScheme, dimensions, sections: 10, evidenceDrawer: "passed", focusRestored: true, errors });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${base}/capabilities.html?study=raven`, { waitUntil: "networkidle" });
    await page.locator("#researchLegacyLink").waitFor({ state: "visible" });
    assert.match(await page.locator("#researchLegacyLink").getAttribute("href"), /raven.html/);
    await page.locator("#researchLegacyLink").click();
    await page.waitForURL(/\/capabilities\/raven(?:\.html)?$/);
    await page.goto(`${base}/capabilities/raven.html?evidence=RV-18`, { waitUntil: "networkidle" });
    await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
    assert.match(await page.locator("#articleEvidenceContent").textContent(), /HarnessBank/);
    await page.close();
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ base, verifiedAt: new Date().toISOString(), results, researchEntry: "passed", evidenceDeepLink: "passed" }, null, 2) + "\n");
    console.log(JSON.stringify({ base, viewportsPassed: results.length, researchEntry: "passed", evidenceDeepLink: "passed", output }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
