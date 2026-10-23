import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(app, "content/dquickts-code-mode");
const publicRoot = path.join(app, "public");
const output = path.join(publicRoot, "studies/dquickts-code-mode");
const receipt = JSON.parse(readFileSync(path.join(source, "receipts.json"), "utf8"));
const markdown = readFileSync(path.join(source, "study.md"), "utf8");
const hash = value => createHash("sha256").update(value).digest("hex");
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const files = {
  "results.json": receipt.core,
  "wasm-results.json": receipt.wasm,
  "monty-results.json": receipt.monty,
  "repl-results.json": receipt.repl,
  "sources.json": receipt.sources,
};
mkdirSync(output, { recursive: true });
for (const [name, data] of Object.entries(files)) writeFileSync(path.join(output, name), `${JSON.stringify(data, null, 2)}\n`);
for (const name of ["host.c", "run.mjs", "wasm-check.mjs", "monty-check.mjs", "repl-check.mjs"]) copyFileSync(path.join(source, name), path.join(output, name));
writeFileSync(path.join(output, "study.md"), markdown);

const recordHash = name => hash(readFileSync(path.join(output, name)));
const definitions = [
  ["跨进程恢复闭包和对象身份", "进程结束后恢复暂停中的调用，结果保留共享引用、闭包计数与工具返回值。", "results.json", "checks: cross-process-resume-closure-and-alias", "模拟工具，不是外部服务或模型任务。"],
  ["恢复不会继承内存上限", "8 MiB 上限不在快照内，新 runtime 读取后仍为默认无限值；继续前由宿主重设。", "results.json", "checks: cross-process-resume-closure-and-alias.stderr", "文档规定的宿主配置边界，不是已确认的沙箱逃逸。"],
  ["调换 native 顺序会改变绑定", "同数量注册表中对调 alpha/beta，快照仍被接受，输出位置随之对调。", "results.json", "checks: swapped-native-order-is-not-rejected", "这是宿主违反相同顺序契约的实验；应用应另外校验工具 ABI。"],
  ["挂起请求不等于硬超时", "native map 回调中的挂起调用被拒绝；其死循环由第五次硬中断终止，并未挂起。", "results.json", "checks: durable-call-inside-native-map-is-rejected; suspension-request-in-map-needs-hard-interrupt", "有限定向样例，不是所有 safepoint 路径的穷举。"],
  ["WASM 可以桥接异步工具", "0.32.0 的 Promise job pump 与 Asyncify 两种绑定均得到 42。", "wasm-results.json", "checks: async-host-tool-with-promise-job-pump; asyncify-sync-looking-call-resumes-in-same-process", "仅同一活进程继续，没有验证持久快照。"],
  ["Monty 也能跨进程续跑", "1.3.0 在工具调用处 dump，新进程恢复共享对象与闭包，输出 [true,42,2,41]。", "monty-results.json", "checks: cross-process-closure-and-alias-resume", "Python 程序与 JS 程序序列化范围不同，不比较压缩率。"],
  ["Monty 的类型检查可以先拒绝代码", "显式启用 typeCheck 后拒绝 int/string 冲突；会话仍能继续计算。", "monty-results.json", "checks: optional-type-check-rejects-mismatch; session-survives-type-error", "只验证一个类型错误，不代表任意代码都安全。"],
  ["启动与长计算的胜负不同", "同机新进程测试中 dquickts 启动更轻；千万次循环下 Node/Deno 更快。", "results.json", "timings; workloads; environment", "每组合 15 个计时样本，未测试常驻 isolate、快照延迟或生产负载。"],
  ["快照可以重复恢复", "dquickts 与 Monty 同一份保存状态都能被新进程再次加载。", "results.json", "checks: same-snapshot-can-be-resumed-again", "不提供全局单次消费或外部副作用 exactly-once 保证。"],
  ["远端 CI 不是全绿", "固定提交 20 个 jobs 中 19 个成功，linux/s390x 测试失败。", "sources.json", "dquicktsCi[0].jobs", "未定位失败根因，也不把其他成功 jobs 当成 snapshot 专项覆盖。"],
  ["TS 解析不包含类型检查", "number 注解绑定字符串仍成功执行并输出 string。", "results.json", "checks: typescript-does-not-typecheck", "类型语法支持不等于运行时参数验证。"],
  ["本地上游测试集通过", "make test 与 make test-snapshot 均退出成功；日志摘要保留在回执。", "results.json", "checks: upstream-builtins; upstream-snapshots", "未运行完整 test262、Rust、sanitizer 或 fuzzing；本地日志全文不公开。"],
  ["持久 REPL 正常重启后继续", "TS class 实例第一次计数为 41，显式退出并重启后继续到 42。", "repl-results.json", "checks: restore-session-in-new-process", "不是 SIGKILL/断电验收；EOF-only 驱动超时后改用明确退出命令。"],
];
const evidence = definitions.map(([title, statement, file, locator, boundary], index) => ({
  id: `DQ-${String(index + 1).padStart(2, "0")}`, title, statement, boundary,
  kind: "observation", confidence: "high", evidenceLabel: file === "sources.json" ? "公开 CI 记录" : "本地机制实验",
  artifact: `studies/dquickts-code-mode/${file}`, locator, sha256: recordHash(file),
  source: { label: "查看固定回执", url: `/studies/dquickts-code-mode/${file}` },
}));
const unknowns = [
  ["恶意快照与沙箱攻击", "没有安全审计、攻击性快照或逃逸测试。", "可信快照来源验证与独立安全评估。"],
  ["真实业务副作用", "模拟工具没有覆盖远程请求已成功但本地回执丢失的窗口。", "真实幂等服务及中途崩溃注入。"],
  ["快照随堆规模增长的代价", "没有扫描不同堆大小的快照 CPU、恢复延迟和驻留内存。", "堆规模、对象变更比例和并发会话矩阵。"],
  ["版本升级与跨架构", "仅同构建本机恢复，未验证升级迁移和不同架构。", "宿主 ABI 固定与版本迁移矩阵。"],
  ["模型任务收益", "没有实测 token 成本、成功率或真实模型 E2E。", "匹配模型与工具任务的受控对照。"],
  ["其他系统的性能", "Cloudflare、isolated-vm、Temporal 和 E2B 仅作来源比较。", "各系统部署后使用同一业务工作负载。"],
].map(([title, text, needed], index) => ({ id: `DQ-U-${index + 1}`, title, text, needed }));
writeFileSync(path.join(publicRoot, "capabilities/dquickts-code-mode.json"), `${JSON.stringify({ id: "dquickts-code-mode", title: "dquickts 与 Code Mode 执行环境", verifiedAt: "2026-10-23", evidence, unknowns }, null, 2)}\n`);

const sections = [
  ["judgment", "研究判断"], ["code-mode", "执行需求"], ["mechanism", "快照机制"], ["recovery", "恢复实测"],
  ["comparison", "方案比较"], ["performance", "性能计时"], ["delta", "增量快照"], ["transactions", "事务边界"],
  ["maturity", "成熟度"], ["choice", "选型结论"], ["reproduce", "复现材料"],
];
let section = -1;
const renderer = new marked.Renderer();
renderer.html = () => { throw new Error("Raw HTML is not allowed in the research source"); };
renderer.heading = function (token) {
  if (token.depth === 1) return "";
  if (token.depth === 2) {
    section++;
    assert.ok(sections[section], "unexpected article section");
    return `${section > 0 ? "</section>" : ""}<section id="${sections[section][0]}" data-article-section><h2>${this.parser.parseInline(token.tokens)}</h2>\n`;
  }
  return `<h${token.depth}>${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
};
renderer.link = function (token) {
  let href = token.href;
  if (Object.hasOwn(files, href) || ["host.c", "run.mjs", "wasm-check.mjs", "monty-check.mjs", "repl-check.mjs"].includes(href)) href = `/studies/dquickts-code-mode/${href}`;
  assert.ok(href.startsWith("https://") || (href.startsWith("/") && !href.startsWith("//")), `unsafe article link: ${href}`);
  return `<a href="${escape(href)}"${href.startsWith("https:") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${this.parser.parseInline(token.tokens)}</a>`;
};
const table = renderer.table.bind(renderer);
renderer.table = token => `<div class="article-table-wrap" role="region" aria-label="比较数据" tabindex="0">${table(token).replace("<table>", '<table class="article-table">')}</div>`;
const code = renderer.code.bind(renderer);
renderer.code = token => code(token).replace("<pre>", '<pre tabindex="0">');
const tokens = marked.lexer(markdown);
// The page header owns the source title and its version/date paragraph.
const firstSection = tokens.findIndex(token => token.type === "heading" && token.depth === 2);
let body = marked.parser(tokens.slice(firstSection), { renderer }) + "</section>";
assert.equal(section + 1, sections.length);
const chartEngines = ["dquickts", "QuickJS-2026-06-04", "Node-24.14.0", "Deno-2.7.5"];
const chart = `<figure class="dq-benchmark"><figcaption>相同代码，新进程端到端中位数 · ms</figcaption><div class="dq-chart-panels">${[["startup", "启动并输出", 20], ["loop10m", "千万次数值循环", 180]].map(([workload, label, max]) => `<div class="dq-chart-panel"><h3>${label}</h3>${chartEngines.map((engine, i) => {
  const t = receipt.core.timings.find(row => row.workload === workload && row.engine === engine);
  return `<div class="dq-chart-row"><span>${["dquickts", "QuickJS", "Node", "Deno"][i]}</span><div class="dq-bar-track"><span class="dq-bar dq-series-${i}" style="width:${(t.medianMs / max * 100).toFixed(3)}%"></span></div><strong>${t.medianMs.toFixed(2)}</strong></div>`;
}).join("")}</div>`).join("")}</div></figure>`;
const performanceHeading = '<section id="performance" data-article-section><h2>性能实测：短任务受启动影响，长计算会反转</h2>';
assert.ok(body.includes(performanceHeading));
body = body.replace(performanceHeading, performanceHeading + chart);
const title = "dquickts 为什么适合 Code Mode";
const description = "独立比较 dquickts、Monty、QuickJS-WASM、V8 与 Cloudflare：跨进程恢复实测、16 组计时和宿主权限边界。";
const toc = sections.map(([id, label], i) => `<li><a href="#${id}" data-index="${String(i + 1).padStart(2, "0")}">${label}</a></li>`).join("");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${title} · AgentLab</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="https://agentlab.dairui1.com/capabilities/dquickts-code-mode">
  <link rel="icon" type="image/png" href="/assets/agentlab-mark.png">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <script src="/site-theme.js"></script>
  <script src="/site-navigation.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/capability-article.css?v=3">
  <link rel="stylesheet" href="/dquickts-study.css">
  <link rel="stylesheet" href="/site-theme.css">
  <link rel="stylesheet" href="/site-theme-compat.css">
</head>
<body class="article-page dq-study">
  <a class="dq-skip" href="#articleBody">跳到正文</a>
  <div class="article-progress" data-reading-progress aria-hidden="true"><span></span></div>
  <div class="app-shell article-shell">
    <header class="topbar"><a class="brand" href="/" aria-label="AgentLab 首页"><span class="brand-mark"><img src="/assets/agentlab-mark.png" alt="" width="28" height="28"></span><strong class="brand-copy">AgentLab</strong></a><agentlab-navigation current="dquickts"></agentlab-navigation></header>
    <main>
      <header class="article-hero"><div class="article-hero-inner">
        <nav class="article-breadcrumb" aria-label="面包屑"><a href="/capabilities.html" data-catalog-back>专题研究</a><span aria-hidden="true">/</span><span>执行环境比较</span></nav>
        <h1>${title}</h1>
        <p class="article-dek">不是更快的 eval，而是可以保存的程序状态。比较恢复语义、宿主权限与运行成本。</p>
        <div class="article-byline"><time datetime="2026-10-23">2026-10-23</time><span>固定源码 + 本地机制实验</span><span>f9a3efaa · QuickJS 2026-06-04</span></div>
      </div></header>
      <div class="capability-reading">
        <aside class="article-toc" data-article-toc aria-label="文章目录"><span>执行环境比较</span><ol>${toc}</ol></aside>
        <article class="capability-article" id="articleBody" tabindex="-1">${body}</article>
      </div>
      <footer class="dq-footer"><a href="/capabilities.html" data-catalog-back>全部专题</a><a href="/capabilities.html?study=dquickts-code-mode">证据与待验证项</a><a href="/studies/dquickts-code-mode/study.md" download>Markdown 原文</a></footer>
    </main>
  </div>
  <script src="/vendor/lucide/lucide.min.js"></script>
  <script src="/capability-article.js"></script>
  <script src="/dquickts-study.js"></script>
</body>
</html>
`;
writeFileSync(path.join(publicRoot, "capabilities/dquickts-code-mode.html"), html);
console.log(`Built dquickts comparison: ${sections.length} sections, ${evidence.length} evidence records, ${receipt.core.timings.length} timing groups.`);
