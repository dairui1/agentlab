---
title: 提示词
description: 把提示词当作可版本化的工程资产。
---

提示词是 Agent 的工程接口。它描述角色、工具、权限、沟通方式、失败处理和产品边界。只把它当作文案会导致变更不可审查、效果不可复现。

## 维护原则

- 每个 snapshot 记录来源、访问日期和采集方式。
- 区分真实来源、观察行为和推断结论。
- 不提交 secrets、私有账号内容或未授权泄露内容。
- 每次变化写 changelog，而不是只保留最新版本。

## 版本记录粒度

<div class="agentlab-grid">
  <div class="agentlab-tile">
    <strong>角色和语气</strong>
    <p>agent 是研究员、编码助手、客服，还是个人助理。</p>
  </div>
  <div class="agentlab-tile">
    <strong>工具协议</strong>
    <p>工具何时调用、如何解释结果、失败如何处理。</p>
  </div>
  <div class="agentlab-tile">
    <strong>权限边界</strong>
    <p>哪些动作必须询问用户，哪些动作可以自动完成。</p>
  </div>
  <div class="agentlab-tile">
    <strong>输出契约</strong>
    <p>最终回答、进度更新、风险说明和测试报告怎么写。</p>
  </div>
</div>

## 交互入口

查看 [提示词 Diff](/agentlab/labs/prompt-diff-viewer/)。
