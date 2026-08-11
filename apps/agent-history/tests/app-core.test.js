const assert = require("node:assert/strict");
const test = require("node:test");

const core = require("../public/app-core.js");

test("outline combines top-level sections and individual tools", () => {
  const items = core.buildOutlineItems({
    sections: [{ id: "system", label: "System", startLine: 1, endLine: 20 }],
    tools: [{ id: "exec", label: "exec", startLine: 21, endLine: 40 }],
  });
  assert.deepEqual(items.map(({ key, kind, label }) => ({ key, kind, label })), [
    { key: "section:system", kind: "section", label: "System" },
    { key: "tool:exec", kind: "tool", label: "exec" },
  ]);
});

test("outline URLs accept stable prefixed keys and legacy bare ids", () => {
  const items = core.buildOutlineItems({
    sections: [{ id: "tools", label: "Tools" }],
    tools: [{ id: "exec", label: "exec" }],
  });
  assert.equal(core.resolveOutlineKey(items, "tool:exec"), "tool:exec");
  assert.equal(core.resolveOutlineKey(items, "exec"), "tool:exec");
  assert.equal(core.resolveOutlineKey(items, "tool:missing"), null);
});

test("range selection excludes the base release and stays chronological", () => {
  const versions = ["1.0.0", "1.1.0", "1.2.0", "1.3.0"].map((version) => ({ version }));
  const entries = versions.map(({ version }) => ({ version, title: version }));
  assert.deepEqual(
    core.selectRangeEntries(versions, entries, "1.0.0", "1.3.0").map((entry) => entry.version),
    ["1.1.0", "1.2.0", "1.3.0"],
  );
  assert.deepEqual(
    core.selectRangeEntries(versions, entries, "1.3.0", "1.1.0").map((entry) => entry.version),
    ["1.2.0", "1.3.0"],
  );
  assert.deepEqual(core.selectRangeEntries(versions, entries, "1.1.0", "1.1.0"), []);
});

test("combined changelog stats deduplicate evidence and reverse line direction", () => {
  const entries = [
    {
      stats: {
        additions: 5,
        deletions: 2,
        changedSections: ["System", "Tools"],
        toolsAdded: ["exec"],
        toolsRemoved: [],
        toolsModified: ["read"],
      },
    },
    {
      stats: {
        additions: 1,
        deletions: 3,
        changedSections: ["Tools"],
        toolsAdded: ["exec", "write"],
        toolsRemoved: ["shell"],
        toolsModified: ["read"],
      },
    },
  ];
  assert.deepEqual(core.combineEntryStats(entries, true), {
    additions: 5,
    deletions: 6,
    changedSections: ["System", "Tools"],
    toolsAdded: ["exec", "write"],
    toolsRemoved: ["shell"],
    toolsModified: ["read"],
  });
});

test("source layers honor the public layers and sources provenance contract", () => {
  const entry = {
    stats: {
      additions: 3,
      deletions: 1,
      changedSections: ["System Prompt", "Tools"],
      toolsAdded: ["exec"],
      toolsRemoved: [],
      toolsModified: [],
    },
    layers: {
      prompt: { status: "available", additions: 3, deletions: 1, changedSections: ["System Prompt"] },
      tools: { status: "available", added: ["exec"], removed: [], modified: [] },
      staticPrompt: {
        status: "available",
        comparisonStatus: "complete",
        changes: { addedCount: 0, removedCount: 0, modifiedCount: 2 },
      },
      official: {
        status: "available",
        release: { title: "Release", notes: { text: "A real feature shipped." } },
        codeChange: { status: "available", filesObserved: 4, additionsObserved: 20, deletionsObserved: 3 },
      },
    },
    sources: [
      { sourceType: "phistory-prompt-capture", url: "https://example.test/prompt" },
      { sourceType: "phistory-tools", url: "https://example.test/tools" },
      { sourceType: "phistory-static-prompt", url: "https://example.test/static" },
      { sourceType: "official-changelog", url: "https://example.test/changelog" },
      { sourceType: "official-release", url: "https://example.test/release" },
      { sourceType: "official-code-compare", url: "https://example.test/compare" },
    ],
  };

  const layers = core.normalizeSourceLayers(entry, {}, {});
  assert.deepEqual(layers.map(({ id, state }) => ({ id, state })), [
    { id: "official", state: "changed" },
    { id: "code", state: "changed" },
    { id: "runtime-prompt", state: "changed" },
    { id: "static-prompt", state: "changed" },
    { id: "tools", state: "changed" },
  ]);
  assert.equal(layers.find((layer) => layer.id === "official").url, "https://example.test/release");
  assert.equal(layers.find((layer) => layer.id === "code").url, "https://example.test/compare");
  assert.equal(layers.find((layer) => layer.id === "runtime-prompt").url, "https://example.test/prompt");
});

test("intelligence feed hides no-change and importance none, then orders by recency", () => {
  const versions = [
    { version: "1.0.0", publishedAt: "2026-07-01T08:00:00Z" },
    { version: "1.1.0", publishedAt: "2026-07-01T09:00:00Z" },
    { version: "1.2.0", publishedAt: "2026-07-03T08:00:00Z" },
    { version: "1.3.0", publishedAt: "2026-07-04T08:00:00Z" },
    { version: "1.4.0", publishedAt: "2026-07-05T08:00:00Z" },
  ];
  const baseStats = {
    additions: 0,
    deletions: 0,
    changedSections: [],
    toolsAdded: [],
    toolsRemoved: [],
    toolsModified: [],
  };
  const entries = [
    { version: "1.1.0", previousVersion: "1.0.0", stats: { ...baseStats, toolsAdded: ["a", "b", "c"] } },
    { version: "1.2.0", previousVersion: "1.1.0", stats: { ...baseStats, additions: 1, changedSections: ["System Prompt"] } },
    { version: "1.3.0", previousVersion: "1.2.0", importance: "none", stats: { ...baseStats, additions: 2, changedSections: ["System Prompt"] } },
    { version: "1.4.0", previousVersion: "1.3.0", stats: baseStats },
  ];
  const items = core.buildIntelligenceItems([{
    agent: { id: "codex", label: "Codex" },
    history: { versions },
    changelog: { entries },
  }], { limit: 20 });

  assert.deepEqual(items.map((item) => item.entry.version), ["1.2.0", "1.1.0"]);
});

test("high-value feed honors explicit importance before score fallback", () => {
  const versions = ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"].map((version, index) => ({
    version,
    publishedAt: `2026-07-0${index + 1}T08:00:00Z`,
  }));
  const changed = {
    additions: 1,
    deletions: 0,
    changedSections: ["System Prompt"],
    toolsRemoved: [],
    toolsModified: [],
  };
  const entries = [
    { version: "1.1.0", previousVersion: "1.0.0", importance: "high", stats: { ...changed, toolsAdded: [] } },
    { version: "1.2.0", previousVersion: "1.1.0", importance: "medium", stats: { ...changed, toolsAdded: ["a", "b", "c", "d", "e"] } },
    { version: "1.3.0", previousVersion: "1.2.0", stats: { ...changed, toolsAdded: ["a", "b", "c", "d", "e"] } },
    { version: "1.4.0", previousVersion: "1.3.0", importance: "none", stats: { ...changed, toolsAdded: ["a", "b", "c", "d", "e"] } },
  ];
  const items = core.buildIntelligenceItems([{
    agent: { id: "codex", label: "Codex" },
    history: { versions },
    changelog: { entries },
  }], { importance: "high", limit: 20 });

  assert.deepEqual(items.map((item) => item.entry.version), ["1.3.0", "1.1.0"]);
  assert.deepEqual(items.map((item) => item.importance), ["high", "high"]);
});

test("importance fallback reserves high for stronger combined evidence", () => {
  const versions = ["1.0.0", "1.1.0", "1.2.0"].map((version, index) => ({
    version,
    publishedAt: `2026-07-0${index + 1}T08:00:00Z`,
  }));
  const entries = [
    {
      version: "1.1.0",
      previousVersion: "1.0.0",
      stats: { additions: 1, deletions: 0, changedSections: ["System Prompt"], toolsAdded: [], toolsRemoved: [], toolsModified: [] },
    },
    {
      version: "1.2.0",
      previousVersion: "1.1.0",
      stats: { additions: 20, deletions: 5, changedSections: ["System Prompt"], toolsAdded: ["a", "b", "c", "d"], toolsRemoved: [], toolsModified: [] },
    },
  ];
  const items = core.buildIntelligenceItems([{
    agent: { id: "codex", label: "Codex" },
    history: { versions },
    changelog: { entries },
  }], { limit: 20 });

  assert.equal(items.find((item) => item.entry.version === "1.1.0").importance, "low");
  assert.equal(items.find((item) => item.entry.version === "1.2.0").importance, "high");
});

test("high-value filter runs before the feed limit", () => {
  const versions = [{ version: "1.0.0", publishedAt: "2026-01-01T08:00:00Z" }];
  const entries = [];
  for (let index = 1; index <= 50; index += 1) {
    const version = `1.${index}.0`;
    versions.push({ version, publishedAt: `2026-03-${String(index % 28 + 1).padStart(2, "0")}T08:00:00Z` });
    entries.push({
      version,
      previousVersion: versions[index - 1].version,
      importance: index === 1 ? "high" : "medium",
      stats: {
        additions: 1,
        deletions: 0,
        changedSections: ["System Prompt"],
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
      },
    });
  }
  const items = core.buildIntelligenceItems([{
    agent: { id: "codex", label: "Codex" },
    history: { versions },
    changelog: { entries },
  }], { importance: "high", limit: 1 });

  assert.deepEqual(items.map((item) => item.entry.version), ["1.1.0"]);
});

test("agent, signal, and high-value filters compose with AND semantics", () => {
  const dataset = (id, entries) => ({
    agent: { id, label: id },
    history: { versions: [{ version: "1" }, { version: "2", publishedAt: "2026-07-03T08:00:00Z" }] },
    changelog: { entries },
  });
  const stats = {
    additions: 0,
    deletions: 0,
    changedSections: [],
    toolsAdded: ["Write"],
    toolsRemoved: [],
    toolsModified: [],
  };
  const items = core.buildIntelligenceItems([
    dataset("codex", [{ version: "2", previousVersion: "1", importance: "high", stats }]),
    dataset("claude-code", [{ version: "2", previousVersion: "1", importance: "high", stats }]),
  ], { agent: "codex", signal: "tools", importance: "high", limit: 20 });

  assert.deepEqual(items.map((item) => item.agent.id), ["codex"]);
});

test("multi-select filters use OR within dimensions and AND across dimensions", () => {
  const dataset = (id, stats, layers = {}) => ({
    agent: { id, label: id },
    history: { versions: [{ version: "1" }, { version: "2", publishedAt: "2026-07-03T08:00:00Z" }] },
    changelog: { entries: [{ version: "2", previousVersion: "1", importance: "high", stats, layers }] },
  });
  const unchangedTools = { toolsAdded: [], toolsRemoved: [], toolsModified: [] };
  const datasets = [
    dataset("codex", { additions: 2, deletions: 0, changedSections: ["System Prompt"], ...unchangedTools }),
    dataset("claude-code", { additions: 0, deletions: 0, changedSections: [], toolsAdded: ["Write"], toolsRemoved: [], toolsModified: [] }),
    dataset("kimi-code", { additions: 0, deletions: 0, changedSections: [], ...unchangedTools }, {
      official: { status: "available", release: { notes: { text: "A feature shipped." } } },
    }),
  ];

  const selected = core.buildIntelligenceItems(datasets, {
    agent: ["codex", "claude-code", "kimi-code"],
    signal: ["prompt", "tools"],
    importance: "high",
    limit: 20,
  });
  assert.deepEqual(selected.map((item) => item.agent.id).sort(), ["claude-code", "codex"]);

  const unfiltered = core.buildIntelligenceItems(datasets, { agent: [], signal: [], limit: 20 });
  assert.deepEqual(unfiltered.map((item) => item.agent.id).sort(), ["claude-code", "codex", "kimi-code"]);
});

test("official evidence can make a prompt-identical release valuable", () => {
  const items = core.buildIntelligenceItems([{
    agent: { id: "codex", label: "Codex" },
    history: { versions: [{ version: "1" }, { version: "2", publishedAt: "2026-07-03T08:00:00Z" }] },
    changelog: { entries: [{
      version: "2",
      previousVersion: "1",
      importance: "medium",
      stats: { additions: 0, deletions: 0, changedSections: [], toolsAdded: [], toolsRemoved: [], toolsModified: [] },
      layers: {
        official: { status: "available", release: { notes: { text: "Added a sandbox policy." } } },
      },
    }] },
  }]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].signals, ["ecosystem"]);
  assert.deepEqual(core.deriveImplications([items[0].entry]), [{
    basis: "官方功能",
    text: "将官方发布说明中的能力点转成可复现验收用例，再判断是否值得进入自研 Agent 路线图。",
  }]);
});

test("health distinguishes explicit sync time from latest evidence time", () => {
  const health = core.dataHealth({ generatedAt: "2026-07-03T08:00:00Z" }, [{
    changelog: { entries: [
      { analysisStatus: "complete" },
      { analysisStatus: "reviewed" },
      { analysisStatus: "pending" },
    ] },
  }]);
  assert.equal(health.lastSync, "");
  assert.equal(health.latestEvidence, "2026-07-03T08:00:00Z");
  assert.equal(health.analyzed, 2);
  assert.equal(health.stale, 1);

  const explicit = core.dataHealth({
    lastSyncAt: "2026-07-04T08:00:00Z",
    analysisCounts: { complete: 7, stale: 2 },
  }, []);
  assert.equal(explicit.lastSync, "2026-07-04T08:00:00Z");
  assert.equal(explicit.analyzed, 7);
  assert.equal(explicit.stale, 2);
});

test("health exposes official-source fallback and quarantined captures", () => {
  const health = core.dataHealth({
    generatedAt: "2026-07-03T08:00:00Z",
    officialSources: { status: "stale", warningCount: 2 },
    ingestion: { rejectedCaptures: 3 },
  }, []);
  assert.equal(health.officialStatus, "stale");
  assert.equal(health.officialWarningCount, 2);
  assert.equal(health.rejectedCaptures, 3);
});

test("explicit implications are preserved without mixing them into facts", () => {
  assert.deepEqual(core.deriveImplications([{
    implications: ["回归工具权限边界。", { action: "验证上下文压缩后的恢复路径。", basis: "Context" }],
  }]), [
      { text: "回归工具权限边界。", basis: "模型建议" },
    { text: "验证上下文压缩后的恢复路径。", basis: "Context" },
  ]);
});
