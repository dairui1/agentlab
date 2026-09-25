const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "..", "public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const study = JSON.parse(read("capabilities/raft-collaboration.json"));
const html = read("capabilities/raft-collaboration.html");

test("Raft is classified as pinned source-available collaboration infrastructure", () => {
  assert.equal(study.source.revision, "05f7d8fd77d2535f993d5d90b85118438bc18216");
  assert.equal(study.source.license, "FSL-1.1-ALv2");
  assert.equal(study.source.evidenceClass, "official-source-static");
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.match(html, /协作型 Agent 基础设施/);
  assert.match(html, /不是实际运行记录/);
  assert.match(html, /未运行 Raft 或上游测试/);
  assert.match(html, /当前未接入自动版本日更或持续监控/);
  for (const boundary of ["continueAnyway", "danger-full-access", "fallback_fresh_thread", "model-seen"]) {
    assert.ok(html.includes(boundary), boundary);
  }
});

test("Raft evidence locators and every article reference resolve", () => {
  const ids = new Set(study.evidence.map((e) => e.id));
  assert.equal(ids.size, 18);
  assert.equal(study.unknowns.length, 6);
  for (const e of study.evidence) {
    assert.match(e.sha256, /^[a-f0-9]{64}$/);
    assert.ok(e.statement && e.boundary && e.locator);
    assert.equal(e.source.url, `https://github.com/${study.source.repository}/blob/${study.source.revision}/${e.artifact}#L${e.lineStart}-L${e.lineEnd}`);
  }
  const cited = new Set();
  for (const [, value] of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of value.split(" ")) { assert.ok(ids.has(id), id); cited.add(id); }
  }
  assert.deepEqual(cited, ids);
  const sections = new Set([...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((m) => m[1]));
  assert.equal(sections.size, 10);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(sections.has(target), target);
});

test("Raft is reachable through shared navigation and searchable research data", () => {
  const entry = JSON.parse(read("research-index.json")).studies.find((s) => s.id === study.id);
  const nav = require("../public/site-navigation.js");
  assert.equal(entry.legacyHref, "/capabilities/raft-collaboration.html");
  assert.equal(nav.researchItems.find((s) => s.id === "raft").href, entry.legacyHref);
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  for (const id of entry.headlineEvidence) assert.ok(study.evidence.some((e) => e.id === id));
  assert.match(html, /<agentlab-navigation current="raft"/);
  assert.match(html, /data-evidence-source="\/capabilities\/raft-collaboration.json"/);
});

test("source verifier rejects changed bytes, invalid locators and unsafe paths without running upstream code", async () => {
  const { verifyEvidenceFiles } = await import("../scripts/verify_raft_sources.mjs");
  const bytes = Buffer.from("first\nsecond\n");
  const fixture = structuredClone(study);
  fixture.evidence = [structuredClone(study.evidence[0])];
  const e = fixture.evidence[0];
  e.lineStart = 1; e.lineEnd = 2;
  e.sha256 = createHash("sha256").update(bytes).digest("hex");
  e.source.url = `https://github.com/${study.source.repository}/blob/${study.source.revision}/${e.artifact}#L1-L2`;
  const result = await verifyEvidenceFiles(fixture, async () => bytes);
  assert.equal(result.files, 1);
  assert.equal(result.runtimeExperiment, "not-run");
  await assert.rejects(() => verifyEvidenceFiles(fixture, async () => Buffer.from("changed")), /Hash mismatch/);
  e.lineEnd = 3;
  await assert.rejects(() => verifyEvidenceFiles(fixture, async () => bytes), /Invalid line range/);
  e.lineEnd = 2; e.source.url = e.source.url.replace(study.source.revision, "main");
  await assert.rejects(() => verifyEvidenceFiles(fixture, async () => bytes), /Unpinned source locator/);
  e.artifact = "../private";
  await assert.rejects(() => verifyEvidenceFiles(fixture, async () => bytes), /Unsafe artifact path/);
});
