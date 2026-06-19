---
title: 来源索引
description: AgentLab 当前引用的公开来源，按 Agent 和主题分类。
---

本页记录当前书稿使用的主要公开来源。来源会持续更新，生成脚本后续应该把 `data/agents.json`、站点正文中的链接和研究目录中的来源合并成一个更完整的 source graph。

## Claude Code

- [Claude Code overview](https://code.claude.com/docs/en/overview)：产品表面、可用界面和下一步文档入口。
- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)：agentic loop、内置能力和项目交互方式。
- [Extend Claude Code](https://code.claude.com/docs/en/features-overview)：`CLAUDE.md`、skills、subagents、hooks、MCP、plugins 的扩展层总览。
- [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)：项目和 home 目录中的 settings、hooks、skills、commands、subagents、rules、auto memory。
- [How Claude remembers your project](https://code.claude.com/docs/en/memory)：`CLAUDE.md` 和 auto memory。
- [Hooks reference](https://code.claude.com/docs/en/hooks)：hooks 事件、schema、输入输出和 exit codes。
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)：skills 的创建、管理和共享。
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)：subagents 和上下文隔离。
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)：Claude Code 的 MCP 接入。
- [Configure permissions](https://code.claude.com/docs/en/permissions)：分层权限、read-only、bash、文件修改、allow/ask/deny 规则。
- [Security](https://code.claude.com/docs/en/security)：MCP、云执行、敏感代码和团队安全建议。
- [How we built Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)：自动审批/权限疲劳的工程背景。
- [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude)：工具输出、代理、策略检查和持久化上下文风险。

## Codex

- [Codex manual](https://developers.openai.com/codex/codex-manual.md)：Codex 的产品表面、沙箱、审批、配置、AGENTS.md、MCP、技能、插件、自动化等综合手册。
- [OpenAI Codex repository](https://github.com/openai/codex)：开源 CLI 和相关实现入口。
- [Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security.md)：沙箱、网络访问、审批策略和风险默认值。
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md.md)：项目规则发现和合并顺序。
- [Customization](https://developers.openai.com/codex/concepts/customization)：AGENTS.md、memories、skills、MCP 的定制层。
- [Model Context Protocol](https://developers.openai.com/codex/mcp.md)：Codex MCP 配置、STDIO/HTTP server 和工具审批。
- [Best practices](https://developers.openai.com/codex/learn/best-practices)：Codex 上下文、提示、验证、MCP、skills 和 automations 的官方实践。
- [Subagents](https://developers.openai.com/codex/subagents)：Codex subagent 配置和能力。

## Pi

- [Pi 官网](https://pi.dev/)：Pi coding agent 的产品和安装入口。
- [earendil-works/pi](https://github.com/earendil-works/pi)：当前官方开源仓库，包含 agent toolkit、coding agent CLI、TUI 和相关 packages。
- [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)：当前 npm 包入口。
- [badlogic/pi-mono](https://github.com/badlogic/pi-mono)：Mario Zechner 早期公开仓库位置，用于追踪迁移历史。
- [@mariozechner/pi-coding-agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)：旧 npm 包入口，研究时只作为迁移线索。

## OpenCode

- [OpenCode](https://opencode.ai/)：产品首页，说明开源、终端/IDE/桌面、多模型和隐私定位。
- [OpenCode docs](https://opencode.ai/docs/)：安装、配置、初始化、使用和共享入口。
- [Agents](https://opencode.ai/docs/agents/)：Build、Plan、subagents、权限和 agent 切换。
- [Config](https://opencode.ai/docs/config/)：远程、全局、项目、`.opencode`、managed config 的优先级。
- [Permissions](https://opencode.ai/docs/permissions/)：allow、ask、deny 风格的工具权限配置。
- [Providers](https://opencode.ai/docs/providers/)：通过 AI SDK 和 Models.dev 支持多模型 provider。
- [Tools](https://opencode.ai/docs/tools)：内置工具、自定义工具、MCP server 和 permission 控制。
- [Server](https://opencode.ai/docs/server/)：server-first 架构和程序化控制。
- [SDK](https://opencode.ai/docs/sdk/)：OpenCode JS/TS SDK。
- [LSP Servers](https://opencode.ai/docs/lsp/)：LSP diagnostics 作为 Agent feedback。
- [CLI](https://opencode.ai/docs/cli/)：server、web、sanitize、import 等 CLI 入口。
- [anomalyco/opencode](https://github.com/anomalyco/opencode)：当前 opencode.ai 指向的官方开源仓库。

## 来源使用规则

1. 优先使用官方文档、官方博客、官方仓库和开发者文档。
2. 第三方文章只能作为线索，不能单独支撑产品事实。
3. 对发布时间、版本号、价格、模型名、可用性、权限默认值等易变信息，必须重新查证。
4. 对提示词内容，只保存公开、可引用、用户自有或明确允许保存的材料。
5. 对无法确认的信息，在正文中写成“待验证”或“工程推断”。
