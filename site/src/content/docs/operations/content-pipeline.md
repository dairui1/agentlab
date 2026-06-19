---
title: 内容生产流水线
description: 让 AgentLab 的文档、数据、交互组件和自动化任务从同一个仓库持续产出。
---

AgentLab 不应该只靠手工写文章。它的目标是让内容从仓库中持续产出：研究笔记进入 `research/`，稳定结论进入 `site/src/content/docs/`，结构化索引进入 `data/`，生成产物进入 `generated/`，交互组件读取结构化数据，CI 负责校验和构建。

## 当前流水线

当前项目已有这些部分：

- `data/agents.json`: 四个 Agent 的结构化索引和来源入口。
- `research/agents/*`: 每个 Agent 的研究草稿和架构页。
- `research/prompts/*`: prompt snapshot 和 changelog 入口。
- `site/src/content/docs/*`: 对外中文文档。
- `site/src/components/labs/*`: 交互实验组件。
- `scripts/build_site_index.py`: 从站点内容生成 `generated/site-index.json`。
- `scripts/sync_sources.py`: 同步公开源码和包产物到本地缓存，生成 `generated/source-sync-manifest.json`。
- `.github/workflows/test.yml`: 校验 Python catalog。
- `.github/workflows/site.yml`: 生成索引、安装依赖、构建站点。
- `.github/workflows/refresh-content.yml`: 定时生成内容并在有变化时提交。
- `.github/workflows/sync-sources.yml`: 定时刷新源码同步 manifest。

这已经形成最小闭环：写内容、同步来源、生成索引、构建站点、CI 验证。但它还没有真实 prompt diff 数据，也还没有把源码变化自动转成研究问题。

## 目标流水线

理想流水线应该分四级：

1. 来源采集：定时检查官方文档、公开仓库、release、博客、开发者文档。
2. 结构化生成：把来源变更转成 JSON、diff、source graph、freshness report。
3. 人工审查：高风险内容，例如 prompt 变更、产品事实变化、价格/模型可用性，自动开 PR。
4. 发布构建：主分支通过校验后自动构建站点，部署到 Pages、Vercel、Cloudflare 或自托管环境。

不要一开始就让定时任务直接改正文。更稳的方式是先生成报告：哪些来源变了，哪些页面可能受影响，哪些 prompt snapshot 需要更新。人确认后再把报告转成正文。

## 目录职责

| 目录 | 职责 | 是否手写 | 是否生成 |
| --- | --- | --- | --- |
| `research/` | 原始研究、草稿、来源摘录、待验证问题 | 是 | 少量 |
| `data/` | 稳定结构化数据，供工具和站点消费 | 是 | 部分 |
| `generated/` | 可审查生成产物，如索引、diff、报告 | 否 | 是 |
| `site/` | 对外文档、组件、样式、导航 | 是 | 部分 |
| `scripts/` | 内容采集、diff、导出、校验脚本 | 是 | 否 |

这个分层能避免两个问题。第一，生成脚本覆盖手写内容。第二，正文页面直接依赖不可审查的外部状态。生成产物应该能被 diff 审查，正文应该由人或 Agent 在明确上下文下修改。

## Prompt diff 流水线

提示词变化历史是 AgentLab 的重点之一。推荐流程：

1. 在 `research/prompts/{agent}/versions/` 添加合法 snapshot。
2. snapshot frontmatter 记录 agent、version、source_url、access_date、evidence_level、scope。
3. 脚本读取相邻版本，生成 `generated/prompt-diffs/{agent}/{from}..{to}.json`。
4. 交互组件读取 JSON，展示左右 diff、变更类别和影响说明。
5. changelog 用人工语言总结变更，不复制敏感全文。

这样做的好处是：原始 snapshot、结构化 diff、解释性 changelog 分开。用户可以看变化，研究者可以审查来源，站点组件可以复用数据。

## 来源 freshness

Agent 产品变化很快。站点中关于价格、模型名、可用性、权限默认值、安装方式和功能状态的内容都应该有 freshness 管理。可以给来源添加字段：

```json
{
  "url": "https://opencode.ai/docs/agents/",
  "owner": "opencode",
  "kind": "official-doc",
  "last_checked": "2026-06-18",
  "stable_claims": ["built-in agents", "permissions"],
  "volatile_claims": ["release version", "provider count"]
}
```

定时任务不需要每次都改正文。它可以先检查 HTTP etag、last-modified、页面 hash 或 GitHub release，再生成 freshness report。如果 volatile claim 的来源变化，就提示人工审查相关页面。

## CI 门槛

AgentLab 的最低 CI 门槛应包括：

- `PYTHONPATH=src python -m agentlab validate`
- `python scripts/build_site_index.py`
- `git diff --exit-code generated/site-index.json`
- `npm ci`
- `npm run check`
- `npm run build`

未来可以加：

- 链接检查。
- frontmatter schema 校验。
- docs 字数/覆盖率统计。
- prompt snapshot schema 校验。
- 禁止提交 secrets。
- 检查新增 Agent 页是否包含来源小节。

## 发布策略

当前仓库是私有仓库，并且当前 GitHub 计划不支持私有仓库 Pages，因此 `site` workflow 默认只构建不部署。后续有三种选择：

- 把仓库或站点发布仓库设为公开，用 GitHub Pages。
- 升级支持私有 Pages 的计划，并设置 `DEPLOY_PAGES=true`。
- 使用 Vercel、Cloudflare Pages 或自托管静态站点，把 `site/dist` 作为发布产物。

无论用哪种发布方式，内容源都应该仍在这个仓库。部署平台只是站点输出，不应该成为研究数据的唯一来源。

## 下一步自动化

最值得优先做的是三个脚本：

1. `scripts/build_prompt_diffs.py`: 从 prompt snapshot 生成结构化 diff。
2. `scripts/check_sources.py`: 检查官方来源是否变化，生成 freshness report。
3. `scripts/sync_sources.py`: 同步公开源码和包产物，生成 source manifest。
4. `scripts/docs_stats.py`: 统计站点页数、中文字符数、每个 Agent 覆盖度，衡量是否达到“电子书体量”。

这三个脚本会让 AgentLab 从“文档站”进化成“内容生产系统”。当站点正文、研究数据、prompt diff 和来源检查都能自动联动时，这个项目才真正符合“开发 Agent 过程中学到的东西”的定位。
