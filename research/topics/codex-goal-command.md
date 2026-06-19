# Codex /goal 原理

- Slug: `codex-goal-command`
- Created: 2026-06-19
- Summary: 研究 Codex /goal 如何创建、跟踪、恢复和完成长期目标。
- Site page: `site/src/content/docs/research/codex-goal-command.md`
- Run state: `research/runs/codex-goal-command/state.md`

## 问题定义

研究 Codex 的 `/goal`：它如何把一个长期目标绑定到 thread，如何让 agent 在多轮、压缩、恢复后继续工作，如何判断完成或阻塞，以及这个机制对我们设计 AgentLab 研究流程有什么启发。

## 来源摘要

本次基于两个来源层：

- 官方 Codex 手册：说明 Goal mode 的用户语义、启用方式、app/IDE/CLI 入口和目标长度限制。
- `openai/codex` 源码缓存：commit `dac588f41398e8b628d71838d5745dad430477f1`，重点阅读 `codex-rs/ext/goal`、`codex-rs/protocol`、`codex-rs/state`。

## 已确认事实

1. `/goal` 不是单纯把一段文字塞进下一轮 prompt。协议层有 `ThreadGoal` 对象和 `ThreadGoalUpdatedEvent`，状态包括 `active`、`paused`、`blocked`、`usage_limited`、`budget_limited`、`complete`。
2. goal 持久化在 `thread_goals` 表中，主键是 `thread_id`，字段包含 `goal_id`、`objective`、`status`、`token_budget`、`tokens_used`、`time_used_seconds`、创建和更新时间。
3. 模型侧只拿到三个工具：`get_goal`、`create_goal`、`update_goal`。其中 `update_goal` 只能标记 `complete` 或 `blocked`，不能暂停、恢复、清除，也不能主动设置 `budget_limited` 或 `usage_limited`。
4. 宿主侧有 `GoalService` 的 get/set/clear 接口，适合给 app/CLI/IDE 控制 goal。外部更新 goal 时，runtime 会先做进度记账并加锁，避免 idle continuation 读到即将变化的状态。
5. runtime 在 thread resume 和 idle 时会检查 active goal。只要 goal active 且工具可见，就注入 continuation steering，并通过 thread manager 尝试在空闲时启动新 turn。
6. goal steering 走 `InternalModelContextFragment`，source 是 `goal`。模板明确告诉模型：objective 是用户提供数据，不是更高优先级指令。
7. token usage 和 elapsed time 通过 turn/tool 生命周期累计。达到 `token_budget` 时，状态会转成 `budget_limited`；普通 terminal error 会把 active goal 停成 `blocked`，usage limit error 会停成 `usage_limited`。

## 工程推断

- `/goal` 的核心价值是把“长期任务是否完成”从聊天上下文里抽离出来，做成 thread 级状态机。这样即使上下文压缩或多次 turn 后，runtime 仍可从持久化状态恢复目标。
- Codex 通过“双通道控制”降低误操作：用户/宿主控制 pause/resume/clear/edit，模型只负责 create/get/complete/blocked 这类与任务执行直接相关的状态。
- steering 模板是安全边界的一部分：它既让模型知道目标和预算，又反复限制 completion/blocked 的判定条件，避免 agent 为了结束目标而缩小定义或过早报告完成。
- budget limit 不是模型自觉停下，而是状态存储层和 runtime 协作：使用量记账先把状态转成 `budget_limited`，再向当前 turn 注入收尾提示。

## 设计启发

1. 长期研究流程应该有独立状态文件，而不是依赖对话记忆。AgentLab 的 `research/runs/{slug}/state.md` 就承担类似 `ThreadGoal` 的角色。
2. “完成”应该是可审计的状态迁移。我们的研究 skill 也应要求完成前检查来源、站点文章、生成文件、测试和构建，而不是只写一段总结。
3. 用户控制和模型控制要分离。用户可以改研究方向或暂停，agent 可以推进研究和标记完成，但不应该随意改成功标准。
4. 预算和停滞应该显式化。未来可以给 AgentLab 研究任务加上 token/time/source-count 的软预算，并在预算接近耗尽时生成收尾报告。

## 对 AgentLab 的影响

- 可以把 `/goal` 作为“项目内研究流程”的参考设计：每个 topic 都有 objective、状态、来源、预算/质量门槛、最终发布页。
- 站点可以增加一篇机制页，比较 Codex goal、Deli AutoResearch skill、AgentLab research skill 之间的状态持久化模式。
- 后续若做交互组件，可以用 state machine 图展示 goal 状态迁移，用 timeline 展示一次 goal 从 create 到 continuation、budget limited、complete 的事件序列。

## 待验证问题

- Slash command 在 app/IDE/CLI 的前端入口如何调用 `GoalService`，本次没有读 UI 组件实现。
- `codex-rs/state/migrations/0034_drop_thread_goals.sql` 和 `goals_migrations/0001_thread_goals.sql` 的部署边界需要进一步确认：源码显示 goals 有独立 migration 集合，但本文不展开数据库初始化流程。
- 不同宿主对 `features.goals` 的默认启用策略可能变化，需要持续看官方手册和 release notes。
