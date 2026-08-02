---
title: 源码同步机制
description: 用本地缓存、同步清单和定时任务持续跟踪 Agent 源码与包产物。
---

AgentLab 研究 Agent 不能只看文档和产品界面。对于公开源码或公开包产物，仓库需要有一个可重复执行的同步机制，把可研究材料拉到本地，再把版本、commit、许可证和不可同步原因记录成可审查的 manifest。

这个机制的边界很重要：第三方源码缓存用于本机研究，不进入 AgentLab 主仓库；主仓库只提交同步配置和快照元数据。这样既能持续跟踪上游变化，又不会把外部项目源码、许可证风险或偶然泄漏内容混进自己的研究库。

## 当前同步目标

同步清单在 `data/source_targets.json` 中维护：

| Agent | 同步方式 | 目标 | 当前策略 |
| --- | --- | --- | --- |
| Codex | Git | `https://github.com/openai/codex.git` | `main` 分支，浅克隆，sparse checkout 研究目录 |
| OpenCode | Git | `https://github.com/anomalyco/opencode.git` | `dev` 分支，浅克隆，sparse checkout 研究目录 |
| Claude Code | npm | `@anthropic-ai/claude-code` | 下载公开 npm 包产物，默认排除 `*.map` |
| Pi | Git | `https://github.com/earendil-works/pi.git` | `main` 分支，浅克隆，sparse checkout 研究目录 |

Claude Code 的处理方式故意保守。公开 npm 包可以作为安装产物研究，但 source map 可能包含不适合当作常规来源使用的内容，所以默认排除。Pi 指的是 Mario Zechner 发起、现迁移到 Earendil Works 的开源 coding agent/toolkit，不是 Inflection 的聊天产品；旧入口如 `badlogic/pi-mono` 和 `@mariozechner/pi-coding-agent` 只作为迁移历史记录。

## 本地缓存

运行：

```bash
make sync-sources
```

脚本会执行 `scripts/sync_sources.py`，把材料放到：

```text
research/sources/cache/
  git/
    codex/
    opencode/
    pi/
  npm/
    claude-code/
```

这个目录已经加入 `.gitignore`。如果需要查看源码，可以直接在缓存目录里搜索：

```bash
rg "approval|sandbox|permission" research/sources/cache/git/codex
rg "tool|permission|provider" research/sources/cache/git/opencode
rg "system" research/sources/cache/npm/claude-code/package
```

缓存目录不要放手写研究笔记。源码阅读结论应该沉淀到 `research/agents/*` 或站点文档中，必要时引用 manifest 中的 commit/version。

## 同步清单

每次同步会更新 `generated/source-sync-manifest.json`。它记录：

- 生成时间。
- 本地缓存目录。
- Git 目标的分支、commit、remote head、sparse paths 和许可证。
- npm 目标的版本、tarball、许可证、排除规则和解包文件数。
- 不可同步目标的原因。

这个文件是可以提交的，因为它只包含元数据，不包含第三方源码。后续可以让站点读取它，展示“当前研究基于哪个上游版本”。

## 本地定时任务

如果希望本机持续同步并自动提交 manifest，可以使用：

```bash
make source-sync-job
```

这个目标会运行 `scripts/run_source_sync_job.sh`：

1. 执行 `python3 scripts/sync_sources.py`。
2. 如果 `generated/source-sync-manifest.json` 没变化，直接退出。
3. 如果 manifest 变化，只 stage 这个文件。
4. 提交 `Refresh source sync manifest` 并 push 当前远端。

crontab 示例：

```text
35 10 * * 1 cd /path/to/agentlab && /usr/bin/make source-sync-job >> tmp/source-sync.log 2>&1
```

如果使用 launchd，也应该调用同一个 Make target，而不是把同步命令复制多份。这样以后脚本参数变更，只需要维护仓库里的入口。

## GitHub 定时任务

`.github/workflows/sync-sources.yml` 每周一运行一次，也支持手动触发。它会在 GitHub Actions 中执行同一个同步脚本，然后只在 manifest 变化时提交。

GitHub runner 上的源码缓存是临时的，不会持久保存；真正用于阅读和搜索的缓存仍然在本机。Actions 的价值主要是提供一个远端 watchtower：如果上游 commit 或 npm version 变了，manifest 会出现在主分支 diff 中，提醒需要更新研究笔记。

## 后续扩展

源码同步只是第一层。下一步可以在 manifest 之上加三类自动分析：

- 目录级 diff：比较上次和本次 commit 中 prompt、tool、permission、sandbox 相关路径的变化。
- 关键词索引：对缓存目录运行可配置的 `rg` 查询，生成候选研究点。
- 文档关联：当 Codex `codex-rs/sandboxing` 或 OpenCode `packages` 变化时，自动标记哪些站点章节需要复查。

原则仍然不变：自动任务生成报告，不直接改正文；正文更新需要带着来源、commit/version 和人工判断进入研究笔记。
