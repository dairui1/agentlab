---
title: OpenCode 配置与项目规则
description: OpenCode 的 global、project、remote、managed config 和 AGENTS.md 如何塑造开源 Agent 的可配置性。
---

OpenCode 的配置系统是开源 Agent 的重要研究对象。官方 Config 文档说明 OpenCode 支持 remote、global、custom、project、`.opencode`、inline、managed config 和 MDM preferences 等来源。这说明 OpenCode 不是简单 CLI，而是在建立一套可分层配置的 Agent runtime。

## 配置优先级是产品设计

配置优先级决定谁能覆盖谁。个人用户希望项目配置覆盖全局默认；企业希望 managed config 能约束项目；临时任务希望 inline config 只影响当前运行。没有清晰优先级，用户会很难理解为什么某个模型、权限或 provider 生效。

一个 Agent 配置系统通常需要这些层：

- Remote/default: 项目或组织推荐默认。
- Global: 用户个人偏好。
- Project: 当前仓库规则。
- Directory: 子目录特殊规则。
- Inline/session: 临时覆盖。
- Managed: 企业强制策略。

不同层应服务不同目的。不要让个人偏好覆盖企业安全策略，也不要让企业默认压掉项目必要命令。

## Project config

项目级 `opencode.json` 适合保存当前仓库的模型、权限、工具、格式化、命令和规则。它和 `AGENTS.md` 互补：config 负责机器可读设置，AGENTS.md 负责自然语言项目说明。

例如：

- config: Plan agent 禁止 edit，Build agent 允许 edit。
- AGENTS.md: 本项目使用 pnpm，修改 UI 后运行 Playwright。

这比把所有内容写成 Markdown 更可执行，也比所有内容写成 JSON 更易读。

## `.opencode` 目录

OpenCode 支持 `.opencode` directories，用于 agents、commands、plugins、skills、tools、themes 等。目录化配置适合大型项目，因为不同扩展可以分文件管理。它也方便版本控制和代码审查。

目录结构本身就是文档。新加入团队的人能看到项目为 Agent 准备了哪些工具、命令和技能。Agent 也能从目录中发现可用扩展。

## Managed config

企业或团队环境需要 managed config。它用于强制安全策略，例如禁用某些 provider、要求审批、限制网络、设置日志策略。Managed config 不应被项目或用户轻易覆盖。

如果没有 managed config，团队只能靠文档约定。文档约定对模型和用户都有帮助，但不能替代强制策略。

## AGENTS.md 初始化

OpenCode docs 提到 `/init` 可以分析项目并创建 AGENTS.md。这是很实用的 onboarding 流程：让 Agent 初次进入项目时生成项目规则草稿，再由人审查。注意，自动生成的 AGENTS.md 只能是草稿，不应未经审查就成为团队事实。

AgentLab 也可以实现类似流程：脚本扫描站点目录、数据目录和 CI，生成或更新项目维护规则。

## 配置审查

Agent 配置变更应像代码一样审查，尤其是：

- provider 和模型。
- permissions。
- tools/MCP。
- managed policy。
- server host/port。
- share/session settings。

这些配置会改变 Agent 能力边界。小配置可能造成大副作用。

## 来源

- [Config](https://opencode.ai/docs/config/)
- [Agents](https://opencode.ai/docs/agents/)
- [Permissions](https://opencode.ai/docs/permissions/)
- [OpenCode docs](https://opencode.ai/docs/)
