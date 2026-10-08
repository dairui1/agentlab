const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const root = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const study = JSON.parse(read("capabilities/raven.json"));
const html = read("capabilities/raven.html");
const revision = "e6c0344cb7ce00db25d554e4bb671ec1909a8f9f";

test("Raven keeps fixed research, release tracking and reproduction distinct", () => {
  assert.equal(study.source.revision, revision);
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.verification.upstreamTestsRunLocally, false);
  assert.equal(study.verification.benchmarksReproduced, false);
  assert.equal(study.verification.realModelCalls, 0);
  assert.equal(study.verification.ci.evidenceClass, "upstream-ci-not-local-reproduction");
  assert.equal(study.evidence.filter((e) => e.evidenceClass === "author-report").length, 2);
  assert.equal(study.evidence.filter((e) => e.evidenceClass === "author-case").length, 1);
  for (const text of ["not_supplied", "credited_2sigma", "HarnessBank v2", "140 个请求", "不归为严格 Agentic RL", "晚于 v0.2.3", "没有在本机执行", "agent-full-access"]) assert.ok(html.includes(text), text);
});

test("all Raven citations are pinned, complete and used", () => {
  const ids = new Set(study.evidence.map((e) => e.id));
  assert.equal(ids.size, 19);
  const cited = new Set();
  for (const [, references] of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of references.split(" ")) { assert.ok(ids.has(id), id); cited.add(id); }
  }
  assert.deepEqual(cited, ids);
  for (const e of study.evidence) {
    assert.ok(e.statement && e.boundary && e.locator && e.evidenceClass, e.id);
    assert.match(e.sha256, /^[a-f0-9]{64}$/);
    if (e.evidenceClass === "author-report") assert.equal(e.sha256, study.verification.reportSha256);
    else assert.equal(e.source.url, `https://github.com/EverMind-AI/Raven/blob/${revision}/${e.artifact}#L${e.lineStart}-L${e.lineEnd}`);
  }
});

test("Raven article is usable without JS, and appears in shared research navigation", () => {
  const sections = [...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((m) => m[1]);
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ["verdict", "curation", "validation", "activation", "engineering", "sources"]);
  assert.deepEqual(links, sections);
  const supplements = [...html.matchAll(/<details id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(supplements, ["orchestration", "evolver", "results", "permissions"]);
  assert.equal(new Set([...sections, ...supplements]).size, 10);
  assert.ok(html.indexOf("作者记录的旅行社模拟") < html.indexOf('id="curation"'));
  assert.ok(html.indexOf('id="engineering"') < html.indexOf('id="evolver"'));
  assert.match(html, /四次/);
  assert.match(html, /没有参与修订的任务/);
  assert.match(html, /不是今天这套 Curator 的效果验收/);
  assert.match(html, /src="\/article-disclosures.js"/);
  assert.doesNotMatch(html, /class="article-(scope-band|toc-note)"/);
  assert.match(html, /data-evidence-source="\/capabilities\/raven.json"/);
  assert.match(html, /role="dialog"[^>]+inert/);
  assert.match(html, /src="\/capability-article.js"/);
  const entry = JSON.parse(read("research-index.json")).studies.find((s) => s.id === "raven");
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.equal(require("../public/site-navigation.js").researchItems.find((s) => s.id === "raven").href, entry.legacyHref);
  for (const id of entry.headlineEvidence) assert.ok(study.evidence.some((e) => e.id === id));
  assert.doesNotMatch(read("raven.css"), /font-size:[^;]*(?:vw|cqw)|letter-spacing:\s*-/);
});

test("Raven product mark preserves the pinned upstream bytes", () => {
  const asset = study.assets[0];
  const bytes = fs.readFileSync(path.join(root, asset.path.slice(1)));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  assert.match(asset.sourceUrl, new RegExp(revision));
  assert.match(html, /src="\/agent-icons\/raven.png"[^>]+width="48" height="48"/);
});

test("Raven verifier rejects source, locator, report and excerpt drift", async () => {
  const { verifyRavenSources } = await import("../scripts/verify_raven_sources.mjs");
  const bytes = Buffer.from("first\nsecond\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sample = {
    source: { repository: "EverMind-AI/Raven", revision },
    verification: { reportSha256: sha256 },
    evidence: [{ id: "RV-test", artifact: "test.py", lineStart: 1, lineEnd: 2, locator: "L1-L2", sha256,
      source: { url: `https://github.com/EverMind-AI/Raven/blob/${revision}/test.py#L1-L2` } }],
    snippets: [{ id: "RV-test", artifact: "test.py", lineStart: 1, lineEnd: 1, text: "first" }], assets: [],
  };
  const verify = (value = sample, markup = '<code data-source-snippet="RV-test">first</code>', source = bytes, report = bytes) =>
    verifyRavenSources(value, markup, async () => source, async () => report, async () => bytes);
  assert.equal((await verify()).runtimeExperiment, "not-run");
  await assert.rejects(verify(sample, undefined, Buffer.from("changed")), /hash mismatch/);
  await assert.rejects(verify(sample, undefined, bytes, Buffer.from("changed")), /hash mismatch/);
  await assert.rejects(verify(sample, "wrong excerpt"), /HTML excerpt mismatch/);
  const range = structuredClone(sample); range.evidence[0].lineEnd = 3;
  await assert.rejects(verify(range), /Invalid range/);
  const unpinned = structuredClone(sample); unpinned.evidence[0].source.url = "https://github.com/EverMind-AI/Raven/blob/main/test.py";
  await assert.rejects(verify(unpinned));
  const unsafe = structuredClone(sample); unsafe.evidence[0].artifact = "../secret";
  await assert.rejects(verify(unsafe), /Unsafe artifact/);
});
