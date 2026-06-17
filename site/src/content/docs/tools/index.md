---
title: 工具
description: Agent 工具系统的设计笔记。
---

Agent 的工具系统不是“给模型一堆 API”这么简单。工具会影响规划方式、错误恢复、权限边界、上下文长度和用户信任。

## 需要记录的问题

- 工具是否有稳定 schema。
- 工具结果如何进入上下文。
- 失败结果是否可重试。
- 哪些工具会改变文件系统、网络、浏览器或远端状态。
- 是否需要用户确认。

## 初始工具分类

<div class="agentlab-grid">
  <div class="agentlab-tile">
    <strong>观察工具</strong>
    <p>读文件、搜索、打开网页、查看 Git 状态。默认风险较低。</p>
  </div>
  <div class="agentlab-tile">
    <strong>编辑工具</strong>
    <p>patch、格式化、批量重写。需要保护用户已有修改。</p>
  </div>
  <div class="agentlab-tile">
    <strong>执行工具</strong>
    <p>shell、测试、构建、脚本。输出需要摘要和错误归因。</p>
  </div>
  <div class="agentlab-tile">
    <strong>外部工具</strong>
    <p>GitHub、浏览器、MCP、云服务。需要认证和权限说明。</p>
  </div>
</div>

## 后续组件想法

- Tool contract viewer：展示工具 schema、风险等级、是否需要确认。
- Tool replay：回放一次 agent 如何读文件、编辑、运行测试。
- Permission matrix：比较不同 Agent 对 shell、网络、文件系统的处理。
