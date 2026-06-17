---
title: 缓存
description: Agent 开发中的 prompt cache、上下文复用和命中率。
---

缓存不是单纯的性能优化，它会影响 prompt 组织、上下文顺序、工具 schema 稳定性和任务拆分方式。

## 直觉规则

- 稳定内容越靠前，越容易复用。
- 频繁变化的任务细节应该靠后。
- 工具 schema、系统约束、项目摘要适合保持顺序稳定。
- 大段无关上下文会降低命中率和可解释性。

## 常见缓存块

<div class="agentlab-grid">
  <div class="agentlab-tile">
    <strong>系统契约</strong>
    <p>身份、风格、权限、编辑规则，通常最稳定。</p>
  </div>
  <div class="agentlab-tile">
    <strong>工具 schema</strong>
    <p>工具名称、参数、返回格式，变化会影响大量缓存。</p>
  </div>
  <div class="agentlab-tile">
    <strong>项目上下文</strong>
    <p>README、目录结构、约定、测试方式，适合生成摘要。</p>
  </div>
  <div class="agentlab-tile">
    <strong>当前任务</strong>
    <p>用户本轮需求，通常最容易变化，应该靠后。</p>
  </div>
</div>

## 交互入口

查看 [缓存命中演示](/agentlab/labs/cache-hit-demo/)。
