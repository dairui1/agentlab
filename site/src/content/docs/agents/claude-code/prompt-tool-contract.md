---
title: Claude Code 提示词与工具契约
description: 从提示词、内置工具、MCP、hooks 和项目规则看 Claude Code 如何约束行动。
---

Claude Code 的提示词研究不能只盯着“系统提示词全文”。更有价值的问题是：一个编码 Agent 如何把角色、项目规则、工具能力、权限边界和用户沟通组合成可执行契约。公开文档不会完整暴露内部提示词，但已经足够看出它的契约结构：Claude 会理解代码库、使用内置工具、遵守项目规则、通过 MCP 扩展外部能力，并在权限边界内行动。

## 契约不是单一 prompt

Agent 行为不是由一段系统提示词单独决定。Claude Code 的行为至少来自这些层：

- 产品系统指令：定义 Claude Code 是编码 Agent、如何沟通、如何安全使用工具。
- 项目规则：`CLAUDE.md`、settings、rules、workflows。
- 工具描述：内置文件、搜索、执行、web/MCP 等工具的使用条件。
- 权限策略：allow、ask、deny、permission mode、hook/callback。
- 用户当前请求：本轮具体目标和限制。
- 运行时观察：文件内容、命令输出、MCP 返回、hook 结果。

提示词研究如果只保存其中一层，就会误判行为来源。比如 Agent 没有运行某个命令，可能是系统 prompt 要求保守，也可能是 permission rule 拦截，也可能是 hook 返回阻止，也可能是项目规则规定不能运行。

## 工具契约的核心问题

Claude Code 官方扩展文档提到内置工具覆盖文件操作、搜索、执行和 web access，MCP 可连接外部工具。对 Agent 开发者来说，关键不是工具有多少，而是工具契约是否清楚：

- 工具什么时候该用。
- 工具返回是否可信。
- 工具是否会产生副作用。
- 工具失败后如何恢复。
- 工具是否需要审批。
- 工具结果如何进入上下文。

例如 bash 工具不是“执行任意字符串”。它需要工作目录、权限模式、超时、输出截断、危险命令识别和用户可理解的审批提示。文件编辑工具也不是“写文件”，它需要保护用户已有改动、生成可审查 diff、避免覆盖生成物。

## Hooks 与 prompt 的边界

Hooks 让 Claude Code 能在生命周期节点执行用户定义动作。它们说明一个重要原则：确定性动作不要全写进 prompt。格式化、日志记录、危险命令阻断、发送通知、额外校验都可以通过 hook 实现。

Prompt 适合写判断原则，例如“修改后运行相关验证”。Hook 适合执行确定性策略，例如“每次 TypeScript 文件修改后运行 prettier”。如果把所有确定性策略都放进 prompt，模型可能忘记、误解或在上下文压力下跳过。

因此，研究 Claude Code 时应该把 hook 当作行为契约的一部分。一个项目可能因为 hook 而表现得更安全、更规范，而不是因为模型本身更“自觉”。

## MCP 工具输出的信任等级

MCP 把外部系统接入 Claude Code，但也把外部内容带进上下文。一个 GitHub issue、网页、数据库字段或 Slack 消息都可能包含不可信文本。工具契约应明确：外部正文是数据，不是指令。Claude Code 的安全和 containment 相关公开材料强调了工具输出风险，这正是 Agent 工程的关键。

自己的 Agent 在设计 MCP 工具时，应在返回值中区分：

- `trusted_metadata`: repo、issue id、timestamp、author 等工具生成元数据。
- `untrusted_content`: 用户或网页提供的正文。
- `side_effects`: 已发生或将发生的副作用。
- `recommended_next_action`: 工具可以建议，但不能越过系统策略。

这样模型能更清楚地处理来源。

## 提示词 diff 的研究切口

如果未来能合法保存 Claude Code prompt snapshot，建议按这些维度 diff：

| 类别 | 关注点 |
| --- | --- |
| 工具使用 | 是否新增工具、工具调用顺序、失败恢复 |
| 文件编辑 | 是否强化 patch、小步修改、用户改动保护 |
| 权限 | 是否改变默认审批、auto mode、危险操作 |
| 项目规则 | `CLAUDE.md`、memory、settings 的优先级 |
| 沟通 | 进度更新、最终回答、风险说明 |
| 安全 | 不可信内容、secrets、网络、MCP 工具 |

不要只统计新增/删除行。提示词变化的真正影响是行为契约变化。

## 对实现自己的 Agent 的建议

如果你实现一个 Claude Code 风格的编码 Agent，建议从五个文件开始：

- `system.md`: 全局行为和安全原则。
- `tools.json`: 工具 schema、副作用和返回结构。
- `permissions.json`: allow/ask/deny 规则。
- `PROJECT.md` 或 `AGENTS.md`: 项目规则。
- `hooks/`: 确定性生命周期动作。

然后让 prompt builder 显式组合这些层，而不是把所有内容拼进一个巨型 prompt。这样更容易测试，也更容易生成 diff。

## 来源

- [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Configure permissions](https://code.claude.com/docs/en/permissions)
