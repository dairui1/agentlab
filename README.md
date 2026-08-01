# AgentLab

AgentLab 是一个面向 Agent 开发者的变更情报站。线上应用会持续跟踪 Phistory 收录的全部 coding agent，包括 Claude Code、Codex、Antigravity、Grok Build、Kimi、MiMo、OpenClaw、Hermes、opencode、Pi 与 Oh My Pi。它把运行时 Prompt、Tools、静态 Prompt、官方发布说明与公开代码变化转成可检索、可追溯的中文更新情报，帮助我们从其他 Agent 的演进中提炼自己的工程决策。首页默认只展示有开发价值的变化；无变化版本不会进入信息流，版本比较保留为证据详情。

更新后的定位是：**开发 Agent 过程中学到的工程知识库 + 可交互实验室 + agent-native 研究系统**。网站层会以文档为主干，在工具、环境、提示词、上下文、缓存等主题中嵌入交互组件；项目层会把研究、来源同步、发布和校验定义成 agent 可调用的 action。

生产应用位于 `apps/agent-history`，发布到 [agentlab.dairui1.com](https://agentlab.dairui1.com)。原有研究目录继续保留，作为架构笔记和人工验证材料。

## 数据链路

1. `sync_phistory.py` 增量拉取 [Phistory](https://github.com/WEIFENG2333/phistory) 中全部 Agent 快照，并自动纳入上游未来新增的 Agent 目录。
2. `sync_official_sources.py` 同步已接入的官方 changelog / GitHub Releases，并为近期 Codex 版本生成有界代码比较概览；未单独接入官方源的 Agent 仍使用 Phistory 的 Prompt、Tools 与包产物证据。
3. `build_from_phistory.py` 规范化版本、请求正文、Tools、静态 Prompt 与多源 evidence；这一步不依赖模型，任何时候都可重现。
4. `analyze_changelogs.py` 用本机 Codex 生成重要性、中文摘要和面向自研 Agent 的可验证建议。模型失败时保留确定性摘要，不阻塞发布。
5. `daily_update.py` 串联同步、构建、分析、测试与 Cloudflare 部署，并由本机 `launchd` 每天调度。

Phistory 只作为上游事实来源；AgentLab 的数据模型、界面、分析提示与部署链路独立实现。

## 研究系统

- 主流 Agent 架构研究：Claude Code, Codex, Pi, OpenCode。
- 提示词研究：收集公开、可引用、可追溯来源中的 prompt snapshot，并记录版本差异。
- 研究工具：提供 CLI 校验 catalog、查看研究对象、创建 prompt snapshot 模板。
- 网站内容：让网站直接读取 `data/` 和 `research/` 中的内容生成页面。
- Agent-native 控制面：直接使用 Builder.io 的 `@agent-native/core`，把创建研究话题、同步源码、校验发布等流程暴露成可复用 action。

## 目录结构

```text
agentlab/
  apps/agent-native/    # Builder.io Agent-Native headless app，承载真实 actions
  agent/                # Agent-native action、job、policy 和 trace 协议
  data/                 # 结构化索引，未来网站可直接消费
  docs/                 # 研究方法、路线图和模板
  research/
    agents/             # 每个 Agent 的架构研究页
    prompts/            # 每个 Agent 的提示词版本和 changelog
    sources/cache/      # 本地源码/包缓存，不提交到 Git
  generated/            # 脚本生成的站点索引、diff 和报告
  scripts/              # 内容刷新和生成脚本
  .codex/skills/        # 项目内 Codex skills，例如中文研究写作流程
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
python3 scripts/new_research_topic.py "Pi extension API" --slug pi-extension-api --summary "研究 Pi 扩展如何声明工具、权限和上下文注入。"
make generated
make docs-stats
make sync-sources
make source-sync-job
make agent-native-install
make agent-native-typecheck
make agent-native-list-pages
make site-build
```

当前仓库是私有仓库；如果 GitHub 计划不支持私有仓库 Pages，`site` workflow 会默认只构建不部署。后续设置仓库变量 `DEPLOY_PAGES=true` 后，workflow 才会尝试走 GitHub Pages 部署。

`make sync-sources` 会读取 `data/source_targets.json`，把可公开同步的源码或包产物拉到 `research/sources/cache/`，并更新 `generated/source-sync-manifest.json`。缓存目录已加入 `.gitignore`，仓库只提交同步清单和快照元数据。

`make source-sync-job` 适合放进本地 crontab 或 launchd：它会运行同步、只提交 `generated/source-sync-manifest.json`，然后 push 到当前远端。

如果需要安装为本地命令：

```bash
python3 -m pip install -e .
agentlab validate
```

Agent-native 控制面在 `apps/agent-native/` 中，直接依赖 `@agent-native/core`。首次使用：

```bash
cd apps/agent-native
npm install
npm run action -- list-site-pages
npm run action -- create-research-topic --title "示例研究" --slug example-research --summary "示例"
npm run action -- validate-research
```

## 研究原则

1. 来源优先：每条结论尽量保留来源 URL、访问日期和采集方式。
2. 区分事实和推断：未验证内容必须标注为 hypothesis 或 todo。
3. 版本化：prompt 只要发生变更，就新增 snapshot 并更新 changelog。
4. 不提交敏感内容：不要提交私有账号 token、内部系统提示词、未授权泄露内容。
5. 结构化沉淀：重复出现的字段放入 `data/`，长文分析放入 `research/`。

旧的 `site/` 仍可作为研究文档站构建；它不再负责 `agentlab.dairui1.com` 的生产发布。
