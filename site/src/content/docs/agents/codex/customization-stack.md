---
title: Codex AGENTS.md 与定制层
description: Codex 如何通过 AGENTS.md、memories、skills、MCP、rules 和 config 把团队工作流产品化。
---

Codex 的定制层说明了一个成熟 coding agent platform 如何吸收团队工作流。它不是只支持“用户写更长 prompt”，而是把项目规则、记忆、技能、MCP、rules、config、plugins 和 hooks 分开。这种分层让 Agent 更像可配置团队成员，而不是一次性聊天机器人。

## AGENTS.md 的意义

`AGENTS.md` 是 Codex 的项目持久指导文件。它的价值在于把团队规范放进仓库，并让 Codex 在任务开始前读取。相比用户每次复制粘贴规则，`AGENTS.md` 可版本化、可审查、可被多人共享。

官方文档说明 Codex 会从全局 Codex home 和项目路径中发现 instruction files，并按层级合并。这个发现链带来了一个重要工程事实：指令不是单层的。全局偏好、项目规则、子目录规则和用户当前请求会共同形成行为。

## 规则文件应该小而硬

Codex best practices 中强调要把 Codex 当成可以配置和持续改进的 teammate。`AGENTS.md` 是这个 teammate 的项目 onboarding 文档。但它不应该承载所有知识。太长的规则文件会造成三个问题：

- 模型难以区分高优先级和低优先级规则。
- 上下文和缓存成本上升。
- 团队很难维护和审查。

好的 `AGENTS.md` 应该写“必须遵守”的内容：测试命令、关键目录、禁止事项、验证要求、PR 规范、常见陷阱。详细背景可以放 docs 链接，由 Agent 需要时读取。

## Memories 和项目规则不同

Codex customization 文档把 AGENTS.md、memories、skills、MCP 放在不同位置。Memories 用于携带有用上下文，但它不应替代仓库规则。项目事实最好进仓库，用户偏好和跨任务经验可以进 memory。

一个实用边界是：如果信息应该被团队所有成员知道，就放仓库；如果信息只适用于某个用户，就放个人记忆；如果信息只适用于当前任务，就留在当前 prompt 或任务摘要。

## Skills 作为工作流封装

Skills 把重复流程封装成可复用能力。例如“修 CI”“处理 review comments”“生成 API contract”“迁移测试框架”。它们比 prompt 模板强，因为可以携带参考文件、脚本和触发规则。

对 AgentLab 来说，未来应该有几个技能：

- `agent-docs-writer`: 新增章节时检查来源、写中文正文、更新导航、跑 build。
- `prompt-snapshot`: 新增 prompt snapshot、生成 diff、更新 changelog。
- `source-audit`: 检查官方来源 freshness，生成报告。

这样项目维护会从手工流程变成可复用流程。

## Rules 和 config

Config 和 rules 是硬边界层。它们不应该被 prompt 轻易覆盖。比如 sandbox、network、MCP approval、model、working directory、trusted repo、hooks 这些设置属于配置，不适合每次任务用自然语言临时声明。

好的 Agent 系统会把“应该怎么做”放在文档和 prompt，把“绝不能怎么做”放在配置和策略，把“每次都要执行”放在 hook，把“需要判断”留给模型。

## 定制层的设计原则

Codex 定制层可以抽象成四条原则：

1. 长期规则进入仓库。
2. 用户偏好进入个人记忆。
3. 可复用流程进入技能。
4. 外部系统进入 MCP 或 connector。

这样做的价值是减少 prompt 胀大。很多团队在 Agent 项目早期会不断往 system prompt 加句子，最后得到一个不可维护的巨型 prompt。分层后，每条知识都能找到合理位置，也更容易测试。

## 来源

- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Customization](https://developers.openai.com/codex/concepts/customization)
- [Best practices](https://developers.openai.com/codex/learn/best-practices)
- [Subagents](https://developers.openai.com/codex/subagents)
