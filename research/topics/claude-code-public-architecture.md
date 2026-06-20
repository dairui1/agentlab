# Claude Code 公开架构与源码泄露分析综述

- Slug: `claude-code-public-architecture`
- Created: 2026-06-20
- Summary: 整合官方文档、公开逆向研究和源码泄露事件分析，梳理 Claude Code 的架构、工具、上下文、权限与安全边界。
- Site page: `site/src/content/docs/research/claude-code-public-architecture.md`
- Run state: `research/runs/claude-code-public-architecture/state.md`

## 问题定义

从官方文档、当前公开 npm 包、公开逆向研究、以及 2026 年 3-4 月 source map 泄露事件后的分析中，提炼 Claude Code 的稳定架构知识：agent loop、工具、上下文、权限、hooks、subagents、记忆和安全边界。

## 来源摘要

来源分三层：

- 一手事实：Claude Code 官方产品页、官方 docs、官方 changelog、当前 npm 包 `@anthropic-ai/claude-code@2.1.183`。
- 事件事实：InfoQ、The Hacker News、Zscaler 对 source map 泄露事件的报道和 Anthropic 对外声明。
- 二级分析：Kir Shatrov、Drew Breunig、Alex Kim、arXiv 论文等公开逆向/源码分析。对这类来源，采用“别人声称观察到”的表述，不直接使用泄露源码。

## 已确认事实

1. Claude Code 官方定位不是 autocomplete，而是 agentic harness：模型负责推理，Claude Code 提供工具、上下文管理和执行环境。
2. 官方把工作循环描述为 gather context、take action、verify results。工具类别包括文件操作、搜索、执行、Web、代码智能，以及 subagents/提问等 orchestration 工具。
3. Claude Code 的上下文系统由多层组成：系统指令、会话历史、工具结果、文件内容、CLAUDE.md、auto memory、skills、subagents 返回摘要、MCP tool definitions 等。
4. CLAUDE.md 和 auto memory 是“上下文”，不是强制策略。要硬阻断动作，官方建议使用 PreToolUse hook。
5. Hooks 是安全与自动化交界面。hook 收 JSON，exit code 2 可阻断特定动作；部分 hook stdout 可作为模型可见上下文。
6. Subagents 是独立上下文窗口，能限制工具、模型、权限、MCP servers、hooks 和 memory。它们的核心价值是隔离大量探索结果，避免污染主会话上下文。
7. 2026 年 3 月底/4 月初的泄露事件是 npm package source map 打包错误：相关报道引用 Anthropic 称无客户数据或凭据暴露，属于 release packaging issue，不是 security breach。
8. AgentLab 当前同步 Claude Code npm 包时排除了 `*.map`，本研究也不下载、纳入或引用泄露源码。

## 工程推断

- Claude Code 的竞争力主要在“模型 + harness + 产品操作面”组合，而不是某一个 prompt。工具授权、上下文装配、compaction、memory、subagents、hooks 和 UI/CLI 都是同等重要的系统层。
- 公开逆向和泄露分析能帮助理解设计空间，但不应成为工程依赖。最稳的学习方式是用官方 docs 构建架构骨架，再用第三方分析验证哪些机制值得深入。
- Source map 泄露暴露的最大教训不是“客户端代码不能有秘密”，而是 agent harness 里有大量安全策略、商业策略和产品实验；发布管线必须把 sourcemap、debug archive、内部 feature flags 当成敏感面处理。
- Claude Code 的架构方向和 Codex `/goal` 有共性：长期任务能力不是靠单条 prompt，而是由状态、上下文管理、恢复、权限和工具循环共同支撑。

## 设计启发

1. AgentLab 后续研究 Claude Code 时，应拆成四条线：prompt/context 构造、权限/hooks、subagents/parallel work、memory/compaction。
2. 任何 coding agent 都要把“指令上下文”和“强制策略”分开：CLAUDE.md 是建议/上下文，hook/permission 才是策略执行点。
3. Subagents 的工程价值不只是并行，而是 context hygiene。它们把搜索、日志、长文件读取和专项分析隔离出去，只把摘要带回主线程。
4. 发布 agent 包时需要供应链清单：`npm pack --dry-run`、files whitelist、sourcemap denylist、CI artifact audit、package size diff 和 secret scanning。

## 对 AgentLab 的影响

- 新增一个研究专题页，先作为综述入口。
- 后续可把本文拆到 `agents/claude-code/` 下的深度页，例如“Claude Code prompt/context 构造”“Claude Code hooks 权限模型”“Claude Code subagents”。
- 可做一个交互组件：Claude Code 架构地图，点击 context/tool/permission/subagent 查看来源和边界。

## 待验证问题

- 官方 docs 更新很快，Claude Code `2.1.x` 的工具、permission modes、subagent 行为可能在数天内变化，需要定期 refresh。
- 第三方泄露源码分析里提到的 fake tools、undercover mode、KAIROS、frustration regex 等，本站不把它们当可直接复查事实，只作为“社区分析声称”记录。
- 当前 npm 包是 native binary + wrapper 形态，公开包无法复查 TypeScript 源实现。若未来 Anthropic 开源部分组件，应重新分层证据。
