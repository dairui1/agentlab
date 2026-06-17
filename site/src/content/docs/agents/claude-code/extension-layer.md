---
title: Claude Code 扩展层
description: CLAUDE.md、skills、subagents、hooks、MCP、plugins 在 Claude Code 中各自解决什么问题。
---

Claude Code 的扩展层值得单独拆开，因为它展示了一个成熟编码 Agent 如何把“长期知识、外部工具、确定性自动化、任务隔离和共享封装”分成不同能力。很多 Agent 项目一开始只有一个巨大 system prompt，所有规则、工具说明、工作流和团队约定都塞进去。Claude Code 的公开文档给出的启发是：扩展层应该分工，而不是把一切都写成提示词。

## 扩展层的分工

Claude Code 官方扩展概览把 `CLAUDE.md`、Skills、subagents、hooks、MCP、plugins 放在同一组“Extend Claude Code”能力里。它们看起来都在“让 Claude 更强”，但工程职责不同。

| 能力 | 主要作用 | 更适合放什么 |
| --- | --- | --- |
| `CLAUDE.md` | 项目和用户长期指令 | 项目结构、测试命令、团队规范、禁止事项 |
| Skills | 可复用工作流和领域知识 | 文档生成、PR 修复、迁移步骤、分析模板 |
| Subagents | 上下文隔离和任务分派 | 大范围搜索、专项分析、多候选方案探索 |
| Hooks | 生命周期中的确定性动作 | 格式化、阻断危险命令、记录日志、通知 |
| MCP | 外部系统和工具接入 | GitHub、数据库、文档、浏览器、内部系统 |
| Plugins | 打包和分享扩展 | 团队标准、工具包、跨项目能力 |

这个表的关键不是记住名字，而是学会分层。项目规则不应该写成 hook；确定性校验不应该交给模型自由发挥；外部系统不应该只用自然语言说明；专项搜索不应该污染主对话上下文。

## `CLAUDE.md`: 项目规则层

`CLAUDE.md` 适合放稳定、可审查、与项目绑定的规则。比如：如何安装依赖、如何运行测试、哪些目录是生成物、哪些文件不能手改、PR 描述格式、发布流程、代码风格、业务术语。它的价值在于进入仓库后自动成为上下文的一部分，而不是每次靠用户重新说明。

好的 `CLAUDE.md` 不应太长。它应该把“每次都要遵守”的规则写清楚，把临时任务细节留给用户 prompt。过长的项目规则会增加上下文成本，也会降低模型抓住当前任务的能力。一个实用原则是：如果一条规则一个月内很少影响任务，就不要放在顶层规则里；可以放进更窄目录、技能或文档链接。

## Skills: 可复用过程层

Skills 适合把一组可复用步骤封装起来。比如“修 GitHub review comment”“生成 API 文档”“迁移某个框架版本”“检查安全策略”。它不同于 `CLAUDE.md`：`CLAUDE.md` 是常驻规则，skill 是在任务匹配时调用的专业流程。

这对 AgentLab 很重要。未来这个仓库可以有自己的 skill：当任务是“新增 Agent 研究页”时，skill 要求先查来源、写来源索引、生成目录、跑 build；当任务是“新增 prompt snapshot”时，skill 要求检查敏感内容、写 changelog、生成 diff。这样内容维护流程不会散落在人的记忆里。

## Subagents: 上下文隔离层

Subagents 的价值不是“更多模型并行”，而是隔离上下文。主 Agent 如果要搜索全仓库、阅读大量日志、对比多个库，很容易把主上下文填满。Subagent 可以在自己的上下文中完成搜索，返回摘要、证据和建议。Claude Code 文档中对 subagents 的定位也强调任务特定 workflow 和 improved context management。

使用 subagent 的风险是信任边界。主 Agent 不能把 subagent 的总结当成无条件事实。最好让 subagent 返回：结论、来源路径、置信度、未读范围、需要主 Agent 复查的关键文件。对于高风险改动，主 Agent 应重新打开关键证据，而不是直接按摘要修改。

## Hooks: 确定性自动化层

Hooks 是很多 Agent 系统最容易缺失的一层。模型擅长判断和生成，但不适合承担所有确定性流程。比如“每次编辑后运行 prettier”“每次 shell 命令前检查是否包含 rm -rf”“每次完成任务后写日志”，这些都可以由 hook 执行。

Claude Code hooks 文档说明 hook 可以是 shell command、HTTP endpoint 或 LLM prompt，并在生命周期特定点触发。对自己的 Agent 来说，hooks 可以用来实现：

- 阻止危险命令。
- 自动格式化改动。
- 在提交前运行校验。
- 记录工具调用轨迹。
- 把关键事件发到团队频道。
- 调用额外安全检查。

Hook 的优势是可测试、可审计、可复用。不要让模型每次“记得”做格式化，直接让 hook 或 CI 执行。

## MCP: 外部系统接入层

MCP 解决的是外部工具协议化。Claude Code 可以通过 MCP 连接工具、数据库和 API。MCP server 不只是把函数给模型用，它还应该表达工具描述、输入输出、错误语义、权限和 server 级 instructions。

MCP 的风险在于外部系统具有真实副作用。一个 GitHub MCP tool 可以读 issue，也可以发 comment 或改 PR；一个数据库 tool 可以查数据，也可以修改数据；一个浏览器 tool 可以截图，也可以提交表单。Agent 需要知道 tool 的副作用，系统也需要在工具层标注和审批。

## Plugins: 分享和治理层

当一个团队有多套 rules、skills、hooks、MCP、commands 时，单个文件已经不够。Plugins 的价值在于把扩展打包、版本化、分发和治理。对企业或研究团队来说，插件化可以把最佳实践带到多个仓库，而不是每个项目复制粘贴。

AgentLab 后续如果要变成长期项目，也可以把“写 Agent 研究文档”的流程做成插件或 skill。这样新项目复用时，不需要从头复制整个仓库。

## 设计启发

Claude Code 的扩展层给出的核心结论是：Agent 的“能力”应拆成多种可维护机制。提示词负责原则，项目规则负责团队约定，skills 负责流程，subagents 负责隔离，hooks 负责确定性动作，MCP 负责外部工具，plugins 负责分发。一个强 Agent 系统不是 system prompt 越长越好，而是每类知识和控制都放在合适位置。

## 来源

- [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
