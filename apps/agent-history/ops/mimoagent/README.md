# MiMo Agent 专题研究

研究日期：2026-09-28。正文位于 `public/capabilities/mimoagent.html`，不是报告全文译文。

## 固定来源

- 官方仓库：`https://github.com/XiaomiMiMo/mimoagent`
- 分支：`mimo-oss`
- Revision：`467f0a19016f0ac4d63b8d17a1f0da9ba07f232c`
- Commit 时间：`2026-09-21T14:01:34-07:00`
- 技术报告：`https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Pro-RL/blob/73875d0/MiMo_V2_6_technical_report.pdf`
- PDF SHA-256：`fb81e6e083801b3358f084ed6be953dc23b0d2e434690f4541d5eae03e01e7af`
- 重点核对：报告 §4.2.5（p.13）、Figure 10（p.23）、§6.2（pp.27-29）、Table 7（p.36）。图表页面已渲染检查。

研究结论：不要混淆 mini-harness 白盒训练、真实 CLI 黑盒接入与模拟用户。前者重组交互机制，第二条路径复用 scaffold，第三条路径模拟追问。黑盒适配日志不是完整训练数据流。

本地固定源树缓存为仓库根目录的 `.codex-research/mimoagent-upstream`；报告缓存为 `.codex-research/mimo-v26-report-fb81e6e0.pdf`。这些原始材料不进入公开站点。

## 本地验证

在临时目录下载源码，以 `uv sync --frozen` 安装锁定依赖。没有改动上游源码。

第一组实际执行命令（仓库根目录）：

```sh
uv run --frozen pytest tests/agents/test_blackbox_harnesses.py tests/agents/test_blackbox_claude_code.py tests/agents/test_blackbox_mimocode.py tests/agents/test_blackbox_pi.py tests/environments/test_kubernetes_detached.py -m 'not integration' -q
```

结果：`358 passed, 7 skipped in 3.26s`。七项 Linux shell 测试依赖 `setsid`、GNU timeout 和 `/proc/self/stat`，当前 macOS 未满足。其余主要用伪环境记录命令并回放固定日志。

第二组：

```sh
uv run --frozen pytest tests/agents/test_compaction.py tests/agents/test_action_interceptors.py tests/agents/test_user_agent.py tests/environments/test_reset_test_files.py tests/environments/test_rubric_judge.py -m 'not integration' -q
```

结果：`73 passed in 1.01s`。两组共 431 通过、7 跳过。这不是完整上游测试套件，也不是真实 CLI 或模型端到端测试。

独立探针：从该固定源码的 uv 环境运行本目录 `probe_blackbox.py SOURCE_TREE OUTPUT_JSON`。探针使用真实 adapter、合成环境和事件；模型 query 一旦调用即失败。两轮 Codex 控制流没有调用原生模型，生成续接命令，但统一轨迹只有四条 user/assistant 消息。Claude 问答回调选择第一项，SDK 返回类型使用替身。公开结果在 `public/capabilities/mimoagent-probe.json`。

## 来源复核

从 `apps/agent-history` 运行：

```sh
node ops/mimoagent/build_evidence.mjs SOURCE_TREE --check
node --test tests/mimoagent.test.js
```

来源生成脚本记录 26 条证据，其中 23 条定位到 16 个固定源文件，3 条定位到报告。`--check` 比对文件 SHA-256、定位范围和整份结构化研究数据。只有确认需要重新生成索引时才使用 `--write`。

站点验收：`npm test` 的 154 项 Python 与 234 项 Node 测试通过；`npm run build` 构建完整 23 个 Agent、1713 个版本，`verify_deploy.py` 通过。Playwright 覆盖 1440/768/390/320 像素宽度与深浅色共五种视口配置，无页面横向溢出、破图或脚本异常；证据抽屉开关、Escape 焦点返回、证据深链接、专题索引与无 JavaScript 阅读均通过。`check_ui.cjs BASE_URL OUTPUT_DIR` 可重复运行，需要环境提供 Playwright。

## 独立主题与发布验收

用户要求不使用 Raft 主题。页面移除 `raft-blog.css` 与对应类名，保留站点通用导航及引证组件，独立使用黑白灰底色、橙色引证和蓝色迁移路径；桌面目录移到正文右侧。研究正文与证据不变。

首轮独立截图审阅指出：移动端抽屉截图只露出边缘，深色正文截图与目录高亮不一致，引证字号偏小。前两项经稳定状态检查确认为截图早于动画和 IntersectionObserver 完成，而非最终布局错误。验收脚本现等待面板完整进入视口、对应目录高亮后再截图；引证改为 13px、接近正文基线，保留细点线，不添加胶囊按钮。桌面与移动端重新截图验收。

第二轮独立审阅确认主题已独立，建议让移动端横向目录的截断更易理解，并简化引证元数据。目录右端增加淡出提示；引证结构属于全站共享组件，本次保留完整来源信息，不扩展为全站交互改造。页面文案没有为视觉变化添加功能说明或营销内容。

发布前检查：2026-09-28 的 launchd 流水线 08:37 启动，08:45 成功完成；无运行进程或占锁。Phistory 本地与远端均为 `6ff9eca9f86218a79fde57291d7c2f1c0ce9fbc4`，官方来源 fresh/current、无 warning/retained agent。生产分析队列 dry-run 为 1713 inspected、0 model-stale、0 deterministic no-signal、0 selected，无需恢复流水线。

生产发布后执行 `node ops/mimoagent/verify_live.mjs OUTPUT_JSON`，比对本地 dist 与 workers.dev、自定义域的 14 个资源 SHA-256，包含 manifest、专题正文、来源数据、独立主题、导航及图片。再对线上域运行 `check_ui.cjs`。缓存、报告 PDF、上游 clone、运行日志和截图不进入公开产物或提交；无关 `artifacts/` 保留不动。

发布回执（2026-09-28）：专题源码提交 `b97e3502` 已推送到 `origin/main`，Wrangler Version ID 为 `c0b909d1-152e-4f33-b975-851b3eab5f15`，线上地址为 `https://agentlab.dairui1.com/capabilities/mimoagent`。两域 14/14 资源哈希一致，生产页五种视口配置与全部交互检查通过；发布后分析队列仍为零，无活跃流水线或占锁。本次未启动额外 analyzer，也没有使用失败后的确定性 fallback。

生产静态托管会把 `.html` 重定向到无扩展名 URL，哈希脚本现显式跟随重定向。验收遇到的瞬时 TLS 连接中断通过有界重试恢复，未关闭证书验证。GitHub 在推送时另提示默认分支有 6 条依赖告警（2 高、4 中），本次没有改动依赖或调查这些告警。

## 未执行与未证实

- 未安装或启动任何生产 CLI，未接真实模型服务、Docker/Kubernetes 或 GPU 训练。
- 没有证明白盒与原版行为等价，也没有复现论文成绩。
- 没有把论文 mini-harness1-4 擅自映射到公开 agent 类型。
- 没有把报告里的 Harness Pool、Payload Porter、token/logprob 采集认作此仓库全部已实现。
- 模型服务兼容性与第三方工具裁剪仅作为实验条件分析，不作为绕过服务限制的指南。
- 本次没有创建自动监控或更改每日发布流水线。
