const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4397";
  const output = process.argv[3] || "/private/tmp/agentlab-oar-ui";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height, colorScheme] of [[1440, 1000, "light"], [1024, 900, "light"], [390, 844, "light"], [320, 740, "light"], [390, 844, "dark"]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const name = `${width}-${colorScheme}`;
      await page.goto(`${base}/capabilities/oar.html`, { waitUntil: "networkidle" });
      await page.locator(".oar-title img").evaluate((img) => img.decode());
      assert.match(await page.title(), /OAR/);
      assert.equal(await page.locator("[data-article-section]").count(), 10);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      assert.ok(dimensions.page <= dimensions.viewport, `${name}: horizontal page overflow`);
      await page.screenshot({ path: path.join(output, `${name}-top.png`) });
      await page.locator("#liveness").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${name}-middle.png`) });
      await page.locator('#liveness [data-evidence="OA-15"]').click();
      await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
      assert.match(await page.locator("#articleEvidenceContent").textContent(), /promptAndWait/);
      assert.ok((await page.locator("#articleEvidenceContent .article-evidence-source").getAttribute("href")).includes("ef893acc0d341b4fa7a1ce41d2be7cafed3c63a2"));
      await page.screenshot({ path: path.join(output, `${name}-evidence.png`) });
      await page.keyboard.press("Escape");
      await page.locator('#articleEvidence[aria-hidden="true"]').waitFor();
      assert.equal(await page.locator('#liveness [data-evidence="OA-15"]').evaluate((node) => node === document.activeElement), true);
      await page.locator("#sources").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${name}-bottom.png`) });
      assert.deepEqual(errors, [], name);
      results.push({ viewport: [width, height], colorScheme, dimensions, sections: 10, evidenceDrawer: "passed", focusRestored: true, errors });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${base}/capabilities.html?study=oar`, { waitUntil: "networkidle" });
    await page.locator("#researchLegacyLink").waitFor({ state: "visible" });
    assert.match(await page.locator("#researchLegacyLink").getAttribute("href"), /oar.html/);
    await page.locator("#researchLegacyLink").click();
    await page.waitForURL(/\/capabilities\/oar(?:\.html)?$/);
    await page.goto(`${base}/capabilities/oar.html?evidence=OA-05`, { waitUntil: "networkidle" });
    await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
    assert.match(await page.locator("#articleEvidenceContent").textContent(), /streamId/);
    await page.close();
    const noJs = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await noJs.goto(`${base}/capabilities/oar.html`);
    assert.equal(await noJs.locator("[data-article-section]").count(), 10);
    assert.ok((await noJs.locator("#articleBody").textContent()).includes("不是硬截止"));
    await noJs.close();
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ base, verifiedAt: new Date().toISOString(), results, researchEntry: "passed", evidenceDeepLink: "passed" }, null, 2) + "\n");
    console.log(JSON.stringify({ base, viewportsPassed: results.length, researchEntry: "passed", evidenceDeepLink: "passed", output }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
