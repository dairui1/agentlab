# AgentLab

AgentLab 是一个用于沉淀 Agent 研究成果的资料库和工具箱。首期重点不是做网站，而是先把研究对象、资料来源、架构拆解、提示词版本和变更记录整理成可维护的结构。

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

## 下一步

- 补全每个 Agent 的公开资料来源清单。
- 建立 prompt snapshot 的命名规范和 diff 规则。
- 为 Claude Code 的历史 prompt 变更建立第一批记录。
- 设计后续网站的信息架构，优先复用当前资料结构。
