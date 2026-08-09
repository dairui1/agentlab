const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const html = fs.readFileSync(path.join(publicRoot, "mechanisms.html"), "utf8");

test("mechanism dossier is linked from the primary navigation", () => {
  const index = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  assert.match(index, /href="\/mechanisms\.html"/);
  assert.match(html, /<h2>Sub-agent 编排<\/h2>/);
  assert.doesNotMatch(html, /对自研 Agent 的启示/);
});

test("mechanism evidence links resolve to captured tool definitions", () => {
  const evidence = [
    { agent: "claude-code", left: "2.1.225", right: "2.1.226", tool: "agent" },
    { agent: "codex", left: "0.146.1", right: "0.147.0", tool: "collaboration-spawn-agent" },
    { agent: "opencode", left: "1.18.14", right: "1.18.15", tool: "task" },
  ];

  for (const item of evidence) {
    const history = JSON.parse(fs.readFileSync(
      path.join(publicRoot, `data/agents/${item.agent}/history.json`),
      "utf8",
    ));
    assert.ok(history.versions.some((release) => release.version === item.left));
    const target = history.versions.find((release) => release.version === item.right);
    assert.ok(target, `${item.agent} target version is captured`);
    assert.ok(target.tools.some((tool) => tool.id === item.tool), `${item.agent} tool is indexed`);
    assert.ok(html.includes(`agent=${item.agent}`));
    assert.ok(html.includes(`section=tool%3A${item.tool}`));
  }
});
