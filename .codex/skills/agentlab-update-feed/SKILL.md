---
name: agentlab-update-feed
description: 从 AgentLab 公开数据中筛选 Coding Agent 更新并输出 Markdown。适用于“查 Codex/Claude Code 最近更新”“只看 Prompt 或 Tools 变化”“获取高价值 Agent 情报”“拿某版本的原始 Prompt Markdown”等任务。
---

# AgentLab 更新数据查询

使用这个 skill 从 `https://agentlab.dairui1.com` 获取适合继续分析的 Markdown，而不是抓取和解析首页 HTML。运行时只依赖已安装 skill 内的脚本和 AgentLab 线上公开数据，不依赖 AgentLab 源码仓库或本地 checkout。

## 首选流程

1. 先读 `/data/manifest.json`，确认数据版本、上游 SHA、Agent id 和数据健康状态。
2. 用本 skill 的查询脚本读取 `/data/feed.json`，按线上 feed schema 计算信号并应用重要性规则。
3. 把筛选条件写成 query string；脚本把结果渲染为 Markdown。
4. 需要研究完整 Runtime Prompt 时，再从 Agent 的 `historyUrl` 找到版本对应的 `promptUrl`，直接获取 `.md` 文件。

下面的 `SKILL_DIR` 是当前 `SKILL.md` 所在目录。skill 安装到哪里都可以运行：

```bash
SKILL_DIR='/path/to/installed/agentlab-update-feed'
node "$SKILL_DIR/scripts/query-feed.mjs" \
  --filter 'feedAgent=codex&signal=tools&priority=high&limit=10&format=markdown'
```

默认读取生产站。`--base-url` 可切换到预览环境：

```bash
node "$SKILL_DIR/scripts/query-feed.mjs" \
  --base-url 'https://example.workers.dev' \
  --filter 'feedAgent=claude-code&signal=prompt&since=2026-07-01&limit=20'
```

## Filter 语义

维度之间使用 AND，同一维度重复出现时使用 OR。

| 参数 | 值 | 语义 |
| --- | --- | --- |
| `feedAgent` | Agent id，可重复 | 只保留这些 Agent。省略表示全部 |
| `signal` | `prompt`, `tools`, `ecosystem`，可重复 | `ecosystem` 包含官方发布、Code 和 Static Prompt |
| `priority` | `high`, `medium`, `low` | 只保留对应重要性 |
| `since` | `YYYY-MM-DD` | 只保留该日期及之后的更新 |
| `until` | `YYYY-MM-DD` | 只保留该日期及之前的更新 |
| `version` | 版本号，可重复 | 只保留指定版本 |
| `analysisStatus` | 状态，可重复 | 常见值为 `complete`, `fallback`, `failed`, `pending` |
| `limit` | 正整数，最大 200 | 最终返回条数，默认 20 |
| `format` | `markdown` 或 `md` | 明确要求 Markdown 输出 |

`priority=high` 是稀缺等级：只表示明确改变 Agent 能力边界、主控制流、安全/信任边界、
Context 持久化与恢复语义，或通用 Tool 权限与生命周期的更新。普通 Bug 修复、性能、
兼容性、Provider/配置/UI 与局部可靠性改进默认不高于 `medium`。

`feedAgent`、`signal`、`priority` 与网站 URL 使用同一组参数。`since`、`until`、`version`、`analysisStatus`、`limit` 和 `format` 是查询脚本提供的 Agent 侧过滤器，不要假设网站首页会处理它们。

示例：Codex 或 Claude Code 中涉及 Prompt 或 Tools 的高价值更新：

```text
feedAgent=codex&feedAgent=claude-code&signal=prompt&signal=tools&priority=high&limit=20&format=markdown
```

示例：某个版本，无论信号和重要性：

```text
feedAgent=codex&version=0.146.0&limit=1&format=markdown
```

不要在 shell 中临时拼一份简化的 `jq` 重要性算法。随 skill 安装的查询脚本已经处理 fallback 分数、no-change 排除、source layers 和排序；它只从 AgentLab 域名读取公开 JSON。

## 获取原始 Prompt Markdown

筛选结果中的摘要是 AgentLab 分析，不是完整 Prompt。需要完整正文时按数据清单追踪 URL：

```bash
BASE='https://agentlab.dairui1.com'
AGENT='codex'
VERSION='0.146.0'
HISTORY_URL=$(curl -fsSL "$BASE/data/manifest.json" | jq -r \
  --arg agent "$AGENT" '.agents[] | select(.id == $agent) | .historyUrl')
PROMPT_URL=$(curl -fsSL "$BASE$HISTORY_URL" | jq -r \
  --arg version "$VERSION" '.versions[] | select(.version == $version) | .promptUrl')
curl -fsSL "$BASE$PROMPT_URL"
```

始终从 manifest 和 history 解析 URL，不要猜对象哈希或拼接 `/data/objects/<hash>.md`。

## 分析约束

- 报告数据的 `generatedAt`、manifest 中的上游 commit，并保留每条更新的比较链接。
- `analysisStatus=complete` 表示模型分析与当前 evidence 匹配；`fallback` 只能称为规则摘要。
- 摘要和 implications 属于 AgentLab 分析层。涉及产品事实时继续检查条目中的官方来源或比较证据。
- 查询无结果时先移除最窄的维度，通常依次检查 `version`、日期、`priority`、`signal`；不要把空结果解释为“该 Agent 没有更新”。
- 批量读取原始 Prompt 前先查看 `bytes` 和 `lineCount`，避免把大量无关正文塞入上下文。

## 维护

这个 skill 的外部依赖只有以下同源公开接口：

- `https://agentlab.dairui1.com/data/manifest.json`
- `https://agentlab.dairui1.com/data/feed.json`
- manifest 声明的 `historyUrl`、`changelogUrl` 和 history 声明的 `promptUrl`

线上 feed schema、信号分类或 importance 规则变化时，要同步更新 skill 内的查询脚本并运行：

```bash
node --check "$SKILL_DIR/scripts/query-feed.mjs"
node "$SKILL_DIR/scripts/query-feed.mjs" \
  --filter 'feedAgent=codex&signal=prompt&limit=2&format=markdown'
```
