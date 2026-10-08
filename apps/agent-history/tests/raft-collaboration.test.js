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
  assert.equal(sections.size, 9);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(sections.has(target), target);
  assert.match(html, /<details id="experiments" class="study-notes">/);
  assert.match(html, /还缺哪些失败路径实验/);
  assert.match(html, /查看数据库怎样检查认领版本/);
  assert.match(html, /查看 Codex 续接错误的分类源码/);
  assert.match(html, /src="\/article-disclosures.js"/);
});

test("Raft essay shares the blog theme without repetitive editorial chrome", () => {
  assert.match(html, /class="article-page raft-blog raft-collaboration"/);
  assert.match(html, /href="\/raft-blog.css"/);
  assert.match(html, /href="\/raft-collaboration.css"/);
  assert.doesNotMatch(html, /class="article-(byline|scope-band|margin|toc-note)"|class="section-number"/);
  assert.doesNotMatch(html + JSON.stringify(study), /线程|智能体|提示词/);
  const css = read("raft-collaboration.css");
  assert.match(css, /grid-template-columns:180px minmax\(0,760px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /color:var\(--text-soft\)/);
});

test("Raft essay preserves the exact task and recovery source excerpts", () => {
  const expected = {
    claimExcerpt: "173ec83e862c23cec8c62ff5fcfb2308c3285bcd3ea0f8b29bbf878b4b494f7f",
    recoveryExcerpt: "0036cec4ca8040a7baac237c3214f4fac92590e406dada02ff1fd79e6ea1d546",
  };
  const excerpts = [...html.matchAll(/data-collaboration-snippet="([^"]+)">([\s\S]*?)<\/code>/g)];
  assert.equal(excerpts.length, 2);
  for (const [, id, encoded] of excerpts) {
    const text = encoded.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
    assert.equal(createHash("sha256").update(text).digest("hex"), expected[id]);
  }
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
