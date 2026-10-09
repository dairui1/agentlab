const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const engine = require("../public/research-guide.js");
const builder = require("../scripts/build_research_guides.cjs");
const root = path.join(__dirname, "../public");
const index = JSON.parse(fs.readFileSync(path.join(root, "research-index.json"), "utf8"));
const studies = index.studies.filter((study) => study.id !== "pi-durable-guide");
const guides = studies.map((study) => ({ study, guide: JSON.parse(fs.readFileSync(path.join(root, study.guideData), "utf8")) }));

test("all 22 other research topics open teaching guides, not evidence reports", () => {
  assert.equal(studies.length, 22);
  assert.equal(index.studies.length, 23);
  assert.ok(!index.studies.some((study) => study.id === "pi-durable"));
  for (const { study, guide } of guides) {
    assert.equal(study.legacyHref, `/guides/${study.id}.html`);
    assert.ok(study.archiveHref.startsWith("/"));
    const records = builder.recordsFor(study);
    assert.doesNotThrow(() => builder.validate(guide, study, records));
    const html = fs.readFileSync(path.join(root, study.legacyHref), "utf8");
    assert.equal(html, builder.render(guide, study, records), `${study.id}: generated page drift`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
    assert.equal(ids.length, new Set(ids).size, `${study.id}: duplicate ID`);
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), `${study.id}: missing anchor ${id}`);
    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /教学场景，不连接真实 Agent、模型或外部工具/);
    assert.match(html, /fieldset class="rg-controls" disabled/);
    assert.match(html, /<details class="rg-source-document" id="rg-sources">/);
    assert.match(html, /source=1/);
  }
});

test("every model has reachable alternatives that change multiple state surfaces", () => {
  for (const { guide } of guides) for (const chapter of guide.chapters) {
    const model = chapter.model;
    if (!model) continue;
    let combinations = [{}];
    for (const control of model.controls) {
      const values = control.type === "select" ? control.options.map((option) => option.value)
        : control.type === "toggle" ? [false, true]
          : [...new Set([control.min, control.max, control.default, ...model.cases.flatMap((scenario) => Object.values(scenario.when[control.id] || {}).flatMap((value) => [value - 1, value, value + 1])).filter((value) => value >= control.min && value <= control.max)])];
      combinations = combinations.flatMap((combination) => values.map((value) => ({ ...combination, [control.id]: value })));
    }
    const reachable = new Set(combinations.map((values) => engine.resolve(model, values)));
    assert.ok(reachable.size >= 2, `${guide.id}/${model.id}: only one reachable case`);
    const surfaces = new Set([...reachable].map((scenario) => JSON.stringify(scenario.frames.at(-1).panels)));
    assert.ok(surfaces.size >= 2, `${guide.id}/${model.id}: controls only change prose`);
    if (model.kind === "timeline") {
      for (const scenario of reachable) assert.notDeepEqual(scenario.frames[0].panels, scenario.frames.at(-1).panels, `${guide.id}/${model.id}: no state transition`);
    }
  }
});

test("case matching respects AND conditions, booleans, and exact threshold edges", () => {
  assert.ok(engine.matches({ saved: true, current: true }, { saved: true, current: true }));
  assert.ok(!engine.matches({ saved: true, current: true }, { saved: true, current: false }));
  assert.ok(engine.matches({ used: { gte: 80, lt: 100 } }, { used: 80 }));
  assert.ok(!engine.matches({ used: { gte: 80, lt: 100 } }, { used: 100 }));
  assert.ok(!engine.matches({ used: { gte: 80 } }, { used: "90" }));
  assert.ok(!engine.matches({ used: { execute: "danger" } }, { used: 90 }));
  assert.ok(engine.matches({}, {}));
});

test("catalog return preserves filters on both canonical and html paths, without accepting foreign destinations", () => {
  const current = "https://agentlab.example/guides/code-mode";
  for (const pathname of ["/capabilities", "/capabilities.html"]) {
    const returned = new URL(engine.catalogReturn(current, `${pathname}?study=code-mode&search=Code+Mode&topic=tools&product=pi&evidence=CM-01`), current);
    assert.equal(returned.pathname, pathname);
    assert.equal(returned.searchParams.get("search"), "Code Mode");
    assert.equal(returned.searchParams.get("topic"), "tools");
    assert.equal(returned.searchParams.get("product"), "pi");
    assert.ok(!returned.searchParams.has("study") && !returned.searchParams.has("evidence"));
  }
  assert.equal(engine.catalogReturn(current, "https://other.example/capabilities?search=private"), "/capabilities.html");
  assert.equal(engine.catalogReturn(current, "javascript:alert(1)"), "/capabilities.html");
  assert.equal(engine.catalogReturn(current, "http://["), "/capabilities.html");
});

test("a running timeline never displays a future success or failure as its current result", () => {
  const model = { kind: "timeline" };
  const scenario = { label: "命令成功，wrapper 完成", explanation: "退出码为零。", frames: [
    { caption: "运行中，退出码尚未产生", log: ["等待命令返回"] },
    { caption: "命令退出", log: ["收到退出码"] },
    { caption: "结果就绪", log: ["包装结果"] },
  ] };
  assert.deepEqual(engine.caseCopy(model, scenario, 0, {}), { label: "当前：运行中，退出码尚未产生", explanation: "等待命令返回" });
  assert.deepEqual(engine.caseCopy(model, scenario, 2, {}), { label: scenario.label, explanation: scenario.explanation });
});

test("rendered model text is escaped and control values are not executable code", () => {
  const markup = engine.frameMarkup({ caption: "{{used}}", diagram: [{ label: "<script>", status: "done" }], panels: [{ title: "<&>", items: [{ label: "记录", value: "{{input}}", state: "bad-attribute" }] }] }, { used: 1000, input: '<img src=x onerror="alert(1)">' });
  assert.ok(markup.includes("1,000"));
  assert.ok(!markup.includes("<script>"));
  assert.ok(!markup.includes("<img"));
  assert.ok(markup.includes('data-state="idle"'));
  const js = fs.readFileSync(path.join(root, "research-guide.js"), "utf8");
  assert.doesNotMatch(js, /\beval\s*\(|new Function|new WebSocket|new XMLHttpRequest/);
  assert.match(js, /pagehide/);
  assert.match(js, /交互暂时未能加载，正文与默认场景仍可阅读/);
  const css = fs.readFileSync(path.join(root, "research-guide.css"), "utf8");
  for (const [local, shared] of [["paper", "page"], ["ink", "text"], ["muted", "text-soft"], ["rule", "border-strong"]]) assert.ok(css.includes(`--rg-${local}: var(--theme-${shared})`), `guide breaks shared theme ${shared}`);
});

test("legacy research routes retain deliberate source access without being the reading default", () => {
  for (const study of studies) {
    const archive = new URL(study.archiveHref, "https://agentlab.test");
    const html = fs.readFileSync(path.join(root, archive.pathname), "utf8");
    assert.match(html, /src="\/research-reading.js"/);
  }
  const script = fs.readFileSync(path.join(root, "research-reading.js"), "utf8");
  assert.match(script, /searchParams\.get\("source"\) === "1"/);
  const pi = fs.readFileSync(path.join(root, "capabilities/pi-durable.html"), "utf8");
  assert.match(pi, /http-equiv="refresh"/);
  assert.doesNotMatch(pi, /data-article-section/);
  const translated = fs.readFileSync(path.join(root, "capabilities/pi-durable-guide.html"), "utf8");
  assert.match(translated, /id="implementation-source"/);
  const records = JSON.parse(fs.readFileSync(path.join(root, "capabilities/pi-durable.json"), "utf8"));
  assert.deepEqual(new Set([...translated.matchAll(/data-evidence="(PD-\d+)"/g)].map(([, id]) => id)), new Set(records.evidence.map((record) => record.id)));
});
