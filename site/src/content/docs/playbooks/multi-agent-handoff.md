---
title: 多 Agent 协作
description: 主 Agent、subagent、reviewer、tool-agent 之间如何交接任务和保留信任边界。
---

多 Agent 协作不是“多开几个模型”。真正的问题是任务边界、上下文边界、信任边界和交付格式。如果这些不清楚，多 Agent 只会增加噪声。

## 什么时候需要 subagent

适合 subagent 的任务：

- 大范围搜索。
- 阅读外部文档。
- 对比多个方案。
- 生成候选实现。
- 审查安全风险。
- 压缩长上下文。

不适合 subagent 的任务：

- 需要单一责任人判断的高风险操作。
- 需要连续用户交互的敏感对话。
- 需要直接修改同一文件的竞争编辑。

Subagent 的价值是隔离，不是逃避主 Agent 的责任。

## 交接格式

Subagent 返回应结构化：

```md
## 结论

## 证据

## 未检查范围

## 风险

## 建议下一步
```

主 Agent 应保留复查权。高风险结论必须能追溯到文件、URL 或日志。

## Reviewer Agent

Reviewer agent 可以用于审批、代码审查、安全检查。它不应该和执行 Agent 使用同一目标函数。执行 Agent 追求完成任务；reviewer 追求发现风险。二者 prompt、工具和权限应不同。

Reviewer agent 可以检查：

- 是否越权。
- 是否访问不该访问的数据。
- 是否有 destructive action。
- 是否忽略用户限制。
- 是否有 prompt injection 痕迹。

但 reviewer 也可能错，所以关键风险仍需系统策略和人工确认。

## Tool-agent 模式

有时可以把一个复杂工具封装成 agent。例如“让 Codex 在仓库中完成开发任务”可以作为上层 Agent 的工具。OpenAI docs 中 Codex 作为 MCP server 的思路就是这种模式。

Tool-agent 的接口要比普通工具更严格：

- 输入任务要清晰。
- 输出要结构化。
- 副作用要可审计。
- 权限要继承或收窄。
- 失败要可恢复。

不要让 tool-agent 自行扩张权限。

## 信任边界

多 Agent 系统中的输出不应自动升级为事实。Subagent 读过不可信网页，它的总结也可能被污染。Reviewer agent 也可能忽略上下文。主 Agent 需要保留来源和置信度。

一个简单规则：任何会导致写文件、发消息、改远端、写记忆的结论，都应能追溯到原始证据或用户明确授权。

## 对四个 Agent 的映射

- Claude Code: subagents 用于任务隔离和上下文管理。
- Codex: subagents、auto review、MCP server 化体现多 Agent/多角色。
- OpenCode: primary agents 和 subagents 明确区分工作模式。
- Pi: 不适合随意拆成多执行 Agent，但可以把安全审查、记忆审查作为独立层。

多 Agent 不是架构炫技，而是边界管理工具。
