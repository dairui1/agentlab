---
title: OpenCode 会话、分享与审计
description: OpenCode 的 session、share link、import、server 和 sanitize 功能对 Agent 审计的启发。
---

OpenCode 的文档中有 session、share、import、server、sanitize 等能力。它们说明一个开源 Agent 不只是实时对话工具，还需要保存、分享、导入和审计工作轨迹。Agent 真正进入工程团队后，轨迹管理会变得和能力本身一样重要。

## 为什么需要 session

Agent 工作不是一次函数调用。它会读文件、运行命令、修改代码、观察结果、再行动。Session 保存这些上下文，使用户可以回到任务，也使问题可以复盘。

一个有用 session 应记录：

- 用户请求。
- 模型和 provider。
- 工具调用。
- 文件 diff。
- 命令输出摘要。
- 权限决策。
- 错误和重试。
- 最终回答。

没有 session，Agent 出错后只能靠用户回忆。

## 分享和隐私

OpenCode 的 share 能力很有价值，但分享 Agent 轨迹也有风险。轨迹可能包含私有代码、文件路径、命令输出、错误日志、环境信息甚至 secrets。CLI 文档中的 sanitize 选项说明分享前需要脱敏。

分享策略应区分：

- 公开分享：必须强脱敏，默认不含源码。
- 团队分享：可包含仓库上下文，但限制访问。
- 调试分享：包含更多日志，但有过期时间和权限。
- 私人保存：不对外公开。

AgentLab 未来如果支持 session replay，也应默认脱敏。

## Import 的意义

Import session 说明 Agent 轨迹可以成为可移动 artifact。用户可以把一个 session 从分享链接或 JSON 文件导入，继续分析或复现。这对研究很有价值：AgentLab 可以保存脱敏后的失败样例，用于评测和教学。

但 import 也引入风险：导入的 session 内容是不可信输入。它可能包含 prompt injection、伪造工具输出或恶意路径。导入后不应自动执行其中的命令，只能作为数据读取。

## Server 审计

OpenCode server 允许程序化控制。Server 架构带来集中日志的机会，也带来远程访问风险。审计系统应记录：

- client 来源。
- session ID。
- API endpoint。
- 工具调用。
- 权限结果。
- 输出 artifact。

如果 server 允许 web 或 SDK 操作，还要有认证和访问控制。

## 对 AgentLab 的启发

AgentLab 可以把“文档生成 session”也当成 artifact。每次大规模扩文档，可以记录：

- 使用的来源。
- 新增页面。
- 字符统计。
- 构建结果。
- CI run。
- 待验证问题。

这比单纯 commit message 更适合长期研究。未来可以把这些记录生成 release notes 或研究日志。

## 来源

- [CLI](https://opencode.ai/docs/cli/)
- [Server](https://opencode.ai/docs/server/)
- [SDK](https://opencode.ai/docs/sdk/)
