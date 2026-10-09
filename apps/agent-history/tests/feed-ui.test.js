const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.resolve(__dirname, "../public");
const html = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");
const manifestPath = path.join(publicRoot, "data/manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { agents: [] };

test("header and favicon use the AgentLab brand mark", () => {
  const logoPath = path.join(publicRoot, "assets/agentlab-mark.png");
  assert.match(html, /rel="icon"[^>]+\/assets\/agentlab-mark\.png/);
  assert.match(html, /class="brand-mark"[^>]*>\s*<img src="\/assets\/agentlab-mark\.png"/);
  assert.ok(fs.existsSync(logoPath), "missing AgentLab brand mark");
  assert.ok(fs.statSync(logoPath).size > 0, "empty AgentLab brand mark");
});

test("header links to the public AgentLab repository", () => {
  assert.match(html, /href="https:\/\/github\.com\/dairui1\/agentlab"/);
});

test("feed filters use custom multi-select popovers instead of native selects", () => {
  assert.doesNotMatch(html, /<select[^>]+id="feed(?:Agent|Signal)Filter"/);
  assert.match(html, /id="feedAgentFilter"[^>]+aria-haspopup="dialog"/);
  assert.match(html, /id="feedSignalFilter"[^>]+aria-haspopup="dialog"/);
  assert.match(app, /input\.type = "checkbox"/);
  assert.match(app, /searchParams\.append\(key, value\)/);
});

test("feed filters use viewport-bounded native popovers with an inline fallback", () => {
  const styles = fs.readFileSync(path.join(publicRoot, "styles.css"), "utf8");
  assert.equal((html.match(/popover="manual"/g) || []).length, 2);
  assert.equal((html.match(/data-feed-filter-close\b/g) || []).length, 2);
  assert.match(app, /typeof definition\.panel\.showPopover === "function"/);
  assert.match(app, /showPopover\(\{ source: definition\.trigger \}\)/);
  assert.match(app, /definition\.panel\.hidePopover\(\)/);
  assert.match(app, /definition\.panel\.hidden = true/);
  assert.match(app, /definition\.panel\.removeAttribute\("popover"\)/);
  assert.match(styles, /@supports selector\(:popover-open\)/);
  assert.match(styles, /#feedAgentFilter\s*\{ anchor-name: --feed-agent;/);
  assert.match(styles, /#feedAgentFilterPanel\s*\{ position-anchor: --feed-agent;/);
  assert.match(styles, /\.feed-filter-options\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain/);
  assert.doesNotMatch(styles, /max-height: min\(314px, calc\(100vh - 260px\)\)/);
});

test("touch filtering keeps editable text readable and separate 44px targets", () => {
  const styles = fs.readFileSync(path.join(publicRoot, "styles.css"), "utf8");
  const touch = styles.slice(styles.lastIndexOf("@media (any-pointer: coarse)"));
  assert.match(touch, /\.feed-filter-search input,[\s\S]*?\.compare-view select,[\s\S]*?font-size: max\(16px, 1rem\)/);
  assert.match(touch, /\.feed-filter-option\s*\{[^}]*min-height: 44px/);
  assert.match(touch, /\.feed-filter-panel-close\s*\{[^}]*width: 44px;[^}]*height: 44px/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
});

test("feed paging observes a window-rooted sentinel and retains a click fallback", () => {
  assert.match(app, /new window\.IntersectionObserver/);
  assert.match(app, /rootMargin: "700px 0px"/);
  assert.match(app, /dataset\.feedLoadMoreSentinel/);
  assert.match(app, /dataset\.feedLoadMore = "true"/);
});

test("feed rows retain comparison links and separate metrics from provenance", () => {
  assert.match(app, /link\.href = comparisonHref\(item\)/);
  assert.match(app, /link\.append\(meta, content\)/);
  assert.match(app, /image\.src = agentIconUrls\[item\.agent\.id\]/);
  assert.match(app, /image\.alt = ""/);
  assert.match(app, /image\.width = 24/);
  assert.match(app, /image\.height = 24/);
  assert.match(app, /provenance\.append\(analysisKind\)/);
  assert.match(app, /footer\.append\(facts, provenance, action\)/);
  assert.match(html, /id="feedImportanceToggle"[^>]+aria-pressed="false"/);
  assert.match(html, /class="feed-toggle-switch" aria-hidden="true"/);
});

test("mixed-language feed metrics share a baseline and explicit line height", () => {
  const styles = fs.readFileSync(path.join(publicRoot, "styles.css"), "utf8");
  assert.match(styles, /\.feed-facts\s*\{[^}]*align-items: baseline/);
  assert.match(styles, /\.feed-facts > \.feed-fact-measured\s*\{[^}]*line-height: 1\.5/);
});

test("initial manifest failures replace the loading feed and offer a retry", () => {
  const fatal = app.slice(app.indexOf("function handleFatalError"), app.indexOf("async function initialize"));
  assert.match(fatal, /if \(state\.manifest\) return/);
  assert.match(fatal, /title\.textContent = "情报数据加载失败"/);
  assert.match(fatal, /elements\.intelligenceFeed\.replaceChildren\(empty\)/);
  assert.match(fatal, /elements\.dataHealth\.hidden = true/);
  assert.match(fatal, /window\.location\.reload\(\)/);
});

test("all referenced application elements are bound before rendering", () => {
  const bindings = app.slice(app.indexOf("const elements = {"), app.indexOf("const categoryLabels"));
  const names = new Set([...bindings.matchAll(/\s+(\w+): document\.getElementById\(/g)].map((match) => match[1]));
  for (const match of app.matchAll(/\belements\.(\w+)/g)) {
    assert.ok(names.has(match[1]), `missing element binding: ${match[1]}`);
  }
});

test("every configured agent filter option has a local source icon", () => {
  assert.match(app, /className = "feed-filter-agent-icon"/);
  const iconEntries = [...app.matchAll(/^\s*(?:"([a-z0-9-]+)"|([a-z0-9-]+)):\s*"(\/agent-icons\/[^"]+)"/gm)]
    .map((match) => [match[1] || match[2], match[3]]);
  const iconUrls = new Map(iconEntries);
  for (const agent of ["goose", "cline", "qwen-code", "gemini-cli", "swe-agent", "mini-swe-agent", "zcode", "minimax-code-cli"]) {
    assert.ok(iconUrls.has(agent), `missing icon mapping for ${agent}`);
  }
  for (const agent of manifest.agents) {
    assert.ok(iconUrls.has(agent.id), `missing icon mapping for ${agent.id}`);
  }
  for (const iconUrl of iconUrls.values()) {
    const iconPath = path.join(publicRoot, iconUrl);
    assert.ok(fs.existsSync(iconPath), `missing icon ${iconUrl}`);
    assert.ok(fs.statSync(iconPath).size > 0, `empty icon ${iconUrl}`);
  }
});

test("Gemini CLI and SWE icons retain their pinned official asset bytes", () => {
  const icons = {
    "gemini-cli.png": "351e9f5b1bf863d738cd7be4ed040a625a1419450ae7fc490143e4042b7c2438",
    "swe-agent.png": "712a12e09cfcd5f6f88fb693d039be4a93da7d6e9763b453b5d72e580b757f16",
    "mini-swe-agent.svg": "14f549e2a0d3be26c587f188d467ef6ff1419f38671af3ca0dd86dd27ac76d02",
  };
  for (const [filename, expected] of Object.entries(icons)) {
    const bytes = fs.readFileSync(path.join(publicRoot, "agent-icons", filename));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expected, filename);
  }
});

test("runtime placeholders cannot enter the actual-request diff viewer", () => {
  assert.match(app, /release\.runtimeCapture\?\.promptStatus === "unavailable"/);
  assert.match(app, /无法生成实际请求差异/);
  assert.match(app, /elements\.sectionList\.replaceChildren\(\)/);
  assert.match(app, /outlineVersion\.textContent = `\$\{displayVersion\(state\.right\)\} · Runtime Prompt 未公开`/);
  assert.match(app, /sectionCount\.textContent = "0 项"/);
  assert.match(app, /selectedSectionLabel\.textContent = "Runtime Prompt 未公开捕获"/);
  assert.match(app, /setStats\(\{ available: false \}\)/);
  assert.match(app, /if \(stats\.available === false\)/);
  assert.ok(
    app.indexOf("if (promptUnavailable)") < app.indexOf('setEditorPlaceholder("正在加载实际请求"'),
    "availability must be checked before prompt fetching",
  );
});

test("changelog highlights wrap long source paths within their grid track", () => {
  const styles = fs.readFileSync(path.join(publicRoot, "styles.css"), "utf8");
  assert.match(styles, /\.changelog-highlights\s*\{[^}]*overflow-wrap: anywhere/);
});

test("deterministic summaries are not attributed to Codex", () => {
  assert.match(app, /generator\?\.model \|\| entry\?\.model/);
  assert.match(app, /=== "deterministic-no-change"/);
  assert.match(app, /textContent = "本地规则摘要"/);
  assert.match(app, /textContent = "规则事实摘要，未调用 Codex"/);
});
