const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");
const script = read("mechanisms.js");
const workbench = JSON.parse(read("dossiers/model-routing-workbench.json"));
const evidence = JSON.parse(read("dossiers/model-routing-evidence.json"));
const summary = JSON.parse(read("dossiers/model-routing-summary.json"));
const claims = new Map(evidence.claims.map((claim) => [claim.id, claim]));
const unknowns = new Map(summary.unknowns.map((item) => [item.id, item]));
const agents = ["claude-code", "codex", "opencode"];

function collectRefs(value, key, target = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, key, target));
  } else if (value && typeof value === "object") {
    for (const [field, item] of Object.entries(value)) {
      if (field === key) {
        const values = Array.isArray(item) ? item : [item];
        values.filter((entry) => typeof entry === "string").forEach((entry) => target.add(entry));
      } else {
        collectRefs(item, key, target);
      }
    }
  }
  return target;
}

function operation(id) {
  return workbench.operations.find((item) => item.id === id);
}

test("model routing dossier is registered in the disclosure menu", () => {
  assert.match(script, /"model-routing": \{[\s\S]*label: "模型路由与回退"[\s\S]*model-routing-evidence\.json[\s\S]*model-routing-summary\.json[\s\S]*model-routing-workbench\.json/);
  assert.match(script, /icon: "route"/);
});

test("workbench ships the full routing inventory", () => {
  assert.equal(workbench.operations.length, 16);
  assert.equal(workbench.flows.length, 10);
  assert.equal(workbench.hazards.length, 32);
  assert.equal(workbench.changes.length, 9);
  assert.ok(workbench.isolation.length >= 6);
  assert.ok(workbench.limits.length >= 7);
  assert.equal(workbench.minimums.operations, 16);
  assert.equal(workbench.minimums.flows, 8);
  assert.equal(workbench.minimums.hazards, 32);
  assert.deepEqual(workbench.snapshots.map((item) => item.agent), agents);
  assert.equal(workbench.defaultOperation, "handle-overload");
});

test("sixteen operations are grouped and every agent cell has a usable contract", () => {
  const expectedGroups = {
    resolution: 4,
    execution: 5,
    recovery: 4,
    governance: 3,
  };
  assert.deepEqual(Object.fromEntries(workbench.operationGroups.map((item) => [item.id, workbench.operations.filter((operation) => operation.group === item.id).length])), expectedGroups);
  const statuses = new Set(["exposed", "partial", "not-exposed", "unknown"]);
  for (const item of workbench.operations) {
    assert.ok(item.id && item.group && item.label && item.question && item.icon);
    assert.deepEqual(Object.keys(item.cells).sort(), [...agents].sort());
    for (const [agent, cell] of Object.entries(item.cells)) {
      assert.ok(statuses.has(cell.status), `${item.id}/${agent} has invalid status`);
      assert.ok(cell.surface && cell.primitive && cell.contract && cell.edge, `${item.id}/${agent} is shallow`);
      assert.ok(Array.isArray(cell.details) && cell.details.length >= 3, `${item.id}/${agent} lacks routing fields`);
      assert.ok(cell.claims?.length || cell.unknown, `${item.id}/${agent} has no evidence`);
    }
  }
});

test("all claims and unknowns are unique, resolved, and reachable", () => {
  assert.equal(evidence.claims.length, 60);
  assert.equal(claims.size, 60, "duplicate claim IDs");
  assert.equal(summary.unknowns.length, 19);
  assert.equal(unknowns.size, 19, "duplicate unknown IDs");
  const claimRefs = collectRefs(workbench, "claims");
  const unknownRefs = collectRefs(workbench, "unknown");
  for (const id of claimRefs) assert.ok(claims.has(id), `unresolved claim ${id}`);
  for (const id of unknownRefs) assert.ok(unknowns.has(id), `unresolved unknown ${id}`);
  for (const id of claims.keys()) assert.ok(claimRefs.has(id), `${id} is unreachable from the workbench`);
  for (const id of unknowns.keys()) assert.ok(unknownRefs.has(id), `${id} is unreachable from the workbench`);
});

test("evidence records preserve pinned, docs-forward, and inference layers", () => {
  const snapshots = new Map(workbench.snapshots.map((item) => [item.agent, item.version]));
  const grades = new Set(["PINNED-CODE", "PINNED-HISTORY", "DOCS-FORWARD", "INFERENCE"]);
  for (const claim of evidence.claims) {
    assert.ok(["fact", "inference"].includes(claim.type), `${claim.id} has invalid evidence type`);
    assert.ok(grades.has(claim.grade), `${claim.id} lacks an explicit evidence grade`);
    if (snapshots.has(claim.agent)) assert.equal(claim.version, snapshots.get(claim.agent), `${claim.id} snapshot mismatch`);
    else assert.equal(claim.agent, "cross-agent", `${claim.id} uses an unknown evidence owner`);
    for (const field of ["title", "statement", "layer", "confidence", "boundary"]) assert.ok(claim[field], `${claim.id} lacks ${field}`);
    assert.ok(claim.signals.length > 0, `${claim.id} lacks signals`);
    assert.match(claim.source.url, /^https:\/\//);
    assert.doesNotThrow(() => new URL(claim.source.url));
  }

  const claudeDocs = evidence.claims.filter((claim) => claim.agent === "claude-code" && claim.grade === "DOCS-FORWARD");
  const claudeHistory = evidence.claims.filter((claim) => claim.agent === "claude-code" && claim.grade === "PINNED-HISTORY");
  assert.ok(claudeDocs.length >= 8);
  assert.ok(claudeDocs.every((claim) => /Current official|current official/i.test(`${claim.layer} ${claim.boundary}`)));
  assert.ok(claudeHistory.length >= 5);
  assert.ok(claudeHistory.every((claim) => claim.source.url.includes("2bb60696142b493eafaeacfe00eac51d16c50c4f")));
  assert.doesNotMatch(JSON.stringify({ evidence, changes: workbench.changes }), /anthropics\/claude-code\/blob\/main\/CHANGELOG/);
});

test("control-flow inferences link to facts, unknowns, and a disproof experiment", () => {
  const inferences = evidence.claims.filter((claim) => claim.type === "inference");
  assert.deepEqual(inferences.map((claim) => claim.id).sort(), ["MR-INF-01", "MR-INF-02", "MR-INF-03", "MR-INF-04", "MR-INF-05"]);
  for (const inference of inferences) {
    assert.equal(inference.grade, "INFERENCE");
    assert.ok(inference.dependsOn.length >= 2);
    assert.ok(inference.unknowns.length >= 1);
    assert.ok(inference.disproof.length >= 30);
    for (const id of inference.dependsOn) {
      assert.equal(claims.get(id)?.type, "fact", `${inference.id} depends on a non-fact ${id}`);
    }
    for (const id of inference.unknowns) {
      assert.ok(unknowns.has(id), `${inference.id} has an unresolved unknown ${id}`);
    }
  }
  assert.deepEqual(claims.get("MR-INF-01").unknowns, ["MR-KU-08"]);
  assert.deepEqual(claims.get("MR-INF-02").unknowns, ["MR-KU-14"]);
  assert.deepEqual(claims.get("MR-INF-04").unknowns, ["MR-KU-19"]);
});

test("deep-linked facts and unknowns can navigate back to their inferences", () => {
  const linkedInferenceIds = (id) => evidence.claims
    .filter((candidate) => [...(candidate.dependsOn || []), ...(candidate.unknowns || []), ...(candidate.supports || [])].includes(id))
    .map((candidate) => candidate.id);
  assert.deepEqual(linkedInferenceIds("MR-CX-15"), ["MR-INF-01"]);
  assert.deepEqual(linkedInferenceIds("MR-KU-08"), ["MR-INF-01"]);
  assert.deepEqual(linkedInferenceIds("MR-KU-19"), ["MR-INF-04"]);
  assert.match(script, /const reverseRelationIds = \[\.\.\.claimById\.values\(\)\]/);
  assert.match(script, /\.\.\.reverseRelationIds/);
});

test("all unknowns carry a runnable verification contract", () => {
  for (const item of summary.unknowns) {
    assert.match(item.id, /^MR-KU-\d{2}$/);
    for (const field of ["title", "text", "needed", "experiment", "observable"]) {
      assert.ok(item[field] && item[field].length >= 12, `${item.id} lacks ${field}`);
    }
  }
});

test("four fallback categories stay visibly separate", () => {
  const codexStartup = operation("resolve-explicit").cells.codex;
  const codexMetadata = operation("handle-model-not-found").cells.codex;
  const codexTransport = operation("retry-transport").cells.codex;
  const claudeModel = operation("handle-overload").cells["claude-code"];
  assert.match(codexStartup.contract, /static provider.*默认/i);
  assert.match(codexStartup.edge, /启动选择替换.*runtime capacity fallback/);
  assert.match(codexMetadata.contract, /fallback metadata warning/);
  assert.match(codexMetadata.edge, /选择 fallback 与 metadata fallback 必须分开/);
  assert.match(codexTransport.contract, /切 HTTPS/);
  assert.match(codexTransport.details.find((item) => item.label === "MODEL CHANGED").value, /^no$/);
  assert.match(claudeModel.details.find((item) => item.label === "FALLBACK KIND").value, /^model$/);
  assert.match(claudeModel.details.find((item) => item.label === "MODEL CHANGED").value, /^yes$/);
});

test("overload, reasoning adjustment, and subagent routing remain product-specific", () => {
  assert.match(operation("handle-overload").cells["claude-code"].contract, /最多三跳/);
  assert.match(operation("handle-overload").cells.codex.contract, /不可重试/);
  assert.match(operation("handle-overload").cells.opencode.contract, /无内建 max attempt/);
  assert.match(operation("adjust-reasoning").cells["claude-code"].edge, /docs-forward/);
  assert.match(operation("adjust-reasoning").cells.codex.contract, /中位/);
  assert.match(operation("adjust-reasoning").cells.opencode.contract, /静默丢弃/);
  assert.match(operation("route-subagent").cells.opencode.edge, /无法在每次 task invocation/);
});

test("hazards distinguish facts from inferred replay risk", () => {
  const duplicate = workbench.hazards.find((item) => item.id === "duplicate-side-effect");
  assert.ok(duplicate);
  assert.deepEqual(duplicate.claims, ["MR-CC-08", "MR-INF-01", "MR-INF-02"]);
  assert.match(duplicate.contract, /Claude 有官方.*Codex 与 opencode 仅有控制流推断/);
  assert.ok(workbench.hazards.find((item) => item.id === "capability-drift").claims.includes("MR-INF-03"));
  assert.deepEqual(workbench.hazards.find((item) => item.id === "regex-retry").unknown, "MR-KU-19");
  assert.ok(workbench.hazards.find((item) => item.id === "billing-final-model").claims.includes("MR-INF-05"));
  for (const item of workbench.hazards) {
    for (const field of ["contract", "trigger", "signal", "recovery", "doNotAssume"]) {
      assert.ok(item[field] && item[field].length >= 14, `${item.id} lacks ${field}`);
    }
  }
});

test("changes use exact immutable Claude history without inventing other-agent diffs", () => {
  assert.ok(workbench.changes.length >= 9);
  assert.ok(workbench.changes.every((item) => item.agent === "claude-code"));
  assert.ok(workbench.changes.every((item) => item.url.includes("2bb60696142b493eafaeacfe00eac51d16c50c4f")));
  assert.ok(workbench.changes.some((item) => item.version === "2.1.166" && /三条/.test(item.impact)));
  assert.ok(workbench.changes.some((item) => item.version === "2.1.83" && /non-streaming/.test(item.impact)));
  assert.equal(operation("switch-turn-model").cells["claude-code"].claims[0], "MR-CC-17");
  assert.equal(operation("handle-model-not-found").cells["claude-code"].claims[0], "MR-CC-19");
  assert.ok(workbench.changes.every((item) => item.claims?.every((id) => claims.get(id)?.grade === "PINNED-HISTORY")));
});

test("renderer exposes operation groups, evidence grades, and verification relations without unsafe HTML", () => {
  assert.match(script, /workbench\.operationGroups \|\| \[\]/);
  assert.match(script, /claim\.type === "inference"/);
  assert.match(script, /grade === "DOCS-FORWARD"/);
  assert.match(script, /"current-docs": "当前文档"/);
  assert.match(script, /claim\.dependsOn/);
  assert.match(script, /claim\.unknowns/);
  assert.match(script, /claim\.disproof/);
  assert.match(script, /unknown\.experiment/);
  assert.match(script, /unknown\.observable/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});
