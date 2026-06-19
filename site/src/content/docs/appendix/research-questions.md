---
title: 研究问题库
description: AgentLab 后续围绕 Claude Code、Codex、Pi、OpenCode 和通用 Agent 工程需要继续回答的问题。
---

这个问题库用于指导后续研究。它不是 TODO 列表，而是帮助判断下一批文档、实验和脚本应该补什么。每个问题都应最终对应来源、观察、实验或明确的待验证状态。

## Claude Code

- `CLAUDE.md`、auto memory、settings、skills、hooks、MCP 的最终加载顺序如何影响行为？
- Auto mode 在不同环境中的可用性、默认策略和用户体验差异是什么？
- Hooks 更适合做哪些确定性动作，哪些动作仍应留给模型？
- Subagents 在大型代码库搜索中的实际上下文节省有多明显？
- MCP 工具返回不可信内容时，Claude Code 的防护边界如何体现？
- Web/cloud/remote/local 表面的权限和审计差异如何系统化比较？

## Codex

- `AGENTS.md`、skills、MCP server instructions、rules、config 之间的实际优先级如何体现在任务中？
- Sandbox mode 和 approval policy 的组合如何影响用户效率和安全？
- Codex 作为 MCP server 时，适合承担哪些下游任务？
- 自动 review 是否能显著减少人工审批疲劳？
- GitHub Action 中 Codex 最适合做审查、修复还是报告？
- Codex open-source CLI 和产品文档之间有哪些边界？

## Pi

- Pi 的 `AGENTS.md`、`SYSTEM.md`、skills、prompt templates 和 extensions 分别如何进入上下文？
- Pi 从 `badlogic/pi-mono` / `@mariozechner/pi-coding-agent` 迁移到 `earendil-works/pi` / `@earendil-works/pi-coding-agent` 时，目录、包名和提示词表面发生了什么变化？
- Pi 的 extension API 如何声明工具、权限和上下文注入？
- Pi 的 minimal harness 与 OpenCode 的配置化 agent 架构如何互相借鉴？
- Pi 的 session 格式如何支持恢复、审计和隐私控制？

## OpenCode

- Build、Plan、General、Explore、Scout 等 agents 的 prompt 和权限如何演化？
- Permission config 在工具、agent、global、project 之间如何合并？
- Provider abstraction 如何处理不同模型的工具调用能力差异？
- LSP diagnostics 对代码修复成功率的影响如何评测？
- Server API 哪些 endpoint 有副作用，如何认证和审计？
- Share/import/sanitize 对 session 隐私保护是否足够？

## 通用 Agent 工程

- 哪些内容应该进入 prompt，哪些应该进入配置、hook、测试或工具？
- 如何衡量上下文质量，而不是只衡量 token 数？
- Prompt cache 对 Agent 架构的影响应该如何可视化？
- Tool output injection 的最小回归测试集是什么？
- 多 Agent 协作中，subagent 输出如何保留证据和置信度？
- 如何设计一个既能自动更新又不会自动发布错误事实的文档系统？

这些问题可以逐步变成章节、实验组件、数据集和脚本。
