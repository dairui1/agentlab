const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const publicRoot = path.join(__dirname, "..", "public");
const read = (name) => fs.readFileSync(path.join(publicRoot, name), "utf8");
const study = JSON.parse(read("capabilities/mimoagent.json"));
const html = read("capabilities/mimoagent.html");
const revision = "467f0a19016f0ac4d63b8d17a1f0da9ba07f232c";

test("MiMo research separates source, author reports and synthetic experiments", () => {
  assert.equal(study.source.revision, revision);
  assert.equal(study.source.runtimeExperiment, "synthetic-contract-only");
  assert.equal(study.source.realCliExperiment, "not-run");
  assert.equal(study.verification.upstreamPassed, 431);
  assert.equal(study.verification.upstreamSkipped, 7);
  assert.equal(study.evidence.filter((e) => e.evidenceClass === "author-report").length, 3);
  for (const text of ["没有运行真实模型或 RL 训练", "不是反向训练", "Completed", "原生模型调用为零", "同算力单 harness", "mini-harness1-4"]) assert.ok(html.includes(text), text);
  assert.match(study.verification.reportSha256, /^[a-f0-9]{64}$/);
});

test("all MiMo citations resolve to pinned evidence and are used", () => {
  const ids = new Set(study.evidence.map((e) => e.id));
  assert.equal(ids.size, 26);
  const cited = new Set();
  for (const [, references] of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of references.split(" ")) { assert.ok(ids.has(id), id); cited.add(id); }
  }
  assert.deepEqual(cited, ids);
  for (const evidence of study.evidence) {
    assert.ok(evidence.statement && evidence.boundary && evidence.locator);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
    if (evidence.evidenceClass === "author-report") assert.match(evidence.source.url, /\/blob\/73875d0\//);
    else assert.equal(evidence.source.url, `https://github.com/XiaomiMiMo/mimoagent/blob/${revision}/${evidence.artifact}#L${evidence.lineStart}-L${evidence.lineEnd}`);
  }
});

test("MiMo synthetic probe never claims production execution or complete trajectories", () => {
  const probe = JSON.parse(read("capabilities/mimoagent-probe.json"));
  assert.equal(probe.revision, revision);
  assert.equal(probe.realCliExecuted, false);
  assert.equal(probe.realModelCalled, false);
  assert.equal(probe.codex.nativeModelQueryCalls, 0);
  assert.equal(probe.codex.resumeCommandObserved, true);
  assert.equal(probe.codex.syntheticCommandEventInInput, true);
  assert.deepEqual(probe.codex.unifiedTrajectoryMessageRoles, ["user", "assistant", "user", "assistant"]);
  assert.equal(probe.codex.unifiedTrajectoryHasTools, false);
  assert.equal(probe.codex.unifiedTrajectoryHasToolCalls, false);
  assert.equal(probe.claudeQuestion.sdkTypeStubbed, true);
});

test("MiMo article has semantic no-JS content, navigation, and bounded responsive layouts", () => {
  const sections = [...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((m) => m[1]);
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.equal(sections.length, 12);
  assert.deepEqual(links, sections);
  assert.equal(new Set(sections).size, sections.length);
  assert.match(html, /data-evidence-source="\/capabilities\/mimoagent.json"/);
  assert.match(html, /role="dialog"[^>]+inert/);
  assert.match(html, /src="\/capability-article.js"/);
  const css = read("mimoagent.css");
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /overflow-x:auto/);
  assert.doesNotMatch(css, /font-size:[^;]*(?:vw|cqw)|letter-spacing:\s*-/);
});

test("MiMo is discoverable and index counts agree with its source data", () => {
  const entry = JSON.parse(read("research-index.json")).studies.find((s) => s.id === study.id);
  const nav = require("../public/site-navigation.js");
  assert.equal(nav.researchItems.find((s) => s.id === study.id).href, entry.legacyHref);
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  for (const id of entry.headlineEvidence) assert.ok(study.evidence.some((e) => e.id === id));
});

test("MiMo owns its theme without inheriting the Raft visual identity", () => {
  const css = read("mimoagent.css");
  assert.doesNotMatch(html, /raft-blog|raft-collaboration|blog-nav/);
  assert.doesNotMatch(css, /--blog-|\.raft-|\.blog-/);
  assert.match(html, /href="\/mimoagent\.css"/);
  assert.match(css, /grid-template-areas:"body toc"/);
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /--article-signal:#b34a14/);
  assert.match(css, /--mimo-route:#226e94/);
});
