const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const publicRoot = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");

const indexHtml = read("index.html");
const mechanismsHtml = read("mechanisms.html");
const capabilitiesHtml = read("capabilities.html");
const articleStyles = read("capability-article.css");
const articleScript = read("capability-article.js");
const computerUseLabStyles = read("computer-use-lab.css");
const computerUseLabScript = read("computer-use-lab.js");
const computerUseLabCoreSource = read("computer-use-lab-core.js");
const computerUseLabCore = require("../public/computer-use-lab-core.js");
const goalModeLabStyles = read("goal-mode-lab.css");
const goalModeLabScript = read("goal-mode-lab.js");
const goalModeLabCoreSource = read("goal-mode-lab-core.js");
const goalModeLabCore = require("../public/goal-mode-lab-core.js");
const deAiSkill = fs.readFileSync(path.resolve(__dirname, "../../../.codex/skills/de-ai-ify/SKILL.md"), "utf8");
const articles = {
  "browser-use": read("capabilities/browser-use.html"),
  "computer-use": read("capabilities/computer-use.html"),
  "goal-mode": read("capabilities/goal-mode.html"),
};
const studies = {
  "browser-use": JSON.parse(read("capabilities/browser-use.json")),
  "computer-use": JSON.parse(read("capabilities/computer-use.json")),
  "goal-mode": JSON.parse(read("capabilities/goal-mode.json")),
};

function navFragment(html) {
  return html.match(/<div\b[^>]*class="[^"]*\bmode-switch\b[^"]*"[^>]*>[\s\S]*?<\/div>/)?.[0] || "";
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
    attributes[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}

function elements(html, tag) {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  return [...html.matchAll(pattern)].map((match) => ({
    source: match[0],
    attributes: parseAttributes(match[1]),
  }));
}

function hasClass(element, className) {
  return (element.attributes.class || "").split(/\s+/).includes(className);
}

function articleSectionIds(html) {
  return elements(html, "section")
    .filter((element) => Object.hasOwn(element.attributes, "data-article-section"))
    .map((element) => element.attributes.id);
}

function plainText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function evidenceRefs(html) {
  const refs = [];
  for (const tag of ["button", "a", "span", "li", "article"]) {
    for (const element of elements(html, tag)) {
      const value = element.attributes["data-evidence"] || element.attributes["data-evidence-trigger"];
      if (value) refs.push(...value.split(/[\s,]+/).filter(Boolean));
    }
  }
  return [...new Set(refs)];
}

function collectClaimRefs(value, target = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectClaimRefs(item, target));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "claims" && Array.isArray(item)) {
        target.push(...item.filter((entry) => typeof entry === "string"));
      } else if (key !== "evidence") {
        collectClaimRefs(item, target);
      }
    }
  }
  return target;
}

function assertSafeRelativePath(value, label) {
  assert.equal(typeof value, "string", `${label} path is not a string`);
  assert.ok(value.trim(), `${label} path is empty`);
  assert.equal(path.isAbsolute(value), false, `${label} exposes an absolute path`);
  assert.doesNotMatch(value, /^(?:file:|[a-z]+:\/\/|[A-Za-z]:[\\/])/, `${label} exposes a URI or drive path`);
  assert.doesNotMatch(value, /(?:^|[\\/])\.\.(?:[\\/]|$)/, `${label} escapes the artifact root`);
  assert.doesNotMatch(value, /^\/Users\//, `${label} exposes a user-specific path`);
}

function assertUnknowns(study, prefix) {
  assert.ok(Array.isArray(study.unknowns) && study.unknowns.length >= 3, `${study.id} needs explicit unknowns`);
  assert.equal(new Set(study.unknowns.map((item) => item.id)).size, study.unknowns.length, `${study.id} has duplicate unknown IDs`);
  for (const unknown of study.unknowns) {
    assert.match(unknown.id, new RegExp(`^${prefix}-KU-\\d{2}$`));
    for (const field of ["title", "text", "needed"]) {
      assert.ok(typeof unknown[field] === "string" && unknown[field].trim(), `${unknown.id} lacks ${field}`);
    }
  }
}

function assertEvidence(study, prefix) {
  assert.ok(Array.isArray(study.evidence) && study.evidence.length >= 8, `${study.id} has too little evidence`);
  const ids = study.evidence.map((claim) => claim.id);
  assert.equal(new Set(ids).size, ids.length, `${study.id} has duplicate evidence IDs`);
  assert.ok(study.evidence.some((claim) => claim.kind === "observation"), `${study.id} lacks observations`);
  assert.ok(study.evidence.some((claim) => claim.kind === "inference"), `${study.id} lacks bounded inferences`);

  for (const claim of study.evidence) {
    assert.match(claim.id, new RegExp(`^${prefix}-\\d{2}$`));
    assert.ok(["observation", "inference"].includes(claim.kind), `${claim.id} has an invalid kind`);
    assert.ok(["high", "medium", "low"].includes(claim.confidence), `${claim.id} has an invalid confidence`);
    for (const field of ["title", "statement", "artifact", "locator", "boundary"]) {
      assert.ok(typeof claim[field] === "string" && claim[field].trim(), `${claim.id} lacks ${field}`);
    }
    assert.match(claim.sha256, /^[a-f0-9]{64}$/, `${claim.id} is not pinned to a SHA-256 digest`);
    assertSafeRelativePath(claim.artifact, claim.id);
    assert.doesNotMatch(claim.statement, /(?:完整|官方)源码(?:证明|确认|显示)|已证明内部实现/);
    if (claim.kind === "inference") {
      assert.match(claim.boundary, /不证明|未验证|不能|无法|推断|未知|尚需|仅能|只说明|不等于/, `${claim.id} lacks an inference boundary`);
    }
  }
}

test("the index, mechanism archive, library, and all three articles expose four top-level sections", () => {
  const labels = ["更新情报", "版本比较", "机制档案", "能力拆解"];
  const pages = [
    ["index", indexHtml],
    ["mechanisms", mechanismsHtml],
    ["capabilities", capabilitiesHtml],
    ...Object.entries(articles),
  ];

  for (const [name, html] of pages) {
    const navigation = navFragment(html);
    assert.ok(navigation, `${name} is missing the top-level navigation`);
    for (const label of labels) assert.match(navigation, new RegExp(`>${label}<`), `${name} is missing ${label}`);
    assert.match(navigation, /href="\/mechanisms\.html"/);
    assert.match(navigation, /href="\/capabilities\.html"/);
  }

  assert.match(mechanismsHtml, /href="\/mechanisms\.html" aria-current="page"/);
  assert.doesNotMatch(mechanismsHtml, /href="\/capabilities\.html" aria-current="page"/);
  for (const html of [capabilitiesHtml, ...Object.values(articles)]) {
    assert.match(html, /href="\/capabilities\.html" aria-current="page"/);
    assert.doesNotMatch(html, /href="\/mechanisms\.html" aria-current="page"/);
  }
});

test("the capability landing page is an ordered three-article library, not the old workbench", () => {
  assert.ok(elements(capabilitiesHtml, "main").some((element) => hasClass(element, "capability-library")));
  assert.ok(elements(capabilitiesHtml, "header").some((element) => hasClass(element, "library-intro")));
  assert.ok(elements(capabilitiesHtml, "ol").some((element) => hasClass(element, "article-list")));

  const entries = elements(capabilitiesHtml, "li").filter((element) => hasClass(element, "article-entry"));
  const links = elements(capabilitiesHtml, "a").filter((element) => hasClass(element, "article-link"));
  assert.equal(entries.length, 3);
  assert.deepEqual(links.map((link) => link.attributes.href), [
    "/capabilities/browser-use.html",
    "/capabilities/computer-use.html",
    "/capabilities/goal-mode.html",
  ]);
  assert.equal(new Set(links.map((link) => link.attributes.href)).size, links.length);
  assert.equal(elements(capabilitiesHtml, "dl").filter((element) => hasClass(element, "article-meta")).length, 3);
  assert.deepEqual(
    elements(capabilitiesHtml, "span")
      .filter((element) => hasClass(element, "article-status"))
      .map((element) => element.attributes["data-status"]),
    ["active", "maintained", "active"],
  );

  assert.match(capabilitiesHtml, /href="\/capabilities-index\.css"/);
  assert.doesNotMatch(capabilitiesHtml, /capabilityApp|capabilityTabs|capabilityWorkspace|role="tablist"/);
  assert.doesNotMatch(capabilitiesHtml, /capabilities-(?:core\.)?js|capabilities\.js|capabilities\.css/);
});

test("all three capability pages are long semantic articles with complete sticky-table-of-contents targets", () => {
  for (const [id, html] of Object.entries(articles)) {
    const body = elements(html, "body")[0];
    assert.equal(body.attributes["data-evidence-source"], `/capabilities/${id}.json`);
    assert.ok(Object.hasOwn(body.attributes, "data-evidence-source"));
    assert.match(html, /href="\/capability-article\.css"/);
    assert.match(html, /src="\/capability-article\.js"/);
    assert.equal(elements(html, "main").length, 1, `${id} must have one semantic main region`);
    assert.match(html, /class="[^"]*\bcapability-reading\b/);
    assert.ok(elements(html, "article").some((element) => hasClass(element, "capability-article")));

    const sectionIds = articleSectionIds(html);
    assert.ok(sectionIds.length >= 10, `${id} is not a skyscraper article`);
    assert.ok(sectionIds.every(Boolean), `${id} has an article section without an id`);
    assert.equal(new Set(sectionIds).size, sectionIds.length, `${id} has duplicate section ids`);

    const tocMatch = html.match(/<(nav|aside)\b[^>]*id="articleToc"[^>]*>[\s\S]*?<\/\1>/i);
    assert.ok(tocMatch, `${id} lacks a semantic article TOC`);
    const toc = tocMatch[0];
    const tocElement = elements(toc, tocMatch[1])[0];
    assert.ok(Object.hasOwn(tocElement.attributes, "data-article-toc"));
    assert.ok(tocElement.attributes["aria-label"], `${id} TOC lacks an accessible name`);
    const tocTargets = elements(toc, "a").map((link) => link.attributes.href).filter((href) => href?.startsWith("#")).map((href) => href.slice(1));
    assert.deepEqual(tocTargets, sectionIds, `${id} TOC and article sections diverged`);

    assert.ok(elements(html, "div").some((element) => element.attributes.id === "articleProgress" && Object.hasOwn(element.attributes, "data-reading-progress")));
    assert.ok(elements(html, "div").some((element) => Object.hasOwn(element.attributes, "data-article-tabs")));
    assert.ok(elements(html, "button").some((element) => Object.hasOwn(element.attributes, "data-evidence-trigger")));
  }
});

test("Computer Use headings form one implementation map instead of unrelated editorial hooks", () => {
  const html = articles["computer-use"];
  const toc = html.match(/<aside\b[^>]*id="articleToc"[^>]*>[\s\S]*?<\/aside>/i)?.[0] || "";
  const tocTitles = [...toc.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => plainText(match[1]));
  const sectionTitles = [...html.matchAll(/<section\b[^>]*data-article-section[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>/gi)]
    .map((match) => plainText(match[1]));

  assert.match(html, /<span class="article-series">实现拆解 · 能力档案 002<\/span>/);
  assert.match(html, /<h1>Codex Computer Use<\/h1>/);
  assert.deepEqual(articleSectionIds(html), [
    "thesis",
    "two-entries",
    "trusted-runtime",
    "permission-stack",
    "policy-roundtrip",
    "observation-model",
    "action-surface",
    "feedback-loop",
    "failure-model",
    "adjacent-channels",
    "release-anatomy",
    "open-questions",
  ]);
  assert.deepEqual(tocTitles, sectionTitles, "TOC and section headings should use the same implementation labels");
  assert.deepEqual(sectionTitles.map((title) => title.split("：")[0]), [
    "整体架构",
    "调用入口",
    "信任边界",
    "权限模型",
    "App Policy",
    "状态观察",
    "动作接口",
    "执行闭环",
    "故障恢复",
    "相邻组件",
    "证据范围",
    "结论与边界",
  ]);

  assert.doesNotMatch(
    html,
    /下一轮动态实验|这篇会跟着构建继续维护|没变（unchanged）|后续会接着追|这份档案怎么维护/,
    "reader-facing conclusion should not read like an internal research backlog",
  );

  const study = studies["computer-use"];
  assert.deepEqual(study.architecture.map((item) => item.title.split("：")[0]), [
    "入口层", "运行时边界", "适配层", "策略层", "传输层", "服务层", "系统层", "相邻通道",
  ]);
  assert.deepEqual(study.loop.map((item) => item.title.split("：")[0]), [
    "路由", "目标绑定", "授权", "观察", "决策", "动作", "验证", "收束",
  ]);
});

test("Browser Use headings form the same kind of implementation map", () => {
  const html = articles["browser-use"];
  const toc = html.match(/<aside\b[^>]*id="articleToc"[^>]*>[\s\S]*?<\/aside>/i)?.[0] || "";
  const tocTitles = [...toc.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => plainText(match[1]));
  const sectionTitles = [...html.matchAll(/<section\b[^>]*data-article-section[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>/gi)]
    .map((match) => plainText(match[1]));

  assert.match(html, /<span class="article-series">实现拆解 · 能力档案 001<\/span>/);
  assert.deepEqual(tocTitles, sectionTitles, "Browser Use TOC and section headings should use the same implementation labels");
  assert.deepEqual(sectionTitles.map((title) => title.split("：")[0]), [
    "整体模型",
    "后端路由",
    "动作接口",
    "只读执行",
    "信任边界",
    "宿主结构",
    "标签页生命周期",
    "安全策略",
    "Chrome 链路",
    "结果回传",
    "故障恢复",
    "结论与边界",
  ]);
});

test("Goal Mode headings keep the Codex and Claude Code comparison on one control-loop map", () => {
  const html = articles["goal-mode"];
  const toc = html.match(/<aside\b[^>]*id="articleToc"[^>]*>[\s\S]*?<\/aside>/i)?.[0] || "";
  const tocTitles = [...toc.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => plainText(match[1]));
  const sectionTitles = [...html.matchAll(/<section\b[^>]*data-article-section[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>/gi)]
    .map((match) => plainText(match[1]));

  assert.match(html, /<span class="article-series">对比拆解 · 能力档案 003<\/span>/);
  assert.match(html, /<h1>Goal Mode<\/h1>/);
  assert.deepEqual(articleSectionIds(html), [
    "overall-model",
    "product-entry",
    "state-location",
    "codex-stack",
    "codex-continuation",
    "lifecycle-budget",
    "claude-stop-hook",
    "evaluator-vision",
    "resume-semantics",
    "control-loop-lab",
    "completion-authority",
    "conclusion-boundary",
  ]);
  assert.deepEqual(tocTitles, sectionTitles, "Goal Mode TOC and section headings should use the same comparison labels");
  assert.deepEqual(sectionTitles.map((title) => title.split("：")[0]), [
    "整体模型",
    "产品入口",
    "目标状态",
    "Codex 控制面",
    "Codex 续跑",
    "状态与预算",
    "Claude 出口闸",
    "评估视野",
    "恢复语义",
    "控制回路实验",
    "完成权限",
    "结论与边界",
  ]);
});

test("capability pages do not expose internal editorial backlog or maintenance notes", () => {
  const readerFacingCopy = [capabilitiesHtml, ...Object.values(articles)].join("\n");
  assert.doesNotMatch(
    readerFacingCopy,
    /下一轮动态实验|文章采用构建锁定维护|文章持续维护时|下一次版本核验|开放问题与维护|持续维护|后续会接着追|这份档案怎么维护|这篇怎么处理/,
  );
});

test("article evidence inspectors and interactive controls expose accessible static contracts", () => {
  for (const [id, html] of Object.entries(articles)) {
    const inspector = elements(html, "aside").find((element) => element.attributes.id === "articleEvidence");
    const backdrop = elements(html, "div").find((element) => element.attributes.id === "articleEvidenceBackdrop");
    const close = elements(html, "button").find((element) => element.attributes.id === "closeArticleEvidence");
    assert.ok(inspector && Object.hasOwn(inspector.attributes, "data-evidence-inspector"), `${id} lacks the inspector hook`);
    assert.equal(inspector.attributes.role, "dialog");
    assert.ok(inspector.attributes["aria-labelledby"], `${id} inspector lacks a label relationship`);
    assert.equal(inspector.attributes["aria-hidden"], "true");
    assert.ok(backdrop && Object.hasOwn(backdrop.attributes, "hidden"), `${id} lacks a hidden inspector backdrop`);
    assert.ok(close, `${id} lacks an inspector close button`);
    assert.equal(close.attributes.type, "button");
    assert.ok(close.attributes["aria-label"], `${id} close button lacks an accessible name`);

    const triggers = elements(html, "button").filter((element) => Object.hasOwn(element.attributes, "data-evidence-trigger"));
    assert.ok(triggers.length >= 3, `${id} exposes too few evidence entry points`);
    for (const trigger of triggers) {
      assert.equal(trigger.attributes.type, "button");
      assert.ok(trigger.attributes["data-evidence"] || trigger.attributes["data-evidence-trigger"]);
    }

    const tablists = elements(html, "div").filter((element) => Object.hasOwn(element.attributes, "data-article-tabs"));
    assert.ok(tablists.length > 0, `${id} lacks progressive article tabs`);
    assert.ok(elements(html, "div").some((element) => element.attributes.role === "tablist"));
    const tabs = elements(html, "button").filter((element) => element.attributes.role === "tab");
    assert.ok(tabs.length >= 2 && tabs.every((element) => element.attributes["aria-controls"]));
    assert.ok(["div", "section"].some((tag) => elements(html, tag).some((element) => element.attributes.role === "tabpanel")));
  }
});

test("Browser Use uses the new compact evidence-only schema", () => {
  const study = studies["browser-use"];
  assert.deepEqual(Object.keys(study).sort(), [
    "boundary",
    "description",
    "evidence",
    "id",
    "number",
    "product",
    "scope",
    "status",
    "subtitle",
    "title",
    "unknowns",
    "verifiedAt",
  ]);
  assert.equal(study.id, "browser-use");
  assert.equal(study.number, "001");
  for (const field of ["title", "product", "subtitle", "description", "status", "boundary"]) {
    assert.ok(typeof study[field] === "string" && study[field].trim(), `browser-use lacks ${field}`);
  }
  assert.match(study.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(study.scope) && study.scope.length >= 5);
  assert.doesNotMatch(JSON.stringify(Object.keys(study)), /architecture|loop|guardrails|failures|artifacts|defaultView|defaultItem/);
  assertEvidence(study, "BU");
  assertUnknowns(study, "BU");
});

test("Goal Mode uses the compact evidence-only schema with current Codex and Claude sources", () => {
  const study = studies["goal-mode"];
  assert.deepEqual(Object.keys(study).sort(), [
    "boundary",
    "description",
    "evidence",
    "id",
    "number",
    "product",
    "scope",
    "status",
    "subtitle",
    "title",
    "unknowns",
    "verifiedAt",
  ]);
  assert.equal(study.id, "goal-mode");
  assert.equal(study.number, "003");
  for (const field of ["title", "product", "subtitle", "description", "status", "boundary"]) {
    assert.ok(typeof study[field] === "string" && study[field].trim(), `goal-mode lacks ${field}`);
  }
  assert.match(study.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(study.scope) && study.scope.length >= 5);
  assert.doesNotMatch(JSON.stringify(Object.keys(study)), /architecture|loop|guardrails|failures|artifacts|defaultView|defaultItem/);
  assertEvidence(study, "GM");
  assertUnknowns(study, "GM");

  for (const claim of study.evidence) {
    assert.ok(claim.source && typeof claim.source === "object", `${claim.id} lacks a public source`);
    assert.ok(typeof claim.source.label === "string" && claim.source.label.trim(), `${claim.id} lacks a source label`);
    assert.match(claim.source.url, /^https:\/\//, `${claim.id} source must use HTTPS`);
    const sourceUrl = new URL(claim.source.url);
    assert.ok(["github.com", "code.claude.com", "www.npmjs.com"].includes(sourceUrl.hostname), `${claim.id} uses an unexpected source host`);
  }
});

test("Goal Mode publishes product conclusions without exposing the local research trail", () => {
  const publicCopy = [
    articles["goal-mode"],
    JSON.stringify(studies["goal-mode"]),
    goalModeLabCoreSource,
    goalModeLabScript,
  ].join("\n");

  assert.doesNotMatch(publicCopy, /本地缓存|泄露|leaked snapshot|claude-code-leak|发布包逆向|5a774a2|PPT|token target/);
  assert.match(publicCopy, /2\.1\.227/);
  assert.match(publicCopy, /ProposeGoal/);
  assert.match(publicCopy, /task budget|task-budget/);
});

test("Computer Use retains its existing research schema without driving a five-view UI", () => {
  const study = studies["computer-use"];
  assert.equal(study.id, "computer-use");
  assert.ok(typeof study.number === "string" && study.number.trim());
  assertEvidence(study, "CU");
  assertUnknowns(study, "CU");

  const evidenceIds = new Set(study.evidence.map((claim) => claim.id));
  for (const ref of collectClaimRefs(study)) assert.ok(evidenceIds.has(ref), `computer-use has unresolved evidence ${ref}`);
  assert.ok(Array.isArray(study.artifacts) && study.artifacts.length > 0);
  for (const artifact of study.artifacts) {
    assert.ok(artifact.id, "computer-use artifact lacks an id");
    assertSafeRelativePath(artifact.path, artifact.id);
  }
});

test("Computer Use embeds an evidence-backed failure trace instead of another static tab", () => {
  const html = articles["computer-use"];
  const lab = elements(html, "div").find((element) => Object.hasOwn(element.attributes, "data-cua-trace-lab"));
  const selector = elements(html, "select").find((element) => Object.hasOwn(element.attributes, "data-cua-trace-select"));
  const context = elements(html, "p").find((element) => Object.hasOwn(element.attributes, "data-cua-trace-context"));
  const detail = elements(html, "section").find((element) => Object.hasOwn(element.attributes, "data-cua-trace-detail"));
  assert.ok(lab, "computer-use lacks the decision trace");
  assert.equal(lab.attributes["aria-busy"], "true");
  assert.ok(selector?.attributes["aria-label"]);
  assert.ok(context, "computer-use trace lacks scenario context");
  assert.equal(detail?.attributes.role, "tabpanel");
  assert.equal(detail?.attributes["aria-live"], "polite");
  assert.match(html, /href="\/computer-use-lab\.css"/);
  assert.match(html, /src="\/computer-use-lab-core\.js"[\s\S]*src="\/computer-use-lab\.js"[\s\S]*src="\/capability-article\.js"/);

  const study = studies["computer-use"];
  const evidenceIds = new Set(study.evidence.map((claim) => claim.id));
  assert.ok(computerUseLabCore.scenarios.length >= 5);
  for (const scenario of computerUseLabCore.scenarios) {
    const resolved = computerUseLabCore.resolveScenario(study, scenario.id);
    assert.equal(resolved.layers.length, 6);
    assert.ok(resolved.layers.some((layer) => ["blocked", "unknown", "next"].includes(layer.status)));
    for (const layer of resolved.layers) {
      assert.ok(layer.title && layer.known && layer.unknown && layer.next && layer.avoid);
      assert.ok(layer.evidence.length > 0, `${scenario.id}/${layer.id} lacks evidence`);
      for (const claim of layer.evidence) assert.ok(evidenceIds.has(claim), `${scenario.id} links unknown ${claim}`);
    }
  }
});

test("Computer Use trace preserves uncertainty and chooses recovery by failure layer", () => {
  const study = studies["computer-use"];
  const resolve = (id, layer) => computerUseLabCore.resolveScenario(study, id).layers.find((item) => item.id === layer);

  const timeout = resolve("transport-timeout", "act");
  assert.equal(timeout.status, "unknown");
  assert.match(timeout.next, /get_app_state|读回/);
  assert.match(timeout.avoid, /不要.*timeout|不要.*再点|重放/);

  const stale = resolve("stale-element", "observe");
  assert.equal(stale.status, "blocked");
  assert.match(stale.next, /disableDiff=true/);
  assert.match(stale.avoid, /不要.*复用/);

  const forbidden = computerUseLabCore.resolveScenario(study, "policy-forbidden");
  assert.equal(forbidden.layers.find((item) => item.id === "policy").status, "blocked");
  assert.ok(forbidden.layers.slice(2).every((item) => item.status === "skipped"));
  assert.match(forbidden.layers[1].avoid, /别名|坐标|session/);

  const permission = resolve("permissions-pending", "permission");
  assert.equal(permission.status, "blocked");
  assert.match(permission.next, /等用户|系统权限/);
  assert.match(permission.avoid, /不要.*坐标/);

  const axPermission = resolve("ax-gap", "permission");
  assert.equal(axPermission.status, "unknown", "a screenshot alone cannot prove Accessibility permission is healthy");

  assert.deepEqual(
    computerUseLabCore.resolveSelection("https://agentlab.local/?trace=stale-element&traceStep=99"),
    { scenarioId: "stale-element", step: 5 },
  );
  assert.deepEqual(
    computerUseLabCore.resolveSelection("https://agentlab.local/?trace=stale-element"),
    { scenarioId: "stale-element", step: 3 },
  );
  assert.equal(
    computerUseLabCore.resolveSelection("https://agentlab.local/?trace=stale-element&traceStep=4", undefined, 0).step,
    0,
  );
});

test("Computer Use trace renders safely, supports keyboard traversal, and deep-links its state", () => {
  assert.doesNotMatch(computerUseLabScript, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/);
  assert.match(computerUseLabScript, /\.textContent\s*=/);
  assert.match(computerUseLabScript, /agentlab:study-loaded/);
  assert.match(computerUseLabScript, /searchParams\.set\("trace"/);
  assert.match(computerUseLabScript, /searchParams\.set\("traceStep"/);
  assert.match(computerUseLabScript, /event\.key === "ArrowDown"/);
  assert.match(computerUseLabScript, /event\.key === "ArrowUp"/);
  assert.match(computerUseLabScript, /event\.key === "Home"/);
  assert.match(computerUseLabScript, /event\.key === "End"/);
  assert.match(computerUseLabScript, /dataset\.evidence/);
  assert.match(computerUseLabScript, /场景先算通过/);
  assert.match(computerUseLabScript, /study\?\.id !== "computer-use"\) throw new Error/);
  assert.match(articleScript, /new CustomEvent\("agentlab:study-loaded"/);
  assert.match(articleScript, /event\.target\.closest\?\.\("\[data-evidence\]"\)/);

  assert.match(computerUseLabStyles, /\.cua-trace-body\s*\{/);
  assert.match(computerUseLabStyles, /\[data-status="unknown"\]/);
  assert.match(computerUseLabStyles, /@media\s*\(max-width:\s*720px\)/);
  assert.match(computerUseLabStyles, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(computerUseLabStyles, /font-size:\s*clamp\([^;]*(?:vw|vmin|vmax)/);
});

test("Goal Mode embeds an accessible two-lane control-loop lab", () => {
  const html = articles["goal-mode"];
  const lab = elements(html, "div").find((element) => Object.hasOwn(element.attributes, "data-goal-mode-lab"));
  const selector = elements(html, "select").find((element) => Object.hasOwn(element.attributes, "data-goal-case-select"));
  const summary = elements(html, "p").find((element) => Object.hasOwn(element.attributes, "data-goal-case-summary"));
  const tabs = elements(html, "div").find((element) => Object.hasOwn(element.attributes, "data-goal-stage-tabs"));
  const lanes = elements(html, "div").find((element) => Object.hasOwn(element.attributes, "data-goal-lanes"));
  const loading = elements(html, "p").find((element) => Object.hasOwn(element.attributes, "data-goal-loading"));

  assert.ok(lab, "goal-mode lacks the control-loop lab");
  assert.equal(lab.attributes["aria-busy"], "true");
  assert.ok(selector?.attributes["aria-label"]);
  assert.ok(summary, "goal-mode lab lacks scenario context");
  assert.equal(tabs?.attributes.role, "tablist");
  assert.ok(tabs?.attributes["aria-label"]);
  assert.equal(lanes?.attributes.role, "tabpanel");
  assert.equal(lanes?.attributes["aria-live"], "polite");
  assert.equal(loading?.attributes.role, "status");
  assert.match(html, /href="\/goal-mode-lab\.css"/);
  assert.match(html, /src="\/goal-mode-lab-core\.js"[\s\S]*src="\/goal-mode-lab\.js"[\s\S]*src="\/capability-article\.js"/);
});

test("Goal Mode lab models five scenarios through four evidence-backed Codex and Claude stages", () => {
  const study = studies["goal-mode"];
  const evidenceIds = new Set(study.evidence.map((claim) => claim.id));
  assert.deepEqual(goalModeLabCore.stages.map((stage) => stage.id), ["set", "turn-end", "boundary", "next"]);
  assert.equal(goalModeLabCore.scenarios.length, 5);
  assert.deepEqual(goalModeLabCore.scenarios.map((scenario) => scenario.id), [
    "evidence-missing",
    "same-blocker",
    "budget-edge",
    "background-running",
    "resume",
  ]);

  for (const source of goalModeLabCore.scenarios) {
    const scenario = goalModeLabCore.resolveScenario(study, source.id);
    assert.ok(scenario.title && scenario.label && scenario.summary, `${scenario.id} lacks reader-facing context`);
    assert.equal(scenario.stages.length, 4, `${scenario.id} must cover the whole turn boundary`);
    for (const [index, stage] of scenario.stages.entries()) {
      assert.deepEqual(Object.keys(stage).sort(), ["claude", "codex"], `${scenario.id}/${index} must retain two lanes`);
      for (const product of ["codex", "claude"]) {
        const lane = stage[product];
        for (const field of ["status", "title", "known", "consequence", "boundary"]) {
          assert.ok(typeof lane[field] === "string" && lane[field].trim(), `${scenario.id}/${index}/${product} lacks ${field}`);
        }
        assert.ok(Array.isArray(lane.evidence) && lane.evidence.length > 0, `${scenario.id}/${index}/${product} lacks evidence`);
        for (const claim of lane.evidence) {
          assert.ok(evidenceIds.has(claim), `${scenario.id}/${index}/${product} links unknown ${claim}`);
        }
      }
    }
  }
  assert.throws(() => goalModeLabCore.resolveScenario(studies["browser-use"], "resume"), /不是 Goal Mode/);
});

test("Goal Mode lab clamps deep links and preserves the selected comparison state", () => {
  assert.deepEqual(
    goalModeLabCore.resolveSelection("https://agentlab.local/?goalCase=resume&goalStep=99"),
    { scenarioId: "resume", step: 3 },
  );
  assert.deepEqual(
    goalModeLabCore.resolveSelection("https://agentlab.local/?goalCase=same-blocker&goalStep=-7"),
    { scenarioId: "same-blocker", step: 0 },
  );
  assert.deepEqual(
    goalModeLabCore.resolveSelection("https://agentlab.local/?goalCase=missing&goalStep=2"),
    { scenarioId: "evidence-missing", step: 2 },
  );
  assert.deepEqual(
    goalModeLabCore.resolveSelection("https://agentlab.local/", "budget-edge", 1),
    { scenarioId: "budget-edge", step: 1 },
  );
  assert.deepEqual(
    goalModeLabCore.resolveSelection("https://agentlab.local/?goalCase=background-running&goalStep=2"),
    { scenarioId: "background-running", step: 2 },
  );
  assert.equal(goalModeLabCore.clampStep("not-a-step"), 0);
});

test("Goal Mode lab renders with safe DOM APIs, keyboard traversal, URL state, and explicit failures", () => {
  assert.doesNotMatch(goalModeLabScript, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/);
  assert.match(goalModeLabScript, /\.textContent\s*=/);
  assert.match(goalModeLabScript, /\.replaceChildren\s*\(/);
  assert.match(goalModeLabScript, /agentlab:study-loaded/);
  assert.match(goalModeLabScript, /agentlab:study-error/);
  assert.match(goalModeLabScript, /searchParams\.set\("goalCase"/);
  assert.match(goalModeLabScript, /searchParams\.set\("goalStep"/);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"]) {
    assert.match(goalModeLabScript, new RegExp(`event\\.key === "${key}"`), `goal-mode lab ignores ${key}`);
  }
  assert.match(goalModeLabScript, /setAttribute\("role", "tab"\)/);
  assert.match(goalModeLabScript, /setAttribute\("aria-selected"/);
  assert.match(goalModeLabScript, /setAttribute\("aria-controls"/);
  assert.match(goalModeLabScript, /setAttribute\("aria-labelledby"/);
  assert.match(goalModeLabScript, /setAttribute\("aria-busy", "false"\)/);
  assert.match(goalModeLabScript, /dataset\.evidence/);
  assert.match(goalModeLabScript, /data-evidence-trigger/);
  assert.match(goalModeLabScript, /study\?\.id !== "goal-mode"\) throw new Error/);
  assert.match(goalModeLabScript, /dataset\.state = "error"/);
  assert.match(goalModeLabScript, /刷新页面后再试/);

  assert.match(goalModeLabStyles, /\.goal-mode-lanes\s*\{/);
  assert.match(goalModeLabStyles, /grid-template-columns:\s*repeat\(2,/);
  assert.match(goalModeLabStyles, /@media\s*\(max-width:\s*720px\)/);
  assert.match(goalModeLabStyles, /overflow-wrap:\s*anywhere/);
  assert.match(goalModeLabStyles, /\[aria-busy="true"\]/);
  assert.match(goalModeLabStyles, /\[data-state="error"\]/);
  assert.doesNotMatch(goalModeLabStyles, /font-size:\s*clamp\([^;]*(?:vw|vmin|vmax)/);
});

test("Computer Use and Goal Mode copy are covered by the project de-ai-ify writing contract", () => {
  assert.match(deAiSkill, /^name: de-ai-ify$/m);
  assert.match(deAiSkill, /不要编/);
  assert.match(deAiSkill, /HTML[\s\S]*JavaScript[\s\S]*JSON/);
  assert.match(deAiSkill, /标题先帮读者定位/);
  assert.match(deAiSkill, /同一级标题保持同一维度/);

  const visibleCopy = [
    articles["computer-use"],
    JSON.stringify(studies["computer-use"]),
    computerUseLabCoreSource,
    computerUseLabScript,
    articles["goal-mode"],
    JSON.stringify(studies["goal-mode"]),
    goalModeLabCoreSource,
    goalModeLabScript,
    articleScript,
  ].join("\n");

  assert.doesNotMatch(visibleCopy, /首先|其次|综上所述|本文将从|在当今|众所周知|希望本文|谢谢阅读/);
  assert.doesNotMatch(visibleCopy, /我之前也遇到|我亲自(?:试|跑)|我上次用|前几天有个朋友/);
});

test("every article evidence trigger resolves to its own unique dataset", () => {
  const allIds = [];
  for (const [id, html] of Object.entries(articles)) {
    const claimIds = new Set(studies[id].evidence.map((claim) => claim.id));
    const refs = evidenceRefs(html);
    assert.ok(refs.length >= 3, `${id} has no meaningful evidence links`);
    for (const ref of refs) assert.ok(claimIds.has(ref), `${id} links unknown evidence ${ref}`);
    allIds.push(...claimIds);
  }
  assert.equal(new Set(allIds).size, allIds.length, "evidence IDs collide across capability articles");
});

test("shared article JavaScript handles safe rendering, deep links, keyboard use, and copying", () => {
  assert.doesNotMatch(articleScript, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/);
  assert.match(articleScript, /\.textContent\s*=/);
  for (const hook of ["data-reading-progress", "data-article-toc", "data-article-section", "data-article-tabs"]) {
    assert.match(articleScript, new RegExp(hook), `renderer ignores ${hook}`);
  }
  assert.match(articleScript, /dataset\.evidenceSource|data-evidence-source/);
  assert.match(articleScript, /\[data-evidence\]|data-evidence-trigger|dataset\.evidenceTrigger/);
  assert.match(articleScript, /dataset\.evidenceCopy|data-evidence-copy/);
  assert.match(articleScript, /articleEvidence|data-evidence-inspector/);

  assert.match(articleScript, /fetch\s*\(/);
  assert.match(articleScript, /response\.ok/);
  assert.match(articleScript, /new URL\(location\.href\)|new URL\(window\.location\.href\)/);
  assert.match(articleScript, /searchParams\.(?:set|get)\(["']evidence["']/);
  assert.match(articleScript, /searchParams\.delete\(["']evidence["']\)/);
  assert.match(articleScript, /searchParams\.get\(["']evidence["']\)/);
  assert.match(articleScript, /requested[\s\S]*openEvidence\(\[requested\]\)/);
  assert.match(articleScript, /history\.(?:replaceState|pushState)\s*\(/);
  assert.match(articleScript, /event\.key\s*===\s*["']Escape["']/);
  assert.match(articleScript, /event\.key\s*===\s*["']Arrow(?:Left|Right|Up|Down)["']/);
  assert.match(articleScript, /navigator\.clipboard\.writeText\s*\(/);
  assert.match(articleScript, /已复制/);
  assert.match(articleScript, /没复制上，请手动选取/);
  assert.match(articleScript, /requestAnimationFrame\s*\([\s\S]*?\.focus\s*\(/);
  assert.match(articleScript, /renderEvidence\(["']previous["']\)/);
  assert.match(articleScript, /renderEvidence\(["']next["']\)/);
  assert.match(articleScript, /article-evidence-load-error/);
  assert.match(articleScript, /setAttribute\(["']role["'],\s*["']alert["']\)/);
  assert.match(articleScript, /刷新页面后再试/);
  assert.doesNotMatch(articleScript, /missing evidence array/);
  assert.match(articleScript, /claim\.source\?\.url/);
  assert.match(articleScript, /\["https:", "http:"\]\.includes\(sourceUrl\.protocol\)/);
  assert.match(articleScript, /"article-evidence-source"/);
  assert.match(articleScript, /source\.target = "_blank"/);
  assert.match(articleScript, /source\.rel = "noopener noreferrer"/);
  assert.match(articleScript, /setAttribute\(["']aria-modal["'],\s*["']true["']\)/);
  assert.match(articleScript, /aria-hidden/);
  assert.match(articleScript, /\.inert\s*=/);
  assert.match(articleScript, /articleEvidenceBackdrop[\s\S]*addEventListener\(["']click["']/);
  assert.match(articleScript, /IntersectionObserver/);
  assert.match(articleScript, /aria-current/);
});

test("shared article styling keeps the TOC sticky and the long read responsive", () => {
  assert.match(articleStyles, /(?:#articleToc|\.article-toc)[^\{]*\{[^}]*position:\s*sticky/);
  assert.match(articleStyles, /#articleProgress|\.article-progress/);
  assert.match(articleStyles, /#articleEvidence|\.article-evidence/);
  assert.match(articleStyles, /\[data-article-section\]|section\[data-article-section\]/);
  assert.match(articleStyles, /@media\s*\(max-width:/);
  assert.match(articleStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(articleStyles, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(articleStyles, /font-size:\s*clamp\([^;]*(?:vw|vmin|vmax)/);
});

test("external links on the library and articles cannot retain opener access", () => {
  for (const [name, html] of [["capabilities", capabilitiesHtml], ...Object.entries(articles)]) {
    for (const anchor of elements(html, "a").filter((element) => element.attributes.target === "_blank")) {
      const rel = new Set((anchor.attributes.rel || "").split(/\s+/));
      assert.ok(rel.has("noopener") && rel.has("noreferrer"), `${name} has an unsafe external link: ${anchor.source}`);
    }
  }
});
