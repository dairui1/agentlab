const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const appCore = require("../public/app-core.js");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");
const html = read("mechanisms.html");
const script = read("mechanisms.js");
const styles = read("mechanisms.css");
const workbench = JSON.parse(read("dossiers/subagent-workbench.json"));
const summary = JSON.parse(read("dossiers/subagent-orchestration.json"));
const evidence = JSON.parse(read("dossiers/subagent-evidence.json"));
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
        target.push(...values.filter((entry) => typeof entry === "string" && /^(CC|CX|OC|KU)-\d+$/.test(entry)));
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

function internalCompareUrls() {
  return [
    ...evidence.claims.map((claim) => claim.compare.url),
    ...workbench.changes.map((item) => item.url),
  ].filter((url) => url.startsWith("/"));
}

test("legacy comparison URLs retain the evidence workbench behind the unified research index", () => {
  const index = read("index.html");
  const navigation = require("../public/site-navigation.js");
  assert.ok(navigation.items.some((item) => item.id === "research" && item.href === "/capabilities.html"));
  assert.match(index, /<agentlab-navigation[^>]+interactive/);
  assert.doesNotMatch(index, /href="\/mechanisms\.html"|>机制档案<|>能力拆解</);
  assert.match(html, /id="contractApp"/);
  assert.match(html, /id="sharpEdgeStrip"[^>]*hidden/);
  assert.doesNotMatch(html, /Evidence scope|EVIDENCE INSPECTOR/);
  assert.doesNotMatch(script, /renderSharpEdges\(\);/);
  assert.match(html, /id="contractWorkspace"/);
  assert.match(html, /id="operationList"/);
  assert.match(html, /id="evidenceInspector"/);
  assert.match(html, /id="contractPanel"[^>]*role="tabpanel"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 5);
  for (const view of ["compare", "flows", "failures", "resources", "changes"]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
  assert.match(html, /src="\/mechanisms\.js\?v=2"/);
  assert.match(html, /href="\/mechanisms\.css\?v=2"/);
});

test("article-era repetition and self-built-Agent advice stay deleted", () => {
  const banned = [
    "对自研 Agent 的启示", "自研 Agent", "自建 Agent", "机制解剖", "跨 Agent 观察",
    "证据账本", "档案目录", "识别边界", "创建执行者", "独立执行", "回收结果",
    "派发入口", "协调方式", "控制面的颗粒度不同",
  ];
  for (const phrase of banned) assert.equal(html.includes(phrase), false, `banned copy: ${phrase}`);
  assert.doesNotMatch(html, /id="(dossierTitle|anatomies|observations|evidence)"/);
  assert.doesNotMatch(html, /class="mechanism-section/);
});

test("workbench data is operation-first and complete enough for harness lookup", () => {
  assert.deepEqual(workbench.snapshots.map((item) => item.agent), agents);
  assert.equal(workbench.operations.length, 11);
  assert.equal(workbench.flows.length, 5);
  assert.equal(workbench.hazards.length, 9);
  assert.equal(workbench.isolation.length, 4);
  assert.equal(workbench.limits.length, 7);
  assert.equal(workbench.changes.length, 9);
  assert.ok(workbench.sharpEdges.length >= 5);
  assert.equal(workbench.defaultOperation, "create");

  const statuses = new Set(["exposed", "partial", "not-exposed", "unknown"]);
  for (const item of workbench.operations) {
    assert.ok(item.id && item.label && item.question && item.icon);
    assert.deepEqual(Object.keys(item.cells), agents);
    for (const cell of Object.values(item.cells)) {
      assert.ok(statuses.has(cell.status), `${item.id} has an invalid status`);
      assert.ok(cell.primitive && cell.contract && cell.edge, `${item.id} has a shallow cell`);
      assert.ok(cell.claims?.length || cell.unknown, `${item.id} has an unsupported cell`);
    }
  }
});

test("all workbench facts and known-unknown references resolve", () => {
  const factRefs = new Set(collectRefs(workbench, "claims"));
  const unknownRefs = new Set(collectRefs(workbench, "unknown"));
  for (const id of factRefs) assert.ok(claims.has(id), `unresolved fact ${id}`);
  for (const id of unknownRefs) assert.ok(unknowns.has(id), `unresolved known-unknown ${id}`);
  for (const id of claims.keys()) assert.ok(factRefs.has(id), `${id} exists only in the evidence file`);
  assert.deepEqual([...unknownRefs].sort(), ["KU-02", "KU-06", "KU-07", "KU-08", "KU-09", "KU-11"]);
  assert.ok(claims.has(workbench.defaultClaim));
});

test("the quick reference encodes the contract traps harness authors actually hit", () => {
  assert.match(operation("steer").cells.codex.primitive, /send_message.*followup_task/);
  assert.match(operation("steer").cells.codex.contract, /唤醒 idle child/);
  assert.match(operation("wait-event").cells.codex.contract, /任一 live Agent/);
  assert.match(operation("wait-event").cells.codex.edge, /不返回 child payload/);
  assert.match(operation("wait-event").cells.codex.details.find((item) => item.label === "RETURN").value, /agent-update.*timeout.*user-steer/);
  assert.match(operation("wait-child").cells.codex.primitive, /no targeted wait/);
  assert.match(operation("join-all").cells["claude-code"].edge, /可落 null/);
  assert.match(operation("join-all").cells["claude-code"].primitive, /parallel\(thunks/);
  assert.match(operation("result").cells.codex.edge, /wait success.*child output/);
  assert.equal(operation("result").cells.codex.unknown, "KU-11");
  assert.match(operation("resume").cells.opencode.edge, /调用成功不证明续跑命中/);
  assert.match(operation("resume").cells.codex.contract, /target idle.*target running/);
  assert.doesNotMatch(operation("create").cells.opencode.primitive, /background/);
  assert.ok(operation("create").cells["claude-code"].details.some((item) => item.label === "REQUIRED"));
  assert.doesNotMatch(JSON.stringify(operation("create").cells["claude-code"].details), /\b(resume|name|mode)\b/);
  assert.match(operation("files").question, /Conversation 隔离后，文件是否仍共享/);
  assert.match(operation("files").cells.codex.contract, /即时互相可见/);
  assert.ok(workbench.hazards.some((item) => /task_id lookup failure 静默 fresh/.test(item.title)));
  assert.ok(workbench.hazards.some((item) => /Workflow barrier 可带 null/.test(item.title)));
});

test("atomic facts carry versioned sources, boundaries, and comparison targets", () => {
  assert.equal(evidence.claims.length, 23);
  assert.equal(claims.size, evidence.claims.length, "duplicate fact IDs");
  for (const claim of evidence.claims) {
    assert.equal(claim.type, "fact");
    assert.ok(agents.includes(claim.agent));
    for (const field of ["version", "title", "statement", "layer", "confidence", "boundary"]) {
      assert.ok(claim[field], `${claim.id} lacks ${field}`);
    }
    assert.ok(claim.signals.length > 0, `${claim.id} lacks visible signals`);
    assert.match(claim.source.url, /^https:\/\//, `${claim.id} source is not deployment-stable`);
    assert.match(claim.compare.url, /^\/\?mode=compare&/, `${claim.id} lacks direct AgentLab compare`);
  }
});

test("snapshot versions match the published corpus", { skip: !hasGeneratedHistory }, () => {
  for (const snapshot of workbench.snapshots) {
    const history = JSON.parse(read(`data/agents/${snapshot.agent}/history.json`));
    assert.ok(history.versions.some((item) => item.version === snapshot.version));
    for (const claim of evidence.claims.filter((item) => item.agent === snapshot.agent)) {
      assert.equal(claim.version, snapshot.version);
    }
  }
});

test("all internal comparison links resolve to a captured outline item", { skip: !hasGeneratedHistory }, () => {
  const urls = internalCompareUrls();
  assert.ok(urls.length >= 24);
  for (const href of urls) {
    const url = new URL(href, "https://agentlab.dairui1.com");
    assert.equal(url.searchParams.get("mode"), "compare");
    assert.equal(url.searchParams.get("view"), "structure");
    const agent = url.searchParams.get("agent");
    const history = JSON.parse(read(`data/agents/${agent}/history.json`));
    const left = history.versions.findIndex((item) => item.version === url.searchParams.get("left"));
    const right = history.versions.findIndex((item) => item.version === url.searchParams.get("right"));
    assert.ok(left >= 0 && right > left, `invalid range ${href}`);
    const outline = appCore.buildOutlineItems(history.versions[right]);
    assert.ok(appCore.resolveOutlineKey(outline, url.searchParams.get("section")), `missing outline target ${href}`);
  }
});

test("renderer keeps evidence in place, handles deep links, and avoids unsafe HTML", () => {
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.doesNotMatch(script, /scrollIntoView|location\.hash\s*=/);
  assert.match(script, /rel = "noopener noreferrer"/);
  assert.match(script, /url\.searchParams\.set\("view"/);
  assert.match(script, /\^#evidence-/);
  assert.match(script, /inspector\.classList\.add\("is-open"\)/);
  assert.match(script, /event\.key === "ArrowRight"/);
  assert.match(script, /aria-labelledby/);
  assert.match(script, /const productAgents = \["claude-code", "codex", "opencode"\]/);
  assert.doesNotMatch(script, /Object\.keys\(agentMeta\)/);
  assert.match(script, /function resetInspectorSelection\(\)/);
  assert.match(script, /state\.view === "compare" && selectedOperation\s*\? compareDefault/);
  assert.match(script, /function revealSelection\(container, selected\)/);
  assert.doesNotMatch(script, /scrollIntoView/);
  assert.match(script, /function focusMechanismItem\(position = "current"\)/);
  assert.match(script, /next\.searchParams\.set\("view", state\.view\)/);
  assert.match(script, /function renderCollectionController\(records, config\)/);
  assert.match(script, /row\.claimsByAgent\[agent\]/);
  assert.match(script, /collectionChunks = \{ flows: 6, failures: 12, changes: 10 \}/);
  assert.match(script, /url\.searchParams\.set\(key, value\)/);
  assert.doesNotMatch(html, /<select\b/);
  assert.match(html, /id="inspectorBackdrop"/);
  assert.match(script, /inspector\.setAttribute\("role", "dialog"\)/);
  assert.match(script, /inspector\.setAttribute\("aria-modal", "true"\)/);
  assert.match(script, /inspectorBackdrop\.addEventListener\("click", \(\) => closeInspector\(\)\)/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /inspector\.scrollTop = 0/);
  assert.match(script, /kind === "compare" \|\| external/);
  assert.match(script, /row\.setAttribute\("role", "row"\)/);
});

test("layout is three-pane on wide screens and row-first on mobile", () => {
  assert.match(styles, /grid-template-columns: 196px minmax\(0, 1fr\) var\(--inspector-width\)/);
  assert.match(styles, /@media \(max-width: 1280px\)[\s\S]*\.evidence-inspector \{[\s\S]*position: fixed/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /\.operation-row \{\s*display: block;/);
  assert.match(styles, /\.operation-rail \{[\s\S]*overflow-x: auto/);
  assert.match(styles, /\.evidence-inspector \{\s*inset: auto 8px 8px/);
  assert.match(styles, /\.resource-head \{\s*grid-template-columns: 142px repeat\(3, minmax\(0, 1fr\)\) 64px/);
  assert.match(styles, /\.contract-workspace:not\(\[data-view="compare"\]\) \.operation-rail \{\s*display: none/);
  assert.match(styles, /\.sharp-edge-strip \{[\s\S]*display: flex/);
  assert.match(styles, /\.sharp-edge-title \{[\s\S]*position: sticky[\s\S]*flex: 0 0 184px/);
  assert.doesNotMatch(styles, /grid-template-columns: 184px repeat\(5/);
  assert.match(styles, /\.collection-toolbar \{[\s\S]*position: sticky/);
  assert.match(styles, /\.collection-facet button\[aria-pressed="true"\]/);
  assert.doesNotMatch(styles, /\.operation-table[^}]*overflow-x:\s*auto/);
});
