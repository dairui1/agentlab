const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const app = path.resolve(__dirname, "../..");
const root = path.join(app, "dist");
const output = process.argv[3] || "/private/tmp/agentlab-dquickts-ui";
const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".md": "text/plain", ".c": "text/plain" };
async function localServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      for (const candidate of [file, file + ".html", path.join(file, "index.html")]) {
        try {
          if (!(await fs.stat(candidate)).isFile()) continue;
          const bytes = await fs.readFile(candidate);
          res.writeHead(200, { "Content-Type": `${types[path.extname(candidate)] || "application/octet-stream"}; charset=utf-8` });
          res.end(bytes);
          return;
        } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
      }
      res.writeHead(404); res.end("Not found");
    } catch { res.writeHead(500); res.end("Server error"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server;
}
async function overflow(page) { return page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth })); }
async function main() {
  await fs.mkdir(output, { recursive: true });
  const server = process.argv[2] === "local" ? await localServer() : null;
  const base = server ? `http://127.0.0.1:${server.address().port}` : process.argv[2];
  assert.ok(base);
  const report = { base, verifiedAt: new Date().toISOString(), articleCases: [], routes: [], checks: [] };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height, colorScheme] of [[1440,1000,"light"], [1024,900,"dark"], [390,844,"light"], [320,740,"light"], [390,844,"dark"]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      const name = `${width}-${colorScheme}`;
      await page.goto(`${base}/capabilities/dquickts-code-mode`, { waitUntil: "networkidle" });
      await page.locator(".brand img").evaluate(img => img.decode());
      assert.equal(await page.locator("[data-article-section]").count(), 11);
      assert.ok((await page.locator("#articleBody").innerText()).length > 9000);
      let size = await overflow(page);
      assert.ok(size.page <= size.viewport, `${name}: ${JSON.stringify(size)}`);
      await page.screenshot({ path: path.join(output, `${name}-top.png`) });
      for (const section of await page.locator("[data-article-section]").all()) {
        await section.locator("h2").scrollIntoViewIfNeeded();
        size = await overflow(page);
        assert.ok(size.page <= size.viewport, `${name}: section ${await section.getAttribute("id")}`);
      }
      await page.locator('#performance').evaluate(el => el.scrollIntoView());
      await page.screenshot({ path: path.join(output, `${name}-performance.png`) });
      if (width <= 390) {
        const table = page.locator("#comparison .article-table-wrap").first();
        await table.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        assert.ok(await table.evaluate(el => el.scrollLeft > 0));
      }
      await page.locator("#reproduce").evaluate(el => el.scrollIntoView());
      await page.screenshot({ path: path.join(output, `${name}-bottom.png`) });
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: path.join(output, `${name}-footer.png`) });
      await page.locator('agentlab-navigation button[aria-haspopup="menu"]').click();
      await page.getByRole("menuitem", { name: "dquickts 执行环境" }).waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator('agentlab-navigation button[aria-haspopup="menu"]').getAttribute("aria-expanded"), "false");
      assert.deepEqual(errors, [], name);
      report.articleCases.push({ width, height, colorScheme, reducedMotion: true, result: "passed" });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${base}/capabilities?search=dquickts`, { waitUntil: "networkidle" });
    await page.locator('.research-item-link[href*="dquickts-code-mode"]').click();
    await page.waitForURL(/capabilities\/dquickts-code-mode/);
    assert.match(await page.locator("[data-catalog-back]").first().getAttribute("href"), /search=dquickts/);
    await page.locator("[data-catalog-back]").first().click();
    await page.waitForURL(/capabilities\?search=dquickts|capabilities\.html\?search=dquickts/);
    await page.locator('#researchApp[aria-busy="false"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("#researchIndexSearch").inputValue(), "dquickts");
    report.checks.push("catalog-search-article-and-filtered-return");
    await page.goto(`${base}/capabilities?study=dquickts-code-mode&evidence=DQ-03`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#evidence-DQ-03").getAttribute("open"), "");
    await page.locator("#researchLegacyLink").click();
    await page.waitForURL(/capabilities\/dquickts-code-mode/);
    for (const link of await page.locator('a[href^="/studies/"]').all()) {
      const response = await page.request.get(new URL(await link.getAttribute("href"), base).href);
      assert.equal(response.status(), 200);
    }
    report.checks.push("evidence-deep-link-and-all-article-attachments");
    await page.goto(`${base}/guides/dquickts-code-mode`, { waitUntil: "networkidle" });
    await page.waitForURL(/capabilities\/dquickts-code-mode/);
    report.checks.push("compatibility-alias");
    await page.close();
    const noJs = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await noJs.goto(`${base}/capabilities/dquickts-code-mode`, { waitUntil: "load" });
    assert.equal(await noJs.locator("[data-article-section]").count(), 11);
    assert.ok((await noJs.locator("#articleBody").innerText()).length > 9000);
    await noJs.close();
    report.checks.push("full-article-with-javascript-disabled");
    if (process.env.DQUICKTS_ROUTE_SMOKE === "1") {
      const routes = JSON.parse(execFileSync(process.execPath, [path.join(app, "scripts/ui_audit_routes.mjs")], { encoding: "utf8" }));
      for (const width of [1440, 390]) {
        const smoke = await browser.newPage({ viewport: { width, height: 900 } });
        for (const entry of routes) {
          const errors = [];
          const listen = error => errors.push(error.message);
          smoke.on("pageerror", listen);
          const response = await smoke.goto(base + entry.route, { waitUntil: "networkidle", timeout: 30000 });
          const size = await overflow(smoke);
          const item = { route: entry.route, width, status: response.status(), title: await smoke.title(), overflow: size.page > size.viewport, errors };
          report.routes.push(item);
          smoke.off("pageerror", listen);
          assert.equal(response.status(), 200, entry.route);
          assert.deepEqual(errors, [], entry.route);
          console.log(`route ${width}: ${entry.route}${item.overflow ? " [overflow]" : ""}`);
        }
        await smoke.close();
      }
    }
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ articleCases: report.articleCases.length, routes: report.routes.length, checks: report.checks, overflowRoutes: report.routes.filter(r => r.overflow), output }));
  } finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
