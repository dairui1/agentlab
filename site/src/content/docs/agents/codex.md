---
title: Codex
description: Codex 的表面、沙箱、审批、AGENTS.md、MCP、技能和自动化机制拆解。
---

Codex 是 OpenAI 的 coding agent 产品体系。它不是单一 CLI，而是一组表面和能力：CLI、IDE extension、Codex app、cloud/web、GitHub code review、Slack、browser、Chrome extension、non-interactive mode、SDK、GitHub Action 等。研究 Codex 的价值在于：它把 Agent 工程中的“本地执行、云端执行、沙箱、审批、项目规则、技能、MCP、插件、自动化”放进同一套文档和配置系统。

## 已确认事实

当前 Codex manual 描述 Codex 可用于写代码、理解陌生代码库、审查代码、调试修复问题和自动化开发任务。它的执行安全模型强调两层：sandbox mode 决定技术上能做什么，approval policy 决定什么时候必须向用户请求确认。Codex 本地默认倾向于限制网络访问并把写权限限制在工作区，云端则运行在 OpenAI 管理的隔离容器中。

Codex 支持 `AGENTS.md` 作为项目持久指导文件。文档说明 Codex 会从全局 Codex home 和项目目录链中发现 `AGENTS.override.md`、`AGENTS.md` 或 fallback 文件，并按从根到当前目录的顺序合并，靠近当前目录的文件出现在更后面，因此能覆盖更宽泛的指导。

Codex 也支持 MCP。MCP 可以通过 STDIO server 或 Streamable HTTP server 连接外部工具和上下文，配置保存在 `config.toml`，CLI 和 IDE extension 共享配置。文档还说明 MCP server 可以提供初始化 instructions，用于跨工具的全局指导。

## 产品表面

Codex 的表面比很多编码 Agent 更广。CLI 是本地仓库工作的入口；IDE extension 贴近编辑器；Codex app 更像桌面/任务管理和交互工作台；cloud/web 支持托管并行任务；GitHub code review 和 GitHub Action 面向自动审查和 CI；Slack/Linear 等集成把 Agent 带进协作系统；Browser Use 和 Chrome extension 处理 Web 测试与用户浏览器状态。

这些表面不是 UI 差异，而是执行模型差异。CLI 和 IDE extension 会面对本地文件系统和 OS sandbox；cloud 任务面对容器、依赖安装、secret 生命周期和网络策略；Chrome extension 使用用户 Chrome profile 和登录态，风险边界明显不同。设计自己的 Agent 时，不能把“多端”看作复用前端，而要把每个表面的权限和数据流画出来。

## 沙箱和审批

Codex 的沙箱模型给了一个很好的工程抽象：技术边界和交互审批分开。沙箱定义 spawned commands 能访问哪些文件、是否能联网、是否能写入工作区。审批策略定义越界时如何处理：请求用户、自动拒绝、自动审查或在特定类别上细分。

这个分层很重要。没有沙箱，用户每次都只能选择“相信模型”或“不相信模型”。有了沙箱，常规读写和测试可以在工作区内自动完成，越界行为才需要审批。没有审批策略，沙箱外需求无法顺畅处理；没有沙箱，审批提示会过多，用户最终会疲劳。

Codex manual 还提到本地网络默认关闭，网络代理可以用 domain policy 限制出站访问，并区分公共域、私有地址、localhost、Unix socket 等。这是 Agent 网络设计的高阶版本：不是“开网/关网”二元选择，而是按目标和风险配置。

## 项目规则：AGENTS.md

`AGENTS.md` 是 Codex 项目化的关键。它把团队规则、构建命令、测试方法、代码风格、审查要求等长期约定放进仓库，让每次 Agent 进入项目时都能加载。相比把规则写进一次性 prompt，`AGENTS.md` 更适合被版本控制、代码审查和团队共用。

对于 AgentLab，自身也应该有类似规则文件。内容项目尤其需要规则：来源必须可引用，不能提交私密 prompt，引用要区分事实和推断，新增页面要通过 build，交互组件要可在移动端工作。把这些规则写进项目文件，比每次口头提醒 Agent 更可靠。

## MCP、技能和插件

Codex 的定制层可以理解为三类：

- `AGENTS.md` 和 memories：让 Agent 知道项目和用户偏好。
- Skills：封装可复用工作流和领域知识。
- MCP/plugins/connectors：连接外部系统、工具和私有上下文。

MCP 的价值在于把外部系统变成可声明的工具边界。server 可以暴露工具，也可以提供 server instructions。工具可以设置 enabled/disabled，approval mode 可以按 server 或 tool 设置。相比把外部 API 直接塞进 prompt，MCP 更容易做权限、日志和复用。

技能则解决“可复用过程”的问题。比如“审查 PR 评论”“修 CI”“生成文档”“迁移 API”都可以是技能。技能不是工具本身，而是指导 Agent 如何组合工具、读哪些参考、运行哪些脚本、如何输出结果。

## 与 Claude Code 的主要差异

Claude Code 和 Codex 都强调项目规则、工具、权限和多表面。但它们的公开文档给人的产品重心不同。Claude Code 文档中 `CLAUDE.md`、auto memory、hooks、skills、subagents、MCP 和 auto mode 形成了强定制层；Codex 文档更系统地展开 sandbox、approval policy、network policy、AGENTS.md、config.toml、MCP、plugins、automations、SDK 和 programmatic interfaces。

从 Agent 工程角度，Codex 的强项是把配置、沙箱、MCP 和自动化作为一套可组合平台。Claude Code 的强项是把编码体验、记忆和权限自动化做成一个高频产品体验。二者都值得拆解，但不要假设内部实现相同。

## 提示词研究方向

Codex 的 prompt 研究可以围绕 durable instructions surfaces 展开：系统/developer 指令、`AGENTS.md`、skills、plugins、MCP server instructions、config、rules、hooks、用户 prompt。关键问题不是“系统 prompt 写了什么神句”，而是这些指令层如何排序、谁覆盖谁、哪些内容进入每轮上下文、哪些内容只在工具选择时影响模型。

Prompt diff 应按这些类别记录：

- coding-agent persona 和沟通规则。
- 文件编辑和工作区保护。
- 工具调用和 apply_patch 约束。
- sandbox/approval/network 策略。
- GitHub/PR/CI 工作流。
- 站点、浏览器、前端验证要求。
- 中断、恢复、长任务和上下文压缩。

## 待验证问题

- Codex app、CLI、IDE extension 在同一项目规则下的实际差异。
- 自动审批 review 的默认可用范围和企业管理策略。
- MCP server instructions 与 `AGENTS.md`、skills 的最终排序细节。
- OpenAI docs manual 中功能成熟度标签和实际账号可用性的对应关系。
- Codex 开源仓库与产品文档之间的差异边界。

## 主要来源

- [Codex manual](https://developers.openai.com/codex/codex-manual.md)
- [Codex overview](https://developers.openai.com/codex/overview)
- [Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security.md)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md.md)
- [Model Context Protocol](https://developers.openai.com/codex/mcp.md)
- [OpenAI Codex repository](https://github.com/openai/codex)
