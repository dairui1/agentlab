const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4397";
  const output = process.argv[3] || "/private/tmp/agentlab-raven-catalog";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.request.get(`${base}/data/agents/raven/history.json`);
      assert.ok(response.ok());
      const history = await response.json();
      assert.ok(history.versions.length >= 2);
      assert.ok(history.versions.every((v) => /^\d+\.\d+\.\d+$/.test(v.version)));
      assert.ok(history.versions.every((v) => v.runtimeCapture.promptStatus === "unavailable" && v.runtimeCapture.toolSchemaStatus === "unavailable"));
      const latest = history.versions.at(-1);
      await page.goto(`${base}/?feedAgent=raven`, { waitUntil: "networkidle" });
      await page.locator("#intelligenceFeed .agent-badge").first().waitFor();
      const labels = await page.locator("#intelligenceFeed .agent-badge").allTextContents();
      assert.ok(labels.length > 0 && labels.every((label) => label === "Raven"));
      await page.screenshot({ path: path.join(output, `${width}-feed.png`) });
      await page.goto(`${base}/?mode=compare&agent=raven`, { waitUntil: "networkidle" });
      const files = page.getByRole("combobox", { name: "选择源码文件" });
      await files.waitFor();
      assert.equal(await files.locator("option").count(), 10);
      assert.match(await page.locator("#editorPlaceholder").textContent(), /静态源码，不是运行时请求/);
      await files.selectOption({ label: "Curator 校验与可选 probe" });
      assert.match(await page.locator("#editorPlaceholder pre").textContent(), /not_supplied/);
      assert.match(await page.locator("#editorPlaceholder a").getAttribute("href"), /\/blob\/[a-f0-9]{40}\//);
      await page.locator("#editorPlaceholder").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${width}-source.png`) });
      await page.locator("#rightVersion").selectOption(history.versions.at(-2).version);
      await page.locator('#editorPlaceholder:not([data-kind="source"])').waitFor();
      assert.match(await page.locator("#editorPlaceholder").textContent(), /没有公开的 Runtime Prompt/);
      await page.locator("#rightVersion").selectOption(latest.version);
      await files.waitFor();
      assert.equal(await page.locator("#agentSwitch").inputValue(), "raven");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      assert.deepEqual(errors, []);
      results.push({ width, versions: history.versions.length, latest: latest.version, sourceFiles: 10, versionSwitching: "passed", errors });
      await page.close();
    }
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ base, verifiedAt: new Date().toISOString(), results }, null, 2) + "\n");
    console.log(JSON.stringify({ base, results, output }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
