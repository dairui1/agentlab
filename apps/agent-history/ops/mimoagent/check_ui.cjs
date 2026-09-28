const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:8802";
  const output = process.argv[3] || "/tmp/mimoagent-ui";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height, colorScheme] of [[1440, 1000, "light"], [1440, 1000, "dark"], [768, 1024, "light"], [390, 844, "light"], [320, 740, "dark"]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/capabilities/mimoagent.html?cb=${Date.now()}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}.png`) });
      if (width === 1440 && colorScheme === "light") await page.screenshot({ path: path.join(output, "full-page.png"), fullPage: true });
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        sections: document.querySelectorAll("[data-article-section]").length,
        brokenImages: [...document.images].filter((image) => !image.complete || !image.naturalWidth).length,
        raftThemeLoaded: [...document.styleSheets].some((sheet) => /raft/.test(sheet.href || "")) || document.body.classList.contains("raft-blog"),
        navBackground: getComputedStyle(document.querySelector(".mimo-nav")).backgroundColor,
        pageBackground: getComputedStyle(document.body).backgroundColor,
        tocOnRight: innerWidth <= 860 || document.querySelector(".article-toc").getBoundingClientRect().left >= document.querySelector("#articleBody").getBoundingClientRect().right,
      }));
      assert.equal(layout.overflow, false, `${width} ${colorScheme}: page overflow`);
      assert.equal(layout.sections, 12);
      assert.equal(layout.brokenImages, 0);
      assert.equal(layout.raftThemeLoaded, false);
      assert.equal(layout.navBackground, layout.pageBackground);
      assert.equal(layout.tocOnRight, true);
      const evidence = page.locator('[data-evidence="MI-01"]');
      await evidence.click();
      await page.locator("#articleEvidence.is-open").waitFor();
      await page.waitForFunction(() => {
        const panel = document.querySelector("#articleEvidence");
        const bounds = panel.getBoundingClientRect();
        return new DOMMatrix(getComputedStyle(panel).transform).m41 === 0 && bounds.left >= 0 && bounds.right <= innerWidth;
      });
      assert.match(await page.locator("#articleEvidenceContent").innerText(), /cc-agent/);
      if (width === 390) await page.screenshot({ path: path.join(output, "390-evidence.png") });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#articleEvidence").getAttribute("aria-hidden"), "true");
      assert.equal(await evidence.evaluate((element) => document.activeElement === element), true);
      await page.waitForFunction(() => document.querySelector("#articleEvidence").getBoundingClientRect().left >= innerWidth);
      await page.locator("#trajectory").evaluate((section) => section.scrollIntoView({ block: "start", behavior: "instant" }));
      await page.waitForFunction(() => document.querySelector('.article-toc a[href="#trajectory"]').getAttribute("aria-current") === "location");
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-trajectory.png`) });
      assert.deepEqual(errors, []);
      results.push({ width, height, colorScheme, ...layout, evidenceOpenClose: true, errors });
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${base}/capabilities/mimoagent.html?evidence=MI-25`, { waitUntil: "networkidle" });
    await page.locator("#articleEvidence.is-open").waitFor();
    assert.match(await page.locator("#articleEvidenceContent").innerText(), /Payload Porter/);
    await page.goto(`${base}/capabilities.html?study=mimoagent`, { waitUntil: "networkidle" });
    assert.match(await page.locator("#researchDetailTitle").innerText(), /MiMo Agent/);
    const noJs = await browser.newPage({ javaScriptEnabled: false });
    await noJs.goto(`${base}/capabilities/mimoagent.html`);
    assert.equal(await noJs.locator("[data-article-section]").count(), 12);
    await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ viewports: results, evidenceDeepLink: true, researchIndex: true, noJs: true }, null, 2) + "\n");
    console.log(JSON.stringify({ viewports: results, evidenceDeepLink: true, researchIndex: true, noJs: true }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
