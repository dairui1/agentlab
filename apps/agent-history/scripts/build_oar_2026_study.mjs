import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(app, "content/oar");
const publicRoot = path.join(app, "public");
const out = path.join(publicRoot, "studies/oar-2026");
const markdown = readFileSync(path.join(source, "research-2026-10-29.md"), "utf8");
const receipt = JSON.parse(readFileSync(path.join(source, "probe-2026-10-29.json"), "utf8"));
const evidenceReceipt = JSON.parse(readFileSync(path.join(source, "evidence-2026-10-29.json"), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(evidenceReceipt.articleSha256, hash(markdown), "OAR manuscript and evidence receipt disagree");
assert.equal(receipt.revision, evidenceReceipt.revision);
assert.equal(receipt.results.length, 6);
assert.ok(receipt.results.every((item) => item.passed));
mkdirSync(out, { recursive: true });
for (const name of ["research-2026-10-29.md", "README.md", "probe-2026-10-29.mjs", "probe-2026-10-29.json", "evidence-2026-10-29.json", "capture-evidence.mjs"]) copyFileSync(path.join(source, name), path.join(out, name));
const descriptions = [
  ["超时不是硬截止", "10 ms 超时后发出 abort；100 ms 观察时仍未结束，合成退出后才返回。", "合成适配器，不是厂商实际卡死复现。"],
  ["报告回调不是交付回执", "父会话已退出时报告投递被拒，回调返回后报告不在未读列表。", "仅为本地合成会话，宿主可另行保存报告。"],
  ["运行上限不限制空闲会话", "maxRunning 为 1，三个任务串行结束后仍保留三个空闲会话。", "未测真实进程内存或生产负载。"],
  ["不支持 env 的 runtime 不能作为 crew 子会话", "合成 runtime 声明拒绝 env 时，spawn 在打开会话前返回 open_failed。", "这是针对该声明的合成合同检查。"],
  ["扁平事件的 seq 可以重复", "同一原生 frame 的两条事件共享一个 seq。", "seq 是记录位置，不是扁平事件唯一 ID。"],
  ["子会话结束不结束父会话", "独立子会话的结束记录不满足根会话的结束等待。", "合成事件，不是实测 Codex 子线程。"],
];
const sha = hash(readFileSync(path.join(out, "probe-2026-10-29.json")));
const evidence = descriptions.map(([title, statement, boundary], i) => ({ id: `OAR26-0${i + 1}`, title, statement, boundary, kind: "observation", confidence: "high", evidenceLabel: "本地合成探针", artifact: "studies/oar-2026/probe-2026-10-29.json", locator: `results: ${receipt.results[i].id}`, sha256: sha, source: { label: "查看合成探针回执", url: "/studies/oar-2026/probe-2026-10-29.json" } }));
const unknowns = [
  ["真实 Agent 任务", "本次没有真实账号、模型任务或跨 runtime 质量对照。", "在隔离环境运行对应版本和真实任务。"],
  ["崩溃后的外部副作用", "本次没有独立复现进程崩溃和外部服务执行状态。", "注入故障并核对目标系统的幂等与状态。"],
  ["权限与隔离", "没有独立安全审计或操作系统隔离验收。", "使用受限账户、隔离环境和攻击性测试。"],
  ["长期资源开销", "没有本地生产规模长会话或并发性能测试。", "按目标负载测量内存、进程和延迟。"],
].map(([title, text, needed], i) => ({ id: `OAR26-U-${i + 1}`, title, text, needed }));
writeFileSync(path.join(publicRoot, "capabilities/oar-2026.json"), JSON.stringify({ id: "oar-2026", title: "OAR：多 Agent 接入与可靠性", verifiedAt: "2026-10-29", evidence, unknowns }, null, 2) + "\n");
const labels = ["项目定位", "记录与状态", "运行时能力", "跨 Agent 编排", "恢复与停止", "权限与凭据", "验证与成本", "方案选择", "独立验证", "最终判断"];
const ids = ["position", "records", "runtimes", "orchestration", "recovery", "security", "engineering", "comparison", "verification", "verdict"];
let section = -1;
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const renderer = new marked.Renderer();
renderer.html = () => { throw new Error("Raw HTML is not allowed in the OAR manuscript"); };
renderer.heading = function (token) {
  if (token.depth === 1) return "";
  if (token.depth === 2) { section++; assert.ok(ids[section]); return `${section ? "</section>" : ""}<section id="${ids[section]}" data-article-section><h2>${this.parser.parseInline(token.tokens)}</h2>\n`; }
  return `<h${token.depth}>${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
};
renderer.link = function (token) {
  const href = token.href.startsWith("https://") ? token.href : `/studies/oar-2026/${token.href}`;
  assert.ok(href.startsWith("https://") || /^\/studies\/oar-2026\/[a-zA-Z0-9._-]+$/u.test(href), `unsafe article link: ${href}`);
  return `<a href="${esc(href)}"${href.startsWith("https:") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${this.parser.parseInline(token.tokens)}</a>`;
};
const table = renderer.table.bind(renderer);
renderer.table = (token) => `<div class="article-table-wrap" role="region" aria-label="研究数据" tabindex="0">${table(token).replace("<table>", '<table class="article-table">')}</div>`;
const tokens = marked.lexer(markdown);
const first = tokens.findIndex((token) => token.type === "heading" && token.depth === 2);
const introduction = marked.parser(tokens.slice(1, first), { renderer });
const body = marked.parser(tokens.slice(first), { renderer }) + "</section>";
assert.equal(section + 1, ids.length);
const toc = ids.map((id, i) => `<li><a href="#${id}" data-index="${String(i + 1).padStart(2, "0")}">${labels[i]}</a></li>`).join("");
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>OAR：多 Agent 接入与可靠性 · AgentLab</title><meta name="description" content="源码、合成探针与公开实验：多 Agent 统一接入后的投递、恢复、权限与资源边界。"><link rel="canonical" href="https://agentlab.dairui1.com/capabilities/oar-2026"><link rel="icon" href="/assets/agentlab-mark.png"><script src="/site-theme.js"></script><script src="/site-navigation.js"></script><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/capability-article.css?v=3"><link rel="stylesheet" href="/site-theme.css"><link rel="stylesheet" href="/site-theme-compat.css"></head>
<body class="article-page"><div class="article-progress" data-reading-progress aria-hidden="true"><span></span></div><div class="app-shell article-shell"><header class="topbar"><a class="brand" href="/" aria-label="AgentLab 首页"><span class="brand-mark"><img src="/assets/agentlab-mark.png" alt="" width="28" height="28"></span><strong class="brand-copy">AgentLab</strong></a><agentlab-navigation current="oar"></agentlab-navigation></header><main><header class="article-hero"><div class="article-hero-inner"><nav class="article-breadcrumb" aria-label="面包屑"><a href="/capabilities.html">专题研究</a><span aria-hidden="true">/</span><span>OAR</span></nav><h1>OAR：多 Agent 接入与可靠性</h1><p class="article-dek">统一接口之后，输入投递、恢复和权限仍由谁负责？</p><div class="article-byline"><time datetime="2026-10-29">2026-10-29</time><span>固定源码与合成探针</span><span>v0.75.0 · main 5532d7b</span></div></div></header><div class="capability-reading"><aside class="article-toc" data-article-toc aria-label="文章目录"><span>OAR 专题</span><ol>${toc}</ol></aside><article class="capability-article" id="articleBody">${introduction}<p><a href="/capabilities/oar.html">阅读 v0.10.2 历史研究</a></p>${body}</article></div><footer><a href="/capabilities.html?study=oar-2026">查看证据与待验证问题</a> · <a href="/studies/oar-2026/research-2026-10-29.md">Markdown 原文</a></footer></main></div><script src="/vendor/lucide/lucide.min.js"></script><script src="/capability-article.js"></script></body></html>\n`;
writeFileSync(path.join(publicRoot, "capabilities/oar-2026.html"), html);
console.log(`Built OAR 2026 research: ${ids.length} sections, ${evidence.length} evidence records.`);
