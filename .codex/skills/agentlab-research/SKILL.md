---
name: agentlab-research
description: 当用户提出一个 Agent 相关研究话题，并希望在 AgentLab 中完成资料检索、源码阅读、研究笔记、中文站点文章、索引更新和验证发布时使用。适用于“研究一下 X 并写到网站上”“把某个 Agent 机制整理成文档”“追踪某个 prompt/工具/权限/缓存主题”等任务。
---

# AgentLab 研究写作流程

这个 skill 用于把一个用户提出的研究话题变成 AgentLab 网站中的中文内容。核心目标是：来源可追溯、事实和推断分离、源码/文档都能复查、最终页面能通过构建。

## 启动条件

用户给出感兴趣的话题，例如：

- “研究一下 Pi 的 extension API，并写到网站上。”
- “比较 Codex 和 OpenCode 的权限模型。”
- “把 Claude Code prompt 变更历史做一个专题。”
- “研究缓存命中对 Agent 响应速度的影响。”

## 参考原则

借鉴 Deli AutoResearch 的三个思想，但不要照搬成长时无人值守科研系统：

- **状态写入文件**：关键决定、来源、待验证问题写进 `research/runs/{slug}/`，不要只留在对话里。
- **反停滞**：如果资料不足、来源冲突或写作卡住，主动缩小范围、记录决策、继续产出可审查版本。
- **质量门槛**：先过来源门槛，再写正文；先写研究笔记，再发布站点页；最终必须跑校验。

## 执行流程

### 1. 定义研究对象

先把话题写成一个一句话问题，并选择 slug。

- slug 用英文小写短横线，例如 `pi-extension-api`。
- 如果话题涉及最新事实、开源仓库、版本、包名、公司产品或模型能力，必须联网核验。
- 如果话题涉及当前已同步源码，优先查 `research/sources/cache/`。

可用脚本创建骨架：

```bash
python3 scripts/new_research_topic.py "Pi extension API" --slug pi-extension-api --summary "研究 Pi 扩展如何声明工具、权限和上下文注入。"
```

### 2. 建立状态文件

骨架会创建：

- `research/runs/{slug}/state.md`: 当前目标、范围、决策、下一步。
- `research/runs/{slug}/sources.md`: 来源日志。
- `research/topics/{slug}.md`: 研究笔记。
- `site/src/content/docs/research/{slug}.md`: 对外中文页面草稿。

工作过程中每次重大取舍都要写入 state，例如：

- 为什么使用某个官方源。
- 为什么排除某个二手来源。
- 为什么将范围缩小到某个子问题。
- 哪些结论仍是推断。

### 3. 收集来源

最低来源门槛：

- 至少 3 个可靠来源；优先官方文档、官方仓库、包 registry、源码、论文或作者文章。
- 最新事实必须联网核验，并记录访问日期。
- 对开源 agent，优先用本地源码缓存和当前 manifest commit。
- 禁止使用未授权泄露 prompt、私有账号内容、token、内部日志。

来源记录格式写入 `research/runs/{slug}/sources.md`：

```markdown
- URL/path:
- Type: official-doc | repo | package | source-code | blog | paper | observation
- Access date:
- What it supports:
- Volatility: low | medium | high
```

### 4. 阅读和归纳

研究笔记先写在 `research/topics/{slug}.md`，结构保持稳定：

- 问题定义
- 来源摘要
- 已确认事实
- 工程推断
- 设计启发
- 对 AgentLab 的影响
- 待验证问题

写作规则：

- 事实必须能追溯到来源。
- 推断必须显式标注。
- 如果来源冲突，写出冲突和当前判断。
- 不要为了让页面完整而编造架构。

### 5. 写入网站

把稳定结论整理到 `site/src/content/docs/research/{slug}.md`。站点页要面向读者，不要只是来源摘录。

建议结构：

- 研究问题
- 结论摘要
- 背景和来源
- 机制拆解
- 对比或设计启发
- 可复查清单
- 待验证问题
- 来源

如果这个话题更适合现有栏目，也可以写入对应目录，例如 `agents/pi/`、`mechanisms/`、`playbooks/`。但仍要保留 `research/topics/{slug}.md` 作为研究笔记。

### 6. 质量门槛

提交前必须跑：

```bash
make generated
make validate
make test
cd site && npm run check && npm run build
```

如果新增页面属于电子书正文，建议再跑：

```bash
make docs-stats
```

验收标准：

- 站点构建通过。
- `generated/site-index.json` 已更新。
- 研究笔记和站点页都存在。
- 来源列表包含足够支撑关键结论的来源。
- 没有把 `research/sources/cache/` 加入 Git。

## 输出格式

完成后向用户报告：

- 研究主题和 slug。
- 新增/修改的研究笔记和站点页面路径。
- 核心结论 3-5 条。
- 使用的关键来源。
- 运行过的验证命令。
- 是否已提交和推送。

## 失败处理

- 来源不足：写一个短页说明“当前无法得出结论”，列出缺口和下一步，不要硬写。
- 最新事实不稳定：记录访问日期和 volatility。
- 源码太大：调整 `data/source_targets.json` 的 sparse paths，不要提交源码缓存。
- 站点结构不合适：先放到 `research/` 栏目，再后续移动到正式章节。
