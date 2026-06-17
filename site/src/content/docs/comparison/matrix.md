---
title: 能力矩阵
description: 从产品表面、上下文、工具、权限、记忆、扩展和自动化角度比较 Claude Code、Codex、Pi、OpenCode。
---

能力矩阵不是为了排座次，而是为了看清不同 Agent 的设计重心。Claude Code、Codex、OpenCode 都是编码 Agent，但它们的表面、配置、权限和生态并不相同。Pi 则是关系型助手，不应该按“能不能改文件”来评价。一个好的矩阵应该帮助我们回答：如果我要做自己的 Agent，哪些能力是核心，哪些能力是场景特定，哪些能力现在只是待验证。

## 总览矩阵

| 维度 | Claude Code | Codex | Pi | OpenCode |
| --- | --- | --- | --- | --- |
| 核心场景 | 编码、仓库操作、自动化开发 | 编码、审查、云/本地任务、自动化 | 情绪智能、个人助理、关系型对话 | 开源编码 Agent、多模型、本地/IDE/桌面 |
| 主要表面 | Terminal、IDE、Desktop、Web、CI、Slack、Chrome | CLI、IDE、App、Cloud/Web、GitHub、Slack、Browser/Chrome | Web、移动端、语音、开发者 API | Terminal、Desktop、IDE、Server/API |
| 项目规则 | `CLAUDE.md`、rules、settings | `AGENTS.md`、config、rules、skills | 未公开等价机制，偏 persona/关系上下文 | `AGENTS.md`、opencode.json、`.opencode` |
| 工具模型 | 内置工具 + MCP + hooks/skills/subagents | 内置工具 + MCP + plugins/skills/hooks/connectors | API preview 提到 tool calling，消费者侧工具细节有限 | 内置 tools + MCP/custom tools/plugins |
| 权限模型 | allow/ask/deny、`/permissions`、auto mode、sandbox/云隔离 | sandbox mode + approval policy + network policy + auto review | 主要是安全/隐私/产品边界，工具权限待验证 | permission config，Build/Plan 权限 profile |
| 记忆 | `CLAUDE.md` + auto memory | `AGENTS.md` + memories/skills | 关系型记忆是核心问题，但公开细节有限 | AGENTS.md、session、config，记忆细节需查实现 |
| 多 Agent | subagents、agent view 等 | subagents、cloud tasks、parallel workflows | 更偏长期助手人格，不是多编码 agent | primary agents + subagents |
| 开源可查 | 产品闭源，文档/博客公开 | CLI 开源，产品文档公开 | 产品闭源，开发者 API 和政策公开 | 官方仓库开源 |
| 研究价值 | 权限、记忆、hooks、MCP、auto mode | 沙箱、AGENTS.md、MCP、插件、自动化 | 情绪智能、人格、关系型上下文 | 开源实现、多模型、agent profiles、server |

## 设计重心差异

Claude Code 的设计重心是把编码体验做成高频开发工具。它强调读写代码、运行命令、跨表面使用、项目记忆、权限和扩展。它的公开材料中很强的一条线是“如何让 Agent 更自主但不失控”：权限、auto mode、sandbox、MCP security、tool output containment 都围绕这个问题。

Codex 的设计重心更平台化。它把 CLI、IDE、app、cloud、GitHub、Slack、browser、SDK、GitHub Action、MCP、plugins、skills、AGENTS.md、sandbox、approval policy 放进一套可配置体系。它适合研究“一个 coding agent platform 应该有哪些 surface 和 control plane”。

Pi 的设计重心是关系和情绪智能。它的价值不是高频修改代码，而是理解用户、维持人格、承接情绪、提供支持。它提醒我们：Agent 不总是工具执行器。面向人的长期 Agent 需要处理 consent、memory、tone、safety、privacy 和 crisis boundary。

OpenCode 的设计重心是开源和可配置。它通过 agents、permissions、providers、config、plugins、LSP、server 把很多能力暴露给用户。它适合研究实现细节，也适合作为自己开发 Agent 的参考样本。

## 权限对比

权限是最能体现产品哲学的维度。Claude Code 公开文档中有 read-only、bash、file modification、allow/ask/deny、auto mode 和安全建议。Codex 把 sandbox mode 和 approval policy 明确分开，并提供 network policy、workspace-write、read-only、danger-full-access 等概念。OpenCode 用 permission config 决定工具是 allow、ask 还是 deny，并通过 Plan agent 提供受限分析模式。Pi 的公开资料更多关注安全、隐私和产品政策，而不是开发工具权限。

对自己的 Agent 来说，权限矩阵可以这样设计：

| 操作 | 默认策略 | 需要记录 | 需要用户确认 |
| --- | --- | --- | --- |
| 读项目文件 | 允许 | 文件路径、读取范围 | 通常不需要 |
| 修改工作区文件 | 允许或询问 | diff、工具调用、原因 | 高风险文件需要 |
| 删除文件 | 询问 | 目标、是否可恢复 | 需要 |
| 访问网络 | 默认关闭或域名 allowlist | URL、请求类型、来源 | 需要或策略允许 |
| 调用 MCP 写操作 | 询问 | server、tool、参数 | 需要 |
| 修改远端状态 | 询问 | 目标系统、账号、资源 | 需要 |
| 读取 secrets | 默认拒绝 | 拒绝原因 | 不应由普通审批绕过 |

这个矩阵应该变成可执行配置，而不仅是文档建议。

## 上下文对比

编码 Agent 的上下文通常来自仓库、diff、命令输出、测试结果和 issue。Claude Code 和 Codex 都有项目规则机制，OpenCode 也有 AGENTS.md 和 config。Pi 的上下文则更多来自对话关系和个人化体验。

这说明上下文策略必须服务场景：

- 编码 Agent 需要检索、路径、符号、测试、diff 和项目规则。
- 审查 Agent 需要 PR patch、评论、CI、历史问题和代码所有权。
- 关系型 Agent 需要用户状态、偏好、边界、历史承接和安全信号。
- 企业 Agent 需要组织政策、权限、审计、数据边界和知识库。

不要把 RAG 当作所有 Agent 的通用答案。RAG 解决“找资料”，但 Agent 还需要判断资料是否可信、是否适用、是否应该进入长期记忆、是否影响行动权限。

## 扩展生态对比

Claude Code 和 Codex 都支持 MCP，且都有 skills/插件/规则/自动化的概念。OpenCode 也支持 MCP/custom tools/plugins/skills，并通过开源仓库让生态更容易观察。Pi 的开发者 API 提到 agentic workflows 和 tool calling preview，但其公开生态还不应和编码 Agent 等量齐观。

扩展生态可以按三类看：

- 工具扩展：接 GitHub、Figma、browser、数据库、Sentry、内部 API。
- 行为扩展：skills、prompts、commands、rules、hooks。
- 管理扩展：config、managed settings、policy、audit、organization defaults。

好的 Agent 平台应该让这三类扩展分开，否则用户会用 prompt 去解决配置问题，用插件去解决文档问题，用 MCP 去解决权限问题。

## 结论

四个 Agent 的共同点是都在某种意义上管理“长期上下文 + 行动边界”。差异在于行动是什么：Claude Code、Codex、OpenCode 的行动主要是开发动作；Pi 的行动主要是对话承接和关系维护，未来才可能扩展到工具调用。研究它们的价值不是模仿某一个产品，而是提炼出可复用问题：Agent 如何知道目标，如何选择上下文，如何调用工具，如何被约束，如何学习，如何解释自己做了什么。
