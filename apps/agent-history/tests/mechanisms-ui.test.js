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
const summary = JSON.parse(read("dossiers/subagent-orchestration.json"));
const evidence = JSON.parse(read("dossiers/subagent-evidence.json"));
const claims = new Map(evidence.claims.map((claim) => [claim.id, claim]));
const unknowns = new Map(summary.unknowns.map((item) => [item.id, item]));
const agents = ["claude-code", "codex", "opencode"];

function compareUrls() {
  return [
    ...evidence.claims.map((claim) => claim.compare.url),
    ...summary.timeline.map((item) => item.url),
  ].filter((url) => url.startsWith("/"));
}

test("mechanism dossier is wired into the application", () => {
  const index = read("index.html");
  assert.match(index, /href="\/mechanisms\.html"/);
  assert.match(html, /<h1 id="dossierTitle"><\/h1>/);
  assert.match(html, /src="\/mechanisms\.js"/);
  assert.match(html, /href="\/mechanisms\.css"/);
  for (const id of ["control-surfaces", "matrix", ...agents, "evolution", "observations", "unknowns", "evidence"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*tabindex="-1"`), `missing focusable #${id}`);
    assert.match(html, new RegExp(`href="#${id}"`), `missing navigation link to #${id}`);
  }
});

test("deprecated generic copy and self-built-Agent advice stay deleted", () => {
  const banned = [
    "识别边界", "创建执行者", "独立执行", "回收结果",
    "派发入口", "协调方式", "状态模型", "控制面的颗粒度不同",
    "隔离不只等于独立对话", "恢复语义正在成为标准能力", "档案目录",
  ];
  for (const phrase of banned) assert.equal(html.includes(phrase), false, `banned copy: ${phrase}`);
  assert.doesNotMatch(html, /对自研\s*Agent\s*的启示|自研\s*Agent|自建\s*Agent/i);
  assert.doesNotMatch(html, />\s*已核验\s*</);
});

test("summary exposes three asymmetric models and a 12-dimension matrix", () => {
  assert.deepEqual(summary.snapshots.map((item) => item.agent), agents);
  assert.deepEqual(summary.models.map((item) => item.agent), agents);
  assert.equal(summary.matrix.length, 12);
  assert.match(summary.thesis, /三层编排/);
  assert.match(summary.thesis, /mailbox Agent 树/);
  assert.match(summary.thesis, /Task-backed child session/);
  for (const row of summary.matrix) {
    assert.ok(row.group && row.label);
    assert.deepEqual(Object.keys(row.cells), agents);
    for (const cell of Object.values(row.cells)) {
      assert.ok(cell.text.length >= 12);
      assert.ok(cell.claims?.length || cell.unknown, `${row.group} has an unsupported cell`);
      for (const id of cell.claims || []) assert.ok(claims.has(id), `matrix has unresolved ${id}`);
      if (cell.unknown) assert.ok(unknowns.has(cell.unknown), `matrix has unresolved ${cell.unknown}`);
    }
  }
});

test("all fact references resolve and every fact is used", () => {
  const referenced = new Set([
    ...summary.models.flatMap((item) => item.claims),
    ...summary.matrix.flatMap((row) => Object.values(row.cells).flatMap((cell) => cell.claims || [])),
    ...summary.anatomies.flatMap((item) => item.claims),
    ...summary.observations.flatMap((item) => item.claims),
  ]);
  for (const id of referenced) assert.ok(claims.has(id), `unresolved fact ${id}`);
  for (const id of claims.keys()) assert.ok(referenced.has(id), `${id} exists only in the ledger`);
  for (const anatomy of summary.anatomies) {
    assert.ok(anatomy.claims.length >= 6, `${anatomy.agent} anatomy is too shallow`);
    assert.ok(anatomy.claims.every((id) => claims.get(id)?.agent === anatomy.agent));
  }
});

test("atomic facts carry versioned evidence, boundary, and confidence", () => {
  assert.equal(evidence.claims.length, 20);
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

test("snapshot counts and current versions match the published corpus", () => {
  for (const snapshot of summary.snapshots) {
    const history = JSON.parse(read(`data/agents/${snapshot.agent}/history.json`));
    assert.equal(history.versions.length, snapshot.captures);
    assert.ok(history.versions.some((item) => item.version === snapshot.version));
    for (const claim of evidence.claims.filter((item) => item.agent === snapshot.agent)) {
      assert.equal(claim.version, snapshot.version);
    }
  }
});

test("all AgentLab comparison links resolve to a captured outline item", () => {
  assert.ok(compareUrls().length >= 20);
  for (const href of compareUrls()) {
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

test("observations and unknowns remain visibly distinct from facts", () => {
  assert.ok(summary.observations.length >= 6);
  assert.ok(summary.unknowns.length >= 10);
  for (const item of summary.observations) {
    assert.match(item.id, /^OBS-\d{2}$/);
    assert.ok(item.claims.length >= 1);
    assert.ok(item.claims.every((id) => claims.has(id)));
  }
  for (const item of summary.unknowns) {
    assert.match(item.id, /^KU-\d{2}$/);
    assert.ok(item.text && item.needed);
  }
  assert.match(script, /dataset\.claimType = "observation"/);
  assert.match(script, /dataset\.claimType = "unknown"/);
  assert.match(styles, /border-style: double/);
  assert.match(styles, /border-style: dashed/);
});

test("renderer is safe, responsive, and keyboard-addressable", () => {
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /rel = "noopener noreferrer"/);
  assert.match(script, /window\.addEventListener\("hashchange"/);
  assert.match(script, /IntersectionObserver/);
  assert.match(styles, /:target/);
  assert.match(styles, /scroll-margin-top/);
  assert.match(styles, /@media \(max-width: 780px\)/);
  assert.match(styles, /\.matrix-row \{ display: block;/);
});
