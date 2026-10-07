const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const study = JSON.parse(read("capabilities/code-mode.json"));
const html = read("capabilities/code-mode.html");

test("Code Mode is a short source essay, not a runtime benchmark claim", () => {
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.source.upstreamTests, "not-run");
  for (const phrase of ["未发布", "不是事务", "没有运行", "ctx.executeTool()", "yield_time_ms", "QuickJS/WASM", "V8 isolate"]) assert.ok(html.includes(phrase), phrase);
  const sections = [...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((match) => match[1]);
  assert.deepEqual(sections, ["program", "pi", "lifetime", "judgment"]);
  assert.deepEqual([...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]), sections);
  assert.ok(html.replace(/<[^>]+>/g, "").match(/[\u4e00-\u9fff]/g).length < 2600);
});

test("Code Mode anchors resolve to pinned sources without conflating Pi and Codex", () => {
  const ids = new Set(study.evidence.map((item) => item.id));
  const used = new Set([...html.matchAll(/data-evidence="([^"]+)"/g)].flatMap((match) => match[1].split(" ")));
  assert.equal(ids.size, 8);
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

test("Code Mode integrates with the library and shared evidence drawer", () => {
  const entry = JSON.parse(read("research-index.json")).studies.find((item) => item.id === study.id);
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.equal(require("../public/site-navigation.js").researchItems.find((item) => item.id === study.id).href, entry.legacyHref);
  assert.match(html, /data-evidence-source="\/capabilities\/code-mode.json"/);
  assert.match(html, /role="dialog"[^>]+inert/);
  assert.match(html, /\/capability-article.js/);
});
