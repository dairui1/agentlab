---
title: Pi 人格与安全边界
description: 从 persona、emotional intelligence、tool calling preview 和高风险主题看关系型 Agent 的工程约束。
---

Pi 方向的 Agent 让我们看到另一类难题：当助手被设计成温暖、理解、持续陪伴时，它更容易获得用户信任，也更需要安全边界。人格和安全不是两个独立模块，而是同一个体验的两面。

## 人格不能替代能力说明

关系型 Agent 常常会使用自然、亲切、有同理心的语气。这个语气有价值，但也有风险：用户可能把流畅回应理解成专业能力，把陪伴感理解成真实关系，把建议理解成现实承诺。

因此 persona 设计要包含能力边界：

- 助手可以陪用户梳理想法，但不能替代医生、律师或金融顾问。
- 助手可以给建议，但应说明不确定性。
- 助手可以表达关心，但不能操控情绪。
- 助手可以记住偏好，但必须尊重隐私和删除权。
- 助手可以调用工具，但高风险行动需要明确确认。

如果一个 persona 只定义“温柔、聪明、有趣”，还不够工程化。

## Emotional intelligence 的测试

情绪智能不能只靠主观感觉。可以设计测试样例：

- 用户表达焦虑时，助手是否先承接再建议。
- 用户要求绝对保证时，助手是否避免过度承诺。
- 用户表达自责时，助手是否避免加重负担。
- 用户提出危险计划时，助手是否安全介入。
- 用户分享隐私时，助手是否避免不必要扩展记忆。

这些测试不一定能完全自动评分，但可以形成 rubric。关系型 Agent 的评测需要人工审查和安全专家参与，不能只看“用户是否点击喜欢”。

## Tool calling preview 的风险

Inflection-3 Pi 文档提到 Pi 3.1 Preview 包含 tool calling，处于 agentic workflows 和 advanced features 的 beta testing。这说明关系型助手也会走向可行动 Agent。但一旦接工具，风险会变大。

想象一个用户在情绪激动时要求助手“帮我发一封很冲的邮件”。如果助手只是生成草稿，风险可控；如果助手可以直接发送邮件，就必须增加确认、冷静期、预览和撤销策略。关系型 Agent 的工具调用不只是技术问题，也是情绪状态问题。

## 安全协议应融入语气

安全拒绝不应像系统错误。关系型 Agent 的安全回应需要三层：

1. 承认用户感受。
2. 说明不能做什么以及为什么。
3. 提供安全替代路径。

例如面对危险请求，助手不能只说“我不能帮助这个”。它需要解释边界，提供支持，必要时引导用户联系现实世界帮助。Pi 方向的产品尤其需要这种体验设计。

## 隐私和训练透明度

Inflection 的训练数据透明度和模型训练说明强调数据来源、隐私保护和训练处理。这类公开信息对关系型 Agent 很重要，因为用户会分享高度个人化内容。产品需要让用户理解数据如何被使用、是否用于训练、如何保护个人信息。

对自己的 Agent 来说，最低要求是：

- 明确记录是否保存对话。
- 明确记录是否用于训练或改进。
- 提供删除和导出机制。
- 高敏感信息默认不长期保存。
- 内部日志和评测数据要脱敏。

## 对 AgentLab 的研究方式

Pi 的很多产品细节不像开源编码 Agent 那样可直接查看。因此 AgentLab 研究 Pi 时应更谨慎：官方文档可以支撑模型定位、情绪智能、tool calling preview、训练透明度等事实；具体消费者产品的记忆、内部 prompt、危机协议如果没有来源，就只能写成待验证。

不要为了“覆盖 Pi”而编造架构图。Pi 的价值在于提供一个不同方向的 Agent 样本：关系、人格、安全和长期信任。

## 来源

- [Inflection-3 Pi developer docs](https://developers.inflection.ai/docs/inflection-3-pi)
- [Inflection AI About](https://inflection.ai/about)
- [Notice on model training](https://inflection.ai/notice-on-model-training)
- [Training Data Transparency Statement](https://inflection.ai/training-data-transparency-statement)
