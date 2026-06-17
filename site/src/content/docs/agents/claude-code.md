---
title: Claude Code
description: Claude Code 的产品表面、工具/权限、记忆、扩展和安全机制拆解。
---

Claude Code 是一个典型的“工程化编码 Agent”。它不是把 Claude 模型放进终端这么简单，而是围绕代码仓库、命令执行、文件修改、项目规则、权限、MCP、hooks、skills、cloud/web/IDE 表面和团队安全建立了一套产品机制。研究 Claude Code 的价值在于：它把很多 Agent 工程问题产品化了，尤其是权限疲劳、项目记忆、配置作用域、工具输出风险和多表面一致性。

## 已确认事实

根据 Claude Code 官方文档，Claude Code 是能读代码库、编辑文件、运行命令并与开发工具集成的 agentic coding tool。它有 terminal、VS Code、JetBrains、Desktop、Web、CI/CD、Slack、Chrome 等多种使用表面。官方 overview 还强调不同表面连接到同一底层 Claude Code engine，因此 `CLAUDE.md`、settings 和 MCP servers 能跨表面工作。

Claude Code 的权限文档把工具分成不同风险层：只读操作通常不需要审批，bash 命令和文件修改通常需要审批或受规则控制。权限可以通过 `/permissions` 查看和管理，并可通过 allow、ask、deny 规则表达。安全文档还强调 MCP servers 由用户或团队配置，Anthropic 会审核目录 listing 标准，但不对所有 MCP server 做安全审计。

Anthropic 的工程文章提供了额外背景。Claude Code 的 auto mode 是为了缓解用户频繁批准带来的 approval fatigue，同时避免用户直接使用完全跳过权限的高风险模式。另一篇关于 containment 的文章说明，Claude Code 和 Claude Cowork 中的工具调用会经过代理层，以执行网络/文件策略并在工具返回进入模型上下文前进行检查。

## 产品表面

Claude Code 的一个关键设计是“同一引擎，多种表面”。终端适合本地开发和直接命令流；IDE 适合贴近编辑器的代码理解；Web/cloud 适合托管会话和移动场景；CI/CD 适合自动代码审查和任务分派；Chrome 适合调试真实网页。对 Agent 开发者来说，这意味着产品表面不是简单 UI，而是会改变权限、上下文和执行位置。

本地终端会接触用户真实文件系统、shell、环境变量和未提交修改。云端执行则更强调隔离 VM、网络访问控制、凭据代理、分支限制和审计日志。远程控制又是另一种模式：Web 界面连接本地 Claude Code 进程，执行仍发生在本机。每个表面都需要单独定义威胁模型。

## 记忆和项目规则

Claude Code 的记忆机制值得重点研究。官方文档把 `CLAUDE.md` 和 auto memory 分开：`CLAUDE.md` 是用户写的持久项目指令，auto memory 是 Claude 根据纠正和偏好写下的学习记录。这是 Agent 工程里的一个重要分层：人写的规范和模型学到的经验不应该混在一起。

`CLAUDE.md` 适合保存编码标准、工作流、项目架构、构建命令和团队约定。auto memory 适合保存调试经验、用户偏好、历史纠正和仓库特定模式。风险在于：自动记忆如果没有来源、时间和信任等级，可能把临时结论变成长期规则。因此在自己的 Agent 中实现记忆时，应该至少记录来源、写入时间、适用范围和撤销方式。

## 工具和扩展层

Claude Code 的扩展层包括 MCP、hooks、skills、subagents、commands、rules、plugins 等。对开发 Agent 的启发是：扩展不应该只有“接更多工具”一种形式。不同扩展解决不同问题：

- `CLAUDE.md`: 给模型稳定项目规则。
- MCP: 连接外部系统和工具。
- Hooks: 在生命周期节点执行确定性动作。
- Skills: 封装可复用工作流或领域知识。
- Subagents: 隔离复杂搜索、专项任务或不同上下文。
- Commands: 给用户提供高频操作入口。
- Settings/rules: 管理作用域、权限和团队标准。

这套分层把“模型自己决定怎么做”和“系统确定性地强制执行”分开。Hook 的价值尤其明显：格式化、测试、通知、阻止危险命令这类事情不应该完全依赖模型想起来。

## 权限模型

Claude Code 的权限模型体现了 Agent 产品的核心矛盾：自主性和安全性。手动审批安全但容易疲劳；完全跳过审批效率高但风险大；沙箱安全但维护成本高；自动模式试图在中间建立分类器和策略判断。Anthropic 的 auto mode 文章把这个 tradeoff 说得很清楚：用户会大量批准请求，批准本身会变成机械动作，安全收益随之下降。

对自己的 Agent 来说，权限设计不能只问“要不要让模型执行命令”。更好的问题是：

- 哪些命令是只读的？
- 哪些命令会修改本地文件？
- 哪些命令会访问网络？
- 哪些命令会触达生产环境？
- 哪些命令可能泄露密钥？
- 哪些命令需要用户明确授权？
- 哪些命令应被系统直接拒绝？

权限系统应该同时有技术约束和用户交互。只靠 prompt 说“不要做危险操作”是不够的；只靠系统拦截也不够，因为用户仍需要理解 Agent 为什么停下来。

## 安全和工具输出

Anthropic 的 containment 文章提醒了一个容易忽略的事实：工具输出本身就是攻击面。网页、README、issue、日志、依赖安装脚本、MCP 返回值都可能包含不可信指令。只要这些内容进入模型上下文，它们就可能影响下一步行动。

Claude Code 的设计线索是：工具调用可以通过代理层执行策略，也可以在结果进入模型前做检查。对 Agent 开发者来说，这提示我们不要把“工具可信”和“工具返回可信”混为一谈。即使工具本身是内部写的，它读取的内容也可能来自外部或不可信用户。

## 提示词研究方向

Claude Code 的提示词研究应避免收集未授权泄露内容。可研究的是公开文档中反复出现的产品契约：要读项目、遵守权限、保护用户修改、使用项目记忆、通过 hooks/MCP/skills 扩展、重视安全和验证。若有用户自有合法 snapshot，可以记录版本、来源、访问日期、范围、变更类别和影响。

提示词 diff 的重点不应只是文本增删，而应分类：

- 工具调用规则是否变化。
- 权限默认值是否变化。
- 对用户沟通的要求是否变化。
- 对项目规则/记忆的优先级是否变化。
- 对不可信内容和安全风险的处理是否变化。
- 对验证、测试、最终回答的要求是否变化。

## 对 AgentLab 的启发

Claude Code 给 AgentLab 的直接启发是：文档项目也应该拥有自己的项目规则、生成脚本、来源索引、自动构建和交互演示。未来可以为本仓库添加 `AGENTS.md` 或类似文件，把写作规则、来源规则、测试命令和禁止事项写入项目根目录，让后续 Agent 能稳定继续维护。

## 待验证问题

- 不同 Claude Code 表面对同一 `CLAUDE.md`、settings、MCP 的加载细节是否完全一致。
- Auto mode 在不同计划、不同环境中的可用性和默认值。
- hooks、skills、subagents 的最佳组合边界。
- cloud execution 与 remote control 在审计、网络、凭据方面的具体差异。
- 公开文档之外是否有可合法保存的 prompt snapshot 来源。

## 主要来源

- [Claude Code overview](https://code.claude.com/docs/en/overview)
- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Configure permissions](https://code.claude.com/docs/en/permissions)
- [Security](https://code.claude.com/docs/en/security)
- [How we built Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude)
