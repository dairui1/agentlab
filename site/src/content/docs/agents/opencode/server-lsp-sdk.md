---
title: OpenCode Server、LSP 与 SDK
description: OpenCode 的 server 架构、LSP diagnostics 和 SDK 对 Agent 产品架构的启发。
---

OpenCode 不只是一个终端 UI。官方 Server 文档说明，运行 TUI 时会启动 server，TUI 是与 server 通信的客户端；也可以通过 `opencode serve` 启动独立 server，并通过 SDK 和 API 程序化交互。这个架构对 Agent 产品很有启发：核心 runtime 可以独立于 UI，多种客户端共享同一个 agent loop。

## Server-first 架构

把 Agent runtime 放在 server 后面，有几个好处：

- TUI、Web、IDE、脚本可以复用同一 runtime。
- session、日志、权限、工具调用集中管理。
- SDK 可以基于同一 API 生成。
- 自动化可以不依赖交互界面。

风险也很明显：server 需要认证、端口控制、host 绑定、日志脱敏、session 隔离。如果本地 server 暴露到不该暴露的网络接口，Agent 能力就可能变成攻击面。

## TUI 只是一个客户端

很多 Agent 项目早期会把核心逻辑写死在 CLI/TUI 中，后续想做 Web、IDE 或 API 时很痛苦。OpenCode 的 server 模式提醒我们，UI 和 agent loop 应该分层。UI 负责显示、输入、确认；server 负责会话、工具、权限、模型、日志。

对自己的 Agent 来说，可以按这个结构设计：

- Core: agent loop、context、tool router、permissions。
- Server: session API、auth、events、logs。
- Clients: CLI、Web、IDE、automation。
- Integrations: MCP、GitHub、browser、LSP。

## LSP diagnostics

OpenCode LSP 文档说明它可以集成 Language Server Protocol，并用 diagnostics 作为 agent feedback。LSP 是编码 Agent 的高价值信号。测试只能告诉你某些行为失败；LSP 可以更早给出类型错误、语法错误、缺失导入、未使用变量、接口不匹配。

Agent loop 中的 LSP 可以这样用：

1. 修改代码。
2. 收集 LSP diagnostics。
3. 把相关诊断摘要回传模型。
4. 模型修复最小范围。
5. 再运行测试确认。

这比每次都跑全量测试更快，也更适合编辑器场景。

## SDK 的价值

OpenCode SDK 提供类型安全 client，用于程序化控制 server。SDK 的价值在于把 Agent 从“人操作的工具”变成“其他系统可调用的服务”。例如内部平台可以发起一个 OpenCode session，CI 可以触发修复任务，另一个 Agent 可以把 OpenCode 当成子工具。

但 SDK 也要求清晰权限。程序化调用如果没有用户在场，必须更明确地限制工具、副作用和输出格式。否则自动化会放大错误。

## 对 AgentLab 的应用

AgentLab 后续如果做交互实验，也可以采用 server/client 分层。文档站只是客户端；生成脚本和数据是 server-side assets；未来如果接真实 prompt diff、工具回放、上下文预算模拟，可以用一个本地 API 生成结构化数据，让组件只负责展示。

## 来源

- [Server](https://opencode.ai/docs/server/)
- [SDK](https://opencode.ai/docs/sdk/)
- [LSP Servers](https://opencode.ai/docs/lsp/)
- [CLI](https://opencode.ai/docs/cli/)
