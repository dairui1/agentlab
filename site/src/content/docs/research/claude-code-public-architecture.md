---
title: Claude Code 公开架构与源码泄露分析综述
description: 整合官方文档、公开逆向研究和源码泄露事件分析，梳理 Claude Code 的架构、工具、上下文、权限与安全边界。
---

## 研究问题

这篇先做一个 Claude Code 公开研究入口：把官方文档、当前 npm 包、公开逆向文章、以及 2026 年 3-4 月 source map 泄露事件后的分析整合起来，回答一个问题：

Claude Code 到底是怎样一种 agent 系统？哪些机制已经能从官方文档确认，哪些只是第三方从泄露或逆向中提出的主张？

## 结论摘要

Claude Code 不应该被理解成“一个很长的系统提示词”。更准确的心智模型是：Claude 模型外面套了一层 agentic harness，这层 harness 负责工具、上下文、权限、记忆、hooks、subagents、会话恢复、UI/CLI 和发布管线。

稳定结论有五个：

- **核心循环**：官方描述为 gather context、take action、verify results，模型在工具结果反馈中持续调整。
- **上下文是主要资源约束**：CLAUDE.md、auto memory、文件内容、工具结果、skills、MCP、subagents 返回摘要都会进入或影响上下文。
- **策略和上下文分离**：CLAUDE.md 和 auto memory 是上下文，不是强制策略；真正能阻断动作的是 permissions 和 hooks。
- **subagents 的价值是隔离上下文**：它们在自己的 context window 中搜索、分析、执行，只把摘要返回主会话。
- **泄露事件的工程教训是供应链卫生**：source map 把 proprietary CLI 源码变得可读，但官方和多家报道都强调没有客户数据或凭据暴露；对我们来说，重点是发布管线、source map、debug archive 和包内容审计。

## 背景和来源

官方产品页把 Claude Code 定义为能读取代码库、编辑文件、运行命令，并覆盖 terminal、IDE、desktop、browser、Slack 等入口的 agent。官方 “How Claude Code works” 页面进一步说明：Claude Code 是围绕 Claude 模型的 agentic harness，提供工具、上下文管理和执行环境。

本研究使用三层来源：

- 官方文档和产品页：作为事实基线。
- 当前公开包：`@anthropic-ai/claude-code@2.1.183`，本项目缓存排除 `*.map`。
- 公开分析：包括泄露前的流量逆向、泄露后的 source-aware 分析、新闻和安全报道。

边界很明确：本文不下载、镜像、复刻或引用泄露源码；只记录公开分析者的高层结论，并标注其证据等级。

## 机制拆解

### 1. Agentic loop：模型决策，harness 执行

官方文档把 Claude Code 的循环拆成三类动作：收集上下文、采取行动、验证结果。工具调用把外部世界反馈给模型，模型再决定下一步。这个 loop 能覆盖 bug fix、重构、测试、文档、搜索和命令行任务。

这意味着 Claude Code 的系统边界不是模型本身，而是“模型 + 工具执行器 + 上下文装配 + 权限控制 + 会话状态”。

### 2. Tool surface：从文件读写到 orchestration

官方文档把工具能力分成文件操作、搜索、执行、Web、代码智能等类别，还包括 subagent、提问等编排工具。泄露前的公开逆向文章曾观察到早期 prompt 中包含目录结构、git 状态、环境信息和工具清单；这和今天官方文档描述的工具化 agent loop 是一致的，但具体工具名和 prompt 片段会随版本变化。

值得注意的是，Claude Code 持续把“工具可见性”变成动态问题。近期 changelog 提到 MCP tool descriptions 可以延迟加载，避免大量 MCP 工具描述占满上下文。这说明工具不是固定 prompt 附件，而是一个会被预算、权限和场景过滤的 tool pool。

### 3. Context system：不是只塞文件，而是多层装配

官方文档说 context window 持有会话历史、文件内容、命令输出、CLAUDE.md、auto memory、skills、system instructions 等。上下文接近上限时，Claude Code 会先清理旧工具输出，再做 summarization；如果持续 thrash，会停止自动 compaction 并提示恢复。

CLAUDE.md 和 auto memory 是两个互补记忆系统：前者由人写，后者由 Claude 根据纠正和偏好积累。两者都会在 session 开始时加载，但官方明确说明它们是上下文，不是强制配置。这个区分很重要：想让 Claude “知道”项目规则，用 CLAUDE.md；想让系统“必须阻止”某类动作，用 hook 或 permission。

### 4. Safety/action layer：permissions、checkpoints、hooks

Claude Code 的安全边界不是单一开关。官方文档列出 checkpoints 和 permission modes：文件编辑前有本地快照可回退；权限模式决定文件编辑、shell 命令和其他动作是否需要询问。

Hooks 把安全策略和自动化接入生命周期。hook 收 JSON 输入，命令型 hook 通过退出码和 stdout/stderr 返回结果。exit code 2 是阻断语义，例如在 `PreToolUse` 中阻止危险命令；部分 hook 还能把 stdout 加入模型可见上下文。

这给 AgentLab 的启发是：规则文本和 enforcement point 必须分开。只写“不要 rm -rf”不够，应该在 PreToolUse 里真的挡住。

### 5. Subagents：并行只是表面，context isolation 才是关键

官方 subagents 文档强调：每个 subagent 有自己的 context window、自定义 system prompt、工具访问和独立权限。Explore 和 Plan 这类内置 subagent 可以做只读探索，custom subagent 可以指定 tools、disallowedTools、model、permissionMode、MCP servers、hooks、memory、isolation 等。

这说明 subagents 的工程价值不只是并行，而是上下文卫生。大量搜索结果、日志、长文件读取和专项分析留在子上下文里，主会话只接收摘要。Drew Breunig 的 prompt 构造分析也把 Agent guidance、Explore/Plan、Skills、Verification Agent、Memory Prompt、MCP Instructions、microcompact 等看成按条件加入的 prompt fragments，而不是一整块静态系统提示词。

### 6. 泄露事件：事实、主张和边界

较可靠的事件事实是：2026 年 3 月 31 日前后，`@anthropic-ai/claude-code` 2.1.88 npm 包包含 source map；报道说该 source map 指向未混淆 TypeScript 源 ZIP。Anthropic 对外说这是 release packaging issue caused by human error，不是 security breach，且无敏感客户数据或凭据暴露。

安全报道给出的直接教训很朴素：不要发布 source map；用 `files` 白名单；`npm pack --dry-run`；发布前审计包内容。Zscaler 还强调，组织风险主要来自下载第三方镜像或所谓“泄露版”，因为这些包可能被植入恶意代码。

泄露分析文章里还有一些更“刺激”的主张，例如 fake tools/anti-distillation、undercover mode、frustration regex、KAIROS 等。本文不把这些写成本站事实，只把它们归类为第三方基于泄露材料的观察。它们的研究价值在于提醒我们：agent harness 里往往混有安全策略、商业策略、产品实验和遥测逻辑，这些都应该被当成敏感发布面。

### 7. 一个可用架构地图

把以上来源压缩成架构图，可以这样看：

1. **Surface layer**：terminal、IDE、desktop、web、Slack、CI。
2. **Core loop**：model reasoning + tool dispatch + verification。
3. **Context layer**：system prompt fragments、CLAUDE.md、auto memory、session history、files、tool results、compaction。
4. **Action/safety layer**：permissions、checkpoints、hooks、sandboxing、managed settings。
5. **Extension layer**：MCP、skills、plugins、slash commands、subagents。
6. **State/ops layer**：JSONL transcripts、resume/fork、package publishing、telemetry、release hygiene。

## 设计启发

- 做 coding agent 不能只抄 prompt，要设计 harness。工具协议、权限、记账、上下文裁剪、恢复和 UI 控制同样重要。
- Context hygiene 是长期任务能力的核心。Claude Code 用 compaction、skills on demand、MCP deferred loading、subagents 独立上下文来处理这个问题。
- 可扩展性要分层：MCP 连接外部能力，skills 封装流程知识，hooks 做生命周期自动化，plugins 打包分发，subagents 隔离工作上下文。
- 发布链路要有 agent-specific audit：source map、debug bundle、prompt snapshot、feature flag、telemetry key、内部 URL 都应进入包内容审计。
- 研究泄露材料时要保守：可以学习公开分析中抽象出来的架构模式，不应把未授权源码变成本站知识资产。

## 可复查清单

- 来源是否足够支撑核心结论：是。核心架构由官方文档支撑，泄露事件由新闻/安全报道支撑，社区分析单独标注。
- 是否区分事实和推断：是。官方事实、第三方主张、AgentLab 工程推断已分层。
- 是否需要更新其他章节：是。后续可拆到 `agents/claude-code/` 下的 prompt/context、hooks/permissions、subagents 三篇深度页。

## 待验证问题

- Claude Code 更新很快，本文基于 2026-06-20 访问的官方 docs 和 `2.1.183` 包。后续需要定期刷新。
- 第三方泄露分析中的具体内部 feature claim 没有在本站复核源码，不作为确定事实。
- 当前公开 npm 包主要是 wrapper 和 native binary，无法从包内复查 TypeScript 源实现。

## 来源

- Claude Code product page: https://claude.com/product/claude-code
- How Claude Code works: https://code.claude.com/docs/en/how-claude-code-works
- Memory: https://code.claude.com/docs/en/memory
- Subagents: https://code.claude.com/docs/en/sub-agents
- Hooks: https://code.claude.com/docs/en/hooks
- Context window: https://code.claude.com/docs/en/context-window
- Changelog: https://code.claude.com/docs/en/changelog
- Anthropic autonomy features: https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously
- npm package: `@anthropic-ai/claude-code@2.1.183`
- InfoQ source map leak report: https://www.infoq.com/news/2026/04/claude-code-source-leak/
- The Hacker News report: https://thehackernews.com/2026/04/claude-code-tleaked-via-npm-packaging.html
- Zscaler security report: https://www.zscaler.com/blogs/security-research/anthropic-claude-code-leak
- Kir Shatrov reverse engineering note: https://kirshatrov.com/posts/claude-code-internals
- Drew Breunig prompt construction analysis: https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html
- Alex Kim source leak analysis: https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/
- arXiv architecture paper: https://arxiv.org/html/2604.14228v1
