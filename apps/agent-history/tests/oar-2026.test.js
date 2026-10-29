const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { test } = require("node:test");

const publicRoot = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(publicRoot, name), "utf8");
const json = (name) => JSON.parse(read(name));
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("OAR 2026 preserves release and main boundaries and failed test evidence", () => {
  const receipt = json("studies/oar-2026/evidence-2026-10-29.json");
  assert.equal(receipt.release.version, "0.75.0");
  assert.equal(receipt.release.revision, "51b83c96811735b3a9f045ab20bab7cd20e61cdf");
  assert.equal(receipt.revision, "5532d7b2a01f26c553def1f4acb4470c94f0ed36");
  assert.equal(receipt.articleSha256, hash(read("studies/oar-2026/research-2026-10-29.md")));
  assert.equal(receipt.independentVerification.upstreamTests.failed, 5);
  assert.equal(receipt.independentVerification.unchangedSerialRerun.passed, 37);
  assert.equal(receipt.independentVerification.mockBehaviorSuite.skipped, 1);
  assert.equal(receipt.independentVerification.realModelCalls, 0);
  assert.equal(receipt.sourceFiles.length, 25);
  for (const file of receipt.sourceFiles) {
    assert.equal(file.url, `https://github.com/botiverse/oar/blob/${receipt.revision}/${file.path}`);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
});

test("OAR 2026 is readable without JavaScript and has a discoverable research entry", () => {
  const html = read("capabilities/oar-2026.html");
  const ids = [...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["position", "records", "runtimes", "orchestration", "recovery", "security", "engineering", "comparison", "verification", "verdict"]);
  assert.ok(ids.every((id) => html.includes(`href="#${id}"`)));
  for (const phrase of ["不在 v0.75.0 发行标签内", "2,287 pass / 5 fail / 102 skipped", "18 pass / 1 skipped", "runtime_exited", "历史研究"]) assert.ok(html.includes(phrase), phrase);
  const entry = json("research-index.json").studies.find((study) => study.id === "oar-2026");
  const data = json("capabilities/oar-2026.json");
  assert.equal(entry.legacyHref, "/capabilities/oar-2026.html");
  assert.equal(entry.evidenceCount, data.evidence.length);
  assert.equal(entry.unknownCount, data.unknowns.length);
  const probeHash = hash(read("studies/oar-2026/probe-2026-10-29.json"));
  assert.ok(data.evidence.every((record) => record.sha256 === probeHash));
  assert.ok(fs.existsSync(path.join(publicRoot, "capabilities/oar.html")));
});
