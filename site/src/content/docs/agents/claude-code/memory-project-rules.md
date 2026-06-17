---
title: Claude Code 记忆与项目规则
description: 区分 CLAUDE.md、auto memory、项目目录和用户偏好。
---

Claude Code 的记忆机制是 Agent 工程中很有价值的样本。很多系统把“记忆”做成一个模糊功能：模型可以记住用户喜欢什么，也可以记住项目怎么构建。但 Claude Code 的公开文档把 `CLAUDE.md` 和 auto memory 分开，这给了更清晰的工程边界。

## Fresh context 与持久规则

Claude Code memory 文档说明，每个 session 从 fresh context window 开始，但可以通过 `CLAUDE.md` 提供持久指令，通过 auto memory 累积 learnings。这个设计很重要：不要假设模型天然“记得项目”，也不要把所有历史上下文都塞进新任务。

Fresh context 的好处是降低历史污染。坏处是用户需要重新提供背景。项目规则和记忆就是在二者之间平衡：把稳定、可复用、可信的信息带进新 session，把临时噪声留在旧 session。

## `CLAUDE.md` 应该写什么

`CLAUDE.md` 应该是项目的可审查规则文件。它适合写：

- 项目架构概览。
- 常用命令和测试方式。
- 代码风格和命名约定。
- 生成文件和禁止手改文件。
- 安全、隐私、发布限制。
- PR 和最终回答格式。

它不适合写：

- 临时任务需求。
- 个人情绪偏好。
- 未验证结论。
- 过长背景材料。
- 私密凭据或客户敏感信息。

如果 `CLAUDE.md` 变成几万字，它就失去了“进入上下文的项目规则”价值。更好的做法是让它链接到详细文档，并只保留高频规则。

## Auto memory 的风险

Auto memory 很方便，因为它可以从纠正和历史工作中学习。但自动写入的记忆必须谨慎。模型可能把一次 workaround 写成长期规则，也可能把错误原因写错，也可能把用户当前偏好误认为永久偏好。

一个安全的 auto memory 设计应包含：

- 写入来源：用户明确说了什么，还是模型推断。
- 适用范围：全局、项目、目录、任务类型。
- 置信度：事实、偏好、经验、待验证。
- 可见性：用户能不能查看和删除。
- 过期策略：是否需要定期审查。

如果做不到这些，auto memory 应该保守，只记低风险偏好，不记业务事实。

## 项目目录作为上下文地图

Claude Code 还有 `.claude` 目录概念，用于集中 settings、hooks、skills、commands、subagents、workflows、rules 和 auto memory。这说明成熟 Agent 需要一个项目内控制目录，而不是把所有配置散落在系统 prompt 和用户 home 中。

对 AgentLab 来说，未来可以考虑：

- `AGENTS.md` 或 `CLAUDE.md`: 项目写作和验证规则。
- `.agentlab/sources.json`: 来源追踪。
- `.agentlab/prompts/`: prompt snapshot schema。
- `.agentlab/workflows/`: 内容生成和发布流程。
- `.agentlab/rules/`: 禁止提交敏感信息、要求来源小节。

这类目录让人和 Agent 都知道“项目如何被维护”。

## 与 Codex AGENTS.md 的对照

Codex 的 `AGENTS.md` 侧重项目指导发现链；Claude Code 的 `CLAUDE.md` 和 auto memory 更强调项目规则和学习。两者都说明一个事实：Agent 不应该每次从零理解项目。不同之处在于命名、发现顺序、记忆机制和生态扩展。

如果一个团队同时使用 Claude Code、Codex、OpenCode，最好不要维护三套完全不同规则。可以写一个主 `AGENTS.md` 或 `CLAUDE.md`，再用同步脚本生成兼容版本，或者在文档中明确每个工具读取哪个文件。

## 来源

- [How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)
- [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
