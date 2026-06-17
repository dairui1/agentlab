---
title: Codex 审查与 CI 工作流
description: 把 Codex 放进 PR、CI 和自动化流水线时，如何控制输入、权限、输出和验证。
---

Codex 很适合研究“Agent 如何进入工程协作系统”。交互式编码只是其中一种形态；PR 审查、CI 修复、GitHub Action、Slack/Linear 集成和非交互模式，才是真正把 Agent 放进团队流程的地方。

## PR 是天然边界

Pull request 给 Agent 提供了清晰边界：有 diff、有 base branch、有 CI、有评论、有 reviewer、有 merge 权限。相比让 Agent 在主分支随意工作，PR 工作流更适合自动化。

在 PR 中，Agent 可以做：

- 解释 diff。
- 找 edge case。
- 检查测试缺口。
- 根据 review comment 生成修复。
- 总结 CI 失败。
- 提出小 patch。

但 merge、force push、关闭 review、修改保护规则这类动作应保持高权限。

## CI 修复流程

CI 修复比普通编码更结构化。输入包括：失败 job、日志、commit、环境、测试命令。Agent 的步骤可以固定：

1. 读取失败 check。
2. 找到关键错误。
3. 定位相关文件。
4. 做最小修改。
5. 本地或 CI 重跑相关验证。
6. 报告 root cause 和风险。

这个流程很适合做成 skill 或 automation。GitHub Actions 日志过长，Agent 必须先摘要关键错误，而不是把全量日志塞进上下文。

## 自动审查的输出格式

Agent 审查输出应该避免泛泛建议。好的评论包含：

- 文件和行。
- 具体风险。
- 为什么当前代码可能失败。
- 建议修复。
- 是否阻塞合并。

坏评论是：“建议增加错误处理”。这种评论没有可执行性。Agent 审查应该尽量给出可复现路径或边界条件。

## 非交互任务的失败策略

CI 中的 Agent 通常没有用户实时对话。失败时不能无限追问。它应：

- 在缺权限时明确失败。
- 在缺依赖时尝试一次安装或说明。
- 在测试不可运行时报告环境问题。
- 在风险过高时开 PR 而不是直接改主分支。
- 在不确定时生成诊断报告。

非交互模式需要更强的输出契约。最终输出应能被机器和人读。

## 对 AgentLab 的实践

AgentLab 当前 site workflow 已经做了基础 CI：生成索引、检查 generated diff、npm ci、build。后续可以加入：

- 链接检查。
- 来源 freshness report。
- 文档 stats threshold。
- prompt snapshot schema 校验。
- 交互组件 browser smoke test。

这些都是 Codex 式工程自动化：让 Agent/脚本持续维护文档质量，而不是只靠手工。

## 来源

- [Codex GitHub Action](https://developers.openai.com/codex/github-action)
- [Non-interactive mode](https://developers.openai.com/codex/cli#non-interactive-mode)
- [Best practices](https://developers.openai.com/codex/learn/best-practices)
