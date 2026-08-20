const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const core = require(path.join(root, "public/deepseek-harness-core.js"));
const html = fs.readFileSync(path.join(root, "public/deepseek-harness.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const architecture = fs.readFileSync(path.join(root, "public/capabilities/deepseek-harness-architecture.html"), "utf8");
const pluginData = JSON.parse(fs.readFileSync(path.join(root, "public/data/deepseek-harness/plugins.json"), "utf8"));

test("DeepSeek Harness tracker models platform evolution instead of prompt-only change", () => {
  assert.equal(core.domains.length, 7);
  assert.deepEqual(core.domains.map((domain) => domain.id), [
    "composition", "orchestration", "context", "execution", "state", "surface", "reliability",
  ]);
  for (const id of ["domainGrid", "pluginList", "pluginTopTab", "pluginTrendingTab", "releaseList", "officialSections", "evidenceLedger", "compatibilityList"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("DSH plugin radar exposes independently sourced Top 20 and Trending lists", () => {
  assert.equal(pluginData.source.name, "awesome-dsh-plugin");
  assert.equal(pluginData.leaderboards.top.metric, "stars");
  assert.equal(pluginData.leaderboards.trending.metric, "downloads");
  assert.equal(pluginData.leaderboards.trending.windowDays, 30);
  assert.equal(pluginData.leaderboards.top.items.length, 20);
  assert.equal(pluginData.leaderboards.trending.items.length, 20);
  assert.match(pluginData.leaderboards.top.method, /Stars/);
  assert.match(pluginData.leaderboards.trending.method, /30 天/);
});

test("release classification keeps DSH cross-plane changes visible", () => {
  const entry = {
    title: "Profile Bundle and persistent PowerShell",
    summary: "Codex Subagent non-interactive permissions and SQLite incompatible storage",
    highlights: ["Image input for /goal and /plan"],
    layers: { official: { release: { notes: { text: "### 新增功能\n* web_search 并发查询" } } } },
  };
  const domains = new Set(core.classifyEntry(entry));
  for (const id of ["composition", "orchestration", "context", "execution", "state", "surface", "reliability"]) {
    assert.ok(domains.has(id), `missing ${id}`);
  }
});

test("DSH feed entries route to the dedicated tracker", () => {
  assert.match(app, /item\.agent\.id === "deepseek-harness"/);
  assert.match(app, /\/deepseek-harness\.html/);
  assert.match(architecture, /href="\/deepseek-harness\.html"/);
});
