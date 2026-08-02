const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.resolve(__dirname, "../public");
const html = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");

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

test("feed paging observes a window-rooted sentinel and retains a click fallback", () => {
  assert.match(app, /new window\.IntersectionObserver/);
  assert.match(app, /rootMargin: "700px 0px"/);
  assert.match(app, /dataset\.feedLoadMoreSentinel/);
  assert.match(app, /dataset\.feedLoadMore = "true"/);
});

test("every configured agent filter option has its copied Phistory icon", () => {
  assert.match(app, /className = "feed-filter-agent-icon"/);
  const iconUrls = [...app.matchAll(/["'](\/agent-icons\/[^"']+)["']/g)]
    .map((match) => match[1]);
  assert.ok(iconUrls.length > 0, "no configured agent icons");
  for (const iconUrl of iconUrls) {
    const iconPath = path.join(publicRoot, iconUrl);
    assert.ok(fs.existsSync(iconPath), `missing icon ${iconUrl}`);
    assert.ok(fs.statSync(iconPath).size > 0, `empty icon ${iconUrl}`);
  }
});
