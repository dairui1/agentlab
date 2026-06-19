# Codex /goal 原理 Research State

- Slug: `codex-goal-command`
- Created: 2026-06-19
- Status: drafted
- Summary: 研究 Codex /goal 如何创建、跟踪、恢复和完成长期目标。

## Research Question

Codex 的 `/goal` 到底是不是一个“更长的 prompt”，还是有独立的状态机、持久化、自动续跑和模型侧工具约束？如果它是一个完整机制，哪些部分由 UI/CLI 控制，哪些部分暴露给模型？

## Scope

- In scope:
  - OpenAI Codex 官方手册中对 Goal mode 和 `/goal` 的公开说明。
  - `openai/codex` 仓库中 `codex-rs/ext/goal`、`codex-rs/protocol`、`codex-rs/state` 的源码实现。
  - goal 的状态枚举、持久化表、模型可见工具、运行时续跑、预算和错误处理。
- Out of scope:
  - Codex App/IDE/CLI 前端 slash command UI 的具体组件实现。
  - OpenAI 服务端调度和模型内部策略。
  - `/goal` 在未开源宿主中的私有实现细节。

## Decisions

- 2026-06-19: Skeleton created.
- 2026-06-19: 将 Codex 源码同步清单补充 `codex-rs/ext/goal` 和 `codex-rs/state`，因为 `/goal` 的关键逻辑不在 prompt 模板目录，而在扩展运行时和状态存储层。
- 2026-06-19: 文章采用“事实/源码证据/工程推断”分层，避免把未开源 UI 行为误写成源码事实。

## Current Next Step

Run generated files, validation, tests, and site build.
