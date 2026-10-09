const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const publicRoot = path.resolve(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(publicRoot, name), "utf8");
const htmlFiles = fs.readdirSync(publicRoot, { recursive: true }).filter((name) => name.endsWith(".html"));

test("the UI audit enumerates every HTML, research guide, source detail, and mechanism entry", async () => {
  const rows = JSON.parse(execFileSync(process.execPath, [path.resolve(__dirname, "../scripts/ui_audit_routes.mjs")], { encoding: "utf8" }));
  const routes = new Set(rows.map((row) => row.route));
  assert.equal(routes.size, rows.length);
  assert.equal(htmlFiles.length, 46);
  assert.equal(htmlFiles.filter((file) => file.startsWith("guides/")).length, 22);
  assert.equal(htmlFiles.filter((file) => file.startsWith("guides/") && read(file).includes('class="rg-page"')).length, 10);
  assert.equal(htmlFiles.filter((file) => file.startsWith("guides/") && read(file).includes('http-equiv="refresh"')).length, 12);
  for (const file of htmlFiles) {
    const route = `/${file}`.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
    assert.ok(routes.has(route), `missing HTML route: ${route}`);
  }
  for (const study of JSON.parse(read("research-index.json")).studies) {
    assert.ok(routes.has(`/capabilities?study=${encodeURIComponent(study.id)}`), `missing study: ${study.id}`);
    if (study.guideData) {
      assert.ok(routes.has(study.legacyHref.replace(/\.html$/, "")), `missing guide: ${study.id}`);
      const source = new URL(study.archiveHref, "https://agentlab.test");
      source.pathname = source.pathname.replace(/\.html$/, "");
      source.searchParams.set("source", "1");
      assert.ok(routes.has(`${source.pathname}${source.search}`), `missing source archive: ${study.id}`);
    } else {
      const reading = new URL(study.legacyHref, "https://agentlab.test");
      reading.pathname = reading.pathname.replace(/\.html$/, "");
      assert.ok(routes.has(`${reading.pathname}${reading.search}`), `missing original reading: ${study.id}`);
    }
  }
  for (const [, href] of read("mechanisms.js").matchAll(/href: "(\/mechanisms[^\"]*)"/g)) {
    assert.ok(routes.has(href), `missing mechanism route: ${href}`);
  }
  assert.ok(routes.has("/?mode=compare"));
  const themeAudit = require("../ops/site-theme/verify_site.cjs");
  const themeRoutes = await themeAudit.routes();
  assert.equal(themeRoutes.filter((route) => route.startsWith("/guides/")).length, 22);
  for (const file of htmlFiles) assert.ok(themeRoutes.includes(file === "index.html" ? "/" : `/${file}`), `missing theme audit HTML: ${file}`);
});

test("all public pages share navigation, base styling, and an explicit current context", () => {
  for (const file of htmlFiles) {
    const html = read(file);
    assert.match(html, /href="\/styles\.css"/, file);
    assert.match(html, /src="\/site-navigation\.js"/, file);
    assert.match(html, /<agentlab-navigation\b[^>]*(?:current="[^"]+"|interactive)/, file);
  }
});

test("interior styles keep readable metadata and theme-aware surfaces", () => {
  for (const name of ["research", "mechanisms", "capability-article", "goal-mode-lab", "goal-mode-real-run", "computer-use-lab", "computer-use-playback", "token-budget-context", "deepseek-harness", "grok-bot"]) {
    assert.doesNotMatch(read(`${name}.css`), /font(?:-size)?:[^;{}]*\b(?:8|9|10|11)(?:\.\d+)?px/, name);
  }
  assert.match(read("deepseek-harness.css"), /--dsh-soft: var\(--surface-muted\)/);
  assert.match(read("deepseek-harness.css"), /\.dsh-domain-tag\s*\{[^}]*color: var\(--text-soft\)/);
  assert.match(read("grok-bot.css"), /--grok-paper: var\(--surface\)/);
  assert.match(read("capability-article.css"), /--article-paper: var\(--surface\)/);
  assert.match(read("research.css"), /\.research-evidence-copy\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)[^}]*overflow-wrap: anywhere/);
});

test("single-operation comparison removes only the redundant desktop label column", () => {
  assert.match(read("mechanisms.js"), /if \(state\.operation !== "all"\)\s*\{\s*table\.classList\.add\("is-single-operation"\)/);
  assert.match(read("mechanisms.js"), /table\.setAttribute\("aria-label", operations\[0\]\.label\)/);
  assert.match(read("mechanisms.css"), /@media \(min-width: 761px\)\s*\{\s*\.is-single-operation/);
  assert.match(read("mechanisms.css"), /\.resource-row\s*\{[^}]*grid-template-columns: 142px repeat\(3, minmax\(0, 1fr\)\) 120px/);
});
