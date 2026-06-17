---
title: OpenCode Provider 与模型抽象
description: OpenCode 多 provider 设计给开源 Agent 带来的能力、成本和一致性问题。
---

OpenCode 的一个核心特点是多 provider。官方文档说明 OpenCode 使用 AI SDK 和 Models.dev 支持 75+ LLM providers，并支持本地模型。对于开源 Agent 来说，多 provider 是重要卖点：用户可以选择 OpenAI、Anthropic、Google、本地模型、代理服务或团队内部网关。

## 多 provider 的价值

多 provider 让 OpenCode 更适合不同用户：

- 个人用户可以用已有 ChatGPT 或 provider key。
- 团队可以接内部模型网关。
- 注重隐私的用户可以跑本地模型。
- 成本敏感任务可以用便宜模型。
- 高难任务可以切强模型。

这比绑定单一模型更开放，也更符合开源工具定位。

## 抽象不是 endpoint 切换

多 provider 的难点不在配置 API key，而在能力差异。不同模型在这些方面差异很大：

- 上下文窗口。
- 工具调用稳定性。
- JSON 输出可靠性。
- 长任务规划能力。
- 代码编辑能力。
- 多语言理解。
- 安全策略。
- 延迟和成本。
- 是否支持本地运行。

如果 Agent 只把模型当 endpoint，就会在边界条件上失败。Provider abstraction 应该记录 model capability，而不只是 base URL。

## 模型选择和任务路由

OpenCode Zen 被描述为经过团队测试验证的模型列表，这说明模型选择本身可以产品化。一个好的编码 Agent 不一定每步用同一个模型：

- 快速搜索总结可以用便宜模型。
- 复杂设计可以用强推理模型。
- 大文件摘要可以用长上下文模型。
- 本地隐私任务可以用本地模型。
- 高风险审查可以用更保守模型或多模型交叉。

但多模型路由也会增加可解释性问题。用户需要知道关键决策由哪个模型做出，失败时也要能复盘。

## 凭据和配置

OpenCode providers 文档提到通过 `/connect` 添加 API key，并配置 provider。凭据存储位置和权限是重要安全问题。模型 provider key 往往能产生费用，也可能访问私有日志。Agent 不应该把 key 读进上下文，而应该由运行时安全地使用。

配置层也要区分：

- 全局 provider 偏好。
- 项目级模型要求。
- 企业 managed config。
- 临时任务 override。

如果这些层冲突，系统必须能解释最终使用哪个模型。

## 本地模型的边界

本地模型看起来更隐私，但能力可能不同。它可能工具调用较弱、上下文较短、代码能力不足、延迟更高。Agent 不能因为“本地”就假设安全，也不能因为“云端”就假设强。模型选择应该基于任务和风险。

一个实用策略是：默认把模型能力写进 capability registry。比如：

```json
{
  "model": "example-local-code",
  "tool_calling": "limited",
  "context": 32768,
  "code_editing": "medium",
  "json_reliability": "low",
  "recommended_tasks": ["search", "summarize"]
}
```

这种 registry 可以帮助 Agent 选择合适模型，而不是盲目路由。

## 对 AgentLab 的启发

AgentLab 后续可以建立 provider comparison 页面，不只记录支持哪些 provider，还记录模型能力、适用任务、工具调用稳定性、成本和隐私边界。对于“开发 Agent 过程中学到的东西”这个定位，多模型路由会是重要主题。

## 来源

- [Providers](https://opencode.ai/docs/providers/)
- [OpenCode docs](https://opencode.ai/docs/)
- [Config](https://opencode.ai/docs/config/)
