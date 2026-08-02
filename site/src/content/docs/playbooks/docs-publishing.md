---
title: 文档发布
description: AgentLab 文档站如何从仓库内容、生成数据、CI 和部署平台形成发布闭环。
---

AgentLab 的网站不应该手工上传。它应该从仓库内容生成：Markdown/MDX 是正文，React islands 是交互组件，`data/` 是结构化源，`generated/` 是脚本产物，CI 负责校验，部署平台只负责发布静态站点。

## 发布闭环

当前闭环是：

1. 写入 `site/src/content/docs`。
2. 更新 `data/agents.json` 或其他结构化数据。
3. 运行 `python scripts/build_site_index.py`。
4. CI 检查 `generated/site-index.json` 是否同步。
5. `npm run check` 做 Astro 类型/内容检查。
6. `npm run build` 生成静态站点。
7. 如果部署开启，上传 `site/dist`。

这个流程让正文、导航、索引和构建保持一致。

## 部署选择

当前生产应用发布到 Cloudflare，`site` workflow 默认只验证文档站构建。文档站可以按需要选择 GitHub Pages、Cloudflare Pages 或其他静态托管平台；启用 GitHub Pages 时设置仓库变量 `DEPLOY_PAGES=true`。

无论部署到哪里，源码和研究资料仍应留在 AgentLab 仓库。

## 发布前检查

发布前至少检查：

- 新页面是否出现在 `generated/site-index.json`。
- 页面是否有 title 和 description。
- 关键事实是否有来源。
- 是否包含未授权 prompt 或 secret。
- 交互组件是否能 build。
- 移动端是否无明显横向溢出。
- 部署是否被 `DEPLOY_PAGES` 和分支条件正确 gating。

这些检查可以逐步自动化。

## 文档版本

如果 AgentLab 真的成长为电子书，可以考虑版本化：

- `main`: 最新持续更新。
- `v0.1`: 第一版电子书。
- `v0.2`: 加入真实 prompt diff。
- `v1.0`: 稳定的 Agent 工程手册。

版本化的价值是让引用更稳定。用户可以引用某个版本，而不是总是引用不断变化的 main。

## 内容统计

AgentLab 已经在 `generated/site-index.json` 中记录 `pages`、`body_chars` 和 `cjk_chars`。这不是虚荣指标，而是维护指标。它可以帮助我们判断：

- 哪些章节太短。
- 哪些 Agent 覆盖不足。
- 是否达到电子书体量。
- 自动生成脚本是否漏掉页面。

未来可以增加每个章节组的统计，确保 Claude Code、Codex、Pi、OpenCode 都有足够深度，而不是总量很大但分布不均。

## 发布原则

发布原则很简单：站点可以持续更新，但事实不能随便漂移。AgentLab 应该宁可把不确定内容标为待验证，也不要为了更新频率牺牲可信度。文档站的价值在长期，而不是一次性生成很多字。
