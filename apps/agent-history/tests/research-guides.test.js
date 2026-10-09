const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const engine = require("../public/research-guide.js");
const builder = require("../scripts/build_research_guides.cjs");
const root = path.join(__dirname, "../public");
const index = JSON.parse(fs.readFileSync(path.join(root, "research-index.json"), "utf8"));
const studies = index.studies.filter((study) => study.id !== "pi-durable-guide");
const retainedIds = ["code-mode", "oar", "goal-mode", "subagent-orchestration", "session-resume", "context-compaction", "token-budget-context", "permission-sandbox", "tool-contract", "mcp-dynamic-tools"];
const restoredHrefs = {
  raven: "/capabilities/raven.html",
  mimoagent: "/capabilities/mimoagent.html",
  autoresearch: "/capabilities/autoresearch.html",
  "raft-multi-agent": "/capabilities/raft-multi-agent.html",
  "raft-collaboration": "/capabilities/raft-collaboration.html",
  "claude-tag": "/capabilities/claude-tag.html",
  "gpt-prompt-evolution": "/capabilities/gpt-prompt-evolution.html",
  "exo-recursive-harness": "/capabilities/exo-recursive-harness.html",
  "deepseek-harness-architecture": "/capabilities/deepseek-harness-architecture.html",
  "model-routing": "/mechanisms.html?mechanism=model-routing",
  "browser-use": "/capabilities/browser-use.html",
  "computer-use": "/capabilities/computer-use.html",
};
const guides = studies.filter((study) => study.guideData).map((study) => ({ study, guide: JSON.parse(fs.readFileSync(path.join(root, study.guideData), "utf8")) }));

test("only the ten retained topics open teaching guides while twelve recover their original reading entries", () => {
  assert.equal(studies.length, 22);
  assert.equal(index.studies.length, 23);
  assert.deepEqual(new Set(guides.map(({ study }) => study.id)), new Set(retainedIds));
  assert.deepEqual(new Set(fs.readdirSync(path.join(root, "research-guides")).filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""))), new Set(retainedIds));
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
  for (const [id, href] of Object.entries(restoredHrefs)) {
    const study = studies.find((entry) => entry.id === id);
    assert.equal(study.legacyHref, href, `${id}: original reading entry not restored`);
    assert.ok(!Object.hasOwn(study, "guideData") && !Object.hasOwn(study, "archiveHref"), `${id}: still classified as a teaching guide`);
    const target = new URL(href, "https://agentlab.test");
    assert.ok(fs.existsSync(path.join(root, target.pathname)), `${id}: restored page missing`);
    const alias = fs.readFileSync(path.join(root, `guides/${id}.html`), "utf8");
    assert.equal(alias, builder.renderRedirect(study), `${id}: compatibility alias drift`);
    assert.match(alias, /http-equiv="refresh"/);
    assert.ok(alias.includes(href.replaceAll("&", "&amp;")), `${id}: published guide alias misses restored target`);
    assert.doesNotMatch(alias, /class="rg-model"|data-guide-model|src="\/research-guide\.js"/);
  }
});

test("published guide aliases preserve the original destination, catalog context, and valid source hashes without redirect loops", () => {
  const script = fs.readFileSync(path.join(root, "research-guide-redirect.js"), "utf8");
  const redirected = (destination, hash = "", from = null) => {
    let result = null;
    const url = new URL(`https://agentlab.test/guides/claude-tag?rev=previous${hash}`);
    if (from !== null) url.searchParams.set("from", from);
    const context = { URL, document: { body: { dataset: { guideRedirect: destination } } }, location: { href: url.href, replace: (target) => { result = target; } } };
    vm.runInNewContext(script, context);
    return result;
  };
  for (const [id, href] of Object.entries(restoredHrefs)) {
    assert.equal(redirected(href), href, `${id}: alias does not open its original reading`);
    const destination = new URL(redirected(href, "#evidence-CT-02", "/capabilities.html?search=请求&topic=控制与协作"), "https://agentlab.test");
    const expected = new URL(href, "https://agentlab.test");
    assert.equal(destination.pathname, expected.pathname);
    for (const [key, value] of expected.searchParams) assert.equal(destination.searchParams.get(key), value);
    assert.equal(destination.searchParams.get("from"), "/capabilities.html?search=请求&topic=控制与协作");
    assert.equal(destination.searchParams.get("rev"), null);
    assert.equal(destination.hash, "#evidence-CT-02");
    assert.equal(new URL(redirected(href, "#rg-invented-model"), "https://agentlab.test").hash, "");
  }
  for (const href of ["https://other.example/capabilities/claude-tag", "/guides/claude-tag.html", "javascript:alert(1)", ""]) {
    assert.equal(redirected(href), null, `${href}: unsafe or recursive alias destination`);
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

test("retained teaching topics keep source access and the Pi translation keeps its independent implementation evidence", () => {
  for (const { study } of guides) {
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

test("old reading URLs only redirect retained topics and leave the restored model-routing workbench available", () => {
  const script = fs.readFileSync(path.join(root, "research-reading.js"), "utf8");
  const redirected = (href) => {
    let destination = null;
    const context = { URL, location: { href, replace: (target) => { destination = target; } } };
    vm.runInNewContext(script, context);
    return destination;
  };
  for (const href of Object.values(restoredHrefs)) {
    for (const pathname of [href, href.replace(/\.html(?=\?|$)/, "")]) {
      assert.equal(redirected(`https://agentlab.test${pathname}`), null, `${pathname}: original reading should not redirect`);
    }
  }
  for (const id of retainedIds) {
    const study = studies.find((entry) => entry.id === id);
    const legacy = new URL(study.archiveHref, "https://agentlab.test");
    const href = legacy.href;
    assert.equal(redirected(href), `/guides/${id}.html`, `${id}: retained topic lost old URL forwarding`);
    legacy.searchParams.set("source", "1");
    assert.equal(redirected(legacy.href), null, `${id}: explicit source access should not redirect`);
    legacy.searchParams.delete("source");
    legacy.searchParams.set("from", "/capabilities.html?search=恢复&topic=控制与协作");
    const target = new URL(redirected(legacy.href), "https://agentlab.test");
    assert.equal(target.searchParams.get("from"), legacy.searchParams.get("from"), `${id}: catalog return lost`);
  }
});
