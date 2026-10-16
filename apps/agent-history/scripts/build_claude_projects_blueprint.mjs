import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Marked, Renderer } from "marked";

const escape = (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderBlueprint(markdown) {
  const toc = [];
  const renderer = new Renderer();
  let openedSection = false;
  renderer.heading = function (token) {
    if (token.depth === 1) return "";
    if (token.depth !== 2) return Renderer.prototype.heading.call(this, token);
    const id = `section-${toc.length + 1}`;
    toc.push({ id, text: token.text.replace(/^\d+\.\s*/, "") });
    const previous = openedSection ? "</section>\n" : "";
    openedSection = true;
    return `${previous}<section id="${id}" data-article-section>\n${Renderer.prototype.heading.call(this, token)}`;
  };
  renderer.table = function (token) { return `<div class="article-table-wrap">${Renderer.prototype.table.call(this, token)}</div>`; };
  renderer.html = () => { throw new Error("Raw HTML is not allowed in the blueprint"); };
  renderer.def = ({ tag, href }) => `<p class="projects-source-ref"><a href="${escape(href)}">${escape(tag)}</a> <code>${escape(new URL(href).hash.slice(1))}</code></p>\n`;
  const marked = new Marked({ renderer, gfm: true, walkTokens(token) {
    if (["link", "image", "def"].includes(token.type)) {
      const url = new URL(token.href, "https://agentlab.dairui1.com");
      assert.equal(url.protocol, "https:", "Only HTTPS or relative links are allowed");
    }
  } });
  const body = marked.parse(markdown) + (openedSection ? "</section>\n" : "");
  assert.ok(toc.length > 0, "Blueprint requires sections");
  const links = toc.map((entry, index) => `<li><a href="#${entry.id}" data-index="${String(index + 1).padStart(2, "0")}">${escape(entry.text)}</a></li>`).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Claude Projects 复刻设计：原创数据模型、事件、异步启动、消息权限、运行适配器、记忆版本、恢复与验收用例。">
  <title>Claude Projects 复刻设计 · AgentLab</title>
  <link rel="icon" type="image/png" href="/assets/agentlab-mark.png">
  <script src="/site-theme.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <script src="/site-navigation.js"></script>
  <link rel="stylesheet" href="/capability-article.css?v=3">
  <link rel="stylesheet" href="/claude-projects.css">
  <link rel="stylesheet" href="/site-theme.css">
  <link rel="stylesheet" href="/site-theme-compat.css">
</head>
<body class="article-page projects-study projects-blueprint">
  <div class="article-progress" data-reading-progress aria-hidden="true"><span></span></div>
  <div class="app-shell article-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="AgentLab 首页"><span class="brand-mark" aria-hidden="true"><img src="/assets/agentlab-mark.png" alt=""></span><strong class="brand-copy">AgentLab</strong></a>
      <agentlab-navigation current="claude-projects" compare-agent="claude-code"></agentlab-navigation>
      <div class="header-links"><a class="icon-button" href="/capabilities/claude-projects-blueprint.md" download aria-label="下载 Markdown 原文" title="下载 Markdown 原文"><i data-lucide="download" aria-hidden="true"></i></a></div>
    </header>
    <main>
      <header class="article-hero"><div class="article-hero-inner">
        <nav class="article-breadcrumb" aria-label="面包屑"><a href="/capabilities/claude-projects.html">Claude Projects 研究</a><i data-lucide="chevron-right" aria-hidden="true"></i><span>复刻设计</span></nav>
        <div class="projects-title"><img src="/agent-icons/claude-code.png" width="48" height="48" alt="Claude Code 标识"><h1>Claude Projects 复刻设计</h1></div>
        <p class="article-dek">从实体和事件开始，逐步实现可追踪、可续接的项目运行系统。</p>
        <div class="article-byline"><span>2026-10-17</span><span>AgentLab 原创设计</span><span>不是 Anthropic 后端源码</span></div>
      </div></header>
      <div class="capability-reading">
        <aside class="article-toc" data-article-toc aria-label="设计文档目录"><span>实现与验收</span><ol>${links}</ol></aside>
        <article class="capability-article" id="articleBody">${body}
          <p><a href="/capabilities/claude-projects.html#tools">返回 63 项工具索引</a> · <a href="/capabilities/claude-projects-blueprint.md" download>下载 Markdown 原文</a></p>
        </article>
      </div>
    </main>
  </div>
  <script src="/vendor/lucide/lucide.min.js"></script>
  <script src="/capability-article.js"></script>
</body>
</html>\n`;
}

async function main() {
  const root = fileURLToPath(new URL("../public/capabilities/", import.meta.url));
  const markdown = await readFile(path.join(root, "claude-projects-blueprint.md"), "utf8");
  await writeFile(path.join(root, "claude-projects-blueprint.html"), renderBlueprint(markdown));
  console.log("Staged Claude Projects blueprint from canonical Markdown");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
