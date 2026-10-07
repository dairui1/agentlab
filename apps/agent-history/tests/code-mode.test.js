const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const study = JSON.parse(read("capabilities/code-mode.json"));
const html = read("capabilities/code-mode.html");

test("Code Mode follows one rooted reading tree without disclosure widgets", () => {
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.source.upstreamTests, "not-run");
  assert.doesNotMatch(html, /<\/?(?:details|summary)\b/i);
  const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const nodes = [...html.matchAll(/<section\b[^>]*\bdata-node\b[^>]*>/g)].map(([tag]) => ({ id: attribute(tag, "id"), parent: attribute(tag, "data-parent") }));
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
  const tree = html.match(/<nav\b[^>]*id="cmTreeNav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(tree, "the reading tree has a persistent navigation landmark");
  assert.deepEqual(new Set([...tree.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])), ids);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(id), id);
  for (const id of ["cmTree", "cmParentLink"]) assert.ok(html.includes(`id="${id}"`), id);
});

test("Code Mode mounts four local diagrams without claiming to execute tools", () => {
  const diagramNodes = ["execution", "codex", "sandbox", "state"];
  const { diagrams } = require("../public/code-mode.js");
  assert.deepEqual(Object.keys(diagrams), diagramNodes);
  assert.deepEqual([...html.matchAll(/data-diagram="([^"]+)"/g)].map(([, id]) => id), diagramNodes);
  for (const id of diagramNodes) {
    const section = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`))?.[0];
    assert.ok(section, id);
    assert.ok(section.includes(`data-diagram="${id}"`));
    const diagram = diagrams[id];
    assert.ok(diagram.title && diagram.note);
    assert.equal(diagram.lanes.length, 3);
    assert.ok(diagram.steps.length >= 3);
    for (const step of diagram.steps) {
      assert.ok(step.label && step.text);
      assert.equal(step.values.length, diagram.lanes.length);
      assert.ok(step.active.every((index) => index >= 0 && index < diagram.lanes.length));
    }
  }
  assert.doesNotMatch(read("code-mode.js"), /\beval\s*\(|new Function\s*\(/);
  for (const diagram of Object.values(diagrams)) {
    if (!diagram.edges) continue;
    assert.equal(diagram.edges.length, diagram.steps.length);
    for (const edges of diagram.edges) {
      assert.equal(edges.length, diagram.lanes.length - 1);
      assert.ok(edges.every((edge) => ["forward", "back", "none"].includes(edge)));
    }
  }
  assert.deepEqual(diagrams.execution.edges[2], ["none", "none"], "local comparison sends no data to the model");
  assert.deepEqual(diagrams.sandbox.edges[2], ["back", "none"], "denied request never reaches the file");
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
  const { resolveNode, adjacentNodes } = require("../public/code-mode.js");
  const ids = ["overview", "pi", "sandbox"];
  assert.equal(resolveNode("#pi", ids, "sandbox"), "pi");
  assert.equal(resolveNode("", ids, "sandbox"), "sandbox");
  assert.equal(resolveNode("#%invalid", ids), "overview");
  assert.equal(resolveNode("#unknown", ids), "overview");
  assert.deepEqual(adjacentNodes("overview", ids), { previous: null, next: "pi" });
  assert.deepEqual(adjacentNodes("pi", ids), { previous: "overview", next: "sandbox" });
  assert.deepEqual(adjacentNodes("sandbox", ids), { previous: "pi", next: null });
  const css = read("code-mode.css");
  assert.doesNotMatch(css, /font-size:[^;]*(?:vw|cqw)|letter-spacing:\s*-/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /max-width:\s*680px/);
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
