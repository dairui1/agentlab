---
title: 上下文
description: Agent 如何选择、压缩和更新上下文。
---

Agent 工程里最容易被低估的是上下文策略：给少了会漏信息，给多了会增加成本、降低命中率、放大噪声。

## 关键问题

- 当前任务真正需要哪些文件。
- 搜索结果如何排序。
- 历史消息什么时候应该摘要。
- 工具输出如何压缩。
- 什么时候应该重新读取原文。
- 哪些上下文应该稳定放在 prompt 前缀。

## 初始模型

<div class="agentlab-flow">
  <div class="agentlab-step"><span>收集</span>读取用户请求、项目说明、代码和工具输出。</div>
  <div class="agentlab-step"><span>筛选</span>只保留对当前决策有用的信息。</div>
  <div class="agentlab-step"><span>压缩</span>摘要重复输出，保留路径、错误、结论。</div>
  <div class="agentlab-step"><span>更新</span>每轮行动后刷新状态，避免用过期假设。</div>
</div>

## 后续组件想法

- Context budget visualizer：显示不同上下文块如何占用 token budget。
- Retrieval sandbox：调节搜索 query，看进入上下文的文件如何变化。
