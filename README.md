# AgentLab

AgentLab 是一个面向 Agent 开发者的变更情报站。线上应用会持续跟踪 Phistory 收录的全部 coding agent，包括 Claude Code、Codex、Antigravity、Grok Build、Kimi、MiMo、OpenClaw、Hermes、opencode、Pi 与 Oh My Pi。它把运行时 Prompt、Tools、静态 Prompt、官方发布说明与公开代码变化转成可检索、可追溯的中文更新情报，帮助我们从其他 Agent 的演进中提炼自己的工程决策。首页默认只展示有开发价值的变化；无变化版本不会进入信息流，版本比较保留为证据详情。

生产应用位于 `apps/agent-history`，发布到 [agentlab.dairui1.com](https://agentlab.dairui1.com)。原有研究目录继续保留，作为架构笔记和人工验证材料。

## 数据链路

1. `sync_phistory.py` 增量拉取 [Phistory](https://github.com/WEIFENG2333/phistory) 中全部 Agent 快照，并自动纳入上游未来新增的 Agent 目录。
2. `sync_official_sources.py` 同步已接入的官方 changelog / GitHub Releases，并为近期 Codex 版本生成有界代码比较概览；未单独接入官方源的 Agent 仍使用 Phistory 的 Prompt、Tools 与包产物证据。
3. `build_from_phistory.py` 规范化版本、请求正文、Tools、静态 Prompt 与多源 evidence；这一步不依赖模型，任何时候都可重现。
4. `analyze_changelogs.py` 用本机 Codex 生成重要性、中文摘要和面向自研 Agent 的可验证建议。模型失败时保留确定性摘要，不阻塞发布。
5. `daily_update.py` 串联同步、构建、分析、测试与 Cloudflare 部署，并由本机 `launchd` 每天调度。

Phistory 只作为上游事实来源；AgentLab 的数据模型、界面、分析提示与部署链路独立实现。

## 目录结构

```text
agentlab/
  data/                 # 结构化索引，未来网站可直接消费
  docs/                 # 研究方法、路线图和模板
  research/
    agents/             # 每个 Agent 的架构研究页
    prompts/            # 每个 Agent 的提示词版本和 changelog
  generated/            # 脚本生成的站点索引、diff 和报告
  scripts/              # 内容刷新和生成脚本
  site/                 # Starlight 文档站和交互组件
  apps/agent-history/   # Phistory 全 Agent 生产应用
  src/agentlab/         # 本地研究工具 CLI
  tests/                # 工具的基础校验
```

## 生产应用

```bash
cd apps/agent-history
npm ci
npm run sync
npm run build
npm run analyze
npm run build
npm test
npm run dev
```

`npm run analyze` 只处理 evidence 已变化且没有有效结果的版本，因此日常运行是增量的。发布使用 `npm run deploy`；完整的日更流程使用 `npm run daily`。本机调度的安装与排查见 `apps/agent-history/ops/README.md`。

生成的上游缓存、prompt 对象、evidence、AI 结果与构建目录都不提交到 Git；站点可由相同的上游 commit 和分析结果重新生成。

## 研究工具

未安装时可以直接用 `PYTHONPATH` 运行：

```bash
PYTHONPATH=src python3 -m agentlab list
PYTHONPATH=src python3 -m agentlab show claude-code
PYTHONPATH=src python3 -m agentlab validate
PYTHONPATH=src python3 -m agentlab new-snapshot claude-code 2026-06-17 --source-url https://example.com/source
make generated
make site-build
```

如果需要安装为本地命令：

```bash
python3 -m pip install -e .
agentlab validate
```

## 研究原则

1. 来源优先：每条结论尽量保留来源 URL、访问日期和采集方式。
2. 区分事实和推断：未验证内容必须标注为 hypothesis 或 todo。
3. 版本化：prompt 只要发生变更，就新增 snapshot 并更新 changelog。
4. 不提交敏感内容：不要提交私有账号 token、内部系统提示词、未授权泄露内容。
5. 结构化沉淀：重复出现的字段放入 `data/`，长文分析放入 `research/`。

旧的 `site/` 仍可作为研究文档站构建；它不再负责 `agentlab.dairui1.com` 的生产发布。
