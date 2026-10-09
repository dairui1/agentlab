const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const engine = require("../public/research-guide.js");

const publicRoot = path.resolve(__dirname, "../public");
const read = (name) => JSON.parse(fs.readFileSync(path.join(publicRoot, name), "utf8"));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const slug = /^[a-z][a-z0-9-]*$/;
const identifier = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const states = new Set(["idle", "active", "done", "blocked", "unknown"]);
function assert(condition, message) { if (!condition) throw new Error(message); }
function safeHref(value) {
  const url = new URL(value, "https://agentlab.dairui1.com");
  assert(["https:", "http:"].includes(url.protocol), `Unsafe link ${value}`);
  return esc(value);
}
function recordsFor(study) {
  const data = read((study.data || study.evidence).slice(1));
  return data.evidence || data.claims;
}
function validate(guide, study, records) {
  assert(guide.id === study.id && slug.test(guide.id), "Guide identity mismatch");
  assert(guide.title && guide.subtitle && guide.intro?.length && guide.source?.boundary && guide.versionNote, `${guide.id}: missing introduction or provenance`);
  safeHref(guide.source.href);
  assert(guide.chapters.length >= 4 && guide.chapters.length <= 6, `${guide.id}: chapter count`);
  const evidence = new Set(records.map((record) => record.id));
  const chapterIds = new Set();
  const modelIds = new Set();
  for (const chapter of guide.chapters) {
    assert(slug.test(chapter.id) && !chapterIds.has(chapter.id), `${guide.id}: chapter ID`);
    chapterIds.add(chapter.id);
    assert(chapter.title && chapter.lead && Array.isArray(chapter.body), `${guide.id}: missing chapter copy`);
    const model = chapter.model;
    if (!model) continue;
    assert(slug.test(model.id) && !modelIds.has(model.id), `${guide.id}: model ID`);
    modelIds.add(model.id);
    assert(["timeline", "compare", "budget"].includes(model.kind), `${guide.id}: model kind`);
    assert(model.controls.length && model.cases.length >= 2, `${guide.id}: no manipulable alternatives`);
    assert(model.evidence.length && model.evidence.every((id) => evidence.has(id)), `${guide.id}/${model.id}: unknown source ID ${model.evidence}`);
    const controls = new Set();
    for (const control of model.controls) {
      assert(identifier.test(control.id) && !controls.has(control.id), `${guide.id}: control ID`);
      controls.add(control.id);
      assert(["select", "toggle", "range"].includes(control.type), `${guide.id}: control type`);
      if (control.type === "select") assert(control.options.length > 1 && control.options.every((option) => typeof option.value === "string") && control.options.some((option) => option.value === control.default), `${guide.id}: select default`);
      if (control.type === "toggle") assert(typeof control.default === "boolean", `${guide.id}: toggle default`);
      if (control.type === "range") assert(Number.isFinite(control.min) && Number.isFinite(control.max) && control.min < control.max && control.default >= control.min && control.default <= control.max, `${guide.id}: range bounds`);
    }
    assert(Object.keys(model.cases.at(-1).when).length === 0, `${guide.id}/${model.id}: missing fallback`);
    for (const scenario of model.cases) {
      assert(scenario.label && scenario.explanation && scenario.frames.length >= (model.kind === "timeline" ? 3 : 1), `${guide.id}: incomplete case`);
      assert(Object.keys(scenario.when).every((id) => controls.has(id)), `${guide.id}: unknown condition`);
      for (const frame of scenario.frames) {
        assert(frame.caption && frame.panels.length >= 2 && frame.diagram?.length >= 2, `${guide.id}: model needs observable surfaces`);
        assert(frame.diagram.every((node) => node.label && states.has(node.status)), `${guide.id}: diagram state`);
        assert(frame.panels.every((panel) => panel.title && panel.items.length && panel.items.every((item) => item.label && typeof item.value === "string" && (!item.state || states.has(item.state)))), `${guide.id}: pane contents`);
        for (const [, id] of JSON.stringify(frame).matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)) assert(controls.has(id), `${guide.id}: unbound interpolation ${id}`);
      }
    }
    engine.resolve(model, engine.defaults(model));
  }
  assert(modelIds.size > 0, `${guide.id}: missing teaching model`);
  return { chapters: chapterIds.size, models: modelIds.size };
}
const navigationIds = { "raft-multi-agent": "raft-blog", "raft-collaboration": "raft", "goal-mode": "goal", "gpt-prompt-evolution": "gpt-prompt", "exo-recursive-harness": "exo", "token-budget-context": "token-budget", "deepseek-harness-architecture": "deepseek-harness", "browser-use": "research" };
function render(guide, study, records) {
  const citedIds = new Set(guide.chapters.flatMap((chapter) => chapter.model?.evidence || []));
  const citations = records.filter((record) => citedIds.has(record.id)).map((record) => `<section class="rg-citation" id="rg-source-${esc(record.id)}"><h3>${esc(record.id)} · ${esc(record.title)}</h3><p>${esc(record.statement)}</p><p>${esc(record.boundary)}</p><p>${esc(record.layer || record.evidenceClass || record.type || record.kind)}${record.version ? ` · ${esc(record.version)}` : ""}</p><a href="${safeHref(record.source?.url || study.data || study.evidence)}" target="_blank" rel="noopener noreferrer">${esc(record.source?.label || "固定构件索引")}</a>${record.compare?.url ? ` · <a href="${safeHref(record.compare.url)}" target="_blank" rel="noopener noreferrer">${esc(record.compare.label || "对照来源")}</a>` : ""}${record.artifact ? `<p><code>${esc(record.artifact)} · ${esc(record.locator)}</code></p>` : ""}${record.sha256 ? `<p><code>SHA-256 ${esc(record.sha256)}</code></p>` : ""}</section>`).join("\n");
  const archive = new URL(study.archiveHref || study.legacyHref, "https://agentlab.dairui1.com");
  archive.searchParams.set("source", "1");
  const title = `${guide.title} · AgentLab`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(guide.subtitle)}">
  <link rel="canonical" href="https://agentlab.dairui1.com/guides/${guide.id}">
  <link rel="icon" href="/assets/agentlab-mark.png" type="image/png">
  <script src="/site-theme.js"></script>
  <script src="/site-navigation.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/site-theme.css">
  <link rel="stylesheet" href="/site-theme-compat.css">
  <link rel="stylesheet" href="/research-guide.css">
</head>
<body class="rg-page" data-guide="${guide.id}">
  <a href="#rg-top" class="rg-skip">跳到正文</a>
  <header class="rg-sitebar"><div class="topbar"><a class="brand" href="/" aria-label="AgentLab 首页"><img src="/assets/agentlab-mark.png" alt="" width="28" height="28"><strong>AgentLab</strong></a><agentlab-navigation current="${navigationIds[guide.id] || guide.id}"></agentlab-navigation><div class="header-links"><a href="/capabilities.html" data-catalog-back>全部专题</a></div></div></header>
  <div class="rg-workspace">
    <nav class="rg-toc" aria-label="专题目录"><a href="#rg-top">${esc(guide.title)}</a><details class="rg-toc-disclosure" open><summary>目录</summary><ol>${guide.chapters.map((chapter, index) => `<li><a href="#rg-${chapter.id}"><span>${String(index + 1).padStart(2, "0")}</span>${esc(chapter.title)}</a></li>`).join("")}<li><a href="#rg-sources" data-source-link><span>↗</span>原文与源码</a></li></ol></details></nav>
    <main class="rg-main" id="rg-top">
      <header class="rg-masthead"><p class="rg-byline">AgentLab 专题研究 · <a href="#rg-sources" data-source-link>固定资料与范围</a></p><h1>${esc(guide.title)}</h1><p class="rg-subtitle">${esc(guide.subtitle)}</p>${guide.intro.slice(0, 1).map((paragraph) => `<p class="rg-intro rg-desktop-intro">${esc(paragraph)}</p>`).join("")}<p class="rg-boundary">教学场景，不连接真实 Agent、模型或外部工具。</p><p class="rg-guide-status" data-guide-status hidden role="status"></p><noscript><p class="rg-boundary">下方保留默认场景的静态快照。</p></noscript></header>
      ${guide.chapters.map((chapter, index) => `<section class="rg-chapter" id="rg-${chapter.id}"><span class="rg-chapter-number">${String(index + 1).padStart(2, "0")}</span><h2>${esc(chapter.title)}</h2><p class="rg-lead${index === 0 ? " rg-desktop-lead" : ""}">${esc(chapter.lead)}</p>${chapter.model ? engine.modelMarkup(chapter.model) : ""}${index === 0 ? `<p class="rg-lead rg-mobile-context">${esc(chapter.lead)}</p>${guide.intro.map((paragraph, paragraphIndex) => `<p class="rg-body rg-mobile-context">${esc(paragraph)}</p>${paragraphIndex > 0 ? `<p class="rg-body rg-desktop-context">${esc(paragraph)}</p>` : ""}`).join("")}` : ""}${chapter.body.map((paragraph) => `<p class="rg-body">${esc(paragraph)}</p>`).join("")}${chapter.takeaway ? `<p class="rg-takeaway">${esc(chapter.takeaway)}</p>` : ""}</section>`).join("\n")}
      <div class="rg-closing">${guide.closing.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}</div>
      <details class="rg-source-document" id="rg-sources"><summary>原文、源码与核验记录</summary><p>${esc(guide.versionNote)}。${esc(guide.source.boundary)}</p><div class="rg-source-links"><a href="${safeHref(guide.source.href)}" target="_blank" rel="noopener noreferrer">${esc(guide.source.label)}</a><a href="${esc(archive.pathname + archive.search)}">${["autoresearch", "raft-multi-agent"].includes(guide.id) ? "完整原文译文、原图与批注" : "完整核验记录"}</a><a href="/capabilities.html?study=${guide.id}">全部证据与待验证问题</a></div>${citations}</details>
    </main>
  </div>
  <script src="/vendor/lucide/lucide.min.js"></script>
  <script src="/research-guide.js"></script>
</body>
</html>
`;
}
function renderRedirect(study) {
  const destination = safeHref(study.legacyHref);
  const canonical = new URL(study.legacyHref, "https://agentlab.dairui1.com").href;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url=${destination}">
  <title>${esc(study.title)} · AgentLab</title>
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="icon" type="image/png" href="/assets/agentlab-mark.png">
  <script src="/site-theme.js"></script>
  <script src="/site-navigation.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/site-theme.css">
  <link rel="stylesheet" href="/site-theme-compat.css">
</head>
<body data-guide-redirect="${destination}">
  <header class="topbar"><a class="brand" href="/" aria-label="AgentLab 首页"><img src="/assets/agentlab-mark.png" alt="" width="28" height="28"><strong>AgentLab</strong></a><agentlab-navigation current="${navigationIds[study.id] || study.id}"></agentlab-navigation></header>
  <main class="app-shell"><h1>${esc(study.title)}</h1><p><a href="${destination}">打开原专题</a></p></main>
  <script src="/vendor/lucide/lucide.min.js"></script>
  <script src="/research-guide-redirect.js"></script>
</body>
</html>
`;
}
function build({ partial = false } = {}) {
  const index = read("research-index.json");
  const guides = [];
  const directory = path.join(publicRoot, "guides");
  fs.mkdirSync(directory, { recursive: true });
  for (const study of index.studies) {
    if (["pi-durable", "pi-durable-guide"].includes(study.id)) continue;
    if (!study.guideData) {
      fs.writeFileSync(path.join(directory, `${study.id}.html`), renderRedirect(study));
      continue;
    }
    const file = path.join(publicRoot, study.guideData.slice(1));
    if (partial && !fs.existsSync(file)) continue;
    const guide = JSON.parse(fs.readFileSync(file, "utf8"));
    const records = recordsFor(study);
    const counts = validate(guide, study, records);
    const html = render(guide, study, records);
    fs.writeFileSync(path.join(directory, `${guide.id}.html`), html);
    guides.push({ id: guide.id, ...counts, sha256: createHash("sha256").update(html).digest("hex") });
  }
  console.log(`Built ${guides.length} reading guides, ${guides.reduce((sum, guide) => sum + guide.models, 0)} teaching models.`);
  return guides;
}
if (require.main === module) build({ partial: process.argv.includes("--partial") });
module.exports = { build, validate, render, renderRedirect, recordsFor };
