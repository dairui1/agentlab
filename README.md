# AgentLab

AgentLab 是一个用于沉淀 Agent 研究成果的资料库和工具箱。首期重点不是做网站，而是先把研究对象、资料来源、架构拆解、提示词版本和变更记录整理成可维护的结构。

更新后的定位是：**开发 Agent 过程中学到的工程知识库 + 可交互实验室**。网站层会以文档为主干，在工具、环境、提示词、上下文、缓存等主题中嵌入交互组件。

## 当前范围

- 主流 Agent 架构研究：Claude Code, Codex, Pi, OpenCode。
- 提示词研究：收集公开、可引用、可追溯来源中的 prompt snapshot，并记录版本差异。
- 研究工具：提供 CLI 校验 catalog、查看研究对象、创建 prompt snapshot 模板。
- 网站预留：后续可以让网站直接读取 `data/` 和 `research/` 中的内容生成页面。

## 目录结构

```text
agentlab/
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
  src/agentlab/         # 本地研究工具 CLI
  tests/                # 工具的基础校验
```

## 常用命令

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

## 研究原则

1. 来源优先：每条结论尽量保留来源 URL、访问日期和采集方式。
2. 区分事实和推断：未验证内容必须标注为 hypothesis 或 todo。
3. 版本化：prompt 只要发生变更，就新增 snapshot 并更新 changelog。
4. 不提交敏感内容：不要提交私有账号 token、内部系统提示词、未授权泄露内容。
5. 结构化沉淀：重复出现的字段放入 `data/`，长文分析放入 `research/`。

## 下一步

- 补全每个 Agent 的公开资料来源清单。
- 建立 prompt snapshot 的命名规范和 diff 规则。
- 为 Claude Code 的历史 prompt 变更建立第一批记录。
- 继续扩展 `site/` 中的文档栏目和交互实验。
