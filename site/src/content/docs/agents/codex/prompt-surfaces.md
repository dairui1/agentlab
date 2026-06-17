---
title: Codex 提示词表面
description: Codex 的行为由系统指令、AGENTS.md、skills、MCP instructions、rules、config 和用户 prompt 共同形成。
---

Codex 的提示词表面很多。研究 Codex 不能只问“system prompt 是什么”，而要问“哪些内容会以什么优先级影响行为”。Codex manual 和定制文档展示了一个分层结构：`AGENTS.md`、memories、skills、MCP、config、rules、hooks、plugins、subagents、用户 prompt 都可能参与构造行为。

## 表面清单

可以把 Codex 的提示词表面分成五类：

1. 产品级指令：Codex 的身份、沟通规范、安全原则和工具使用规则。
2. 项目级指令：`AGENTS.md`、fallback filenames、子目录覆盖规则。
3. 工作流级指令：skills、custom prompts、slash commands、subagent config。
4. 工具级指令：MCP server instructions、tool descriptions、approval annotations。
5. 用户级指令：本轮任务、临时限制、反馈和修正。

这些表面不是平等的。系统和安全约束优先级更高；项目规则是持久上下文；用户指令定义当前目标；工具返回是观察结果而不是新指令。

## AGENTS.md 的 prompt 角色

`AGENTS.md` 本质上是项目级 prompt，但它比普通 prompt 更工程化：它在仓库中版本化，可以被 code review，可以按目录分层。Codex 文档说明它会从全局和项目路径发现并合并 instruction files。这意味着 AGENTS.md 是 prompt supply chain 的一部分。

AGENTS.md 写得好，Agent 每次进入仓库都能稳定表现；写得差，就会把过时命令、错误约定和过长背景带进每个任务。

## Skills 和 prompt 模块化

Skills 把 prompt 从“巨型系统指令”拆成按需加载模块。一个 skill 可以包含具体流程、参考材料、脚本和输出要求。它的价值是降低主 prompt 复杂度，同时提高专业任务一致性。

Prompt 模块化的关键是触发条件。技能过多但触发不准，会增加噪声；技能太少，重复流程又会散落在用户 prompt 中。一个团队应定期审查 skills：哪些高频，哪些过时，哪些可以合并。

## MCP instructions

MCP server instructions 是工具级 prompt。它告诉 Codex 这个 server 的跨工具约束，例如 rate limit、数据可信度、工作流顺序和安全边界。它和 tool description 不同：tool description 是单工具说明，server instruction 是整组工具的共同规则。

设计 MCP server 时，不要把所有说明塞进每个 tool。通用约束放 server instructions，单工具参数和副作用放 tool description。

## Config 和 rules 的 prompt 外边界

Config 和 rules 不一定是 prompt，但会影响 prompt 可做什么。比如 sandbox、network、approval、enabled tools、disabled tools 会改变模型可行动空间。它们是 prompt 外的硬边界。

这给 prompt 设计一个重要原则：不要让 prompt 承担硬边界。Prompt 可以说“不要访问网络”，但真正的网络关闭应由 config 实现。Prompt 可以说“不要提交 secrets”，但 secret scanning 和文件保护应由工具/CI 实现。

## Prompt diff 应包含表面

Codex 的 prompt diff 不应只比较系统 prompt。一个行为变化可能来自：

- AGENTS.md 改了。
- skill 改了。
- MCP tool schema 改了。
- approval policy 改了。
- sandbox mode 改了。
- model 改了。
- user prompt 变了。

因此 prompt snapshot 应记录 scope。没有 scope 的 snapshot 很难解释行为。

## 来源

- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Customization](https://developers.openai.com/codex/concepts/customization)
- [Model Context Protocol](https://developers.openai.com/codex/mcp)
- [Best practices](https://developers.openai.com/codex/learn/best-practices)
