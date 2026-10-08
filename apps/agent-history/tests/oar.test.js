const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const root = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const study = JSON.parse(read("capabilities/oar.json"));
const html = read("capabilities/oar.html");
const revision = "ef893acc0d341b4fa7a1ce41d2be7cafed3c63a2";

test("OAR distinguishes source, local contracts, remote CI and real runtime work", () => {
  assert.equal(study.source.revision, revision);
  assert.equal(study.source.version, "0.10.2");
  assert.equal(study.source.realCliExperiment, "not-run");
  assert.equal(study.verification.realModelCalls, 0);
  assert.equal(study.verification.upstreamTests.testsPassed, 398);
  assert.equal(study.verification.ci.evidenceClass, "upstream-ci-not-local-reproduction");
  const probe = JSON.parse(read("capabilities/oar-probe.json"));
  assert.equal(probe.revision, revision);
  assert.equal(probe.evidenceClass, "local-synthetic-contract-probe");
  assert.equal(probe.realCliRuns, 0);
  assert.equal(probe.realModelCalls, 0);
  assert.equal(probe.results.length, 6);
  assert.ok(probe.results.every((result) => result.passed));
  const timeout = probe.results.find((result) => result.id === "timeout-is-not-hard-deadline");
  assert.equal(timeout.settledOnlyAfterSyntheticExit, true);
  for (const phrase of ["不是硬截止", "danger-full-access", "streamId", "没有在本机运行真实", "不是 exactly-once", "get_settings", "不是全进程字节级抓包", "不归为严格 Agentic RL 或 RSI"]) assert.ok(html.includes(phrase), phrase);
});

test("all OAR source citations are pinned, located and used", () => {
  const ids = new Set(study.evidence.map((e) => e.id));
  assert.equal(ids.size, 24);
  const used = new Set();
  for (const [, refs] of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of refs.split(" ")) { assert.ok(ids.has(id), id); used.add(id); }
  }
  assert.deepEqual(used, ids);
  for (const e of study.evidence) {
    assert.ok(e.statement && e.boundary && e.locator && e.evidenceClass, e.id);
    assert.match(e.sha256, /^[a-f0-9]{64}$/);
    assert.equal(e.source.url, `https://github.com/botiverse/oar/blob/${revision}/${e.artifact}#L${e.lineStart}-L${e.lineEnd}`);
  }
});

test("OAR article works without JS and integrates with shared research navigation", () => {
  const sections = [...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((m) => m[1]);
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ["verdict", "delivery", "records", "attribution", "permissions", "sources"]);
  assert.deepEqual(links, sections);
  const supplements = [...html.matchAll(/<details id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(supplements, ["adapters", "continuation", "liveness", "validation"]);
  assert.equal(new Set([...sections, ...supplements]).size, 10);
  assert.ok(html.indexOf('id="delivery"') < html.indexOf('id="records"'));
  assert.ok(html.indexOf('id="records"') < html.indexOf('id="adapters"'));
  assert.match(html, /先别发布/);
  assert.match(html, /接手|排队/);
  assert.match(html, /超时发出 abort 后/);
  assert.match(html, /src="\/article-disclosures.js"/);
  assert.doesNotMatch(html, /class="article-(scope-band|toc-note)"/);
  assert.match(html, /data-evidence-source="\/capabilities\/oar.json"/);
  assert.match(html, /role="dialog"[^>]+inert/);
  const entry = JSON.parse(read("research-index.json")).studies.find((s) => s.id === "oar");
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.equal(require("../public/site-navigation.js").researchItems.find((s) => s.id === "oar").href, entry.legacyHref);
  assert.doesNotMatch(read("oar.css"), /font-size:[^;]*(?:vw|cqw)|letter-spacing:\s*-/);
});

test("OAR mark matches pinned upstream bytes", () => {
  const asset = study.assets[0];
  const bytes = fs.readFileSync(path.join(root, asset.path.slice(1)));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  assert.match(asset.sourceUrl, new RegExp(revision));
});

test("OAR source verifier rejects hash, line, URL and path drift", async () => {
  const { verifyOarSources } = await import("../scripts/verify_oar_sources.mjs");
  const bytes = Buffer.from("one\ntwo\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sample = { source: { repository: "botiverse/oar", revision }, evidence: [{ id: "test", artifact: "test.ts", lineStart: 1, lineEnd: 2, locator: "L1-L2", sha256, source: { url: `https://github.com/botiverse/oar/blob/${revision}/test.ts#L1-L2` } }], assets: [] };
  const verify = (s = sample, b = bytes) => verifyOarSources(s, async () => b, async () => b);
  assert.equal((await verify()).evidence, 1);
  await assert.rejects(verify(sample, Buffer.from("changed")), /hash mismatch/);
  const range = structuredClone(sample); range.evidence[0].lineEnd = 3;
  await assert.rejects(verify(range), /Invalid range/);
  const unpinned = structuredClone(sample); unpinned.evidence[0].source.url = "https://github.com/botiverse/oar/blob/main/test.ts";
  await assert.rejects(verify(unpinned));
  const unsafe = structuredClone(sample); unsafe.evidence[0].artifact = "../secret";
  await assert.rejects(verify(unsafe), /Unsafe artifact/);
});
