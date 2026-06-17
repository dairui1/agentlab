---
title: Codex MCP 与自动化
description: Codex 如何通过 MCP、GitHub Action、SDK、非交互模式和自动化把 coding agent 嵌入工程系统。
---

Codex 的平台价值不只在交互式编码。它还提供 MCP、GitHub Action、SDK、non-interactive mode、automations 等入口，让 Agent 能嵌入工程系统。研究这些入口可以帮助我们理解：什么时候 Agent 是“聊天中的助手”，什么时候 Agent 是“自动化工作流的一步”。

## MCP: 外部系统边界

Codex MCP 文档说明它支持 STDIO server 和 Streamable HTTP server，配置保存在 `config.toml`。MCP server 可以提供工具，也可以提供 server instructions。工具可以启用/禁用，approval mode 可以按 server 或 tool 设置。

这给 Agent 平台一个清晰边界：外部系统不直接变成 prompt 文本，而是通过协议暴露能力。比如 GitHub、Figma、Sentry、浏览器、文档检索都可以成为 MCP server。Agent 看到的是工具描述和返回结果，系统保留权限和审计能力。

## Codex 作为 MCP server

Codex 也可以被其他 Agent 调用。OpenAI docs 中有把 Codex CLI 作为 MCP server 接入 Agents SDK 的说明。这很有意思：Codex 不只是 MCP client，也可以成为其他 agentic workflow 的工具。一个上层 Agent 可以把“让 Codex 在仓库里完成开发任务”当成可调用能力。

这提示我们：Agent 之间可以通过协议组合，而不是互相嵌套 prompt。上层 Agent 负责业务目标，下层 Codex 负责代码修改，二者通过工具接口交换任务、结果和状态。

## 非交互模式

非交互模式适合 CI、脚本和自动化。它要求任务描述更明确，输出更结构化，失败处理更可控。交互式 Agent 可以向用户追问；非交互 Agent 必须在缺信息时失败或使用预设策略。

设计非交互任务时，要提供：

- 明确目标。
- 工作目录。
- 允许的文件范围。
- 验证命令。
- 输出格式。
- 失败时是否允许修改。
- 是否允许网络。

AgentLab 的生成脚本就是非交互流程的一部分：生成索引、检查 diff、构建站点。未来可以让 Codex 或其他 Agent 在 workflow_dispatch 中生成 source freshness report。

## GitHub Action 与自动审查

Codex GitHub Action 和 code review 能把 Agent 带进 PR 流程。这里的核心不是“自动写代码”，而是让 Agent 在一个受控上下文中完成固定任务：审查 diff、运行检查、评论风险、生成修复建议。PR 是天然边界：有 patch、有讨论、有 CI、有 reviewer。

对团队来说，PR 是 Agent 自动化的好入口，因为它有审查机制。相比让 Agent 直接推主分支，让 Agent 开 PR 或评论 PR 更安全。

## 自动化的边界

不是所有任务都适合自动化。适合自动化的任务通常具备：

- 输入稳定。
- 目标清晰。
- 副作用可控。
- 验证可自动化。
- 失败可安全停止。

不适合完全自动化的任务包括：产品策略、敏感权限变更、生产数据修改、未验证公开事实发布、用户情绪高风险处理。对于这些任务，Agent 可以生成草稿和报告，但不应自动发布。

## 对 AgentLab 的应用

AgentLab 可以用 Codex 式自动化做三件事：

1. 定时检查来源页面是否变化，生成 report。
2. 当 prompt snapshot 新增时，自动生成 diff JSON。
3. 当文档内容新增时，自动统计体量和覆盖度。

这些自动化不需要立即发布正文。它们先生成可审查产物，再由人或 PR 流程决定是否合并。这是 Agent 自动化的健康模式。

## 来源

- [Model Context Protocol](https://developers.openai.com/codex/mcp)
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action)
- [Non-interactive mode](https://developers.openai.com/codex/cli#non-interactive-mode)
