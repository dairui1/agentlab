---
title: Agent-native 项目协议
description: 让 AgentLab 的研究、同步、发布和交互组件都能被 agent 以同一套 action 模型驱动。
---

AgentLab 不应该只是一个给人看的文档站，也应该是一个 agent-native 项目。这里的意思不是简单加聊天框，而是把仓库里的核心操作定义成稳定 action：人点按钮、CLI 脚本、定时任务、MCP tool、Codex 或 Claude Code 都调用同一套动作。

这个方向直接接入 Builder.io 开源的 `@agent-native/core`，但不把现有文档站整体重写。现阶段更合适的路线是 **repo-native + Agent-Native control plane**：Markdown、JSON、脚本、生成报告和 Git 仍然是事实来源，`apps/agent-native/` 用官方框架把关键操作暴露成 action。

## 第一版协议

项目里有两层：

```text
apps/agent-native/
  actions/    # 真实 @agent-native/core defineAction
  lib/        # 仓库路径和命令执行 helper

agent/
  actions/    # 迁移期协议说明
  jobs/       # 多个动作组成的研究/发布流程
  policies/   # 来源边界、发布门槛和安全规则
  traces/     # agent 运行轨迹格式
```

`apps/agent-native/` 是可执行层，`agent/` 是项目策略层。这样可以直接用官方框架，同时保留 AgentLab 的研究边界和发布规则。

## 当前动作

| Action | 作用 | 当前入口 |
| --- | --- | --- |
| `list-site-pages` | 从 `generated/site-index.json` 读取站点页面索引 | Agent-Native action |
| `create-research-topic` | 为新研究话题创建状态、来源、研究笔记和站点页骨架 | Agent-Native action 包装 `scripts/new_research_topic.py` |
| `sync-agent-sources` | 同步公开源码/包缓存并更新 manifest | Agent-Native action 包装 `make sync-sources` |
| `validate-research` | 生成索引、校验 catalog、跑测试、构建站点 | Agent-Native action 包装 `make` 和 `npm` |

本地使用：

```bash
cd apps/agent-native
npm install
npm run action -- list-site-pages
npm run action -- validate-research
```

这些 action 不是为了替代现有脚本，而是把脚本纳入官方 Agent-Native action surface。后续 MCP server、网站后台按钮、GitHub Actions 都应该复用这些 action。

## 研究状态机

一个研究话题应当从状态机里流动，而不是只停留在对话上下文中：

```text
idea -> collecting -> synthesizing -> drafted -> validated -> published
                                      \-> needs-refresh
                                      \-> blocked
```

状态写在 `research/runs/{slug}/state.md`，来源写在 `research/runs/{slug}/sources.md`。这样下一次 agent 接手时，不需要依赖上一轮聊天记忆。

## Action-native 的好处

- **可复用**：同一个研究动作可以由人、CLI、定时任务、MCP、网页按钮触发。
- **可审计**：每次运行记录来源、命令、产物、校验和提交。
- **可恢复**：长任务中断后，可以从状态文件和 trace 继续。
- **可约束**：来源边界、泄露材料、私有账号数据、发布门槛都写成项目内 policy。
- **可产品化**：未来网站里的“刷新来源”“生成专题”“发布草稿”按钮，不需要另写一套逻辑。

## 与现有流水线的关系

AgentLab 已经有内容流水线：`research/` 写研究，`site/` 发布文档，`generated/` 放索引和报告，`.github/workflows/` 做自动化。agent-native 协议是把这些能力统一命名，并补上执行边界。

短期内，最重要的是三个落点：

1. 新研究话题必须先创建 action 可识别的 run 目录。
2. 来源采集必须标注证据等级：官方事实、本地观察、第三方主张、AgentLab 推断。
3. 发布前必须跑生成、校验、测试和站点构建。

## 后续演进

下一步可以围绕 `apps/agent-native/` 继续扩展：

- 打开 MCP/HTTP 暴露，让外部 agent 直接调用 AgentLab 动作。
- 在站点里做研究 dashboard，展示每个 topic 的状态、来源数和最后刷新时间。
- 为 `research-to-publish` job 生成 trace，记录 agent 的每一步动作。
- 给 source refresh 增加 freshness report，自动提示哪些页面需要更新。

这样 AgentLab 会从“记录 agent 研究的文档站”进化成“由 agent 持续维护的研究系统”。
