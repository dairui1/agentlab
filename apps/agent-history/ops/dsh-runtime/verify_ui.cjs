const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4407";
  const output = process.argv[3] || "/private/tmp/agentlab-dsh-runtime-ui";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const noOverflow = async (page, label) => {
    const size = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(size.page <= size.viewport, `${label}: ${JSON.stringify(size)}`);
  };
  try {
    for (const [width, height, colorScheme] of [[1440, 1000, "light"], [1024, 900, "dark"], [390, 844, "light"], [320, 740, "light"], [390, 844, "dark"]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.url().startsWith(base) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      const name = `${width}-${colorScheme}`;
      await page.goto(`${base}/capabilities/dsh-runtime-evolution.html`, { waitUntil: "networkidle" });
      await page.locator(".brand-mark img").evaluate((img) => img.decode());
      assert.equal(await page.locator("[data-article-section]").count(), 12);
      await noOverflow(page, name);
      await page.screenshot({ path: path.join(output, `${name}-top.png`) });
      await page.locator("#contract .source-code").first().scrollIntoViewIfNeeded();
      await noOverflow(page, `${name}-code`);
      await page.screenshot({ path: path.join(output, `${name}-code.png`) });
      const trigger = page.locator('[data-evidence="DRE-28 DRE-37"]');
      await trigger.click();
      await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
      assert.match(await page.locator("#articleEvidenceKicker").textContent(), /DRE-28/);
      assert.match(await page.locator(".article-evidence-source").getAttribute("href"), /blob\/[a-f0-9]{40}\/.*#L\d+-L\d+$/);
      assert.match(await page.locator("#articleEvidenceContent").textContent(), /[a-f0-9]{64}/);
      await noOverflow(page, `${name}-evidence`);
      await page.screenshot({ path: path.join(output, `${name}-evidence.png`) });
      await page.keyboard.press("Escape");
      await page.locator('#articleEvidence[aria-hidden="true"]').waitFor();
      assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
      await page.locator("#build table").scrollIntoViewIfNeeded();
      assert.equal(await page.locator("#build tbody tr").count(), 20);
      await noOverflow(page, `${name}-tests`);
      await page.screenshot({ path: path.join(output, `${name}-tests.png`) });
      assert.deepEqual(errors, [], name);
      results.push({ width, height, colorScheme, result: "passed" });
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${base}/capabilities.html?study=dsh-runtime-evolution`, { waitUntil: "networkidle" });
    const link = page.locator("#researchLegacyLink");
    await link.waitFor({ state: "visible" });
    assert.match(await link.getAttribute("href"), /dsh-runtime-evolution.html/);
    await link.click();
    await page.waitForURL(/capabilities\/dsh-runtime-evolution(?:\.html)?(?:\?|$)/);
    await page.goto(`${base}/capabilities/dsh-runtime-evolution.html?evidence=DRE-29`, { waitUntil: "networkidle" });
    await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
    assert.match(await page.locator("#articleEvidenceKicker").textContent(), /DRE-29/);
    await page.goto(`${base}/guides/dsh-runtime-evolution.html`, { waitUntil: "networkidle" });
    await page.waitForURL(/capabilities\/dsh-runtime-evolution(?:\.html)?(?:\?|$)/);
    await page.close();
    const noJs = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await noJs.goto(`${base}/capabilities/dsh-runtime-evolution.html`);
    assert.equal(await noJs.locator("[data-article-section]").count(), 12);
    assert.equal(await noJs.locator('a[href="/capabilities/dsh-runtime-evolution.json"]').count(), 1);
    await noOverflow(noJs, "no-js");
    await noJs.close();
    const report = { base, checkedAt: new Date().toISOString(), results, catalog: true, deepLink: true, redirect: true, noJs: true };
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ ...report, output }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
