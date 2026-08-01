const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.resolve(__dirname, "../public");
const html = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, "data/manifest.json"), "utf8"));

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

test("every current agent filter option has its copied Phistory icon", () => {
  assert.match(app, /className = "feed-filter-agent-icon"/);
  for (const agent of manifest.agents) {
    const extension = agent.id === "omp" ? "svg" : "png";
    const iconPath = path.join(publicRoot, "agent-icons", `${agent.id}.${extension}`);
    assert.ok(fs.existsSync(iconPath), `missing icon for ${agent.id}`);
    assert.ok(fs.statSync(iconPath).size > 0, `empty icon for ${agent.id}`);
    assert.match(app, new RegExp(`/${agent.id}\\.${extension}`));
  }
});
