---
title: Pi 可观察性与安全边界
description: 从最小 harness、可见上下文、扩展审计和工具确认看 Pi 的安全设计重点。
---

Pi 的安全重点不是“情绪型 persona”，而是 coding agent 的可观察性和边界控制。一个终端 agent 能读文件、改代码、运行命令、调用模型供应商、加载项目规则和扩展工具。只要这些能力存在，安全问题就不只是模型拒绝策略，而是 harness 是否让用户看见和控制副作用。

## 可观察性是安全能力

Pi 的一个核心卖点是用户能更清楚地看到 agent 在做什么。对 coding agent 来说，可观察性至少包括：

- 当前 prompt 和项目指令从哪里来。
- 工具调用准备执行什么。
- 文件改动具体是什么 diff。
- 命令输出如何影响下一步计划。
- 扩展和技能向 agent 注入了什么能力。

如果这些内容不可见，用户只能盲目信任 agent。可观察性不是调试便利，而是授权的前提。

## 最小 harness 的安全价值

Pi 倾向于把 harness 做薄。薄 harness 的好处是更容易审查：工具、状态、上下文、TUI 和扩展边界更清楚。复杂系统当然可以提供更多能力，但能力越多，越需要权限模型和审计机制。

对 AgentLab 来说，Pi 是一个很好的安全基线：先研究最小可用 coding agent 需要哪些权限，再看 Claude Code、Codex、OpenCode 如何把这些权限产品化、配置化或沙箱化。

## 扩展风险

扩展是 Pi 的强项，也是风险点。一个扩展可以带来新命令、新工具、新上下文和新自动化流程。风险主要来自：

- 读取敏感文件。
- 执行 shell 命令。
- 把上下文发给外部服务。
- 修改 prompt 或工具说明。
- 在会话中隐藏真实副作用。

因此扩展应有可审计元数据：来源、版本、声明工具、权限需求、是否会联网、是否会写文件。即使 Pi 本身保持简单，扩展生态也需要安全约束。

## 工具确认

Coding agent 的工具确认不应只问“允许吗”。更好的确认要显示：

- 将执行的命令或文件改动。
- 当前工作目录。
- 可能影响的文件范围。
- 是否联网或调用外部服务。
- 是否可撤销。

Pi 的研究重点之一，是看它在 minimal harness 中如何处理这些确认。如果某些能力交给扩展实现，就要评估扩展是否能绕过用户预期。

## 与 Codex 和 OpenCode 的比较

Codex 的安全研究重点是 sandbox、approval policy、云端/本地任务和 `AGENTS.md`。OpenCode 的重点是 provider、permission、server/LSP/SDK 和配置化 agent。Pi 的重点是薄 harness 下的可见性和扩展边界。

这三个方向不是互斥的。自己的 agent 可以借鉴 Pi 的可观察性、Codex 的沙箱审批和 OpenCode 的配置化权限。

## 来源

- [Pi 官网](https://pi.dev/)
- [earendil-works/pi](https://github.com/earendil-works/pi)
- [Mario Zechner: What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
