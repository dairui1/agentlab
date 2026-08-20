const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const core = require(path.join(root, "public/deepseek-harness-core.js"));
const html = fs.readFileSync(path.join(root, "public/deepseek-harness.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const architecture = fs.readFileSync(path.join(root, "public/capabilities/deepseek-harness-architecture.html"), "utf8");

test("DeepSeek Harness tracker models platform evolution instead of prompt-only change", () => {
  assert.equal(core.domains.length, 7);
  assert.deepEqual(core.domains.map((domain) => domain.id), [
    "composition", "orchestration", "context", "execution", "state", "surface", "reliability",
  ]);
  for (const id of ["domainGrid", "releaseList", "officialSections", "evidenceLedger", "compatibilityList"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
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
