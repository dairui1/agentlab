---
title: 研究专题
description: 从一个感兴趣的话题出发，经过来源采集、源码阅读、研究笔记和质量门槛后沉淀成站点文章。
---

研究专题区用于承接还没有归入固定章节的新话题。它不是随手写博客，而是 AgentLab 的研究流水线出口：每个专题都应该能追溯到 `research/topics/` 的研究笔记、`research/runs/` 的状态记录，以及可复查的来源列表。

## 适合放在这里的内容

- 一个新 agent 的初步研究。
- 某个机制的横向比较，例如权限、缓存、prompt template、session replay。
- 某个开源仓库或包的源码阅读记录。
- 某个正在变化的事实，例如改名、迁移、版本变化、文档更新。
- 尚未成熟到放进“机制篇”或“四个 Agent”的实验性观察。

## 最小流程

1. 用户提出一个话题。
2. Agent 选择 slug，并运行 `scripts/new_research_topic.py` 创建骨架。
3. 来源写入 `research/runs/{slug}/sources.md`。
4. 推断和分析先写入 `research/topics/{slug}.md`。
5. 稳定结论整理到 `site/src/content/docs/research/{slug}.md`。
6. 运行 `make generated`、`make validate`、`make test`、`npm run check`、`npm run build`。

这个流程借鉴 Deli AutoResearch 的“状态写入文件、反停滞、质量门槛”思想，但收敛到 AgentLab 的实际目标：持续生产中文工程知识库，而不是长时间无人值守写论文。

## 质量原则

- 不用未授权泄露材料。
- 最新事实必须联网核验。
- 开源 agent 优先读本地源码缓存和 manifest commit。
- 事实和推断分开写。
- 来源不足时宁可写待验证问题，不要补全幻觉。
- 站点文章必须能通过构建。
