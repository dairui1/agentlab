const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const core = require(path.join(root, "public/deepseek-harness-core.js"));
const html = fs.readFileSync(path.join(root, "public/deepseek-harness.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const architecture = fs.readFileSync(path.join(root, "public/capabilities/deepseek-harness-architecture.html"), "utf8");
const tracker = fs.readFileSync(path.join(root, "public/deepseek-harness.js"), "utf8");
const navigation = require(path.join(root, "public/site-navigation.js"));

test("DeepSeek Harness tracker models platform evolution instead of prompt-only change", () => {
  assert.equal(core.domains.length, 7);
  assert.deepEqual(core.domains.map((domain) => domain.id), [
    "composition", "orchestration", "context", "execution", "state", "surface", "reliability",
  ]);
  for (const id of ["domainGrid", "pluginCapabilityGrid", "releaseList", "officialSections", "evidenceLedger", "compatibilityList"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("DSH plugin section explains capability roles without a live leaderboard", () => {
  assert.equal(core.pluginCapabilities.length, 7);
  assert.deepEqual(core.pluginCapabilities.map((capability) => capability.id), [
    "workspace", "memory", "multimodal", "tools", "workflow", "model", "runtime",
  ]);
  for (const capability of core.pluginCapabilities) {
    assert.ok(capability.description);
    assert.ok(capability.boundary);
    assert.ok(capability.forms.length >= 3);
  }
  assert.doesNotMatch(html, /Top 20|Trending/);
  assert.doesNotMatch(tracker, /plugins\.json|pluginMode/);
});

test("release facts lead while low-value coverage metrics stay collapsed", () => {
  const trackerIndex = html.indexOf('class="dsh-tracker-layout"');
  const pluginIndex = html.indexOf('class="dsh-plugin-section"');
  const coverageIndex = html.indexOf('id="trackingCoverage"');
  assert.ok(trackerIndex > 0);
  assert.ok(trackerIndex < pluginIndex);
  assert.ok(pluginIndex < coverageIndex);
  const coverage = html.slice(coverageIndex, html.indexOf("</details>", coverageIndex));
  assert.match(coverage, /class="dsh-status-band"/);
  assert.match(coverage, /id="domainGrid"/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
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
  assert.ok(navigation.items.some((item) => item.id === "dsh" && item.href === "/deepseek-harness.html"));
  assert.doesNotMatch(architecture, /<agentlab-navigation[^>]+current=/);
});
