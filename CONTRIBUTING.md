# 参与 AgentLab

感谢你愿意帮助 AgentLab。这个项目同时包含代码、结构化数据和研究内容，因此贡献不仅要“能运行”，也要“可追溯”。

## 适合提交的内容

- 修正错误事实、失效链接或版本归属。
- 增加官方文档、公开仓库、release note 等一手来源。
- 改进同步、规范化、分析、测试和发布脚本。
- 改进 Agent 变更情报界面、文档站和交互实验。
- 补充可复现的 Agent 工程案例。

涉及大范围目录调整、数据格式变化或新依赖时，建议先开 Issue 说明问题和方案。

## 研究内容要求

1. 优先引用官方文档、公开仓库、官方 release 或可复现实验。
2. 明确区分 `source`、`observed`、`inferred` 和 `todo`。
3. 不提交私有 Prompt、Token、内部日志、账号导出或未授权泄露内容。
4. 引用第三方内容时以摘要和结构化结论为主，不复制不必要的长篇原文。
5. 易变化的事实需要记录来源和版本或访问日期。

详细规则见 [`docs/methodology.md`](docs/methodology.md) 和 [`agent/policies/source-boundaries.md`](agent/policies/source-boundaries.md)。

## 本地校验

基础目录和 Python CLI：

```bash
PYTHONPATH=src python3 -m agentlab validate
PYTHONPATH=src python3 -m unittest discover -s tests
```

变更情报应用：

```bash
cd apps/agent-history
npm ci
npm test
```

文档站：

```bash
cd site
npm ci
npm run check
npm run build
```

Agent-native actions：

```bash
cd apps/agent-native
npm ci
npm run typecheck
```

只需运行与改动相关的检查，但提交说明中应写明实际运行了哪些命令，以及哪些检查因环境限制没有运行。

## Pull Request

- 一个 PR 尽量解决一个明确问题。
- 生成文件应由对应脚本更新，不要手工修改生成结果。
- UI 改动应检查桌面端和移动端布局。
- 新增行为应补充聚焦的测试。
- 不要顺手重写与当前问题无关的内容。
