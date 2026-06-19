---
title: Pi 数据与本地边界
description: 开源终端 coding agent 中项目源码、会话日志、模型供应商和扩展数据流的边界。
---

Pi 是本地终端 coding agent，但“本地运行”不等于没有数据风险。它会读取项目文件、构造模型上下文、保存会话、调用模型供应商，并可能加载扩展。数据与隐私研究应围绕这些路径展开，而不是围绕消费者聊天产品的训练透明度。

## 数据流

Pi 的典型数据流包括：

- 项目文件进入上下文。
- `AGENTS.md` 和 `SYSTEM.md` 进入 prompt。
- 用户消息和工具结果进入会话。
- 模型请求发送到配置的 provider。
- 扩展读取、修改或生成额外上下文。
- 会话和日志保存在本地目录。

每条路径都需要回答两个问题：数据在哪里被读取，数据会被发到哪里。尤其是 provider 调用和扩展联网能力，需要明确记录。

## 本地缓存和会话

Coding agent 的会话记录可能包含源码片段、命令输出、错误日志、文件路径、环境变量片段和用户决策。这些内容不一定适合提交到 Git，也不一定适合进入公开 issue。研究 Pi 时要检查会话格式、默认存储路径、删除能力和导出能力。

AgentLab 自己也采用类似原则：第三方源码同步到 `research/sources/cache/`，该目录被 `.gitignore` 排除；仓库只提交 manifest，不提交外部源码缓存。

## Provider 边界

Pi 支持统一模型供应商接口。模型 provider 是数据边界的关键：同一个 prompt 发给不同 provider，日志、保留、训练使用、区域和合规规则都可能不同。Pi harness 应尽量让用户知道当前请求会发往哪个 provider、使用哪个模型、是否包含项目文件。

对于自己的 agent，provider 层应该支持：

- 明确的模型和供应商标识。
- 请求日志脱敏或关闭。
- 不同项目的 provider policy。
- 对敏感项目禁用联网模型的策略。
- 把“上下文将发送到外部模型”作为可见事实。

## 扩展数据流

扩展比 provider 更难审计，因为扩展可以自定义行为。一个扩展可能调用内部 API、读取本地配置、上传日志或保存额外缓存。Pi 的扩展生态越强，越需要约束：

- 扩展来源和版本锁定。
- 权限声明。
- 网络访问提示。
- 文件读写范围。
- 对敏感输出的过滤。

否则扩展会成为绕过 harness 安全边界的后门。

## 研究方法

研究 Pi 的数据边界时，不要只读 README。应该从同步源码里追踪：

- provider 调用封装在哪里。
- session 文件格式在哪里定义。
- 工具调用结果如何进入历史。
- 扩展 API 是否暴露文件系统和网络能力。
- prompt 构造是否包含完整文件、摘要还是片段。

这些问题可以直接从 `research/sources/cache/git/pi` 里搜索和验证。

## 来源

- [earendil-works/pi](https://github.com/earendil-works/pi)
- [Pi 官网](https://pi.dev/)
- [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
