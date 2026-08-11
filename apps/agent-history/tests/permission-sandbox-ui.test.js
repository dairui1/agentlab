const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");
const script = read("mechanisms.js");
const styles = read("mechanisms.css");
const workbench = JSON.parse(read("dossiers/permission-sandbox-workbench.json"));
const evidence = JSON.parse(read("dossiers/permission-sandbox-evidence.json"));
const summary = JSON.parse(read("dossiers/permission-sandbox-summary.json"));
const claims = new Map(evidence.claims.map((claim) => [claim.id, claim]));
const unknowns = new Map(summary.unknowns.map((item) => [item.id, item]));
const agents = ["claude-code", "codex", "opencode"];
const hasGeneratedHistory = workbench.snapshots.every((snapshot) =>
  fs.existsSync(path.join(publicRoot, `data/agents/${snapshot.agent}/history.json`)),
);

function collectRefs(value, key, target = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, key, target));
  } else if (value && typeof value === "object") {
    for (const [field, item] of Object.entries(value)) {
      if (field === key) {
        const values = Array.isArray(item) ? item : [item];
        target.push(...values.filter((entry) => typeof entry === "string" && /^PERM-(CC|CX|OC|KU)-\d+$/.test(entry)));
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

function hazard(title) {
  return workbench.hazards.find((item) => item.title === title);
}

test("permission dossier has harness-facing density rather than a prose overview", () => {
  assert.equal(workbench.operations.length, 14);
  assert.equal(workbench.flows.length, 7);
  assert.equal(workbench.hazards.length, 21);
  assert.equal(workbench.isolation.length, 9);
  assert.equal(workbench.limits.length, 10);
  assert.equal(workbench.changes.length, 13);
  assert.deepEqual(workbench.snapshots.map((item) => item.agent), agents);
  assert.deepEqual(Object.keys(workbench.views).sort(), ["changes", "compare", "failures", "flows", "resources"]);
  assert.equal(workbench.defaultOperation, "inspect-policy");
  assert.equal(workbench.minimums.operations, 14);
});

test("all forty-two operation cells carry an actionable contract and evidence", () => {
  const statuses = new Set(["exposed", "partial", "not-exposed", "unknown"]);
  for (const item of workbench.operations) {
    assert.ok(item.id && item.label && item.question && item.icon, `${item.id || "operation"} lacks navigation copy`);
    assert.deepEqual(Object.keys(item.cells).sort(), [...agents].sort());
    for (const [agent, cell] of Object.entries(item.cells)) {
      assert.ok(statuses.has(cell.status), `${item.id}/${agent} has invalid status`);
      assert.ok(cell.surface && cell.primitive && cell.contract && cell.edge, `${item.id}/${agent} lacks a developer contract`);
      assert.ok(Array.isArray(cell.details) && cell.details.length >= 3, `${item.id}/${agent} lacks implementation fields`);
      assert.ok(Array.isArray(cell.claims) && cell.claims.length > 0, `${item.id}/${agent} lacks evidence`);
    }
  }
});

test("all 41 atomic facts are unique, referenced, pinned, and source-resolvable", () => {
  assert.equal(evidence.claims.length, 41);
  assert.equal(claims.size, 41, "duplicate fact IDs");
  assert.equal(unknowns.size, 10, "known-unknown inventory drifted");
  const factRefs = new Set(collectRefs(workbench, "claims"));
  const unknownRefs = new Set(collectRefs(workbench, "unknown"));
  for (const id of factRefs) assert.ok(claims.has(id), `unresolved fact ${id}`);
  for (const id of unknownRefs) assert.ok(unknowns.has(id), `unresolved unknown ${id}`);
  for (const id of claims.keys()) assert.ok(factRefs.has(id), `${id} is unused`);
  for (const id of unknowns.keys()) assert.ok(unknownRefs.has(id), `${id} is unreachable from the workbench`);

  const snapshots = new Map(workbench.snapshots.map((item) => [item.agent, item.version]));
  for (const claim of evidence.claims) {
    assert.equal(claim.type, "fact");
    assert.equal(claim.version, snapshots.get(claim.agent), `${claim.id} is not pinned to its dossier snapshot`);
    for (const field of ["title", "statement", "layer", "confidence", "boundary"]) assert.ok(claim[field], `${claim.id} lacks ${field}`);
    assert.ok(claim.signals.length > 0, `${claim.id} lacks observable signals`);
    assert.match(claim.source.url, /^https:\/\//);
    assert.doesNotThrow(() => new URL(claim.source.url));
  }
});

test("snapshot versions are captured by the local AgentLab corpus", { skip: !hasGeneratedHistory }, () => {
  for (const snapshot of workbench.snapshots) {
    const history = JSON.parse(read(`data/agents/${snapshot.agent}/history.json`));
    assert.ok(history.versions.some((item) => item.version === snapshot.version), `${snapshot.agent} ${snapshot.version} is absent locally`);
  }
});

test("quick reference preserves the permission traps a harness must branch on", () => {
  assert.match(operation("limit-tools").cells["claude-code"].contract, /allowedTools.*预批准/);
  assert.match(hazard("allowedTools 不是 allowlist").doNotAssume, /未预批准.*不可见/);
  assert.match(operation("network-escalate").cells["claude-code"].edge, /sandbox setup failure.*无沙箱/);
  assert.match(hazard("Claude sandbox 不可用时默认继续无沙箱执行").recovery, /failIfUnavailable/);
  assert.match(hazard("Claude HTTP policy outage 不会自动拒绝").contract, /non-2xx.*timeout.*非阻断/);

  assert.match(operation("set-baseline").cells.codex.edge, /never.*不询问.*sandbox 拒绝/);
  assert.match(operation("persist-grant").cells.codex.contract, /turn\/start.*sticky/);
  assert.match(operation("network-escalate").cells.codex.edge, /require_escalated.*仍可能 sandboxed/);
  assert.match(operation("observe-outcome").cells.codex.contract, /serverRequest\/resolved.*terminal item.*执行真相/);
  assert.match(operation("limit-tools").cells.codex.edge, /readOnlyHint.*不是.*证明/);
  assert.match(operation("host-exec-bypass").cells.codex.primitive, /thread\/shellCommand.*process\/spawn/);
  assert.match(operation("host-exec-bypass").cells.codex.contract, /unsandboxed.*不继承 thread permission\/sandbox policy/);
  assert.match(hazard("Codex host execution API 绕过 thread policy").recovery, /独立 ACL.*外层容器/);

  assert.match(operation("declare-rules").cells.opencode.contract, /最后匹配项/);
  assert.match(operation("persist-grant").cells.opencode.contract, /directory InstanceState.*跨 session.*SQLite/);
  assert.match(hazard("OpenCode permission 不是 OS sandbox").doNotAssume, /filesystem\/network contained/);
  assert.match(hazard("OpenCode plugin 不调用 ctx.ask 就没有 execution gate").contract, /wrapper 不自动/);
  assert.match(operation("reconcile-pending").cells.opencode.contract, /authoritative pending snapshot/);
  assert.match(operation("delegate").cells.opencode.contract, /自身 rules.*deny.*external_directory/);
  assert.match(claims.get("PERM-CC-09").statement, /native Windows 不支持/);
});

test("OpenCode file admission and child derivation remain separate lifecycles", () => {
  const external = workbench.flows.find((item) => item.id === "opencode-external-file");
  const child = workbench.flows.find((item) => item.id === "opencode-child-policy");
  assert.ok(external && child);
  assert.doesNotMatch(JSON.stringify(external), /child session|subagent_type/);
  assert.doesNotMatch(JSON.stringify(child), /read\/edit target|external_directory.*parent-dir wildcard/);
  assert.match(JSON.stringify(external), /external_directory.*read or edit gate/);
  assert.match(JSON.stringify(child), /task\(subagent_type\).*parent session subset/);
});

test("mechanism registry renders the new dossier through a scalable disclosure menu", () => {
  assert.match(script, /"permission-sandbox": \{[\s\S]*label: "权限、审批与沙箱"[\s\S]*permission-sandbox-evidence\.json[\s\S]*permission-sandbox-summary\.json[\s\S]*permission-sandbox-workbench\.json/);
  assert.match(script, /Object\.entries\(dossierRegistry\)\.forEach/);
  assert.match(script, /link\.href = config\.href/);
  assert.match(script, /evidenceButton\(hazard\.claims, hazard\.unknown, `失败面/);
  assert.match(styles, /\.mechanism-menu \{[\s\S]*max-height: min\(70vh, 520px\)[\s\S]*overflow-y: auto/);
});
