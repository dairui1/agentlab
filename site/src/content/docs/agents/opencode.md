---
title: OpenCode
description: OpenCode 的开源编码 Agent 形态、agents、permissions、providers、config 和 server 架构拆解。
---

OpenCode 是 AgentLab 中最适合作为“可检查开源样本”的编码 Agent。它的官方站点把它定位为 open source AI coding agent，可在 terminal、IDE 或 desktop 中使用，并支持通过 Models.dev 连接 75+ LLM providers，包括本地模型。它的价值不只是“又一个编码助手”，而是让我们能研究一个把 agents、permissions、providers、LSP、plugins、server 和 config 暴露给用户的开源产品。

## 名称说明

当前公开资料中存在多个叫 OpenCode/opencode 的项目。AgentLab 这里主要研究 `opencode.ai` 指向的 OpenCode，也就是 GitHub 上的 `anomalyco/opencode`。另一个 `opencode-ai/opencode` 也是公开仓库，但它的定位、实现语言和成熟度不同，不应混为同一对象。后续如果需要研究第二个项目，应该另建 slug，例如 `opencode-ai-go`。

## 已确认事实

OpenCode 官方首页说明它是帮助用户在 terminal、IDE 或 desktop 中写代码的开源 Agent。首页列出 LSP enabled、multi-session、share links、GitHub Copilot 登录、ChatGPT Plus/Pro 登录、75+ providers 和 any editor 等特性。官方 docs 说明 OpenCode 可作为 terminal interface、desktop app 或 IDE extension 使用。

OpenCode docs 的 Agents 页面说明它有 primary agents 和 subagents。内置 primary agents 包括 Build 和 Plan：Build 是默认开发 agent，拥有完整工具访问；Plan 是受限制的规划和分析 agent，默认会对 file edits 和 bash commands 询问。内置 subagents 包括 General、Explore、Scout 等，用于专项任务或多步搜索。

OpenCode Config 文档说明配置来源有优先级：remote config、global config、custom config、project config、`.opencode` directories、inline config、managed config、MDM preferences 等。Permissions 文档说明 OpenCode 使用 permission config 决定动作是自动执行、提示用户还是阻止。

## 开源样本的价值

闭源产品的研究通常只能看文档、行为和公开博客。OpenCode 的特殊价值在于它有公开仓库、文档和配置。我们可以研究它如何组织代码、如何描述工具、如何管理 session、如何接 provider、如何处理 LSP、如何提供 server API、如何实现插件和权限。

这对开发自己的 Agent 很重要。很多 Agent 设计问题在闭源产品中只能猜，但在开源项目中可以直接看实现：

- agent 配置如何表达。
- 工具权限如何落到代码。
- session 如何保存。
- LSP 诊断如何反馈给模型。
- provider 抽象如何处理不同模型能力。
- 插件如何监听事件或修改行为。
- server API 如何支持多个客户端。

## Agents 和权限

OpenCode 把 Build 和 Plan 做成可切换 primary agents，是一个很好的产品模式。很多编码任务都需要“先看不改”和“开始修改”两个阶段。把它们做成不同 agent，而不是只靠用户 prompt 说“先不要改”，能降低误操作概率。

Plan agent 默认对文件编辑和 bash 命令询问，适合陌生代码探索、方案评审和改动前讨论。Build agent 则适合实际开发。这个分离对自己的 Agent 设计很有启发：你可以把 agent mode 当作权限 profile，而不是当作 UI 状态。

Subagents 则解决上下文污染问题。复杂搜索、跨目录分析、调研任务可以由 subagent 完成，再把结构化结论返回主 agent。风险在于主 agent 不能盲目信任 subagent 输出，尤其当 subagent 读取了不可信内容时。多 Agent 系统需要信任边界，而不是把“来自自己系统的输出”自动升级为可信事实。

## Provider 和模型抽象

OpenCode 的 provider 设计说明它不是绑定单一模型，而是通过 AI SDK 和 Models.dev 支持多 provider。用户可以配置 provider、base URL、API keys、模型变体和 OpenCode Zen。这个方向适合开源项目，因为用户往往希望选择 OpenAI、Anthropic、Google、本地模型或代理服务。

多模型支持带来的工程问题是：不同模型的工具调用能力、上下文窗口、推理风格、JSON 稳定性、成本、延迟和安全策略不同。如果 Agent 把模型当成完全可替换的黑盒，就会在边界条件上失败。因此 provider abstraction 应该记录模型能力，而不仅是 endpoint 和 key。

## Config、rules 和项目初始化

OpenCode 支持通过 `/init` 让项目生成 `AGENTS.md`。这和 Codex 的 `AGENTS.md` 思路相近：把项目结构和编码模式写进仓库，让 Agent 后续进入项目时有稳定上下文。OpenCode 还支持 `.opencode` 目录、agents、commands、plugins、skills、tools、themes 等子目录。这说明开源 Agent 也在向“项目内可配置生态”发展。

配置优先级本身就是产品设计。remote config 适合组织默认值，global config 适合用户偏好，project config 适合项目规则，managed config 适合不可覆盖的企业标准。设计自己的 Agent 时，需要明确这些层的覆盖关系，否则用户会很难理解为什么某个设置生效。

## LSP 和工程反馈

OpenCode docs 说明它可以集成 Language Server Protocol，并使用 diagnostics 作为 agent feedback。LSP 对编码 Agent 很重要，因为它提供了比纯文本搜索更结构化的项目反馈：类型错误、语法错误、诊断、符号信息。Agent 如果只靠 grep 和测试，很多错误要到较晚阶段才暴露；LSP 可以把错误更早带入循环。

未来 AgentLab 可以做一个实验组件：展示 Agent 修改代码后，LSP diagnostic 如何进入下一轮上下文，以及它和测试失败、lint 失败有什么差异。

## Server 架构

OpenCode 的 Server 文档说明运行 TUI 时会启动 server，TUI 是和 server 通信的客户端；server 暴露 OpenAPI 3.1 spec，也用于生成 SDK。这个架构对 Agent 产品很有启发：把核心 Agent runtime 做成 server，TUI、Web、IDE、脚本都可以成为 client。这样可以避免每个表面重复实现 agent loop。

风险也随之出现：server 的认证、端口、host、远程访问、session 隔离、日志和权限都要设计。一个本地 server 如果暴露到错误网络接口，就可能变成安全问题。

## 待验证问题

- `anomalyco/opencode` 的最新内部架构和 docs 是否完全一致。
- Build/Plan/General/Explore/Scout 的具体 prompt 和权限配置如何演化。
- OpenCode Zen 的模型选择标准和可审计性。
- Server API 中哪些操作有副作用，如何认证。
- LSP diagnostic 在 agent loop 中的实际权重。

## 主要来源

- [OpenCode](https://opencode.ai/)
- [OpenCode docs](https://opencode.ai/docs/)
- [Agents](https://opencode.ai/docs/agents/)
- [Config](https://opencode.ai/docs/config/)
- [Permissions](https://opencode.ai/docs/permissions/)
- [Providers](https://opencode.ai/docs/providers/)
- [Server](https://opencode.ai/docs/server/)
- [anomalyco/opencode](https://github.com/anomalyco/opencode)
