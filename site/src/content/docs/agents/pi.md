---
title: Pi
description: Pi 作为情绪智能和关系型 Agent 样本的产品定位、上下文策略和工程启发。
---

Pi 和 Claude Code、Codex、OpenCode 不属于同一类 Agent。后三者主要面向代码仓库和开发工作流，Pi 更接近关系型、情绪智能、个人助理方向。把 Pi 放进 AgentLab，不是为了比较谁更会写代码，而是为了提醒我们：Agent 不只有“执行工具完成任务”一种形态。长期对话、语气一致性、用户安全、人格设定、情绪承接和信任关系同样是 Agent 工程问题。

## 已确认事实

Pi 的官方入口说明它由 Inflection AI 创建，Inflection AI 将自己定位为 empowering people and brands with emotionally intelligent, human-centered AI。Inflection 的 About 页面进一步强调公共利益使命、提升人类福祉和生产力，以及把 EQ 和 IQ 结合的 human-centered AI。

Inflection 开发者文档显示，Inflection-3 包含不同用途的模型。Pi (3.0) 被描述为 powering pi.ai and Pi iOS app experiences，包含 backstory、emotional intelligence、productivity 和 safety，并适合 customer support chatbots 等场景。Productivity (3.0) 更强调按指令输出和 JSON 等精确任务。Pi (3.1-Preview) 是包含 backstory、emotional intelligence、tool calling 等能力的 preview 模型，处于 agentic workflows 和 advanced features 的 beta testing。

Inflection 的训练数据说明和透明度声明还提供了产品背后的模型训练信息：训练数据来源包括公开数据、授权数据和合成蒸馏数据；Inflection 强调 privacy-by-design、避免披露训练数据中的个人信息，并说明其数据处理包括去重、质量过滤、数据混合、内容过滤和格式标准化。

## 为什么 Pi 对 Agent 工程有价值

编码 Agent 的默认目标是完成任务：修 bug、加功能、跑测试、开 PR。Pi 的默认目标更接近关系维持：让用户愿意表达、继续对话、被理解、获得支持。这两类 Agent 的优化目标不同，导致架构关注点不同。

如果一个 Agent 面向心理支持、客户沟通、个人反思、学习陪伴或企业内部助理，它不能只追求“快速给答案”。它要处理用户状态、语气、上下文连续性、安全边界和长期信任。Pi 是这个方向的样本。即使我们无法看到它的完整内部提示词，也可以从产品定位和开发者模型说明中学习：backstory、emotional intelligence、safety、tone mirroring、agentic preview 是其重要概念。

## 关系型上下文

Pi 的上下文不是代码文件，而是关系状态。关系型上下文至少包括：

- 用户当前问题或情绪。
- 用户先前表达过的偏好、目标、压力和边界。
- 助手自己的稳定人格和语气。
- 当前对话的情感节奏。
- 安全风险和危机信号。
- 是否应该建议用户寻求现实世界帮助。

这种上下文不能简单按“相关文档检索”来处理。过多引用历史可能显得冒犯；完全不记得用户又会破坏关系感。一个关系型 Agent 需要更细的记忆策略：哪些内容可以记，哪些内容应短期使用，哪些内容必须明确征得同意，哪些内容不能用于未来个性化。

## Prompt 和人格

Pi 这类产品的 prompt 研究更适合关注 persona 和 response policy，而不是工具调用。核心问题包括：

- 助手如何表达温暖、好奇和尊重。
- 助手如何避免过度迎合或给出不负责任建议。
- 助手如何在用户情绪低落时承接，而不是机械解决问题。
- 助手如何保持人格一致性。
- 助手如何处理隐私、危机、安全和专业边界。

开发者文档提到 Pi 模型包含 backstory 和 emotional intelligence，这说明人格不是 UI 文案，而是模型/配置层面的设计资产。对自己的 Agent 来说，如果要做长期陪伴或客服角色，persona 应该被版本化、测试和审查，而不是散落在 prompt 里。

## 工具调用和 agentic preview

Pi 3.1 Preview 文档提到 tool calling 和 agentic workflows。这说明关系型助手也会走向可行动 Agent。但关系型助手接工具的风险比编码 Agent 更复杂：用户可能在情绪脆弱时授权行动，助手可能把支持性语气和行动建议混在一起，工具结果可能影响用户现实决策。

因此，Pi 方向的工具设计需要更保守：

- 高风险行动必须有明确确认。
- 医疗、法律、金融、危机类建议必须有边界。
- 记忆和个性化要清晰告知。
- 工具结果要区分事实、建议和情绪支持。
- 不要用“我理解你”掩盖不确定性。

## 与编码 Agent 的差异

Pi 的价值不在于文件系统操作，而在于对话体验和人本定位。编码 Agent 的评价指标可以是测试通过率、PR 质量、编辑正确性和上下文命中率。Pi 的评价指标应该包括用户是否感到被理解、是否避免伤害、是否保持边界、是否适度个性化、是否在长期对话中保持一致。

这也提醒我们：AgentLab 的比较矩阵不能只有“是否能执行命令”。一个 Agent 的核心能力要和目标场景匹配。对 Pi 来说，`shell`、`git`、`MCP` 不是主轴；backstory、emotional intelligence、safety、tone mirroring、voice 和长期关系才是主轴。

## 待验证问题

- Pi 消费者产品当前是否公开说明长期记忆机制。
- Pi 3.1 Preview 的 tool calling 具体工具协议和权限模型。
- Pi 在企业场景中如何区分 customer support、employee assistant 和 personal AI。
- Pi 的 safety protocol 如何在产品中体现。
- 开发者 API 与 pi.ai / Pi iOS app 的行为差异。

## 主要来源

- [Pi](https://hey.pi.ai/)
- [Inflection AI](https://inflection.ai/)
- [Inflection AI About](https://inflection.ai/about)
- [Inflection-3 Pi developer docs](https://developers.inflection.ai/docs/inflection-3-pi)
- [Notice on model training](https://inflection.ai/notice-on-model-training)
- [Training Data Transparency Statement](https://inflection.ai/training-data-transparency-statement)
