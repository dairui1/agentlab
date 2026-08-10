const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");
const script = read("mechanisms.js");
const workbench = JSON.parse(read("dossiers/session-resume-workbench.json"));
const evidence = JSON.parse(read("dossiers/session-resume-evidence.json"));
const summary = JSON.parse(read("dossiers/session-resume-summary.json"));
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
        target.push(...values.filter((entry) => typeof entry === "string" && /^SES-(CC|CX|OC|KU)-\d+$/.test(entry)));
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

test("session dossier is an implementation workbench, not a conceptual overview", () => {
  assert.equal(workbench.operations.length, 14);
  assert.equal(workbench.flows.length, 8);
  assert.equal(workbench.hazards.length, 30);
  assert.equal(workbench.isolation.length, 10);
  assert.equal(workbench.limits.length, 10);
  assert.equal(workbench.changes.length, 14);
  assert.deepEqual(workbench.snapshots.map((item) => item.agent), agents);
  assert.deepEqual(Object.keys(workbench.views).sort(), ["changes", "compare", "failures", "flows", "resources"]);
  assert.equal(workbench.defaultOperation, "capture-identity");
  assert.equal(workbench.minimums.operations, 14);
});

test("all forty-two operation cells expose actionable state and evidence", () => {
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

test("all 48 facts and 18 known unknowns are unique, pinned, sourced, and reachable", () => {
  assert.equal(evidence.claims.length, 48);
  assert.equal(claims.size, 48, "duplicate fact IDs");
  assert.equal(unknowns.size, 18, "known-unknown inventory drifted");
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
    if (claim.compare) assert.doesNotThrow(() => new URL(claim.compare.url));
  }
});

test("snapshot versions exist in AgentLab's local release history", () => {
  for (const snapshot of workbench.snapshots) {
    const history = JSON.parse(read(`data/agents/${snapshot.agent}/history.json`));
    assert.ok(history.versions.some((item) => item.version === snapshot.version), `${snapshot.agent} ${snapshot.version} is absent locally`);
  }
});

test("Claude resume contracts preserve resolver, runtime, replay, and terminal boundaries", () => {
  assert.match(operation("continue-latest").cells["claude-code"].contract, /working directory.*latest resolver/);
  assert.match(operation("resume-explicit").cells["claude-code"].edge, /permission mode.*冲突/);
  assert.match(operation("rehydrate-runtime").cells["claude-code"].contract, /cwd.*MCP\/plugin.*workspace revision/);
  assert.match(operation("fork-branch").cells["claude-code"].contract, /\/branch.*session approvals 不携带.*background \/fork.*worktree/);
  assert.match(operation("replay-ui").cells["claude-code"].contract, /acknowledgement.*hydration.*hook context/);
  assert.match(operation("verify-terminal-durable").cells["claude-code"].contract, /ResultMessage.*EOF.*SessionEnd.*lifecycle/);
});

test("Codex resume contracts preserve identity, store, hydration, and rollback boundaries", () => {
  assert.match(operation("capture-identity").cells.codex.contract, /threadId.*主键.*sessionId.*lineage/);
  assert.match(operation("choose-persistence").cells.codex.edge, /path.*未 materialize.*remote\/custom/);
  assert.match(operation("resume-explicit").cells.codex.contract, /history > path > ID/);
  assert.match(operation("resume-explicit").cells.codex.edge, /hot resume.*override.*忽略/);
  assert.match(operation("replay-ui").cells.codex.contract, /过去 notifications 不重发/);
  assert.match(operation("fork-branch").cells.codex.edge, /forkedFromId.*sessionId/);
  assert.match(operation("rewind-conversation").cells.codex.contract, /追加 marker.*不删除/);
  assert.match(operation("restore-files").cells.codex.contract, /文件恢复.*host/);
  assert.match(operation("verify-terminal-durable").cells.codex.edge, /turn\/completed.*path.*不证明/);
});

test("OpenCode resume contracts preserve collection, fork, revert, replay, and terminal traps", () => {
  assert.match(operation("capture-identity").cells.opencode.contract, /DB channel.*collection/);
  assert.match(operation("continue-latest").cells.opencode.contract, /scoped list.*parentID.*append/);
  assert.match(operation("fork-branch").cells.opencode.edge, /cut ID 不存在.*full clone/);
  assert.match(operation("rewind-conversation").cells.opencode.contract, /transcript 后缀仍存在.*互斥出口/);
  assert.match(operation("rewind-conversation").cells.opencode.edge, /下一条 prompt\/shell\/summarize.*cleanup/);
  assert.match(operation("restore-files").cells.opencode.edge, /2 MiB\/file.*7 日.*不上抛/);
  assert.match(operation("replay-ui").cells.opencode.contract, /不调用 LLM\/tool/);
  assert.match(operation("verify-terminal-durable").cells.opencode.contract, /204.*background effect.*idle.*assistant completed/);
  assert.match(operation("archive-delete-export").cells.opencode.edge, /返回 true.*export.*不含 snapshot/);
});

test("the highest-risk receipts remain visible in the failure inventory", () => {
  assert.match(hazard("终态信号被当作 durable receipt").recovery, /store watermark\/readback/);
  assert.match(hazard("OpenCode 下一条普通操作会提交 Revert cleanup").recovery, /boundary version\/lease/);
  assert.match(hazard("OpenCode delete true 被当作完整删除").recovery, /parent、children、events/);
  assert.match(hazard("Codex Rollout 被当作完整 Event Log").recovery, /telemetry journal/);
  assert.match(hazard("UI Replay 被实现成 LLM\/Tool Rerun").recovery, /historical_ui.*new_live/);
  assert.match(hazard("Codex ephemeral 被当作只是隐藏的 Thread").contract, /没有 cold resume/);
  assert.match(hazard("Codex Hot Rejoin 被当作 Cold Restart 后重复发 Turn").recovery, /active turn.*append ownership/);
  assert.match(hazard("Codex Rollback Live Context 已变但 Marker 未落盘").contract, /先用 marker 重建 live context.*append durable marker/);
  assert.match(hazard("OpenCode 单 Event 事务被误当作整 Session 单 Writer").recovery, /owner lease\/CAS/);
});

test("evidence provenance stays immutable and does not flatten docs-forward claims into exact-build proof", () => {
  const claudeClaims = evidence.claims.filter((claim) => claim.agent === "claude-code");
  assert.ok(claudeClaims.every((claim) => /Docs-aligned|Exact-history|exact-build/i.test(claim.layer)));
  assert.doesNotMatch(JSON.stringify({ evidence, changes: workbench.changes }), /anthropics\/claude-code\/blob\/main\/CHANGELOG\.md/);
  assert.match(claims.get("SES-CC-15").source.url, /2bb60696142b493eafaeacfe00eac51d16c50c4f\/CHANGELOG\.md/);
  assert.match(claims.get("SES-OC-05").source.url, /session\.ts#L957-L1009/);
  assert.match(claims.get("SES-OC-07").source.url, /session\.ts#L655-L693/);
  assert.match(claims.get("SES-OC-09").source.url, /revert\.ts#L83-L115/);
  assert.match(claims.get("SES-OC-15").source.url, /session\.ts#L576-L595/);
  assert.match(claims.get("SES-OC-16").compare.url, /import\.ts#L179-L225/);
  assert.match(claims.get("SES-OC-18").source.url, /handlers\/session\.ts#L311-L329/);
});

test("mechanism registry exposes Session persistence through the disclosure menu", () => {
  assert.match(script, /"session-resume": \{[\s\S]*label: "Session 持久化与恢复"[\s\S]*session-resume-evidence\.json[\s\S]*session-resume-summary\.json[\s\S]*session-resume-workbench\.json/);
  assert.match(script, /Object\.entries\(dossierRegistry\)\.forEach/);
});
