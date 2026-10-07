const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const study = JSON.parse(read("capabilities/code-mode.json"));
const html = read("capabilities/code-mode.html");

test("Code Mode replaces the essay with a novice-first research tree", () => {
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.source.upstreamTests, "not-run");
  for (const phrase of ["未发布", "不是事务", "没有运行", "ctx.executeTool()", "yield_time_ms", "QuickJS/WASM", "V8 isolate"]) assert.ok(html.includes(phrase), phrase);
  assert.doesNotMatch(html, /把确定的步骤交给程序|我更愿意把/);
  const nodes = [...html.matchAll(/<section id="([^"]+)" data-node data-parent="([^"]*)"/g)].map((match) => ({ id: match[1], parent: match[2] }));
  assert.equal(nodes.length, 23);
  const ids = new Set(nodes.map((node) => node.id));
  assert.equal(ids.size, nodes.length);
  assert.equal(nodes[0].id, "overview");
  for (const node of nodes.slice(1)) assert.ok(ids.has(node.parent));
  for (const node of nodes.slice(1)) {
    const seen = new Set();
    let cursor = node;
    while (cursor.parent) {
      assert.ok(!seen.has(cursor.id), `cycle at ${cursor.id}`);
      seen.add(cursor.id);
      cursor = nodes.find((item) => item.id === cursor.parent);
    }
    assert.equal(cursor.id, "overview");
  }
  const tree = html.match(/<nav aria-label="Code Mode 研究树">([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual(new Set([...tree.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])), ids);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(id), id);
  assert.match(html, /教学示意：版本工具是虚构接口/);
  assert.match(html, /普通工具接口也可以支持批量或并行调用/);
  assert.match(html, /不是发明优先权的判定/);
});

test("Code Mode anchors resolve to pinned sources without conflating Pi and Codex", () => {
  const ids = new Set(study.evidence.map((item) => item.id));
  const used = new Set([...html.matchAll(/data-evidence="([^"]+)"/g)].flatMap((match) => match[1].split(" ")));
  assert.equal(ids.size, 12);
  assert.deepEqual(used, ids);
  for (const item of study.evidence) {
    assert.ok(item.statement && item.boundary && item.evidenceClass && item.locator);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    const url = new URL(item.source.url);
    const [, repository, project, marker, revision, ...artifact] = url.pathname.split("/");
    assert.equal(marker, "blob");
    assert.equal(study.source.revisions[`${repository}/${project}`], revision);
    assert.equal(artifact.join("/"), item.artifact);
    assert.equal(url.hash, `#L${item.lineStart}-L${item.lineEnd}`);
  }
  assert.equal(study.unknowns.length, 3);
  assert.ok(study.unknowns.every((item) => item.text && item.needed));
});

test("research node links fall back safely and keep explicit branches above evidence hints", () => {
  const { resolveNode } = require("../public/code-mode.js");
  const ids = ["overview", "pi", "sandbox"];
  assert.equal(resolveNode("#pi", ids, "sandbox"), "pi");
  assert.equal(resolveNode("", ids, "sandbox"), "sandbox");
  assert.equal(resolveNode("#%invalid", ids), "overview");
  assert.equal(resolveNode("#unknown", ids), "overview");
  const css = read("code-mode.css");
  assert.doesNotMatch(css, /font-size:[^;]*(?:vw|cqw)|letter-spacing:\s*-/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /max-width: 680px/);
});

test("Code Mode integrates with the library and shared evidence drawer", () => {
  const entry = JSON.parse(read("research-index.json")).studies.find((item) => item.id === study.id);
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.equal(require("../public/site-navigation.js").researchItems.find((item) => item.id === study.id).href, entry.legacyHref);
  assert.match(html, /data-evidence-source="\/capabilities\/code-mode.json"/);
  assert.match(html, /role="dialog"[^>]+inert/);
  assert.match(html, /\/capability-article.js/);
});
