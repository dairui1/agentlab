---
title: Pi
description: Pi 作为 Mario Zechner 发起、现迁移到 Earendil Works 的开源终端 coding agent/toolkit 的架构入口。
---

Pi 不是 Inflection 的聊天产品。AgentLab 这里研究的 Pi，是 Mario Zechner 发起的开源终端 coding agent 和 agent toolkit。它曾以 `badlogic/pi-mono`、`@mariozechner/pi-coding-agent` 等入口出现，近期迁移到 `earendil-works/pi` 和 `@earendil-works/pi-coding-agent`。这个更名/迁移很重要，因为研究资料、安装入口和源码同步目标都应该指向当前官方位置。

Pi 的定位和 Claude Code、Codex、OpenCode 更接近：它面向本地开发工作流，强调终端交互、项目上下文、工具调用、会话、扩展、技能和提示词模板。它和这些 agent 的差异在于哲学更“薄”：不要把 harness 做成难以理解的黑盒，而是让用户能看见 prompt、工具、session、扩展和运行状态。

为了避免后续资料混淆，AgentLab 中单独写作 “Pi” 时默认指这个开源 coding agent；如果需要讨论 Inflection 的 Pi 聊天产品，必须显式写成 “Inflection Pi”，并放到另一个研究对象中。这个命名边界会影响源码同步、来源索引、能力矩阵和 prompt 版本记录。

后续新增资料也必须先检查命名来源。

## 已确认事实

当前官方源码仓库是 `https://github.com/earendil-works/pi`，仓库描述为 AI agent toolkit，包含 unified LLM API、agent loop、TUI 和 coding agent CLI。仓库许可证为 MIT。当前 npm 包是 `@earendil-works/pi-coding-agent`，旧的 `@mariozechner/pi-coding-agent` 已不再是首选入口。

Pi 的公开文档和 README 把它描述为 minimal terminal coding harness。它支持项目指令、默认系统提示词的替换或追加、扩展、技能、提示词模板、主题和会话。也就是说，Pi 不只是一个 CLI 命令，而是一个可改造的 agent harness。

## 为什么 Pi 值得研究

Pi 对 AgentLab 的价值在于三个方向。

第一，它把“可观察性”放在核心位置。很多 coding agent 会把规划、子任务、工具选择和上下文构造隐藏在内部，用户只看到结果。Pi 的设计倾向是把这些中间状态暴露出来，让用户能检查、修改和扩展。

第二，它把扩展点做成一等公民。用户不一定要 fork agent 源码，而是通过扩展、技能、prompt template、主题和配置适配自己的工作流。这和 Claude Code 的 Skills / hooks、Codex 的 `AGENTS.md` / MCP、OpenCode 的 agents / provider / permission 配置都可以直接比较。

第三，它提供了一个“少即是多”的反例。Agent 越复杂，越容易把 prompt、工具、权限、上下文和 UI 混成一团。Pi 倾向于保持 harness 简洁，这适合研究一个问题：一个 coding agent 最小需要哪些层，哪些能力可以留给扩展。

## 架构层次

Pi 可以粗分成这些层：

- Provider 层：统一不同模型供应商和模型调用接口。
- Agent core：负责 agent loop、工具调用、状态管理和消息流。
- Coding agent：把 core 绑定到代码编辑、项目上下文、会话和终端工作流。
- TUI：提供终端交互界面和可见运行状态。
- Extension surface：让用户扩展工具、命令、提示词、技能和主题。

研究 Pi 时，不应该只看 CLI 行为。更重要的是看这些层之间的边界：什么属于 core，什么属于 coding agent，什么属于用户扩展，什么只是 TUI 表现。

## Prompt 和项目上下文

Pi 的 prompt 表面值得重点研究。公开文档提到 `AGENTS.md` 会作为项目指令加载，`SYSTEM.md` 可以替换或追加默认系统提示词。这和 Codex 的 `AGENTS.md`、Claude Code 的 memory / project rules、OpenCode 的 config rules 是同一类问题：项目如何把自己的约束注入 agent。

这里的核心问题不是“提示词写得多长”，而是：

- 默认系统提示词如何保持最小。
- 项目指令按什么路径和优先级加载。
- 用户如何覆盖默认行为。
- 技能和扩展如何向上下文注入说明。
- agent 如何避免把所有可用信息都塞进上下文。

## 与其他三个 Agent 的对比

Claude Code 强在产品化的工具协议、权限、记忆、hooks、skills 和云端/本地边界。Codex 强在 sandbox、审批、`AGENTS.md`、云任务、review/CI 工作流。OpenCode 强在开源实现、provider 抽象、server/LSP/SDK 和配置化 agent。Pi 的研究重点则是 minimal harness、可观察性和扩展点。

如果要开发自己的 coding agent，Pi 是一个很好的下限样本：先把 agent loop、工具调用、会话、项目指令和扩展表面做清楚，再考虑更复杂的云端任务、协作、多 agent 和企业权限。

## 待验证问题

- `packages/coding-agent` 中默认 system prompt 的版本化方式。
- `AGENTS.md` 和 `SYSTEM.md` 的加载优先级。
- 扩展工具是否有权限边界和审计点。
- 旧 `badlogic/pi-mono` 到 `earendil-works/pi` 的迁移中，包名、目录和 prompt 表面有哪些变化。
- Pi 与 OpenCode 在 TypeScript agent harness 设计上的相似点和分歧。

## 迁移研究方法

Pi 最近的迁移不只是改仓库名。对 AgentLab 来说，迁移本身就是研究材料：旧包名、旧仓库目录、当前包名、当前仓库目录、README、CHANGELOG、文档路径和 npm deprecation 信息都要一起记录。只有这样，后续看到网上引用 `badlogic/pi-mono` 或 `@mariozechner/pi-coding-agent` 时，才不会误以为是另一个项目。

建议把 Pi 的迁移拆成三条线看。第一条是源码线：哪些 packages 保留，哪些目录移动，默认提示词和扩展 API 是否变化。第二条是分发线：npm 包从哪里迁到哪里，安装命令和可执行文件是否变化。第三条是文档线：`pi.dev`、GitHub README、包 README 和第三方教程是否同步更新。迁移期间最容易产生事实漂移，源码同步 manifest 可以记录当前 commit，但研究笔记还需要解释“为什么这个 commit 代表当前官方入口”。

## 主要来源

- [Pi 官网](https://pi.dev/)
- [earendil-works/pi](https://github.com/earendil-works/pi)
- [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
- [badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- [Mario Zechner: What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
