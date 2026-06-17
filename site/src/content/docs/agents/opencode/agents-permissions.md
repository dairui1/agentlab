---
title: OpenCode Agents 与权限
description: OpenCode 的 Build、Plan、subagents 和 permission config 如何表达不同工作模式。
---

OpenCode 的 agents 和 permissions 很适合作为开源 Agent 的产品化样本。它没有把所有行为都交给一个统一模式，而是公开区分 Build、Plan、subagents 和 permission config。这个设计把“要不要行动”和“行动有多大权限”变成可配置对象。

## Build 和 Plan

OpenCode docs 中的 primary agents 包括 Build 和 Plan。Build 是默认开发 agent，拥有完整工具访问；Plan 是受限 agent，适合分析和规划，默认会对 file edits 和 bash commands 询问。这是一个非常实用的模式。

很多编码任务都应该先进入 Plan：理解需求、读代码、提出方案、列风险。只有方案清楚后再切到 Build 执行。这样用户更容易控制范围，Agent 也不容易在不确定时直接改文件。

## Mode 不是 UI 状态

Plan/Build 不应该被理解为界面上的“模式按钮”。它本质上是权限 profile、prompt profile 和工具 profile 的组合。Plan 更保守，Build 更可行动。一个 Agent 平台可以有更多 profile：

- Review：只读 diff 和评论。
- Research：允许网络和依赖源码缓存，但不写工作区。
- Refactor：允许改代码，但需要测试。
- Release：允许生成 changelog，但不允许推送。
- Incident：允许读日志，但生产操作强审批。

OpenCode 的 agents 提醒我们：Agent mode 是产品安全和用户心智模型的一部分。

## Subagents 的工程价值

OpenCode docs 中还有 General、Explore、Scout 等 subagents，以及 compaction、title 这类隐藏系统 agent。Subagent 的工程价值在于隔离任务和上下文。探索依赖源码、扫描大型仓库、压缩长上下文、生成标题，都不应该污染主 Agent 的全部工作记忆。

一个好的 subagent 返回值应该包含：

- 结论摘要。
- 关键证据路径或 URL。
- 没有检查的范围。
- 置信度。
- 建议主 Agent 复查的点。

如果 subagent 只返回“我看过了，没问题”，主 Agent 很难审查。

## Permissions 的三态

OpenCode permissions 文档说明可以控制工具行为，allow、deny 或 require approval。并且可以按 agent override，agent permissions 与 global config 合并，agent rules 优先。这很重要：权限不是全局一刀切，而是可以随 agent profile 变化。

例如 Plan agent 可以默认 deny edit、ask bash；Build agent 可以 allow edit、ask risky bash；Research agent 可以 allow docs network、deny workspace write。把权限和 agent 绑定，比每次靠用户 prompt 更稳定。

## 默认工具启用的风险

OpenCode tools 文档提到内置工具默认启用，并可通过 permissions 控制。这种默认适合易用性，但也要求权限配置足够清晰。否则用户可能不知道模型能做什么。开源 Agent 尤其需要文档化每个工具的风险等级。

AgentLab 后续可以对 OpenCode 工具做一张表：工具名、只读/写入、是否网络、是否 shell、默认权限、推荐策略、对应源码位置。这个表会非常适合研究开源 Agent 的工具协议。

## 来源

- [Agents](https://opencode.ai/docs/agents/)
- [Permissions](https://opencode.ai/docs/permissions/)
- [Tools](https://opencode.ai/docs/tools)
- [Config](https://opencode.ai/docs/config/)
