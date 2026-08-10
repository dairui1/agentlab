const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");
const html = read("mechanisms.html");
const script = read("mechanisms.js");
const workbench = JSON.parse(read("dossiers/context-compaction-workbench.json"));
const evidence = JSON.parse(read("dossiers/context-compaction-evidence.json"));
const summary = JSON.parse(read("dossiers/context-compaction-summary.json"));
const claims = new Map(evidence.claims.map((claim) => [claim.id, claim]));
const unknowns = new Map(summary.unknowns.map((item) => [item.id, item]));
const agents = ["claude-code", "codex", "opencode"];

function collectRefs(value, key, target = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, key, target));
  } else if (value && typeof value === "object") {
    for (const [field, item] of Object.entries(value)) {
      if (field === key) {
        const values = Array.isArray(item) ? item : [item];
        target.push(...values.filter((entry) => typeof entry === "string" && /^CMP-(CC|CX|OC|KU)-\d+$/.test(entry)));
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

test("context compaction workbench has the required harness-facing density", () => {
  assert.equal(workbench.operations.length, 10);
  assert.equal(workbench.flows.length, 5);
  assert.equal(workbench.hazards.length, 15);
  assert.equal(workbench.isolation.length, 7);
  assert.equal(workbench.limits.length, 7);
  assert.equal(workbench.changes.length, 11);
  assert.deepEqual(workbench.snapshots.map((item) => item.agent), agents);
  assert.deepEqual(Object.keys(workbench.views).sort(), ["changes", "compare", "failures", "flows", "resources"]);
  assert.equal(workbench.defaultOperation, "auto-trigger");
  assert.ok(workbench.defaultClaim);
});

test("all thirty operation cells expose an actionable contract and evidence", () => {
  const statuses = new Set(["exposed", "partial", "not-exposed", "unknown"]);
  for (const item of workbench.operations) {
    assert.ok(item.id && item.label && item.question && item.icon, `${item.id || "operation"} lacks navigation copy`);
    assert.deepEqual(Object.keys(item.cells).sort(), [...agents].sort());
    for (const [agent, cell] of Object.entries(item.cells)) {
      assert.ok(statuses.has(cell.status), `${item.id}/${agent} has an invalid status`);
      assert.ok(cell.primitive, `${item.id}/${agent} lacks a primitive`);
      assert.ok(cell.contract, `${item.id}/${agent} lacks an observable contract`);
      assert.ok(cell.edge, `${item.id}/${agent} lacks a trap`);
      assert.ok(Array.isArray(cell.claims) && cell.claims.length > 0, `${item.id}/${agent} lacks evidence claims`);
    }
  }
});

test("the 28 atomic claims are unique, referenced, and fully resolvable", () => {
  assert.equal(evidence.claims.length, 28);
  assert.equal(claims.size, 28, "duplicate claim IDs");
  assert.equal(unknowns.size, summary.unknowns.length, "duplicate known-unknown IDs");

  const factRefs = new Set(collectRefs(workbench, "claims"));
  const unknownRefs = new Set(collectRefs(workbench, "unknown"));
  for (const id of factRefs) assert.ok(claims.has(id), `unresolved fact ${id}`);
  for (const id of unknownRefs) assert.ok(unknowns.has(id), `unresolved known-unknown ${id}`);
  for (const id of claims.keys()) assert.ok(factRefs.has(id), `${id} is unused by the workbench`);
  assert.ok(claims.has(workbench.defaultClaim), "default evidence does not resolve");
});

test("facts use exact snapshot versions and deployment-stable HTTPS sources", () => {
  const snapshots = new Map(workbench.snapshots.map((item) => [item.agent, item.version]));
  const withCompare = evidence.claims.filter((claim) => claim.compare);
  const withoutCompare = evidence.claims.filter((claim) => !claim.compare);

  assert.ok(withCompare.length > 0 && withoutCompare.length > 0, "compare links must remain optional");
  for (const claim of evidence.claims) {
    assert.equal(claim.type, "fact");
    assert.ok(agents.includes(claim.agent));
    assert.equal(claim.version, snapshots.get(claim.agent), `${claim.id} is not pinned to its snapshot`);
    for (const field of ["title", "statement", "layer", "confidence", "boundary"]) {
      assert.ok(claim[field], `${claim.id} lacks ${field}`);
    }
    assert.ok(Array.isArray(claim.signals) && claim.signals.length > 0, `${claim.id} lacks observable signals`);
    assert.ok(claim.source?.label);
    assert.match(claim.source.url, /^https:\/\//, `${claim.id} source is not HTTPS`);
    assert.doesNotThrow(() => new URL(claim.source.url));
    if (claim.compare) {
      assert.ok(claim.compare.label);
      assert.match(claim.compare.url, /^https:\/\//, `${claim.id} comparison is not HTTPS`);
    }
  }
  for (const change of workbench.changes) assert.match(change.url, /^https:\/\//, `${change.version} change source is not HTTPS`);
});

test("snapshot versions exist in the local AgentLab history corpus", () => {
  for (const snapshot of workbench.snapshots) {
    const history = JSON.parse(read(`data/agents/${snapshot.agent}/history.json`));
    assert.ok(history.versions.some((item) => item.version === snapshot.version), `${snapshot.agent} ${snapshot.version} is not captured locally`);
  }
});

test("quick reference preserves the compaction traps a harness must branch on", () => {
  const manualCodex = operation("manual-compact").cells.codex;
  assert.match(manualCodex.primitive, /thread\/compact\/start/);
  assert.match(manualCodex.contract, /立即返回 \{\}.*特殊 turn/);
  assert.match(manualCodex.edge, /ACK.*不能|ACK 后/);
  assert.match(hazard("Codex compact/start 返回 {} 时才刚开始").recovery, /completed.*turn terminal/);
  assert.match(hazard("Codex compact/start 返回 {} 时才刚开始").recovery, /无 completed.*failed\/abandoned/);

  const interceptCodex = operation("intercept").cells.codex;
  assert.match(interceptCodex.contract, /Post.*replacement.*item completed 后/);
  assert.match(interceptCodex.edge, /不回滚/);
  assert.match(hazard("Codex PostCompact stop 不回滚 replacement").doNotAssume, /state unchanged/);
  assert.match(operation("replace-context").cells.codex.primitive, /TokenBudget.*local.*remote V1.*remote V2/);
  assert.match(operation("replace-context").cells.codex.contract, /canonical initial context/);

  const configureOpencode = operation("configure-policy").cells.opencode;
  assert.match(configureOpencode.contract, /auto 默认 true.*false.*关闭.*provider-overflow recovery/);
  assert.match(configureOpencode.edge, /prune 默认 false/);
  assert.match(hazard("opencode auto=false 会关掉 overflow 救场").contract, /直接 error.*不创建 recovery marker/);
  assert.match(hazard("opencode prune 默认关闭且不删除存储").doNotAssume, /prune == compact == erase/);
  assert.match(configureOpencode.details.find((item) => item.label === "RESERVED").value, /effectiveMaxOutput/);
  assert.match(operation("replace-context").cells.opencode.primitive, /compaction user text.*optional tail/);
  assert.match(operation("durable-state").cells.opencode.contract, /可选 overflow\/tail_start_id/);

  const durable = workbench.isolation.find((item) => item.label === "原始完整 transcript");
  assert.ok(durable, "active versus durable state row is missing");
  for (const agent of agents) assert.match(durable.cells[agent], /ACTIVE:.*DURABLE:/);
  assert.match(hazard("完整记录还在，不代表模型还看得见").doNotAssume, /可检索 == 在当前 prompt 中/);
  assert.match(claims.get("CMP-CC-04").statement, /uuid.*session_id.*compact_metadata/);
});

test("Claude percentage override is quarantined as tag-unverified, not a 2.1.226 contract", () => {
  const claudeCells = workbench.operations.map((item) => item.cells["claude-code"]);
  const mainContracts = claudeCells.map((cell) => `${cell.primitive}\n${cell.contract}`).join("\n");
  const configureClaude = operation("configure-policy").cells["claude-code"];

  assert.doesNotMatch(mainContracts, /CLAUDE_AUTOCOMPACT_PCT_OVERRIDE|PCT_OVERRIDE/);
  assert.doesNotMatch(JSON.stringify(evidence), /CLAUDE_AUTOCOMPACT_PCT_OVERRIDE|PCT_OVERRIDE/);
  assert.match(configureClaude.edge, /CLAUDE_AUTOCOMPACT_PCT_OVERRIDE.*只在更新文档出现.*不能下发给 2\.1\.226/);
  assert.ok(configureClaude.details.some((item) => item.label === "TAG-UNVERIFIED" && item.value === "PCT_OVERRIDE"));
});

test("renderer selects dossiers through a mechanism menu and supports claims without compare links", () => {
  assert.match(html, /id="mechanismMenuTrigger"[^>]*aria-expanded="false"[^>]*aria-controls="mechanismMenu"/);
  assert.match(html, /<nav id="mechanismMenu"[^>]*aria-label="选择机制档案"/);
  assert.match(html, /href="\/mechanisms"[^>]*data-mechanism="subagent-orchestration"/);
  assert.match(html, /href="\/mechanisms\?mechanism=context-compaction"[^>]*data-mechanism="context-compaction"/);
  assert.doesNotMatch(html, /role="menu(item)?"|aria-haspopup="menu"/);
  assert.doesNotMatch(html, /<select/);
  assert.match(script, /"context-compaction": \{[\s\S]*context-compaction-evidence\.json[\s\S]*context-compaction-summary\.json[\s\S]*context-compaction-workbench\.json/);
  assert.match(script, /new URL\(location\.href\)\.searchParams\.get\("mechanism"\)/);
  assert.match(script, /dossierRegistry\[requestedDossier\] \? requestedDossier : "subagent-orchestration"/);
  assert.match(script, /fetch\(dossierConfig\.workbench/);
  assert.match(script, /querySelectorAll\("\[data-mechanism\]"\)/);
  assert.match(script, /item\.setAttribute\("aria-current", "page"\)/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /document\.addEventListener\("focusin"[\s\S]*mechanismSwitcher\.contains\(event\.target\)/);
  assert.match(script, /if \(claim\.compare\) links\.append\(safeLink\(claim\.compare, "compare"\)\)/);
  assert.match(script, /\^\[A-Z\]\[A-Z0-9-\]\*-\\d\+\$/);
});

test("the original sub-agent mechanism remains the default registered dossier", () => {
  assert.doesNotThrow(() => JSON.parse(read("dossiers/subagent-workbench.json")));
  assert.doesNotThrow(() => JSON.parse(read("dossiers/subagent-evidence.json")));
  assert.doesNotThrow(() => JSON.parse(read("dossiers/subagent-orchestration.json")));
  assert.match(script, /"subagent-orchestration": \{[\s\S]*subagent-evidence\.json[\s\S]*subagent-orchestration\.json[\s\S]*subagent-workbench\.json/);
  assert.match(html, /href="\/mechanisms"[^>]*data-mechanism="subagent-orchestration"/);
});
