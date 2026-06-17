---
title: 来源保鲜
description: 如何让 AgentLab 中的产品事实、链接和研究结论持续保持新鲜。
---

Agent 产品变化很快。今天正确的安装命令、权限默认值、模型名、provider 数量、功能状态，几周后可能变化。来源保鲜是 AgentLab 能否长期可信的关键。

## 易变字段

最容易变化的字段包括：

- 产品可用性和计划。
- 模型名和默认模型。
- provider 数量。
- 命令行参数。
- 权限默认值。
- 新增/删除工具。
- 文档 URL 和标题。
- 开源仓库默认分支。
- 安全建议。

这些内容在正文中应尽量附来源，并避免写成永久真理。

## 检查方式

来源检查可以分层：

- HTTP status：链接是否还可访问。
- hash：页面内容是否变化。
- heading diff：标题结构是否变化。
- keyword diff：关键术语是否出现/消失。
- GitHub API：仓库描述、默认分支、license、release 是否变化。
- manual fetch：官方 docs manual 是否更新。

初期只做 hash 和 link check 就有价值。

## Freshness report

不要让脚本直接改正文。先生成 report：

```json
{
  "url": "https://opencode.ai/docs/agents/",
  "last_checked": "2026-06-18",
  "changed": true,
  "affected_pages": ["/agents/opencode/", "/comparison/matrix/"],
  "suggested_action": "review"
}
```

这样自动化只是提醒，不会把未审查内容发布出去。

## 稳定事实和易变事实

同一来源中也要区分稳定和易变。比如“OpenCode 是开源 coding agent”相对稳定；“支持 75+ providers”更易变。正文可以把易变事实写得更保守，例如“官方文档当前说明支持大量 provider，并通过 Models.dev 维护 provider 信息”，而不是把具体数字当长期结论。

## 手工审查

来源变化后，人工或 Agent 审查应回答：

- 哪个事实受影响。
- 哪个页面引用了它。
- 是否需要更新矩阵。
- 是否需要更新截图或组件。
- 是否需要更新生成数据。
- 是否影响安全建议。

审查结果应进 changelog 或 commit message。

## AgentLab 实现路线

后续脚本可以这样演进：

1. `sources.json`: 维护 URL、owner、kind、affected_pages。
2. `check_sources.py`: 检查状态和 hash。
3. `generated/source-freshness.json`: 生成报告。
4. GitHub Action 定时运行。
5. 如果有变化，自动开 PR 或提交 report。

这会让 AgentLab 从静态书稿变成可维护的研究系统。
