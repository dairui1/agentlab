---
title: Codex 沙箱与审批
description: Codex 如何把技术沙箱、审批策略、网络控制和自动审查组合成安全执行模型。
---

Codex 的沙箱和审批文档是研究编码 Agent 安全边界的重要材料。它把一个常见但模糊的问题拆清楚了：Agent 能做什么，和 Agent 什么时候必须问用户，不是一回事。前者是 sandbox mode，后者是 approval policy。

## 技术边界和交互边界

技术边界由沙箱执行。它决定模型生成的命令能访问哪些文件、能不能联网、能不能写工作区外路径。交互边界由审批策略执行。它决定当 Agent 想越过边界时，是询问用户、自动拒绝、自动审查还是继续执行。

这个设计比单纯 prompt 安全强很多。Prompt 可以告诉 Agent 不要做危险事，但不能真正阻止命令访问路径或联网。沙箱可以强制限制执行环境；审批策略则让合法但高风险的需求有处理通道。

## 本地和云端的差异

Codex 文档区分本地 CLI/IDE/app 和 cloud。云端任务运行在 OpenAI 管理的隔离容器中，并有 setup 和 agent phase 的差异；本地任务则依赖 OS 级沙箱和工作区限制。这个区别对 Agent 产品很重要，因为同一操作在不同表面风险不同。

本地 Agent 能接触用户真实机器、未提交修改、私有配置和本地服务。云端 Agent 接触隔离容器、依赖安装、repo checkout 和配置 secrets。Chrome 或浏览器表面又会接触用户登录态。不能用一种权限模型覆盖所有表面。

## 网络默认关闭的意义

Codex 文档强调默认网络访问关闭。这个默认值很保守，但合理。网络访问会引入三类风险：数据外传、外部内容注入、执行环境变化。一个命令如果能下载脚本并执行，沙箱内也可能发生供应链风险；一个网页如果能影响 prompt，后续本地写操作可能被间接操纵。

更好的网络策略是按域名、用途和阶段开放：

- 文档查找：走受控搜索或特定域名。
- 依赖安装：允许 registry，但记录 lockfile 变化。
- 本地服务：只允许明确的 localhost 端口。
- 企业服务：通过 MCP 或 connector，而不是任意 curl。

## 审批策略的产品体验

审批策略要服务用户，而不是服务系统设计者。用户不想理解所有 sandbox internals，但需要知道 Agent 为什么被拦住，以及批准意味着什么。一个好审批提示应该能映射到用户任务：为了运行测试、为了安装依赖、为了访问官方文档、为了推送分支。

如果审批提示只暴露底层错误，例如“sandbox blocked network”，用户仍要猜。更好的提示是：“我需要访问 npm registry 安装测试依赖，当前网络关闭。是否允许本次命令访问 registry？”这才是产品体验。

## Auto review 的启发

Codex manual 提到 automatic approval reviews 可以把符合条件的审批请求交给 reviewer agent 审查。这里的关键不是“用另一个模型替人批准”，而是把审批变成可策略化流程：低风险可通过，高风险需要用户授权，关键风险拒绝，解析失败 fail closed。

对自己的 Agent 来说，自动审查可以从简单规则开始：

- 命令是否包含删除、权限提升、密钥读取。
- 网络目标是否在 allowlist。
- 文件路径是否在工作区。
- 工具是否标记 destructive。
- 用户是否在当前 prompt 明确授权。

复杂场景再引入 reviewer agent，而不是一开始就把所有判断交给模型。

## 回归样例

Codex 风格的权限系统应该有这些回归测试：

- 在 read-only 模式下尝试写文件，应被阻止。
- 在 workspace-write 模式下修改工作区文件，应允许。
- 写工作区外路径，应请求审批或拒绝。
- 网络关闭时访问外部域名，应被阻止。
- 允许特定域名后访问其他域名，应仍被阻止。
- destructive MCP tool 应要求审批。
- 审批解析失败时，应 fail closed。

这些测试比“模型回答说会小心”更有意义，因为它们验证技术边界。

## 来源

- [Sandbox](https://developers.openai.com/codex/concepts/sandboxing)
- [Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
- [Advanced configuration](https://developers.openai.com/codex/config-advanced)
