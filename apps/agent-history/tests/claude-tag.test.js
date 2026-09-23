const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "..", "public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const tools = JSON.parse(read("capabilities/claude-tag-tools.json"));
const study = JSON.parse(read("capabilities/claude-tag.json"));
const html = read("capabilities/claude-tag.html");

test("Claude Tag tool inventory is complete, pinned and separates worker capabilities", () => {
  assert.equal(tools.tools.length, 85);
  assert.equal(new Set(tools.tools.map((t) => t.name)).size, 85);
  const counts = tools.tools.reduce((out, t) => ({ ...out, [t.family]: (out[t.family] || 0) + 1 }), {});
  assert.deepEqual(counts, { coordinator: 10, remote: 26, slack: 49 });
  for (const name of ["Bash", "Edit", "Write", "Artifact"]) assert.ok(!tools.tools.some((t) => t.name === name));
  for (const t of tools.tools) {
    assert.equal(t.schema.type, "object");
    assert.ok(t.schema.properties);
    assert.ok(t.lineStart > 1116 && t.lineEnd > t.lineStart);
    assert.ok(t.source.includes(`/blob/${tools.revision}/`));
    assert.ok(t.source.endsWith(`#L${t.lineStart}-L${t.lineEnd}`));
  }
});

test("Claude Tag preserves schema-versus-description differences instead of fixing the evidence", () => {
  const get = (name) => tools.tools.find((t) => t.name === name).schema;
  assert.deepEqual(get("Agent").required, ["description", "prompt"]);
  assert.ok(get("Agent").properties.subagent_type);
  assert.deepEqual(get("SendMessage").required, ["to", "message"]);
  assert.deepEqual(get("mcp__slackbot__reply").required, ["last_seen_ts"]);
  assert.equal(get("mcp__slackbot__reply").properties.force.type, "boolean");
});

test("Claude Tag evidence anchors resolve and remain scoped to one snapshot", () => {
  const ids = new Set(study.evidence.map((e) => e.id));
  for (const match of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of match[1].split(" ")) assert.ok(ids.has(id), id);
  }
  assert.equal(study.evidence.length, 18);
  assert.equal(study.unknowns.length, 5);
  for (const e of study.evidence) {
    assert.equal(e.sha256, tools.sha256);
    assert.ok(e.source.url.includes(`/blob/${tools.revision}/${tools.artifact}#L`));
    assert.equal(e.artifact, tools.artifact);
  }
  assert.match(html, /不是实际运行记录/);
  assert.match(html, /没有后端源码或真实 Slack 实验|未做真实 Slack 实验/);
  assert.match(html, /没有 claim database/);
});

test("tool extractor skips JSON examples and reads the final schema", async () => {
  const { extractTools } = await import("../scripts/extract_claude_tag_tools.mjs");
  const fixture = '# Tools\n\n## SendMessage\n\n```json\n{"to":"a"}\n{"to":"b"}\n```\n\n```json\n{"type":"object","properties":{"to":{"type":"string"}},"required":["to"]}\n```\n';
  assert.deepEqual(extractTools(fixture)[0].schema.required, ["to"]);
  assert.throws(() => extractTools("# no tools"), /Missing Tools/);
  assert.throws(() => extractTools("# Tools\n## Broken\n"), /Missing schema/);
});

test("Claude Tag is discoverable from both the shared navigation and research index", () => {
  const nav = require("../public/site-navigation.js");
  const entry = JSON.parse(read("research-index.json")).studies.find((s) => s.id === "claude-tag");
  assert.equal(entry.legacyHref, "/capabilities/claude-tag.html");
  assert.equal(nav.researchItems.find((s) => s.id === "claude-tag").href, entry.legacyHref);
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
});
