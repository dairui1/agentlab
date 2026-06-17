---
title: Claude Code 云端与本地边界
description: Claude Code 多表面使用时，本地执行、远程控制和云端任务的信任边界如何变化。
---

Claude Code 的一个研究重点是多表面：terminal、IDE、Desktop、Web、CI/CD、Slack、Chrome、云端和远程控制。多表面不是简单地把同一个 Agent 放到不同 UI 里，而是改变执行位置、凭据暴露、网络能力、审计方式和用户确认方式。

## 本地执行

本地 terminal/IDE 模式最贴近开发者工作流，也最接近真实风险。Agent 能看到工作区、未提交修改、本地工具链、可能存在的环境变量和本地服务。它的优势是上下文真实、反馈快、和用户一起工作；风险是越权写入、误读本地状态、执行危险命令和泄露本地信息。

本地执行的安全重点：

- 工作区边界。
- 未提交修改保护。
- `.git`、`.env`、secret 文件保护。
- 命令超时和输出截断。
- 网络默认策略。
- 审批提示。

本地执行适合高交互任务：修 bug、加功能、跑测试、调试页面。

## 云端任务

云端任务适合 offload 和并行：让 Agent 在隔离环境中执行较长任务，不占用用户本机。它的风险不同：需要 checkout 代码、安装依赖、使用临时凭据、访问网络或内部资源。云端环境应强调隔离、secret 生命周期、网络策略和审计日志。

云端任务不应简单复制本地权限。它更适合：

- 只在临时容器内运行。
- setup phase 和 agent phase 分开。
- secrets 尽量只在 setup 或受控工具中使用。
- 输出以 PR、patch 或报告形式返回。
- 高风险远端操作走人工审核。

## 远程控制本地

Web/remote control 这类模式最容易混淆：用户在 Web 上操作，但执行可能发生在本地 Claude Code 进程。它的体验像云端，风险像本地。用户需要清楚知道：命令在哪里执行，能访问哪些文件，是否使用本地凭据。

对自己的 Agent 产品来说，如果做远程控制，应在 UI 中明确显示：

- 当前执行主机。
- 当前工作目录。
- 网络和文件权限。
- 使用的账号/凭据来源。
- 审批请求来自哪个环境。

否则用户很难建立正确心智模型。

## CI/CD 和团队环境

CI/CD 中的 Agent 更像自动化工人。它通常没有用户实时交互，权限来自 workflow token、repo settings、secrets 和组织策略。这里应更保守：

- 默认只读或只评论。
- 自动修复应开 PR。
- 不直接推 main。
- secrets 使用最小化。
- 日志脱敏。
- 所有副作用可审计。

Claude Code 和 Codex 都有面向 CI/GitHub 的能力，说明 coding agent 正在进入工程流水线。流水线里的 Agent 必须比交互式 Agent 更可预测。

## Chrome 和浏览器表面

浏览器表面会接触用户登录态、cookie、网页 prompt injection 和真实 UI。它的风险和 shell 不同，但不更低。页面内容是外部输入，表单提交是远端副作用，下载和上传都可能传输数据。

浏览器 Agent 的基本规则：

- 页面内容不可信。
- 表单提交需要确认。
- 上传文件需要确认。
- 登录态不能被模型读取为秘密。
- 截图和 DOM 提取要注意敏感信息。

## 对 AgentLab 的启发

AgentLab 当前站点是静态文档，但后续如果加入真实交互实验，也会遇到执行边界：是在浏览器本地模拟，还是调用后端脚本，还是读仓库生成数据。每个组件都应说明数据来源和副作用。文档站中的交互组件默认应只读，不直接修改仓库或远端。

## 来源

- [Claude Code overview](https://code.claude.com/docs/en/overview)
- [Security](https://code.claude.com/docs/en/security)
- [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude)
