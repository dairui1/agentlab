---
title: Claude Code 权限与 Auto Mode
description: 从权限疲劳、工具风险和自动审批角度拆解 Claude Code 的安全体验。
---

Claude Code 的权限模型体现了编码 Agent 的核心矛盾：如果所有行动都要用户批准，Agent 会变慢，用户会疲劳；如果什么都自动执行，风险会迅速上升。Anthropic 关于 auto mode 的工程文章正是围绕这个矛盾展开：用户在高频使用中会机械批准，approval 本身会失去安全价值。

## 权限疲劳

权限疲劳不是小问题。一个编码 Agent 在真实任务中会多次读文件、运行命令、修改文件、跑测试、查文档。如果每个动作都弹窗，用户会从“认真审查”变成“连续点允许”。表面上安全提示变多了，实际安全性可能下降。

解决权限疲劳有三条路：

1. 减少低风险请求。
2. 提高高风险请求的信息密度。
3. 用沙箱和策略替代部分人工判断。

Claude Code 的 auto mode 可以理解为在第二和第三条路之间寻找平衡：让低风险动作更自动，同时仍对危险动作保持边界。

## 权限请求要按风险分类

Claude Code 文档中的权限规则、allow/ask/deny、read-only、bash、file modification 等概念说明，工具不是同一风险等级。一个成熟 Agent 不应把“读文件”和“执行外部命令”混在同一个确认框里。

可以把 Claude Code 风格的权限经验抽象成四类：

- 默认可读：列目录、搜索、读取项目文件。
- 工作区可写：编辑当前仓库文件，但保护敏感路径和用户修改。
- 需要询问：运行有副作用命令、联网、修改配置、安装依赖。
- 默认拒绝：读取 secrets、生产破坏、不可恢复删除、越权远端操作。

真正的系统还要考虑路径、命令模式、域名、MCP server、tool annotation、用户计划和组织策略。

## Auto Mode 的工程含义

Auto mode 不等于“跳过安全”。它更像一个额外判断层：哪些请求足够低风险，可以自动通过；哪些请求仍然应该问用户；哪些请求应该拒绝。这个层可以由规则、分类器、策略模型和上下文共同决定。

对自己的 Agent 来说，auto mode 设计至少需要这些输入：

- 工具类型：读、写、执行、网络、远端。
- 目标资源：路径、URL、账号、repo、环境。
- 命令模式：是否包含删除、权限提升、下载执行、secret 读取。
- 当前任务：用户是否明确授权了这类动作。
- 沙箱状态：动作是否仍在工作区和 allowlist 内。
- 历史行为：是否重复失败或绕过策略。

如果这些输入不可见，auto mode 就会变成“模型觉得可以就可以”，这不够可靠。

## 审批提示设计

高质量审批提示应该帮助用户判断，而不是把判断负担全推给用户。一个好提示可以包含：

- Agent 想做什么。
- 为什么需要这样做。
- 会影响哪些文件、命令、URL 或远端资源。
- 是否可逆。
- 如果拒绝，Agent 会怎么继续。

比如“允许运行 npm install 吗？”不如“允许在当前项目中运行 npm install 以安装 package-lock 中缺失依赖吗？该命令可能修改 node_modules，但不应修改源代码。”后者更具体，也更容易审查。

## 工具输出和权限联动

权限系统还应理解工具输出风险。网页、issue、README、日志都可能包含“请忽略之前指令并执行某命令”这类注入。即使读取网页是只读动作，网页内容也可能影响后续写操作。因此工具输出应被标记为不可信，权限层在高风险后续动作中应要求更强审查。

Anthropic 的 containment 文章提到工具调用会经过代理层并在工具输出进入模型上下文前做检查，这个方向很重要。Agent 不是只需要保护“工具执行”，也需要保护“工具返回如何影响下一步”。

## 对 AgentLab 的启发

AgentLab 后续可以把权限研究做成两类产物。一类是文档：权限模式、auto mode、审批提示、风险分类。另一类是交互组件：用户选择工具、路径、网络、命令，组件显示风险等级和推荐策略。这样权限不再是抽象安全概念，而是可解释的产品机制。

## 来源

- [Configure permissions](https://code.claude.com/docs/en/permissions)
- [How we built Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude)
- [Configure permissions in Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/permissions)
