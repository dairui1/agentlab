const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");
const script = read("mechanisms.js");
const workbench = JSON.parse(read("dossiers/mcp-dynamic-tools-workbench.json"));
const evidence = JSON.parse(read("dossiers/mcp-dynamic-tools-evidence.json"));
const summary = JSON.parse(read("dossiers/mcp-dynamic-tools-summary.json"));
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

test("MCP dossier is registered in the mechanism disclosure menu", () => {
  assert.match(script, /"mcp-dynamic-tools": \{[\s\S]*label: "MCP 与动态工具"[\s\S]*icon: "plug-zap"[\s\S]*mcp-dynamic-tools-workbench\.json/);
});

test("MCP dossier ships the complete audited inventory", () => {
  assert.equal(workbench.operations.length, 16);
  assert.equal(workbench.flows.length, 12);
  assert.equal(workbench.hazards.length, 42);
  assert.equal(workbench.isolation.length + workbench.limits.length, 18);
  assert.equal(evidence.claims.length, 76);
  assert.equal(summary.unknowns.length, 26);
  assert.equal(workbench.changes.length, 34);
  assert.deepEqual(workbench.minimums, { operations: 16, flows: 12, hazards: 42 });
  assert.deepEqual(workbench.snapshots.map((item) => item.agent), agents);
  assert.equal(workbench.defaultOperation, "OP10");
});

test("operation, flow, and hazard IDs are complete and contiguous", () => {
  const ids = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);
  assert.deepEqual(workbench.operations.map((item) => item.id), ids("OP", 16));
  assert.deepEqual(workbench.flows.map((item) => item.id), ids("F", 12));
  assert.deepEqual(workbench.hazards.map((item) => item.id), ids("H", 42));
  assert.deepEqual(workbench.operationGroups.map((group) => group.id), ["registration", "catalog", "invocation", "lifecycle"]);
  assert.deepEqual(Object.fromEntries(workbench.operationGroups.map((group) => [group.id, workbench.operations.filter((item) => item.group === group.id).length])), {
    registration: 4,
    catalog: 4,
    invocation: 5,
    lifecycle: 3,
  });
});

test("all forty-eight product operation cells expose an actionable contract", () => {
  const statuses = new Set(["exposed", "partial", "not-exposed", "unknown"]);
  for (const item of workbench.operations) {
    assert.ok(item.label && item.question && item.icon, `${item.id} lacks navigation copy`);
    assert.deepEqual(Object.keys(item.cells).sort(), [...agents].sort());
    for (const [agent, cell] of Object.entries(item.cells)) {
      assert.ok(statuses.has(cell.status), `${item.id}/${agent} has invalid status`);
      for (const field of ["surface", "primitive", "contract", "edge"]) {
        assert.ok(cell[field], `${item.id}/${agent} lacks ${field}`);
      }
      assert.ok(Array.isArray(cell.details) && cell.details.length >= 3, `${item.id}/${agent} lacks implementation fields`);
      assert.ok(cell.claims?.length || cell.unknown, `${item.id}/${agent} has no evidence`);
    }
  }
});

test("all claims and known unknowns are unique, resolved, and reachable", () => {
  assert.equal(claims.size, 76, "duplicate claim IDs");
  assert.equal(unknowns.size, 26, "duplicate unknown IDs");
  const claimRefs = collectRefs(workbench, "claims");
  const unknownRefs = collectRefs(workbench, "unknown");
  for (const id of claimRefs) assert.ok(claims.has(id), `unresolved claim ${id}`);
  for (const id of unknownRefs) assert.ok(unknowns.has(id), `unresolved unknown ${id}`);
  for (const id of claims.keys()) assert.ok(claimRefs.has(id), `${id} is unreachable from the workbench`);
  for (const id of unknowns.keys()) assert.ok(unknownRefs.has(id), `${id} is unreachable from the workbench`);
});

test("evidence grades keep docs, immutable history, protocol, and pinned code distinct", () => {
  const claudeGrades = new Set(["CURRENT-DOCS", "EXACT-HISTORY", "CURRENT-DOCS+EXACT-HISTORY", "PROTOCOL"]);
  for (const claim of evidence.claims) {
    assert.equal(claim.type, "fact");
    assert.match(claim.id, /^MCP-(CC|CX|OC)-\d{2}$/);
    for (const field of ["title", "statement", "layer", "confidence", "boundary"]) {
      assert.ok(claim[field], `${claim.id} lacks ${field}`);
    }
    assert.ok(claim.signals.length > 0, `${claim.id} lacks observable signals`);
    assert.match(claim.source.url, /^https:\/\//);
    assert.doesNotThrow(() => new URL(claim.source.url));
    if (claim.agent === "claude-code") assert.ok(claudeGrades.has(claim.grade), `${claim.id} flattens Claude provenance`);
    else assert.equal(claim.grade, "PINNED-CODE", `${claim.id} is not pinned to code`);
  }
  assert.ok(evidence.claims.some((claim) => claim.grade === "CURRENT-DOCS"));
  assert.ok(evidence.claims.some((claim) => claim.grade === "EXACT-HISTORY"));
  assert.ok(evidence.claims.some((claim) => claim.grade === "PROTOCOL"));
  assert.match(script, /grade\.includes\("CURRENT-DOCS"\)/);
  assert.match(script, /grade === "EXACT-HISTORY"/);
  assert.match(script, /grade === "PROTOCOL"/);
  assert.match(script, /"pinned-evidence": "固定证据"/);
});

test("known unknowns carry a runnable verification contract", () => {
  for (const item of summary.unknowns) {
    assert.match(item.id, /^MCP-KU-\d{2}$/);
    for (const field of ["title", "text", "needed", "experiment", "observable"]) {
      assert.ok(item[field], `${item.id} lacks ${field}`);
    }
  }
});

test("MCP and Codex dynamicTools remain separate control planes", () => {
  const registration = operation("OP12");
  const invocation = operation("OP13");
  assert.equal(registration.cells["claude-code"].status, "unknown");
  assert.equal(registration.cells.opencode.status, "unknown");
  assert.deepEqual(registration.cells.codex.claims, ["MCP-CX-27", "MCP-CX-28", "MCP-CX-29", "MCP-CX-30"]);
  assert.match(registration.cells.codex.contract, /thread\/start.*dynamicTools/);
  assert.match(registration.cells.codex.edge, /恢复 schema 不等于绑定.*host subscriber/);
  assert.match(registration.cells.codex.details.find((item) => item.label === "HOST LIVENESS").value, /bind current subscriber separately/);
  assert.equal(invocation.cells["claude-code"].status, "unknown");
  assert.equal(invocation.cells.opencode.status, "unknown");
  assert.deepEqual(invocation.cells.codex.claims, ["MCP-CX-30"]);
  assert.match(invocation.cells.codex.contract, /item\/tool\/call 反向请求 host.*没有自己的 wall-clock timeout/);
  assert.match(JSON.stringify(workbench.sharpEdges), /MCP ≠ dynamicTools/);
});

test("model invocation and host direct invocation retain different authority", () => {
  const modelPath = operation("OP10").cells.codex;
  const directPath = operation("OP11").cells.codex;
  assert.ok(modelPath.claims.includes("MCP-CX-20"));
  assert.match(modelPath.contract, /等待current server.*approval/);
  assert.deepEqual(directPath.claims, ["MCP-CX-21"]);
  assert.match(directPath.contract, /App-server direct path.*不进入 model-path approval/);
  assert.match(directPath.edge, /Host API authority.*单独记录和验证/);
  assert.match(claims.get("MCP-CX-21").statement, /不进入 model-path approval/);
  assert.match(claims.get("MCP-CX-21").boundary, /host API authority 仍未知.*不证明.*没有 ACL/);
  assert.match(JSON.stringify(workbench.sharpEdges), /模型调用 ≠ direct 调用/);
});

test("configured, cached, live, ready, and callable are never collapsed", () => {
  assert.match(JSON.stringify(workbench.sharpEdges), /configured ≠ connected/);
  assert.match(JSON.stringify(workbench.sharpEdges), /cached ≠ live ≠ callable/);
  assert.match(operation("OP06").cells.codex.edge, /cached schema 不等于 live client/);
  assert.match(operation("OP08").cells["claude-code"].edge, /Indexed 与 cached 不证明 server live 或 tool callable/);
  assert.match(workbench.hazards.find((item) => item.id === "H01").recovery, /status \+ catalog read-back/);
  assert.match(workbench.hazards.find((item) => item.id === "H06").title, /ready.*status已 failed/);
});

test("catalog refresh, identity, reconnection, and error boundaries stay product-specific", () => {
  assert.match(operation("OP07").cells.opencode.edge, /raw identity.*collision/);
  assert.match(operation("OP14").cells.codex.contract, /on_tool_list_changed只log.*不是catalog refresh/);
  assert.match(operation("OP15").cells.opencode.contract, /普通close.*failed.*404仅特殊重试一次/);
  assert.match(operation("OP15").cells.opencode.edge, /不能宣传成generic auto-reconnect/);
  assert.match(JSON.stringify(workbench.sharpEdges), /tool error ≠ transport failure/);
  assert.match(operation("OP10").cells["claude-code"].edge, /Tool error不能标 connection failed/);
});

test("operation fields, flow states, and hazard priorities are authored contracts rather than templates", () => {
  assert.ok(workbench.operations.every((item) => Object.values(item.cells).every((cell) => cell.details.every((detail) => detail.label !== "STATE"))));
  assert.ok(workbench.flows.every((flow) => flow.steps.every((step) => step.meta !== "state transition")));
  const dynamicFlow = workbench.flows.find((flow) => flow.id === "F10");
  assert.match(dynamicFlow.label, /schema；调用另轨/);
  assert.doesNotMatch(dynamicFlow.steps.map((step) => `${step.label} ${step.meta}`).join(" | "), /ephemeral subscriber|Direct\/deferred|disconnect \| cancel/);
  assert.match(dynamicFlow.controls.find((item) => item.primitive === "invocation lane").effect, /先验证 current host binding/);
  assert.match(workbench.flows.find((flow) => flow.id === "F12").label, /404 恢复另轨/);
  assert.deepEqual(new Set(workbench.hazards.map((item) => item.severity)), new Set(["P0", "P1", "P2"]));
  assert.ok(workbench.hazards.filter((item) => item.severity === "P0").length < workbench.hazards.length / 2);
  assert.equal(operation("OP11").cells.opencode.status, "unknown");
  assert.match(operation("OP11").cells.opencode.edge, /注册与控制 API.*invocation/);
});

test("resource matrix has eighteen owner, isolation, and limit rows", () => {
  const rows = [...workbench.isolation, ...workbench.limits];
  assert.equal(rows.length, 18);
  assert.equal(new Set(rows.map((item) => item.label)).size, 18);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row.cells).sort(), [...agents].sort());
    assert.ok(Object.values(row.cells).every(Boolean), `${row.label} has an empty product contract`);
    assert.ok(row.claims?.length, `${row.label} lacks evidence`);
    assert.deepEqual(Object.keys(row.claimsByAgent).sort(), [...agents].sort());
    assert.ok(Object.values(row.claimsByAgent).flat().every((id) => claims.has(id)), `${row.label} has unresolved cell evidence`);
    assert.ok(Object.values(row.unknownByAgent || {}).every((id) => unknowns.has(id)), `${row.label} has unresolved cell unknown`);
  }
});

test("version history contains the expected product split and immutable references", () => {
  const counts = Object.fromEntries(agents.map((agent) => [agent, workbench.changes.filter((item) => item.agent === agent).length]));
  assert.deepEqual(counts, { "claude-code": 18, codex: 6, opencode: 10 });
  for (const item of workbench.changes) {
    assert.ok(item.version && item.impact && item.path, `${item.agent}/${item.version} is shallow`);
    assert.match(item.url, /^https:\/\//);
    assert.doesNotThrow(() => new URL(item.url));
    if (item.agent === "claude-code" && !["2.1.195", "2.1.199"].includes(item.version)) {
      assert.match(item.url, /github\.com\/anthropics\/claude-code\/blob\/[0-9a-f]{40}\//);
    }
    if (item.agent === "codex") assert.match(item.url, /(?:releases\/tag\/rust-v|commit\/[0-9a-f]{40})/);
    if (item.agent === "opencode") assert.match(item.url, /(?:releases\/tag\/v|commit\/[0-9a-f]{40})/);
    assert.ok(["exact-history", "current-docs"].includes(item.evidenceClass));
    assert.ok(item.sources?.length, `${item.agent}/${item.version} lacks provenance links`);
    assert.ok(item.sources.every((source) => /^https:\/\//.test(source.url)));
  }
  assert.equal(workbench.changes.filter((item) => item.evidenceClass === "current-docs").length, 2);
  assert.ok(workbench.changes.find((item) => item.agent === "codex" && item.version === "0.147.0").sources.length >= 4);
  assert.ok(workbench.changes.find((item) => item.agent === "opencode" && item.version === "1.17.14").sources.length >= 2);
});
