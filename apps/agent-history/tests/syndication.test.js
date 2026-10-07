const assert = require("node:assert/strict");
const { mkdtemp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const core = require("../public/app-core.js");
const { buildSyndication, createSyndication, digest, finalizeSnapshot } = require("../scripts/build_syndication.cjs");

function fixture() {
  return {
    exportedAt: "2026-10-07T02:00:00.000Z",
    manifest: {
      schemaVersion: 1, generatedAt: "2026-10-07T01:00:00Z",
      agents: [{ id: "codex", label: "Codex" }],
    },
    datasets: [{
      agent: { id: "codex", label: "Codex" },
      history: { versions: [
        { version: "1.0.0", capturedAt: "2026-10-01T00:00:00Z" },
        { version: "1.1.0", capturedAt: "2026-10-03T00:00:00Z", publishedAt: "2026-10-02T00:00:00Z" },
      ] },
      changelog: { entries: [{
        version: "1.1.0", previousVersion: "1.0.0", title: "Changes tools", summary: "A grounded analysis.",
        implications: ["Check the changed tool contract."], analysisStatus: "complete", importance: "medium",
        evidenceDigest: "a".repeat(64), capturedAt: "2026-10-03T00:00:00Z",
        sources: [{ sourceType: "official-code-compare", url: "https://example.org/compare", ref: "abc123" }],
        stats: { additions: 2, deletions: 0, changedSections: ["System"], toolsAdded: ["exec"], toolsRemoved: [], toolsModified: [] },
        layers: {
          prompt: { status: "available", additions: 2, deletions: 0 },
          tools: { status: "available", added: ["exec"], removed: [], modified: [] },
          official: { status: "available", freshness: "fresh" },
        },
      }] },
    }],
  };
}

test("syndication preserves publication time, provenance and stable release identity", () => {
  const feed = createSyndication(fixture());
  assert.equal(feed.items.length, 1);
  const item = feed.items[0];
  assert.equal(item.id, "agentlab:release:codex:1.1.0");
  assert.equal(item.url, "https://agentlab.dairui1.com/?mode=compare&agent=codex&version=1.1.0");
  assert.equal(item.publishedAt, "2026-10-02T00:00:00.000Z");
  assert.equal(item.dateKind, "published");
  assert.equal(item.sources[0].ref, "abc123");
  assert.equal(item.evidenceDigest, "a".repeat(64));
  assert.match(item.contentText, /AgentLab.*不是厂商官方声明/);
  assert.match(item.contentText, /https:\/\/example.org\/compare/);
  assert.equal(feed.coverage.absenceMeansWithdrawal, false);
  assert.equal(feed.coverage.researchIncluded, false);
  const { snapshotDigest, ...snapshot } = feed;
  assert.equal(snapshotDigest, digest(snapshot));
  const { revision, ...record } = item;
  assert.equal(revision, digest(record));
});

test("capture fallback is explicit and never uses build wall clock", () => {
  const input = fixture();
  delete input.datasets[0].history.versions[1].publishedAt;
  const first = createSyndication(input);
  assert.equal(first.items[0].dateKind, "captured");
  assert.equal(first.items[0].publishedAt, "2026-10-03T00:00:00.000Z");
  assert.match(first.items[0].contentText, /采集日期，非上游发布日期/);
  assert.deepEqual(createSyndication(input), first);
});

test("source-only placeholder provenance survives without inventing a URL", () => {
  const input = fixture();
  input.datasets[0].changelog.entries[0].sources.push({ sourceType: "official-source-publication-placeholder", ref: "v1.1.0" });
  const item = createSyndication(input).items[0];
  assert.equal(item.sources.length, 2);
  assert.equal(item.sources[1].url, undefined);
  assert.doesNotMatch(item.contentText, /undefined/);
  input.datasets[0].changelog.entries[0].sources.shift();
  assert.throws(() => createSyndication(input), /public source URL/);
});

test("complete analysis does not hide source staleness and semantic revisions change the hash", () => {
  const input = fixture();
  const first = createSyndication(input);
  input.datasets[0].changelog.entries[0].layers.official.freshness = "stale";
  const stale = createSyndication(input);
  assert.equal(stale.items[0].analysisStatus, "complete");
  assert.equal(stale.items[0].sourceFreshness, "stale");
  assert.notEqual(stale.items[0].revision, first.items[0].revision);
  assert.notEqual(stale.snapshotDigest, first.snapshotDigest);
  assert.equal(stale.generatedAt, first.generatedAt);
  input.datasets[0].changelog.entries[0].summary = "Corrected analysis.";
  assert.notEqual(createSyndication(input).items[0].revision, stale.items[0].revision);
});

test("exports retain time for unchanged content and advance revisions despite clock rollback", () => {
  const input = fixture();
  const first = createSyndication(input);
  assert.deepEqual(finalizeSnapshot(first, first, "2026-10-08T00:00:00Z"), first);
  input.datasets[0].changelog.entries[0].summary = "Correction.";
  const revised = finalizeSnapshot(createSyndication(input), first, "2026-10-01T00:00:00Z");
  assert.equal(revised.exportedAt, "2026-10-07T02:00:00.001Z");
  assert.notEqual(revised.snapshotDigest, first.snapshotDigest);
  assert.equal(revised.generatedAt, first.generatedAt);
  const { snapshotDigest, ...snapshot } = revised;
  assert.equal(snapshotDigest, digest(snapshot));
  assert.throws(() => finalizeSnapshot(first, { ...first, snapshotDigest: "invalid" }, input.exportedAt), /digest is invalid/);
});

test("incomplete analysis and existing no-signal policy produce explicit suppressions", () => {
  const input = fixture();
  input.datasets[0].changelog.entries[0].analysisStatus = "pending";
  let feed = createSyndication(input);
  assert.equal(feed.items.length, 0);
  assert.equal(feed.suppressed.find((x) => x.id.endsWith(":1.1.0")).reason, "analysis-incomplete");
  input.datasets[0].changelog.entries[0].analysisStatus = "reviewed";
  input.datasets[0].changelog.entries[0].importance = "none";
  feed = createSyndication(input);
  assert.equal(feed.items.length, 0);
  assert.equal(feed.suppressed.find((x) => x.id.endsWith(":1.1.0")).reason, "no-signal");
});

test("manual withdrawals are explicit, mutually exclusive and can outlive the current catalog", () => {
  const input = fixture();
  input.withdrawals = [
    { id: "agentlab:release:codex:1.1.0", reason: "Evidence retracted." },
    { id: "agentlab:release:retired:0.1.0", reason: "Historical correction." },
  ];
  const feed = createSyndication(input);
  assert.equal(feed.items.length, 0);
  assert.equal(feed.suppressed.length, 1);
  assert.equal(feed.suppressed[0].id, "agentlab:release:codex:1.0.0");
  assert.equal(feed.withdrawn.length, 2);
  input.withdrawals.push(input.withdrawals[0]);
  assert.throws(() => createSyndication(input), /Duplicate.*withdrawal/);
});

test("malformed evidence, dates, identities and duplicate releases fail the whole export", () => {
  for (const mutate of [
    (x) => { x.datasets[0].changelog.entries[0].sources[0].url = "javascript:alert(1)"; },
    (x) => { x.datasets[0].changelog.entries[0].evidenceDigest = "missing"; },
    (x) => { x.datasets[0].history.versions[1].publishedAt = "yesterday"; },
    (x) => { x.datasets[0].history.versions[1].publishedAt = "2026-02-30T00:00:00Z"; },
    (x) => { x.datasets[0].history.versions[1].publishedAt = "2026-10-01"; },
    (x) => { x.datasets[0].history.versions[1].publishedAt = "2026-10-01T00:00:00"; },
    (x) => { x.datasets[0].changelog.entries[0].layers.official.freshness = "invented"; },
    (x) => { x.datasets[0].agent.id = "../escape"; },
    (x) => { x.datasets[0].changelog.entries.push(x.datasets[0].changelog.entries[0]); },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => createSyndication(input));
  }
});

test("feed has no sample cap and uses existing importance resolution", () => {
  const input = fixture();
  const template = input.datasets[0];
  input.datasets = Array.from({ length: 25 }, (_, i) => ({ ...template, agent: { id: `agent-${i}`, label: `Agent ${i}` } }));
  const expected = core.buildIntelligenceItems(input.datasets, { limit: Number.MAX_SAFE_INTEGER });
  const feed = createSyndication(input);
  assert.equal(feed.items.length, 25);
  assert.deepEqual(feed.items.map((x) => x.importance), expected.map((x) => x.importance));
});

test("stable version links follow that version's actual predecessor, not the latest", () => {
  const versions = ["1.0.0", "1.1.0", "1.2.0", "1.3.0"];
  assert.deepEqual(core.resolveComparisonVersions(versions, { version: "1.1.0" }), { left: "1.0.0", right: "1.1.0" });
  assert.deepEqual(core.resolveComparisonVersions(versions, { version: "1.0.0" }), { left: "1.0.0", right: "1.0.0" });
  assert.deepEqual(core.resolveComparisonVersions(versions, { left: "1.0.0", right: "1.2.0" }), { left: "1.0.0", right: "1.2.0" });
  assert.throws(() => core.resolveComparisonVersions(versions, { version: "missing" }), /不在当前历史/);
});

test("dist builder exports the feed from complete data and installs no-cache headers", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "agentlab-syndication-"));
  try {
    const input = fixture();
    await mkdir(path.join(temp, "data/agents/codex"), { recursive: true });
    await writeFile(path.join(temp, "data/manifest.json"), JSON.stringify(input.manifest));
    await writeFile(path.join(temp, "data/agents/codex/history.json"), JSON.stringify(input.datasets[0].history));
    await writeFile(path.join(temp, "data/agents/codex/changelog.json"), JSON.stringify(input.datasets[0].changelog));
    await writeFile(path.join(temp, "syndication-withdrawals.json"), JSON.stringify({ schemaVersion: 1, withdrawn: [] }));
    const feed = await buildSyndication(temp);
    assert.deepEqual(JSON.parse(await readFile(path.join(temp, "data/syndication.json"), "utf8")), feed);
    const builder = await readFile(path.join(__dirname, "../scripts/build_dist.mjs"), "utf8");
    assert.match(builder, /await syndication\.buildSyndication\(source\)/);
    assert.match(builder, /"\/data\/syndication\.json",\s*"  Cache-Control: no-cache"/);
    const app = await readFile(path.join(__dirname, "../public/app.js"), "utf8");
    assert.match(app, /version: params\.get\("version"\)/);
    assert.match(app, /appCore\.resolveComparisonVersions\(versions, requested\)/);
    assert.match(app, /const requestedAgent = requested\.version \|\|/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
