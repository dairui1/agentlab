const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const root = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const revision = "1cedd32724abfcb0915f76cc61b6827e2c16dbad";
const repository = "earendil-works/pi";
const loadStudy = () => JSON.parse(read("capabilities/pi-durable.json"));

test("Pi Durable keeps its research pinned and runtime evidence explicit", () => {
  const study = loadStudy();
  assert.equal(study.id, "pi-durable");
  assert.equal(study.source.repository, repository);
  assert.equal(study.source.revision, revision);
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.verification.upstreamTestsRunLocally, true);
  assert.equal(study.verification.realModelCalls, 0);
  assert.equal(study.verification.benchmarksReproduced, false);
  assert.ok(study.unknowns.length > 0);
  assert.ok(study.unknowns.every((item) => item.text && item.needed));
});

test("all Pi Durable citations are complete, pinned and used", () => {
  const study = loadStudy();
  const html = read("capabilities/pi-durable.html");
  const ids = new Set(study.evidence.map((item) => item.id));
  assert.ok(ids.size > 0);
  assert.equal(ids.size, study.evidence.length);
  const cited = new Set();
  for (const [, references] of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of references.trim().split(/\s+/)) { assert.ok(ids.has(id), id); cited.add(id); }
  }
  assert.deepEqual(cited, ids);
  for (const item of study.evidence) {
    assert.match(item.id, /^PD-\d{2,}$/);
    assert.ok(item.statement && item.boundary && item.locator && item.evidenceClass, item.id);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(item.lineStart) && Number.isInteger(item.lineEnd)
      && item.lineStart >= 1 && item.lineEnd >= item.lineStart, item.id);
    assert.equal(item.locator, `L${item.lineStart}-L${item.lineEnd}`);
    assert.equal(item.source.url, `https://github.com/${repository}/blob/${revision}/${item.artifact}#L${item.lineStart}-L${item.lineEnd}`);
  }
});

test("Pi Durable has static article anchors and shared evidence navigation", () => {
  const study = loadStudy();
  const html = read("capabilities/pi-durable.html");
  const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const sections = [...html.matchAll(/<section\b[^>]*\bdata-article-section\b[^>]*>/g)].map(([tag]) => attribute(tag, "id"));
  const sectionIds = new Set(sections);
  assert.ok(sections.length > 1);
  assert.ok(sections.every(Boolean));
  assert.equal(sectionIds.size, sections.length);
  const anchors = new Set([...html.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id));
  for (const id of sectionIds) assert.ok(anchors.has(id), id);
  for (const id of anchors) assert.ok(sectionIds.has(id), id);
  assert.match(html, /data-evidence-source="\/capabilities\/pi-durable.json"/);
  assert.match(html, /role="dialog"[^>]+inert/);
  assert.match(html, /src="\/capability-article.js"/);
  const entry = JSON.parse(read("research-index.json")).studies.find((item) => item.id === study.id);
  assert.ok(entry);
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.equal(require("../public/site-navigation.js").researchItems.find((item) => item.id === study.id).href, entry.legacyHref);
  for (const id of entry.headlineEvidence) assert.ok(study.evidence.some((item) => item.id === id), id);
});

test("Pi Durable verifier caches artifacts and rejects source, locator and citation drift", async () => {
  const { verifyPiDurableSources } = await import("../scripts/verify_pi_durable_sources.mjs");
  const bytes = Buffer.from("first\nsecond\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sample = {
    source: { repository, revision },
    evidence: [{ id: "PD-01", artifact: "test.ts", lineStart: 1, lineEnd: 2, locator: "L1-L2", sha256,
      source: { url: `https://github.com/${repository}/blob/${revision}/test.ts#L1-L2` } }],
  };
  const markup = '<p data-evidence="PD-01">Research claim</p>';
  const verify = (value = sample, html = markup, source = bytes) => verifyPiDurableSources(value, html, async () => source);
  assert.equal((await verify()).verificationKind, "pinned-source");
  const duplicateArtifact = structuredClone(sample);
  duplicateArtifact.evidence.push({ ...duplicateArtifact.evidence[0], id: "PD-02" });
  let loads = 0;
  const result = await verifyPiDurableSources(duplicateArtifact, '<p data-evidence="PD-01 PD-02">Claim</p>', async () => { loads += 1; return bytes; });
  assert.equal(loads, 1);
  assert.equal(result.files, 1);
  assert.equal(result.evidence, 2);
  await assert.rejects(verify(sample, markup, Buffer.from("changed")), /Source hash mismatch/);
  await assert.rejects(verify(sample, '<p data-evidence="PD-99">Claim</p>'), /Unknown citation/);
  await assert.rejects(verify(sample, "No citations"), /Unused evidence/);
  await assert.rejects(verify(sample, '<p data-evidence=" ">Claim</p>'), /Empty evidence citation/);
  assert.equal((await verify(sample, "<p data-evidence='PD-01'>Claim</p>")).citations, 1);
  const range = structuredClone(sample); range.evidence[0].lineEnd = 3;
  await assert.rejects(verify(range), /Invalid range/);
  const fractional = structuredClone(sample); fractional.evidence[0].lineStart = 1.5;
  await assert.rejects(verify(fractional), /Invalid range/);
  const locator = structuredClone(sample); locator.evidence[0].locator = "L1-L1";
  await assert.rejects(verify(locator), /Locator mismatch/);
  const unpinned = structuredClone(sample); unpinned.evidence[0].source.url = `https://github.com/${repository}/blob/main/test.ts`;
  await assert.rejects(verify(unpinned), /Pinned URL mismatch/);
  const moved = structuredClone(sample); moved.source.revision = "a".repeat(40);
  await assert.rejects(verify(moved), /Revision mismatch/);
  const otherRepository = structuredClone(sample); otherRepository.source.repository = "bad/pi";
  await assert.rejects(verify(otherRepository), /Repository mismatch/);
  const unsafe = structuredClone(sample); unsafe.evidence[0].artifact = "../secret";
  await assert.rejects(verify(unsafe), /Unsafe artifact/);
  const duplicate = structuredClone(sample); duplicate.evidence.push(structuredClone(duplicate.evidence[0]));
  await assert.rejects(verify(duplicate), /Duplicate evidence/);
  await assert.rejects(verify({ ...sample, evidence: [] }), /Missing evidence/);
  await assert.rejects(verify(sample, markup, Buffer.alloc(6 * 1024 * 1024 + 1)), /Source too large/);
});

test("Pi Durable verifier rejects optional excerpt drift", async () => {
  const { verifyPiDurableSources } = await import("../scripts/verify_pi_durable_sources.mjs");
  const bytes = Buffer.from("<first>\nsecond\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sample = {
    source: { repository, revision },
    evidence: [{ id: "PD-01", artifact: "test.ts", lineStart: 1, lineEnd: 2, locator: "L1-L2", sha256,
      source: { url: `https://github.com/${repository}/blob/${revision}/test.ts#L1-L2` } }],
    snippets: [{ id: "PD-01", artifact: "test.ts", lineStart: 1, lineEnd: 1, text: "<first>" }],
  };
  const markup = '<p data-evidence="PD-01">Claim</p><code data-source-snippet="PD-01">&lt;first&gt;</code>';
  const verify = (value = sample, html = markup) => verifyPiDurableSources(value, html, async () => bytes);
  assert.equal((await verify()).snippets, 1);
  await assert.rejects(verify(sample, '<p data-evidence="PD-01">Claim</p>'), /HTML excerpt mismatch/);
  const drift = structuredClone(sample); drift.snippets[0].text = "changed";
  await assert.rejects(verify(drift), /Snippet mismatch/);
  const range = structuredClone(sample); range.snippets[0].lineEnd = 3;
  await assert.rejects(verify(range), /Invalid snippet range/);
});
