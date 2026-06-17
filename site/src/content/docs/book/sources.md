---
title: 来源索引
description: AgentLab 当前引用的公开来源，按 Agent 和主题分类。
---

本页记录当前书稿使用的主要公开来源。来源会持续更新，生成脚本后续应该把 `data/agents.json`、站点正文中的链接和研究目录中的来源合并成一个更完整的 source graph。

## Claude Code

- [Claude Code overview](https://code.claude.com/docs/en/overview)：产品表面、可用界面和下一步文档入口。
- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)：agentic loop、内置能力和项目交互方式。
- [Configure permissions](https://code.claude.com/docs/en/permissions)：分层权限、read-only、bash、文件修改、allow/ask/deny 规则。
- [Security](https://code.claude.com/docs/en/security)：MCP、云执行、敏感代码和团队安全建议。
- [How we built Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)：自动审批/权限疲劳的工程背景。
- [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude)：工具输出、代理、策略检查和持久化上下文风险。

## Codex

- [Codex manual](https://developers.openai.com/codex/codex-manual.md)：Codex 的产品表面、沙箱、审批、配置、AGENTS.md、MCP、技能、插件、自动化等综合手册。
- [OpenAI Codex repository](https://github.com/openai/codex)：开源 CLI 和相关实现入口。
- [Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security.md)：沙箱、网络访问、审批策略和风险默认值。
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md.md)：项目规则发现和合并顺序。
- [Model Context Protocol](https://developers.openai.com/codex/mcp.md)：Codex MCP 配置、STDIO/HTTP server 和工具审批。

## Pi / Inflection

- [Pi](https://hey.pi.ai/)：Pi 的消费者产品入口。
- [Inflection AI](https://inflection.ai/)：公司定位、人本和情绪智能表述。
- [Inflection AI About](https://inflection.ai/about)：公共利益使命、情绪智能和可信 Agent 方向。
- [Inflection-3 Pi developer docs](https://developers.inflection.ai/docs/inflection-3-pi)：Pi 3.0、Productivity 3.0、Pi 3.1 Preview 的开发者说明。
- [Notice on model training](https://inflection.ai/notice-on-model-training)：训练数据来源和隐私保护说明。
- [Training Data Transparency Statement](https://inflection.ai/training-data-transparency-statement)：训练数据类型、规模、处理和合成数据说明。

## OpenCode

- [OpenCode](https://opencode.ai/)：产品首页，说明开源、终端/IDE/桌面、多模型和隐私定位。
- [OpenCode docs](https://opencode.ai/docs/)：安装、配置、初始化、使用和共享入口。
- [Agents](https://opencode.ai/docs/agents/)：Build、Plan、subagents、权限和 agent 切换。
- [Config](https://opencode.ai/docs/config/)：远程、全局、项目、`.opencode`、managed config 的优先级。
- [Permissions](https://opencode.ai/docs/permissions/)：allow、ask、deny 风格的工具权限配置。
- [Providers](https://opencode.ai/docs/providers/)：通过 AI SDK 和 Models.dev 支持多模型 provider。
- [anomalyco/opencode](https://github.com/anomalyco/opencode)：当前 opencode.ai 指向的官方开源仓库。

## 来源使用规则

1. 优先使用官方文档、官方博客、官方仓库和开发者文档。
2. 第三方文章只能作为线索，不能单独支撑产品事实。
3. 对发布时间、版本号、价格、模型名、可用性、权限默认值等易变信息，必须重新查证。
4. 对提示词内容，只保存公开、可引用、用户自有或明确允许保存的材料。
5. 对无法确认的信息，在正文中写成“待验证”或“工程推断”。
