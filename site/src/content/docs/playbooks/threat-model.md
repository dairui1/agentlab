---
title: 威胁建模
description: 为 Agent 工具、上下文、记忆、网络和自动化建立可执行威胁模型。
---

Agent 威胁建模不能只问“模型会不会胡说”。一个能调用工具的 Agent 会接触文件系统、网络、浏览器、远端 API、用户账号和长期记忆。它的风险来自模型错误，也来自工具副作用、上下文污染、权限配置、凭据暴露和自动化放大。

## 资产清单

先列资产，不要直接列攻击。常见资产包括：

- 源代码、未提交修改、私有仓库。
- secrets、API keys、cookie、SSH key。
- 用户账号、GitHub 权限、Slack 权限、云账号。
- 本地服务、数据库、内网资源。
- 长期记忆和项目规则。
- PR、issue、文档和公开发布内容。
- CI/CD token 和发布权限。

每类资产都要回答：Agent 能不能读，能不能写，能不能通过工具间接影响。

## 入口清单

Agent 的攻击入口比普通应用多：

- 用户 prompt。
- 仓库文件。
- README、issue、PR comment。
- 网页和搜索结果。
- 工具 stdout/stderr。
- MCP server 返回值。
- 依赖安装脚本。
- 自动记忆。
- prompt snapshot。

其中很多入口不是传统“用户输入框”，但都会进入模型上下文。只要进入上下文，就可能影响后续行动。

## 典型威胁

常见威胁可以分成六类：

1. Prompt injection：外部内容要求 Agent 忽略原有指令。
2. Data exfiltration：诱导 Agent 读取并发送 secrets。
3. Tool abuse：让 Agent 执行高风险命令或远端操作。
4. Memory poisoning：把错误或恶意内容写入长期记忆。
5. Supply chain：通过安装脚本、依赖、生成代码影响环境。
6. Automation amplification：错误在定时任务或 CI 中自动扩散。

这些威胁的共同点是：攻击者不一定直接控制 Agent，只要能控制 Agent 会读取的内容。

## 防护层

防护不要只依赖一层：

- Prompt 层：声明不可信内容不能覆盖系统指令。
- Tool 层：标记副作用，结构化返回，隔离不可信正文。
- Permission 层：allow/ask/deny，网络 allowlist，路径限制。
- Sandbox 层：OS/container 限制文件和网络。
- Memory 层：写入需要来源、范围、可删除。
- CI 层：检测 secrets、校验生成产物、阻止异常 diff。
- Human review：高风险内容和自动生成正文走 PR。

多层防护的价值是即使模型判断错了，工具或沙箱仍能阻止。

## AgentLab 威胁模型

AgentLab 自身的高风险点包括：

- 未授权 prompt 泄露被提交。
- 来源事实过期但仍在站点展示。
- 自动生成脚本覆盖手写内容。
- 定时任务把错误内容推到 main。
- 文档引用不可信来源。
- GitHub Pages/部署权限误配置。

对应防护是：只保存公开/用户自有 prompt；生成内容进 `generated/`；CI 检查索引；部署权限最小化；来源页面单独维护；高风险自动更新开 PR。

## 输出物

威胁建模的结果不应该只是会议纪要。至少生成：

- 资产表。
- 入口表。
- 工具风险矩阵。
- 权限默认值。
- 审批提示模板。
- 回归测试样例。
- 待验证风险。

这些输出可以直接变成文档、配置、测试和交互组件。
