const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { test } = require("node:test");

const root = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("capabilities/pi-durable-guide.html");
const js = read("pi-durable-guide.js");
const css = read("pi-durable-guide.css");
const revision = "d01f763b02f06ff6144d4366eb966a76dbb35577";
const sourceHash = "146753ee7fdeab0e5a2369aa1adb54a43e88afb75f1641cc3df9ea2e623c0bb7";
const sections = ["why", "shape", "nouns", "run", "once", "inbox", "tasks", "docs", "ext", "ctx", "watch", "storage"];
const controls = [
  "sim-run", "sim-step", "sim-kill", "sim-open", "sim-reset", "sim-safe",
  "rid-on", "rid-send", "rid-reset", "ib-steer", "ib-follow", "ib-write", "ib-reject", "ib-restart",
  "ck-ok", "ck-decline", "ck-cancel", "ck-restart", "rl-call", "rl-install", "rl-reset",
  "cx-range", "cx-over", "cx-manual", "cx-reset", "w-run", "w-join", "w-slow",
];
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

test("Pi Pocket translation preserves all twelve original chapters and their anchors", () => {
  const actual = [...html.matchAll(/<section\b[^>]*\bclass="sec"[^>]*>/g)].map(([tag]) => attribute(tag, "id"));
  assert.deepEqual(actual, sections);
  const toc = html.match(/<ol id="toc">([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(toc);
  assert.deepEqual([...toc.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id), sections);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, "duplicate document ID");
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), target);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /Pi Durable.*中文/);
});

test("the translation retains every original teaching-model control and render target", () => {
  for (const id of controls) {
    const tag = [...html.matchAll(/<(?:button|input)\b[^>]*>/g)].map(([tag]) => tag).find((tag) => attribute(tag, "id") === id);
    assert.ok(tag, id);
    assert.ok(js.includes(`"#${id}"`), `${id} has no script binding`);
  }
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
  for (const [, selector] of js.matchAll(/\$\("#([^"\s]+)"/g)) assert.ok(ids.has(selector), selector);
  assert.deepEqual([...html.matchAll(/\bdata-p="([^"]+)"/g)].map(([, policy]) => policy), ["initial", "asOf", "current"]);
  for (const hook of ["beforeRequest", "afterResponse", "afterTools", "onYield", "beforeTool", "afterTool"]) assert.ok(js.includes(hook), hook);
  for (const id of ["layers", "layer-detail", "nouns-grid", "sim-ledger", "sim-tx", "sim-tree", "sim-docs", "rid-subs", "ib-q", "ib-placed", "ck-log", "fk-child", "hook-narr", "rl-calls", "cx-state", "w-clients"]) assert.ok(ids.has(id), id);
  assert.doesNotThrow(() => new vm.Script(js, { filename: "pi-durable-guide.js" }));
});

test("original SVG geometry and model parameters survive translation", () => {
  const svgs = [...html.matchAll(/<svg\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(svgs.length, 3);
  assert.equal(attribute(svgs[0], "viewBox"), "0 0 18 18");
  assert.equal(attribute(svgs.find((tag) => attribute(tag, "id") === "ck-svg"), "viewBox"), "0 0 560 270");
  assert.equal(attribute(svgs.find((tag) => attribute(tag, "id") === "life-svg"), "viewBox"), "0 0 800 185");
  assert.equal((html.match(/class="(?:pb )?diagram-scroll" tabindex="0" role="region"/g) || []).length, 2);
  assert.match(css, /\.diagram-scroll\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /#ck-svg\s*\{[^}]*min-width:\s*560px/);
  assert.match(css, /#life-svg\s*\{[^}]*min-width:\s*800px/);
  for (const geometry of ["M3 11h24M3 18h24", "M5 7h20M5 12h14M5 17h18M5 22h10", "M10 15l4 4 7-8", "M4 20h22v6H4z", "M420 23 Q330 0 250 72"]) assert.ok(js.includes(geometry), geometry);
  for (const [name, value] of [["WIN", 200000], ["RES", 16384], ["BG", 32768], ["KEEP", 20000], ["MAX", 100]]) assert.match(js, new RegExp(`\\b${name}\\s*=\\s*${value}\\b`));
  const slider = [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag).find((tag) => attribute(tag, "id") === "cx-range");
  assert.equal(attribute(slider, "min"), "0");
  assert.equal(attribute(slider, "max"), "200000");
  assert.equal(attribute(slider, "step"), "1000");
  assert.equal(attribute(slider, "value"), "120000");
  assert.match(js, /\["visa-1", "visa-2", "visa-3", "visa-4"\]/);
  assert.match(js, /t\.replay === "safe" && now/);
  assert.match(js, /c\.q\.length >= MAX/);
  assert.match(js, /c\.q = \[\{ seq, snap: true \}\]/);
  assert.match(js, /S\.usage\.tokens \+= 1840/);
  assert.match(js, /S\.usage\.tokens \+= 2310/);
});

test("the translated models do not turn submission deduplication into external exactly-once execution", () => {
  const once = html.slice(html.indexOf('id="once"'), html.indexOf('id="inbox"'));
  assert.match(once, /requestId/);
  const note = html.match(/<aside class="guide-translation-note"[^>]*>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(note, "missing independent translator note");
  assert.ok(html.indexOf('class="guide-translation-note"') < html.indexOf('id="why"'));
  assert.match(note, /提交去重.*不保证外部动作只执行一次/);
  assert.match(note, /教学模拟.*不是真实 Harness/);
  assert.match(html, /教学模型/);
  assert.match(html, /不是.*真实|不.*实际运行/);
  assert.match(html, /1\.0\.2/);
  assert.match(html, /实验阶段|实验性/);
  assert.match(html, /一次只能由一个进程|一个进程.*使用/);
  assert.match(html, /断电.*丢失|主机故障.*丢失/);
  assert.doesNotMatch(js, /\bfetch\s*\(|\bnew\s+(?:WebSocket|XMLHttpRequest)\b/);
});

test("translation metadata, attribution and MIT provenance are pinned separately from the implementation study", () => {
  const study = JSON.parse(read("capabilities/pi-durable-guide.json"));
  assert.equal(study.id, "pi-durable-guide");
  assert.equal(study.source.repository.toLowerCase(), "tannermidd/pi-pocket");
  assert.equal(study.source.revision, revision);
  assert.equal(study.source.license, "MIT");
  assert.equal(study.source.sha256, sourceHash);
  assert.equal(study.source.packageVersion, "1.0.2");
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.deepEqual(study.translation.sectionIds, sections);
  assert.match(study.boundary, /教学|模型/);
  assert.match(study.boundary, /未.*运行|不是.*真实|不.*实际|不.*复现/);
  assert.match(html, /Tanner Middleton/);
  assert.match(html, /AgentLab 中文翻译/);
  assert.match(html, new RegExp(`https://github.com/TannerMidd/pi-pocket/blob/${revision}/site/durable.html`));
  assert.match(html, /https:\/\/tannermidd.github.io\/pi-pocket\/durable.html/);
  const license = read("assets/source-media/pi-pocket/LICENSE.txt");
  assert.match(license, /MIT License/);
  assert.match(license, /Permission is hereby granted/);
  assert.equal(createHash("sha256").update(license).digest("hex"), study.assets.find((asset) => asset.path.endsWith("LICENSE.txt")).sha256);
  assert.match(html, /href="\/assets\/source-media\/pi-pocket\/LICENSE.txt"/);
  const entry = JSON.parse(read("research-index.json")).studies.find((item) => item.id === study.id);
  assert.ok(entry, "missing research entry");
  assert.equal(entry.legacyHref, "/capabilities/pi-durable-guide.html");
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  const navigation = require("../public/site-navigation.js");
  assert.equal(navigation.researchItems.find((item) => item.id === study.id)?.href, entry.legacyHref);
});

test("the article and its teaching models use only available local executable assets", () => {
  for (const [tag] of html.matchAll(/<(?:script|link|img)\b[^>]*>/g)) {
    const url = attribute(tag, "src") || attribute(tag, "href");
    if (!url || (tag.startsWith("<link") && attribute(tag, "rel") === "canonical")) continue;
    assert.ok(url.startsWith("/"), url);
    const local = path.join(root, url.split("?")[0].slice(1));
    assert.ok(fs.existsSync(local), local);
  }
  assert.match(html, /src="\/pi-durable-guide.js"/);
  assert.match(html, /href="\/pi-durable-guide.css"/);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.ok(css.includes('data-color-scheme="dark"'), "missing site dark-theme override");
});
