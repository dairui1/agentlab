const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const publicRoot = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(publicRoot, name), "utf8");
const study = JSON.parse(read("capabilities/dsh-runtime-evolution.json"));
const html = read("capabilities/dsh-runtime-evolution.html");
const verifier = import("../scripts/verify_dsh_runtime_sources.mjs");
const repository = "deepseek-ai/deepseek-harness";
const pins = {
  "dsh-v0.2.0-rc.2": "639ed015397290b3745d163aafe02ffee4aa3f84",
  "dsh-v0.2.1-alpha.1": "5badb15009ae1756c3afe0ae0cef1faafc290ccc",
  "dsh-v0.2.1-alpha.2": "d743267388641bc76f17c45ce8b4c231aed1d32c",
  "dsh-v0.2.1-alpha.3": "2fbf4359b82fb94c03dcce0b831660d87f12ea5c",
  "dsh-v0.2.1-alpha.4": "86a402200d95fecef4529d969836f1fe13c6cb0d",
  "dsh-v0.2.1-alpha.5": "1517a4dbca0a2789ff1d41ba439600f8547d23fa",
  "dsh-v0.2.1-rc.1": "1600d8a1e140dcde43a1a0941940a0480712c011",
  "dsh-v0.2.1-rc.2": "687f282e8625c6b8d11ff58211a90524be2e4317",
};
const sourceUrl = (item, revision) => `https://github.com/${repository}/blob/${revision}/${item.artifact}#L${item.lineStart}-L${item.lineEnd}`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("DSH research preserves fixed release pins and static-verification boundaries", () => {
  assert.equal(study.id, "dsh-runtime-evolution");
  assert.equal(study.source.repository, repository);
  assert.deepEqual(Object.fromEntries(study.source.versions.map(({ tag, revision }) => [tag, revision])), pins);
  assert.equal(study.source.versions.length, Object.keys(pins).length);
  assert.equal(study.source.revision, pins[study.source.release]);
  assert.equal(study.source.evidenceClass, "official-source-static-diff");
  assert.equal(study.source.trackingMode, "fixed-release-comparison");
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.source.upstreamTests, "inspected-not-run");
  assert.ok(study.source.historyBoundary && study.boundary);
  assert.ok(study.unknowns.length > 0);
  assert.equal(new Set(study.unknowns.map((item) => item.id)).size, study.unknowns.length);
  for (const item of study.unknowns) assert.ok(item.id && item.title && item.text && item.needed, item.id);
});

test("DSH evidence retains complete claims, captured hashes and pinned source ranges", () => {
  const ids = new Set();
  const fileHashes = new Map();
  assert.ok(study.evidence.length > 0);
  for (const item of study.evidence) {
    assert.match(item.id, /^DRE-\d+$/);
    assert.ok(!ids.has(item.id), `Duplicate evidence: ${item.id}`);
    ids.add(item.id);
    assert.equal(item.kind, "observation", item.id);
    assert.ok(["high", "medium", "low"].includes(item.confidence), item.id);
    assert.ok(item.title && item.statement && item.changeClass && item.boundary, item.id);
    const revision = item.revision || study.source.revision;
    assert.ok(Object.values(pins).includes(revision), item.id);
    if (item.firstObservedVersion) assert.ok(pins[`dsh-v${item.firstObservedVersion}`], item.id);
    assert.match(item.artifact, /^[a-zA-Z0-9_./-]+$/);
    assert.ok(!item.artifact.startsWith("/") && !item.artifact.split("/").includes(".."), item.id);
    assert.ok(Number.isInteger(item.lineStart) && Number.isInteger(item.lineEnd), item.id);
    assert.ok(item.lineStart >= 1 && item.lineEnd >= item.lineStart, item.id);
    assert.match(item.sha256, /^[a-f0-9]{64}$/, item.id);
    assert.equal(item.locator, `L${item.lineStart}-L${item.lineEnd} · ${revision.slice(0, 8)}`, item.id);
    assert.ok(item.source.label, item.id);
    assert.equal(item.source.url, sourceUrl(item, revision), item.id);
    const key = `${revision}:${item.artifact}`;
    if (fileHashes.has(key)) assert.equal(item.sha256, fileHashes.get(key), `Inconsistent file hash: ${item.id}`);
    fileHashes.set(key, item.sha256);
  }
});

test("DSH article references all evidence and keeps section and inspector wiring intact", () => {
  const ids = new Set(study.evidence.map((item) => item.id));
  const referenced = new Set();
  for (const [, value] of html.matchAll(/\bdata-evidence="([^"]+)"/g)) {
    for (const id of value.trim().split(/\s+/)) {
      assert.ok(ids.has(id), `Unknown article evidence: ${id}`);
      referenced.add(id);
    }
  }
  assert.deepEqual([...referenced].sort(), [...ids].sort(), "Some evidence is not used in the article");
  const anchors = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(anchors).size, anchors.length, "Duplicate HTML id");
  const sections = [...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((match) => match[1]);
  for (const section of ["scope", "contract", "state", "authority", "results", "cancellation", "context", "subagents", "lifecycle", "provider", "build", "sources"]) {
    assert.ok(sections.includes(section), `Missing article section: ${section}`);
  }
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(anchors.includes(id), `Missing anchor: ${id}`);
  assert.match(html, /data-evidence-source="\/capabilities\/dsh-runtime-evolution\.json"/);
  assert.match(html, /data-evidence-inspector[^>]+role="dialog"[^>]+inert/);
  assert.match(html, /src="\/capability-article\.js"/);
  assert.doesNotMatch(read("dsh-runtime-evolution.css"), /font-size:[^;]*(?:vw|cqw)|letter-spacing:\s*-/);
  for (const [, url] of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
    assert.ok(fs.existsSync(path.join(publicRoot, url)), `Missing local asset: ${url}`);
  }
});

test("DSH is indexed once and appears only in the shared research dropdown", () => {
  const entries = JSON.parse(read("research-index.json")).studies.filter((entry) => entry.id === study.id);
  assert.equal(entries.length, 1, "Research catalog entry missing or duplicated");
  const entry = entries[0];
  assert.equal(entry.title, study.title);
  assert.equal(entry.data, "/capabilities/dsh-runtime-evolution.json");
  assert.equal(entry.legacyHref, "/capabilities/dsh-runtime-evolution.html");
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.equal(entry.verifiedAt, study.verifiedAt);
  assert.ok(entry.headlineEvidence.length > 0);
  for (const id of entry.headlineEvidence) assert.ok(study.evidence.some((item) => item.id === id), id);
  const nav = require("../public/site-navigation.js");
  const current = html.match(/<agentlab-navigation\b[^>]*\bcurrent="([^"]+)"/)?.[1];
  const researchEntries = nav.researchItems.filter((item) => item.id === current);
  assert.equal(researchEntries.length, 1);
  assert.equal(researchEntries[0].href, entry.legacyHref);
  assert.equal(nav.researchItems.filter((item) => item.href === entry.legacyHref).length, 1);
  assert.deepEqual(nav.primaryItems.map((item) => item.id), ["intelligence", "compare"]);
  assert.ok(nav.primaryItems.every((item) => item.id !== current && item.href !== entry.legacyHref));
});

function fixture() {
  const revision = "a".repeat(40);
  const bytes = Buffer.from("first\nsecond\n");
  const evidence = { id: "fixture-1", artifact: "src/runtime.ts", lineStart: 1, lineEnd: 2, sha256: sha256(bytes) };
  evidence.source = { label: "Pinned source", url: sourceUrl(evidence, revision) };
  return {
    bytes,
    study: { source: { repository, revision, versions: [{ revision }] }, evidence: [evidence] },
  };
}

test("DSH verifier reuses source bytes by revision and path without mutating verification input", async () => {
  const { verifyEvidence } = await verifier;
  const data = fixture();
  const otherRevision = "b".repeat(40);
  data.study.source.versions.push({ revision: otherRevision });
  data.study.evidence.push({ ...structuredClone(data.study.evidence[0]), id: "fixture-2" });
  const other = { ...structuredClone(data.study.evidence[0]), id: "fixture-3", revision: otherRevision };
  other.source.url = sourceUrl(other, otherRevision);
  data.study.evidence.push(other);
  const original = structuredClone(data.study);
  const loaded = [];
  const result = await verifyEvidence(data.study, (artifact, revision) => { loaded.push(`${revision}:${artifact}`); return data.bytes; });
  assert.deepEqual(loaded, [`${data.study.source.revision}:src/runtime.ts`, `${otherRevision}:src/runtime.ts`]);
  assert.deepEqual(result, { files: 2, evidence: data.study.evidence.length, runtimeExperiment: "not-run", upstreamTests: "inspected-not-run" });
  assert.deepEqual(data.study, original);
});

test("DSH source capture creates canonical locators and remains verifiable offline", async () => {
  const { verifyEvidence } = await verifier;
  const data = fixture();
  const item = data.study.evidence[0];
  delete item.sha256;
  item.source.url = "https://example.com/unpinned";
  await verifyEvidence(data.study, () => data.bytes, { capture: true });
  assert.equal(item.sha256, sha256(data.bytes));
  assert.equal(item.locator, `L1-L2 · ${data.study.source.revision.slice(0, 8)}`);
  assert.equal(item.source.label, "Pinned source");
  assert.equal(item.source.url, sourceUrl(item, data.study.source.revision));
  await verifyEvidence(data.study, () => data.bytes);
});

test("DSH source verification rejects unsafe, unpinned, duplicated and out-of-range citations", async () => {
  const { verifyEvidence } = await verifier;
  const cases = [
    [(data) => { data.source.repository = "other/repository"; }, /Unexpected source repository/],
    [(data) => { data.source.versions[0].revision = "main"; }, /Unpinned revision/],
    [(data) => { data.evidence[0].revision = "b".repeat(40); }, /Unpinned revision/],
    [(data) => { data.evidence.push(structuredClone(data.evidence[0])); }, /Duplicate evidence id/],
    [(data) => { data.evidence[0].id = ""; }, /Duplicate evidence id/],
    ...["../secret", "/absolute/path", "src/../../secret", "src/runtime.ts:main"].map((artifact) => [
      (data) => { data.evidence[0].artifact = artifact; }, /Unsafe artifact/,
    ]),
    ...[[0, 1], [2, 1], [1, 3], [1.5, 2], [1, "2"]].map(([lineStart, lineEnd]) => [
      (data) => Object.assign(data.evidence[0], { lineStart, lineEnd }), /Invalid line range/,
    ]),
    [(data) => { data.evidence[0].sha256 = "0".repeat(64); }, /Hash mismatch/],
    [(data) => { data.evidence[0].source.url = data.evidence[0].source.url.replace(data.source.revision, "main"); }, /Unpinned source locator/],
  ];
  for (const [mutate, expected] of cases) {
    const data = fixture();
    mutate(data.study);
    await assert.rejects(verifyEvidence(data.study, () => data.bytes), expected);
  }
});

test("DSH source verification detects byte drift, excessive size and unavailable sources", async () => {
  const { verifyEvidence } = await verifier;
  const data = fixture();
  for (const bytes of [Buffer.from("first\nchanged\n"), Buffer.from("first\r\nsecond\r\n")]) {
    await assert.rejects(verifyEvidence(data.study, () => bytes), /Hash mismatch/);
  }
  await assert.rejects(verifyEvidence(data.study, () => Buffer.alloc(4 * 1024 * 1024 + 1)), /Oversized source/);
  await assert.rejects(verifyEvidence(data.study, () => { throw new Error("source unavailable"); }), /source unavailable/);
});

test("DSH version-only verification accepts package bumps but rejects runtime or metadata drift", async () => {
  const { verifyVersionOnlyDiff } = await verifier;
  const entry = {
    artifact: "package.json",
    before: JSON.stringify({ name: "fixture", version: "0.2.1-alpha.5", dependencies: { runtime: "1.0.0" } }),
    after: JSON.stringify({ name: "fixture", version: "0.2.1-rc.1", dependencies: { runtime: "1.0.0" } }),
  };
  const entries = [entry, { ...entry, artifact: "packages/core/package.json" }, {
    artifact: "vendor/cordis/package.json",
    before: JSON.stringify({ name: "cordis", version: "4.0.5-alpha.2" }),
    after: JSON.stringify({ name: "cordis", version: "4.0.5" }),
  }];
  const original = structuredClone(entries);
  assert.equal(verifyVersionOnlyDiff(entries), entries.length);
  assert.deepEqual(entries, original);
  assert.throws(() => verifyVersionOnlyDiff([]), /Empty version comparison/);
  assert.throws(() => verifyVersionOnlyDiff([{ ...entry, artifact: "src/runtime.ts" }]), /Runtime change/);
  assert.throws(() => verifyVersionOnlyDiff([{ ...entry, after: entry.before }]), /Unexpected version/);
  assert.throws(() => verifyVersionOnlyDiff([{ ...entry, after: entry.after.replace("0.2.1-rc.1", "") }]), /Unexpected version/);
  const withoutVersion = JSON.parse(entry.after);
  delete withoutVersion.version;
  assert.throws(() => verifyVersionOnlyDiff([{ ...entry, after: JSON.stringify(withoutVersion) }]), /Unexpected version/);
  assert.throws(() => verifyVersionOnlyDiff([{ ...entry, after: entry.after.replace("1.0.0", "2.0.0") }]), /Non-version change/);
  assert.throws(() => verifyVersionOnlyDiff([{ ...entry, after: "not JSON" }]), SyntaxError);
});
