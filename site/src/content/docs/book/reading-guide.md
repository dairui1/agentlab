---
title: 阅读路线
description: 根据不同目的选择 AgentLab 的阅读路径。
---

AgentLab 不是线性教材。你可以按自己的问题进入：要做产品架构，就从 Agent 工程地图开始；要做提示词版本管理，就从提示词和 diff 开始；要比较现有产品，就从四个 Agent 个案开始；要设计自动发布，就从内容生产流水线开始。

## 路线一：我要开发一个编码 Agent

建议顺序：

1. [Agent 工程地图](/agentlab/foundations/agent-engineering-map/)
2. [Agent Loop](/agentlab/foundations/agent-loop/)
3. [工具](/agentlab/tools/)
4. [环境](/agentlab/environments/)
5. [提示词](/agentlab/prompts/)
6. [Codex](/agentlab/agents/codex/)
7. [Claude Code](/agentlab/agents/claude-code/)
8. [OpenCode](/agentlab/agents/opencode/)

这条路线的核心问题是：模型如何读懂项目、如何决定下一步、如何安全调用工具、如何在失败后恢复、如何把长期团队规范变成可执行的配置。读完之后，你应该能画出自己的编码 Agent 的最小架构图：输入层、上下文层、推理层、工具层、权限层、执行层、观察层和交付层。

## 路线二：我要研究提示词和上下文

建议顺序：

1. [提示词](/agentlab/prompts/)
2. [上下文](/agentlab/context/)
3. [缓存](/agentlab/caching/)
4. [提示词 Diff](/agentlab/labs/prompt-diff-viewer/)
5. [Claude Code](/agentlab/agents/claude-code/)
6. [Codex](/agentlab/agents/codex/)

这条路线的核心问题是：哪些指令应该稳定放在前缀，哪些上下文应该由项目文件提供，哪些内容应该由记忆提供，哪些内容应该在每轮任务中重新检索。提示词版本研究不要只看“新版本多了一句话”，而要看这句话属于哪个层：身份、工具、权限、风格、规划、验证、风险、最终回答、用户交互还是产品边界。

## 路线三：我要理解不同 Agent 产品

建议顺序：

1. [能力矩阵](/agentlab/comparison/matrix/)
2. [Claude Code](/agentlab/agents/claude-code/)
3. [Codex](/agentlab/agents/codex/)
4. [OpenCode](/agentlab/agents/opencode/)
5. [Pi](/agentlab/agents/pi/)
6. [设计模式](/agentlab/comparison/patterns/)

这条路线要避免一个常见误区：用同一种指标评价所有 Agent。Claude Code 看重产品化权限、hooks、skills 和自动模式；Codex 看重沙箱、审批、`AGENTS.md`、云/本地任务和 review 工作流；Pi 看重 minimal harness、可观察性、扩展、skills 和 prompt templates；OpenCode 的价值在于开源可检查、可配置、可接多模型。不同产品的“Agent 性”不是同一种形态。

## 路线四：我要维护这个项目

建议顺序：

1. [内容生产流水线](/agentlab/operations/content-pipeline/)
2. [来源索引](/agentlab/book/sources/)
3. [Agent 工程手册](/agentlab/book/)
4. `scripts/build_site_index.py`
5. `generated/site-index.json`

这条路线把 AgentLab 本身当作一个内容系统。每次新增来源、章节、数据或实验组件，都要考虑它能否被脚本发现、能否被 CI 校验、能否在站点中被导航、能否被未来的 Agent 继续编辑。好的文档项目不是“写完一篇文章”，而是让未来的更新成本变低。

## 阅读时的标记

建议你在研究笔记中使用四类标记：

- `source`: 有官方文档、公开仓库或可引用页面支持。
- `observed`: 来自重复使用或产品行为观察，但没有直接文档证明。
- `inferred`: 基于公开事实的工程推断，需要后续验证。
- `todo`: 还没有足够证据。

这四类标记能防止文档越写越像传言库。Agent 研究的核心价值不是“知道很多八卦”，而是把可验证事实和可复用判断分开。
