---
title: Prompt Diff 工作流
description: 如何从 prompt snapshot 生成可审查的版本历史、左右 diff 和变更解释。
---

Prompt diff 是 AgentLab 的核心实验方向之一。它的目标不是猎奇地收集系统提示词，而是把提示词变化变成可审查的工程资产。一个成熟的 prompt diff 工作流应该能回答：这次改了什么，为什么改，影响哪个行为，如何验证，能否回滚。

## Snapshot 格式

每个 snapshot 应包含 frontmatter：

```yaml
agent: codex
version: 2026-06-18
source_url: https://example.com/source
access_date: 2026-06-18
evidence_level: source
scope: system-prompt
save_policy: summary-only
```

正文可以保存允许保存的 prompt 内容、结构摘要或变更说明。对于不允许保存全文的材料，应只保存元数据和分类摘要。

## Diff 生成

生成 diff 时，不要只做纯文本行对比。应同时生成结构化字段：

```json
{
  "agent": "codex",
  "from": "2026-06-01",
  "to": "2026-06-18",
  "changes": [
    {
      "category": "permissions",
      "kind": "added",
      "summary": "新增对 destructive MCP tool 的审批要求",
      "risk": "safer but more interruptions"
    }
  ]
}
```

左右 diff 用于人看文本，结构化 changes 用于统计和筛选。比如用户可以只看权限变化、工具变化、最终回答变化。

## Changelog 写法

Changelog 应用工程语言写，不要只写“更新 prompt”。好的条目包括：

- 改动类别。
- 改动动机。
- 预期影响。
- 可能副作用。
- 验证样例。

例如：“将网络访问说明从默认允许改为默认关闭，要求通过 domain allowlist 开启。预期降低数据外传和 prompt injection 风险；副作用是文档查找任务需要更多授权。”

## 回归测试

每次 prompt 变化后，应跑固定样例：

- 用户要求高风险操作。
- 工具输出恶意指令。
- 需要保护未提交修改。
- 需要先计划后执行。
- 测试失败需要诊断。
- 小任务不应过度解释。

这些样例可以人工评分，也可以用结构化 verifier 评估部分条件。比如是否访问网络、是否修改文件、是否在最终回答包含验证命令，这些可以自动检查。

## Diff 组件

AgentLab 当前有一个示例版提示词 Diff 组件。未来它应读取真实 JSON：

- 左右版本选择。
- 按类别过滤。
- 显示新增/删除/修改统计。
- 展示变更摘要和风险。
- 链接到 snapshot 和 changelog。

组件的价值是降低审查成本。Prompt 变更如果只在 Markdown 里，很难快速看出行为影响；交互 diff 可以让用户按关心的维度查看。

## 安全边界

Prompt diff 工作流必须遵守安全边界：

- 不保存未授权私有 prompt。
- 不保存账号密钥或环境变量。
- 不保存内部系统信息。
- 不把泄露材料当作可靠来源。
- 不为了完整性牺牲合法性。

研究 prompt 的真正价值是理解结构和变化，不是复制秘密。
