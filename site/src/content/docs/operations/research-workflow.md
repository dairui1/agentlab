---
title: 研究写作流程
description: AgentLab 如何从用户提出的研究话题，产出研究笔记、中文站点文章和可验证提交。
---

AgentLab 需要一个可重复的研究流程：你提出一个感兴趣的话题，Agent 去查资料、读源码、做归纳，然后把结果写进网站。这个流程不应该依赖某一次对话的记忆，而应该把状态、来源、决策和产出都留在仓库里。

## 项目内 skill

仓库内提供了一个中文 skill：

```text
.codex/skills/agentlab-research/SKILL.md
```

它适用于这类请求：

- “研究一下 Pi 的 extension API，并写到网站上。”
- “比较 Codex 和 OpenCode 的权限模型。”
- “把 Claude Code prompt 变更历史做一个专题。”
- “研究缓存命中对 Agent 响应速度的影响。”

这个 skill 的核心约束是：先建立状态文件，再收集来源；先写研究笔记，再写站点文章；先过质量门槛，再提交。

## 骨架脚本

新话题用脚本创建骨架：

```bash
python3 scripts/new_research_topic.py "Pi extension API" --slug pi-extension-api --summary "研究 Pi 扩展如何声明工具、权限和上下文注入。"
```

脚本会创建四类文件：

```text
research/runs/{slug}/state.md
research/runs/{slug}/sources.md
research/topics/{slug}.md
site/src/content/docs/research/{slug}.md
```

其中 `research/runs/` 记录过程，`research/topics/` 记录研究笔记，`site/src/content/docs/research/` 是最终对外页面。

## 借鉴 Deli AutoResearch 的部分

Deli AutoResearch 的公开说明强调三个长期任务问题：认知循环、停滞和运行脆弱性。它的协议要求把状态写入文件、用外部监控检测停滞、通过质量门槛推进阶段。AgentLab 不需要完整照搬长时间无人值守框架，但这些工程原则很适合文档研究。

AgentLab 的收敛版本是：

- **状态持久化**：每个话题都有 `state.md` 和 `sources.md`。
- **反停滞**：资料不足就缩小范围并记录原因，不停在“是否继续”的问题上。
- **质量门槛**：至少完成来源记录、研究笔记、站点页和构建验证。
- **分工清晰**：研究笔记允许保留粗糙推断，站点页只放更稳定的结论。

## 来源门槛

一个正常专题至少需要 3 个可靠来源。优先级如下：

1. 官方文档、官方仓库、官方包 registry。
2. 本地同步源码缓存和 manifest commit。
3. 作者文章、论文、release note。
4. 可复现的本地观察。
5. 二手文章只能作为线索，不能单独支撑关键事实。

如果话题涉及最新版本、改名、开源仓库、包名、产品能力、价格、模型或法律/隐私政策，必须联网核验并记录访问日期。

## 发布门槛

每个专题完成前至少运行：

```bash
make generated
make validate
make test
cd site && npm run check && npm run build
```

如果专题显著增加正文，也运行：

```bash
make docs-stats
```

通过这些检查后，才能提交和推送。

## 后续扩展

这个流程后续可以继续增强：

- 自动从 `sources.md` 生成来源 freshness report。
- 自动把专题页加入相关章节的交叉链接。
- 对源码缓存运行固定查询，生成候选研究问题。
- 让 prompt diff、source manifest 和专题文章互相引用。
- 增加一个研究 dashboard，显示每个 topic 的状态、来源数和最后更新时间。
