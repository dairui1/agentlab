---
title: 术语表
description: AgentLab 中反复使用的 Agent 工程术语。
---

这个术语表用于统一 AgentLab 的写法。很多争论来自术语混用：有人把 Agent 当模型，有人把 Agent 当产品，有人把工具调用当 Agent，有人把带记忆的聊天机器人当 Agent。术语不统一，设计讨论会很快变成抽象争论。

## Agent

在 AgentLab 中，Agent 指能在目标、上下文和工具之间循环行动的系统。它不一定必须有复杂自主性，但至少要能观察、决定、调用工具或生成行动建议。只生成文本的普通聊天不一定是 Agent；能读仓库、修改文件、运行测试的编码助手更接近 Agent。

## Agent loop

Agent loop 是观察、计划、行动、验证、压缩的循环。不同产品不一定显式展示计划，也不一定把压缩叫做压缩，但只要能多步行动，就必须解决这些问题。Agent loop 是分析工具，而不是某个固定实现。

## Tool

Tool 是模型可以调用的外部能力，例如读文件、搜索、执行 shell、浏览网页、调用 GitHub、访问数据库。工具不是普通函数；它有副作用、权限、返回结构和审计要求。

## Context

Context 是进入模型当前请求的信息集合，包括系统指令、项目规则、用户 prompt、文件内容、工具输出、历史摘要、记忆和外部来源。上下文不是事实本身，而是模型可见材料。

## Memory

Memory 是跨任务保留的信息。它可能是用户偏好、项目经验、历史纠正或自动总结。记忆需要来源、范围、时间、可删除性和信任等级。不要把记忆和项目规则混为一谈。

## Project rules

Project rules 是项目内持久指导，例如 `AGENTS.md`、`CLAUDE.md`、OpenCode project config。它们应该被版本控制和审查，适合保存团队规范、测试命令和项目约定。

## Prompt surface

Prompt surface 指会影响模型行为的指令来源。系统 prompt、developer prompt、项目规则、skills、MCP server instructions、tool descriptions、用户 prompt 都是 prompt surface。研究 prompt 时必须标注 scope。

## Sandbox

Sandbox 是技术边界，限制命令、文件和网络能做什么。它和 approval policy 不同：sandbox 是能不能做，approval 是越界或高风险时需不需要问。

## Approval

Approval 是交互边界。当 Agent 要做某个高风险动作时，系统向用户或 reviewer 请求确认。好的 approval prompt 应具体说明动作、目标、原因、副作用和可撤销性。

## MCP

MCP 是 Model Context Protocol，用于把外部工具和数据源连接给模型。MCP server 应清楚表达工具 schema、副作用、权限、返回结构和 server instructions。

## Skill

Skill 是可复用工作流或领域知识包。它不同于工具：工具做动作，skill 指导 Agent 如何完成一类任务。技能适合封装“修 CI”“生成文档”“处理 PR 评论”等流程。

## Subagent

Subagent 是用于特定任务或隔离上下文的辅助 Agent。它适合大范围搜索、专项分析、压缩长上下文或候选方案探索。Subagent 的输出仍需保留来源和置信度。

## Prompt diff

Prompt diff 是提示词版本之间的差异记录。它不应只看文本增删，还要分类：工具、权限、上下文、风格、安全、最终回答、失败恢复等。

## Source freshness

Source freshness 是来源保鲜。Agent 产品变化快，文档中关于模型、权限、provider、安装命令和可用性的事实需要定期检查。
