---
title: 项目定位
description: AgentLab 的内容边界、发布形态和仓库组织方式。
---

AgentLab 是一个长期维护的 Agent 工程知识库。它记录的是“开发 Agent 过程中学到的东西”，包括可复用的工程判断、失败经验、提示词演化、工具协议、环境约束和可运行实验。

## 内容边界

- `工具`: shell、文件编辑、浏览器、MCP、GitHub、检索、执行器。
- `环境`: 本地开发、CI、容器、沙箱、Secrets、远程执行。
- `提示词`: system/developer/tool prompt、版本 diff、schema、反模式。
- `上下文`: 文件选择、记忆、摘要、压缩、workspace indexing。
- `缓存`: prompt cache、工具结果缓存、上下文复用、命中率分析。
- `案例`: Claude Code、Codex、OpenCode、Pi 等作为工程拆解对象。

## 仓库分层

<div class="agentlab-grid">
  <div class="agentlab-tile">
    <strong>research/</strong>
    <p>原始研究、来源记录、草稿、待验证结论。</p>
  </div>
  <div class="agentlab-tile">
    <strong>data/</strong>
    <p>结构化索引和组件输入，适合被脚本、网站和 CI 消费。</p>
  </div>
  <div class="agentlab-tile">
    <strong>site/</strong>
    <p>对外文档站和交互组件，保持发布层清晰。</p>
  </div>
  <div class="agentlab-tile">
    <strong>generated/</strong>
    <p>定时任务生成的 diff、索引、报告，允许审查后发布。</p>
  </div>
</div>

## 发布方式

内容应该尽量从仓库产出。推荐流程：

1. 定时任务抓取或检查公开来源。
2. 脚本生成结构化数据和 diff 报告。
3. CI 校验数据、文档和网站构建。
4. 低风险更新自动发布，高风险 prompt 变更走 PR 审查。
