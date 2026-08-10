const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");
const script = read("mechanisms.js");
const workbench = JSON.parse(read("dossiers/tool-contract-workbench.json"));
const evidence = JSON.parse(read("dossiers/tool-contract-evidence.json"));
const summary = JSON.parse(read("dossiers/tool-contract-summary.json"));
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
        target.push(...values.filter((entry) => typeof entry === "string" && /^TOOL-(CC|CX|OC|KU)-\d+$/.test(entry)));
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

test("tool dossier is a dense native-contract workbench", () => {
  assert.equal(workbench.operations.length, 16);
  assert.equal(workbench.flows.length, 8);
  assert.equal(workbench.hazards.length, 28);
  assert.equal(workbench.isolation.length, 10);
  assert.equal(workbench.limits.length, 10);
  assert.equal(workbench.changes.length, 15);
  assert.deepEqual(workbench.snapshots.map((item) => item.agent), agents);
  assert.deepEqual(Object.keys(workbench.views).sort(), ["changes", "compare", "failures", "flows", "resources"]);
  assert.equal(workbench.defaultOperation, "settle-outcome");
  assert.equal(workbench.minimums.operations, 16);
});

test("all forty-eight operation cells expose native join and terminal contracts", () => {
  const statuses = new Set(["exposed", "partial", "not-exposed", "unknown"]);
  for (const item of workbench.operations) {
    assert.ok(item.id && item.label && item.question && item.icon, (item.id || "operation") + " lacks navigation copy");
    assert.deepEqual(Object.keys(item.cells).sort(), [...agents].sort());
    for (const [agent, cell] of Object.entries(item.cells)) {
      assert.ok(statuses.has(cell.status), item.id + "/" + agent + " has invalid status");
      assert.ok(cell.surface && cell.primitive && cell.contract && cell.edge, item.id + "/" + agent + " lacks a developer contract");
      assert.ok(Array.isArray(cell.details) && cell.details.length >= 3, item.id + "/" + agent + " lacks implementation fields");
      assert.ok(Array.isArray(cell.claims) && cell.claims.length > 0, item.id + "/" + agent + " lacks evidence");
      assert.match(cell.details.map((detail) => detail.label).join(" "), /SURFACE.*JOIN KEY.*TERMINAL/);
    }
  }
});

test("all 51 facts and 17 known unknowns are unique, pinned, sourced, and reachable", () => {
  assert.equal(evidence.claims.length, 51);
  assert.equal(claims.size, 51, "duplicate fact IDs");
  assert.equal(unknowns.size, 17, "known-unknown inventory drifted");
  const factRefs = new Set(collectRefs(workbench, "claims"));
  const unknownRefs = new Set(collectRefs(workbench, "unknown"));
  for (const id of factRefs) assert.ok(claims.has(id), "unresolved fact " + id);
  for (const id of unknownRefs) assert.ok(unknowns.has(id), "unresolved unknown " + id);
  for (const id of claims.keys()) assert.ok(factRefs.has(id), id + " is unused");
  for (const id of unknowns.keys()) assert.ok(unknownRefs.has(id), id + " is unreachable from the workbench");

  const snapshots = new Map(workbench.snapshots.map((item) => [item.agent, item.version]));
  for (const claim of evidence.claims) {
    assert.equal(claim.type, "fact");
    assert.equal(claim.version, snapshots.get(claim.agent), claim.id + " is not pinned to its dossier snapshot");
    for (const field of ["title", "statement", "layer", "confidence", "boundary"]) assert.ok(claim[field], claim.id + " lacks " + field);
    assert.ok(claim.signals.length > 0, claim.id + " lacks observable signals");
    assert.match(claim.source.url, /^https:\/\//);
    assert.doesNotThrow(() => new URL(claim.source.url));
    assert.ok(claim.compare, claim.id + " lacks secondary evidence for its composite statement");
    assert.doesNotThrow(() => new URL(claim.compare.url));
  }
});

test("snapshot versions exist in AgentLab local release history", () => {
  for (const snapshot of workbench.snapshots) {
    const history = JSON.parse(read("data/agents/" + snapshot.agent + "/history.json"));
    assert.ok(history.versions.some((item) => item.version === snapshot.version), snapshot.agent + " " + snapshot.version + " is absent locally");
  }
});

test("catalog, identity, and validation stay native instead of falsely normalized", () => {
  assert.match(operation("snapshot-catalog").cells["claude-code"].edge, /28 blocks 当全集|初始 tool list/);
  assert.match(operation("snapshot-catalog").cells.codex.contract, /direct\/deferred\/code-mode/);
  assert.match(operation("snapshot-catalog").cells.opencode.edge, /ToolPart 本身不留 origin\/schema version/);
  assert.match(operation("correlate-call").cells["claude-code"].primitive, /tool_use_id/);
  assert.match(operation("correlate-call").cells.codex.primitive, /call_id/);
  assert.match(operation("correlate-call").cells.opencode.primitive, /sessionID,messageID,partID/);
  assert.match(operation("validate-input").cells["claude-code"].contract, /hooks 前终止/);
  assert.match(operation("validate-input").cells.codex.edge, /RespondToModel|Fatal/);
  assert.match(operation("validate-input").cells.opencode.edge, /ToolPart state.*actual tool name/);
});

test("shell outcome keeps all three timeout and stream semantics distinct", () => {
  assert.match(operation("execute-shell").cells["claude-code"].edge, /stdout.*combined.*stderr.*harness notices/);
  assert.match(operation("execute-shell").cells.codex.edge, /status \+ exitCode \+ aggregatedOutput/);
  assert.match(operation("execute-shell").cells.opencode.edge, /metadata\.exit.*nonzero 不转 ToolPart error/);
  const deadlineFlow = workbench.flows.find((item) => item.id === "claude-timeout");
  assert.match(JSON.stringify(deadlineFlow), /background_running.*do not retry/);
  assert.match(hazard("execution timeout全部映射为failed").signal, /Claude background_running.*Codex exit 124.*OpenCode completed/);
});

test("native terminal and semantic outcome remain separate", () => {
  assert.match(operation("settle-outcome").cells["claude-code"].edge, /query另判|call/);
  assert.match(operation("settle-outcome").cells.codex.edge, /item\/completed authoritative.*generic function wire无 success.*isError/);
  assert.match(operation("settle-outcome").cells.opencode.edge, /semantic success.*exit\/timeout\/diagnostics\/provider metadata decoder/);
  assert.match(hazard("terminal envelope或generic success当业务成功").recovery, /native terminal.*tool-specific semantic decoder/);
  assert.match(hazard("ACK、approval resolution或delta-end当terminal").recovery, /item\/completed/);
});

test("failure inventory contains distinct invariants, triggers, signals, and false assumptions", () => {
  for (const item of workbench.hazards) {
    for (const field of ["contract", "trigger", "signal", "recovery", "doNotAssume"]) {
      assert.ok(item[field] && item[field].length >= 14, item.title + " lacks actionable " + field);
    }
    assert.notEqual(item.contract, item.signal, item.title + " repeats failure copy instead of an invariant");
    assert.doesNotMatch(item.trigger, /实现成统一 shortcut/);
    assert.doesNotMatch(item.doNotAssume, /当作跨 Agent 的共同事实/);
  }
});

test("effects, cancellation, and retries never imply rollback or exactly-once", () => {
  assert.match(operation("preserve-projections").cells["claude-code"].edge, /post rewrite不回滚side effect/);
  assert.match(operation("apply-file-change").cells.codex.edge, /failed\/denied.*committed prefix/);
  assert.match(operation("preserve-projections").cells.opencode.edge, /after-hook error.*副作用/);
  assert.match(operation("cancel-and-teardown").cells.codex.edge, /每item terminal.*background另行terminate.*acknowledgement 不证明 kill/);
  assert.match(operation("cancel-and-teardown").cells.opencode.edge, /completed与interrupted error都可能有output\/effects.*acknowledgement 不证明 kill/);
  assert.match(JSON.stringify(workbench.flows.find((item) => item.id === "opencode-abort-retry")), /250ms cleanup/);
  assert.match(operation("retry-safely").cells.codex.contract, /sandbox denial.*最多second attempt.*first-attempt delta\/effects/);
  assert.match(operation("retry-safely").cells.opencode.edge, /provider status\/effect receipts.*不是幂等键/);
  assert.match(hazard("retry当exactly-once或天然幂等").recovery, /attempt.*effect receipt/);
});

test("delegated work, transport drain, and reconnect use independent gates", () => {
  assert.match(operation("track-delegated-work").cells["claude-code"].edge, /partial prose不算完成/);
  assert.match(operation("track-delegated-work").cells.codex.edge, /wait timed_out不证明child完成/);
  assert.match(operation("track-delegated-work").cells.opencode.edge, /child job\/session terminal/);
  assert.match(operation("reconcile-terminal").cells["claude-code"].edge, /Result记录query.*EOF记录transport.*task notification记录background/);
  assert.match(operation("reconcile-terminal").cells.codex.edge, /item truth不由turn fallback、ACK或delta替代.*background terminal另算/);
  assert.match(operation("reconcile-terminal").cells.opencode.edge, /SSE无Last-Event-ID replay.*GET reconcile/);
  assert.match(hazard("收到Result\/turn state就停止transport drain").recovery, /drain|GET reconcile/);
});

test("evidence provenance stays immutable and does not promote docs-forward Claude claims", () => {
  const claudeClaims = evidence.claims.filter((claim) => claim.agent === "claude-code");
  assert.ok(claudeClaims.every((claim) => /Exact|Docs|Internal|Pinned/i.test(claim.layer)));
  assert.doesNotMatch(JSON.stringify({ evidence, changes: workbench.changes }), /raw\.githubusercontent\.com\/anthropics\/claude-code\/main\/CHANGELOG\.md/);
  assert.doesNotMatch(JSON.stringify({ evidence, changes: workbench.changes }), /anthropics\/claude-code\/blob\/main\/CHANGELOG\.md/);
  assert.ok(workbench.changes.filter((item) => item.agent === "claude-code" && /CHANGELOG/.test(item.url)).every((item) => item.url.includes("2bb60696142b493eafaeacfe00eac51d16c50c4f")));
  assert.match(claims.get("TOOL-CX-03").source.url, /rust-v0\.147\.0\/codex-rs\/tools\/src\/json_schema\.rs/);
  assert.match(claims.get("TOOL-OC-16").source.url, /v1\.18\.15\/packages\/(schema|opencode)\/src/);
  assert.match(claims.get("TOOL-CC-14").source.url, /static-candidates\.json#L26995/);
  assert.match(claims.get("TOOL-CX-16").source.url, /orchestrator\.rs#L217-L332/);
  assert.match(claims.get("TOOL-OC-09").source.url, /task\.ts#L216-L307/);
  assert.match(claims.get("TOOL-OC-12").source.url, /processor\.ts#L539-L597/);
  assert.match(claims.get("TOOL-OC-14").layer, /control-flow inference/);
  assert.equal(operation("invoke-extension").cells.opencode.unknown, "TOOL-KU-16");
  assert.equal(operation("validate-input").cells.opencode.unknown, "TOOL-KU-17");
  assert.doesNotMatch(JSON.stringify(workbench.changes), /subagent默认background|Docs-forward floor/);
});

test("mechanism registry exposes the Tool contract through the disclosure menu", () => {
  assert.match(script, /"tool-contract": \{[\s\S]*label: "Tool 调用与失败语义"[\s\S]*tool-contract-evidence\.json[\s\S]*tool-contract-summary\.json[\s\S]*tool-contract-workbench\.json/);
  assert.match(script, /Object\.entries\(dossierRegistry\)\.forEach/);
});
