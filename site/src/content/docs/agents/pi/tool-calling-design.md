---
title: Pi 工具与扩展设计
description: Pi 如何把工具调用、扩展、技能和提示词模板变成 minimal coding harness 的核心表面。
---

Pi 的工具调用设计要从“可扩展 harness”理解。它不只是内置几个工具让模型调用，而是把 coding agent 的能力拆成 core、coding agent、TUI、扩展、技能和提示词模板。用户可以在不 fork 主仓库的情况下，把自己的工作流接进去。

## 内置工具和扩展工具

内置工具通常承载基础开发能力：读文件、编辑文件、运行命令、搜索项目、管理会话。扩展工具则承载项目或个人工作流：调用内部 API、生成固定格式报告、执行特定测试矩阵、查询私有系统。

这两类工具应该分开研究。内置工具代表 Pi 的默认安全和能力边界；扩展工具代表生态能力和风险边界。

## 工具契约

一个可研究的工具契约至少包含：

- 工具名和自然语言描述。
- 输入 schema。
- 输出结构。
- 是否读文件、写文件、运行命令或联网。
- 是否需要用户确认。
- 失败如何反馈给模型。
- 结果是否进入会话历史。

Pi 的价值在于这些契约可以在源码中追踪。相比只能观察黑盒产品，开源 harness 能让我们看到工具如何被注册、描述、调用和记录。

## 技能和 prompt template

技能和 prompt template 不是工具，但会改变工具使用方式。技能可以规定流程，例如“先搜索，再读文件，再给 patch”；template 可以生成特定任务提示，例如“把 issue 转成实现计划”。它们会影响模型选择工具的顺序和判断标准。

研究 Pi 时要把三者放在一起看：

- 工具提供动作能力。
- 技能提供流程能力。
- 模板提供任务入口。

这三者如果边界清楚，agent 就容易扩展；如果边界混乱，所有能力都会变成一团 prompt。

## 与 Claude Code Skills 的关系

Pi 的 skills 设计可以和 Claude Code、Codex CLI 的技能生态放在一起研究。一个趋势是：agent 不再只靠单个全局系统提示词，而是按任务加载技能说明和局部流程。技能的命名、目录结构、加载时机和版本化会成为 agent 工程的重要接口。

这也解释了为什么源码同步重要。只有持续跟踪 Pi 的仓库，才能看到技能目录、扩展 API、prompt template 和工具契约如何变化。

## 权限和确认

工具越容易扩展，越需要确认策略。最低限度应区分：

- 只读工具。
- 写文件工具。
- shell 工具。
- 网络工具。
- 调用外部服务的工具。
- 修改 agent 自身配置或 prompt 的工具。

Pi 的 minimal harness 不应该等于 minimal permission model。即使默认实现很薄，扩展也应该把风险暴露给用户。

## 对 AgentLab 的启发

如果以后 AgentLab 自己做研究工具，应该借鉴 Pi 的分层方式：核心工具保持少，项目定制走扩展，重复流程沉淀为技能，任务入口使用 prompt template。这样工具不会失控，文档也能自然解释每一层。

## 来源

- [earendil-works/pi](https://github.com/earendil-works/pi)
- [Pi 官网](https://pi.dev/)
- [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
