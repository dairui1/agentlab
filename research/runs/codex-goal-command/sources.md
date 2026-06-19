# Codex /goal 原理 Sources

记录支撑本次研究结论的所有来源。

## 来源记录

- URL/path: `https://developers.openai.com/codex/codex-manual.md`
  - Type: official-doc
  - Access date: 2026-06-19
  - Local cache: `/var/folders/6m/gws8r14s7w78rlgw5450w7b00000gn/T/openai-docs-cache/codex-manual.md`
  - What it supports: Goal mode 是跨较长任务保持的持久目标；目标文本既是起始 prompt 也是完成标准；`/goal` 可在 app、IDE extension、CLI 中开启；如果 slash command 不出现，需要启用 `features.goals`；CLI 支持 `/goal`、`/goal pause`、`/goal resume`、`/goal clear`；目标非空且最多 4,000 字符。
  - Volatility: medium
- URL/path: `generated/source-sync-manifest.json`
  - Type: observation
  - Access date: 2026-06-19
  - What it supports: 本次源码阅读基于 `openai/codex` `main` 分支 commit `dac588f41398e8b628d71838d5745dad430477f1`，本地路径为 `research/sources/cache/git/codex`。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/protocol/src/protocol.rs`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: 协议层定义 `ThreadGoalStatus` 六种状态、4,000 字符校验、`ThreadGoal` 字段、`ThreadGoalUpdatedEvent` 事件结构。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/ext/goal/src/spec.rs`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: 模型可用的三个 goal 工具是 `get_goal`、`create_goal`、`update_goal`；`create_goal` 只能在用户或系统/开发者明确要求时调用；`update_goal` 只能标记 `complete` 或 `blocked`，不能由模型暂停、恢复、设置预算受限或使用量受限。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/ext/goal/src/tool.rs`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: 工具执行器如何读取、创建、更新 goal；创建时写入状态库、标记当前 turn active、发出 `ThreadGoalUpdated`；更新时先记账再把状态改为 complete/blocked。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/ext/goal/src/api.rs`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: 宿主侧 `GoalService` 提供 get/set/clear 接口，外部 UI/CLI 控制 goal 时会先做运行时互斥和进度记账，再更新状态并触发运行时效果。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/ext/goal/src/runtime.rs`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: goal runtime 负责恢复 active goal、在 idle 时注入 continuation steering 并尝试启动新 turn、在目标编辑后注入 updated-objective steering、在错误或用量限制时停止 active goal。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/ext/goal/src/extension.rs`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: goal 是 Codex extension 生命周期的一部分；thread start/resume/idle/stop、turn start/stop/abort/error、token usage、tool finish 都有 hook；Plan mode 会清除当前 turn goal；review subagent 不暴露 goal 工具。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/ext/goal/src/steering.rs` and `research/sources/cache/git/codex/codex-rs/ext/goal/templates/goals/*.md`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: goal 通过 `InternalModelContextFragment` 以内部上下文注入；模板明确目标是用户提供数据，不是更高优先级指令；completion audit 和 blocked audit 是 steering 的核心。
  - Volatility: medium
- URL/path: `research/sources/cache/git/codex/codex-rs/state/goals_migrations/0001_thread_goals.sql` and `research/sources/cache/git/codex/codex-rs/state/src/runtime/goals.rs`
  - Type: source-code
  - Access date: 2026-06-19
  - What it supports: `thread_goals` 持久化表结构；`GoalStore` 的 get/replace/insert/update/delete/account usage；token budget 达到后自动转 `budget_limited`。
  - Volatility: medium
