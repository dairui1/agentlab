# AgentLab

> 面向 Coding Agent 开发者的中文变更情报站。

[在线体验](https://agentlab.dairui1.com) · [GitHub 仓库](https://github.com/dairui1/agentlab)

Web 界面开发遵循 [设计约定](DESIGN.md)，包括专题详情、长文章、机制工作台及移动端的共同验收要求。

AgentLab 持续跟踪 Claude Code、Codex、OpenCode、Pi、OpenClaw、Goose、Cline、Qwen Code、Gemini CLI、SWE-agent、mini-swe-agent、DeepSeek Harness、Exo、Reasonix 等 Coding Agent 与 Agent Harness 的公开变化，把运行时 Prompt、Tools、静态 Prompt、官方发布说明与公开代码变化整理成可检索、可追溯的中文情报。

这个项目不是 Agent 排行榜，也不把模型生成内容当成事实。每条重要结论都应回到公开来源、版本和实际差异，并明确区分事实证据、工程观察与模型推断。

## 主要功能

- **更新情报**：按 Agent、信号类型和重要性筛选近期变化。
- **版本比较**：比较实际请求、Prompt 结构和 Tools，保留逐行证据。
- **专题研究**：用固定版本证据回答会改变 Agent 工程判断的问题；先给结论和工程后果，再展开事实、推断边界与未知项。
- **多源证据**：组合 Phistory 快照、官方 changelog、GitHub Releases、npm 发布与公开代码比较结果。
- **中文解读**：生成重要性、变化摘要和对自研 Agent 的启示；模型不可用时保留确定性回退结果。

## 数据链路

```mermaid
flowchart LR
    A["Phistory 快照"] --> C["确定性规范化"]
    B["官方发布与公开代码"] --> C
    C --> D["Evidence 与版本差异"]
    D --> E["Codex 中文分析"]
    E --> F["校验与确定性回退"]
    F --> G["AgentLab Web 应用"]
```

1. `sync_phistory.py` 增量同步 [Phistory](https://github.com/WEIFENG2333/phistory) 收录的 Agent 快照。
2. `sync_official_sources.py` 同步官方 changelog、GitHub Releases、npm 发布和有界代码比较结果；只有发布包映射、没有可靠 commit/tag 的来源不会冒充完整源码比较。
3. `sync_source_captures.py` 将尚无运行时快照的官方发布物化为 source-only Capture。
4. `build_from_phistory.py` 规范化版本、请求正文、Tools、静态 Prompt 与多源 evidence。
5. `analyze_changelogs.py` 为发生变化的版本生成中文摘要、重要性和工程启示。
6. `daily_update.py` 串联同步、构建、分析、测试与 Cloudflare 部署。

## 用自己的 Codex 运行

需要 Node.js 22 或更高版本、Python 3.11 或更高版本，以及已经登录的 Codex CLI。先确认 Codex 可用：

```bash
codex login status
```

从一个全新的 clone 开始，最短路径是：

```bash
cd apps/agent-history
npm ci
npm run local
npm run dev
```

`npm run local` 只稀疏同步 Codex 数据和对应官方来源，默认选取最新 5 个待分析版本，调用当前用户已登录的 `codex exec`，随后合并结果、运行测试并构建站点。缓存、Evidence、分析结果和构建产物都留在本地，不进入 Git。

可以调整 Agent、模型和分析数量，例如：

```bash
npm run local -- --agents codex --max-releases 10 --reasoning-effort high
```

初次运行不需要下载整个 AgentLab 数据集。`codex` 的 Phistory Capture 当前约为十几 MB；脚本还会按需获取其官方 Release、Changelog 和有界代码比较。选择 `claude-code` 或 `all` 会明显增加同步量。

流水线在同步前检查 Codex 登录状态。Codex 未安装、未登录，或者某个模型分析未通过本地 JSON Schema 与证据校验时，`npm run local` 会失败，而不会悄悄把确定性回退结果冒充成 Codex 分析。

需要自己控制各阶段时可以运行：

```bash
npm run sync
npm run build:data
npm run analyze -- --agents codex --newest-first --max-releases 5
npm run build
npm test
```

`npm run sync` 会在官方来源同步完成后物化 source-only Capture，因此全新缓存也可直接交给 `npm run build:data`。

### Gemini CLI、SWE-agent 与 mini-swe-agent

三项开源项目分别进入官方来源、source-only Capture、证据分析和日更链路，保持独立的 Agent ID，不把 fork 或同组织项目的版本混在一起：

- `gemini-cli` 对应 [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)。它是独立的 Gemini CLI 项目，不是 Antigravity，也不以其他 Agent 的 Gemini Provider 更新代替自身版本变化。
- `swe-agent` 对应 [SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent)。
- `mini-swe-agent` 对应 [SWE-agent/mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent)。MiMoAgent 文章对它的提及只是研究背景，不是本次持续跟踪的数据来源。

没有 Phistory Runtime Capture 的版本从官方发布与公开源码建立 source-only 条目。源码中的 Prompt、工具实现和 Agent 执行逻辑与实际模型请求分开展示；源码基线不计作 Runtime Prompt 或 Tool Schema 的增删，也不表示已运行项目、模型任务或复现 benchmark。

只跟踪正式 `vX.Y.Z` 发布，排除 preview、nightly、包内组件标签和 draft/prerelease。SWE-agent 的正式发布早于 source-only 起始日期，因此仅补入最新三个真实 GitHub Releases，保留原发布时间，不改全局入库起点，也不把当前 commit 日期伪装成新发布。新增三项的 focused 更新只同步 Phistory 元数据，不请求不存在的 Capture 目录；完整日更仍使用 `--agents all`。

三项本地图标原样取自官方仓库固定提交，仅用于标识被跟踪产品：[Gemini CLI companion icon](https://github.com/google-gemini/gemini-cli/blob/2ce1a6963e9e53a04afaf76111e4527cfa7c5dd7/packages/vscode-ide-companion/assets/icon.png)、[SWE-agent inspector icon](https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/inspector/icons/swe-agent-logo-50.png)、[mini-swe-agent square icon](https://github.com/SWE-agent/mini-swe-agent/blob/04d809ceab9df28f9adaed044884180159172930/docs/assets/mini_square.svg)。图标回归测试核对本地资产摘要，不联网获取或改绘上游标识。

### ZCode 与 MiniMax Code

2026-09-21 核验后，两项开源 Harness 已接入同一套官方来源同步、source-only Capture、证据分析和日更链路：

- `zcode` 对应 [zai-org/ZCode](https://github.com/zai-org/ZCode)，根许可证为 Apache-2.0。核验时没有公开 tag 或 GitHub Release，因此跟踪有界 commit 快照，而不是把桌面端 `3.14.0` 或 CLI workspace `0.16.9` 当成正式发布。源码入口是 `apps/zcode-cli/packages/core/src/`，包含 Agent turn machine、工具执行、权限和压缩模块。
- `minimax-code-cli` 对应 [MiniMax-AI/minimax-code](https://github.com/MiniMax-AI/minimax-code)，从官方 `v0.5.0` release/tag 开始跟踪。第一方代码默认 MIT；第三方组件保留各自许可，详见官方 `LICENSE-STATUS.md`。源码包含 `packages/local-runtime-v2`、`packages/agent-modules` 与独立 Prompt 模板。
- MiniMax 只展示一个 **MiniMax Code** 入口（内部 ID `minimax-code-cli`）。旧桌面版 `3.0.x` 采集保留在原始来源和本地缓存，不再作为并列产品进入目录。旧 `minimax-code` 页面参数会转到当前入口，但旧版本号不会与 CLI `0.x` 混排。

source-only 条目不表示已捕获真实模型请求。静态 Prompt 文件、公开工具实现与 Runtime Prompt/Tool Schema 是不同证据；缺少运行时采集时仍明确标记缺失，不从源码伪造运行时快照。首次只有一个 release 的项目也没有相邻版本源码差异，后续版本才会自动累积比较证据。

这两个项目的最新源码另有有界文件采集：按 release 对应的 commit 固定获取 Prompt、工具契约/实现、Turn、权限与压缩文件，保留全文、文件路径、SHA-256 和官方链接。详情页直接展示源码，不再只显示缺失请求的空面板。源码基线可进入更新情报，但不计作 Runtime Prompt 或 Tool Schema 的增删。

ZCode 的本地图标复制自[官方仓库固定提交](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/public/logo/icons/128x128.png)，仅用于标识被跟踪产品。

`npm run analyze` 只处理 Evidence 已变化且缺少有效分析的版本。普通 `npm run daily` 面向无人值守发布，Codex 分析失败时允许确定性回退；完整日更流程的安全边界和参数见 [`apps/agent-history/ops/README.md`](apps/agent-history/ops/README.md)。

生成的 `public/`、`dist/` 和 `analysis/` 可从已同步的数据重建；`.cache/official-sources/` 还保存有界代码比较的历史账本，应像发布状态一样备份，不能在普通更新前删除。数据来源、版本、摘要以及 Evidence Digest 会写入生成的 `public/data/manifest.json` 和 Changelog JSON，外部用户不需要信任仓库作者机器上的缓存。

## Pi Durable 持久执行研究

[Pi Durable 专题](https://agentlab.dairui1.com/capabilities/pi-durable) 固定官方 main 提交 `1cedd32724abfcb0915f76cc61b6827e2c16dbad`，从提交、任务检查点、工具 replay、模型重发与 deferred polling，追到消息队列、子任务取消、文档 fork 和存储故障边界。25 条文件证据与 6 项待验证问题，分别保留 API experimental、外部副作用幂等、单进程持有和目录非沙箱的限制。

在清空凭据、隔离 HOME 的环境中，显式枚举 Durable 非 e2e 测试：47 个文件通过，977 项通过、2 项平台相关跳过；两个真实模型 cache e2e 完全排除。首轮 source 解析失败后，仅用外置配置合并上游既有 aliases，未改源码或构建发布包。未做真实模型、SIGKILL、断电或生产压测；固定提交的远端整仓 CI Test 步骤失败，具体失败包未确认。

在 `apps/agent-history` 执行 `node scripts/verify_pi_durable_sources.mjs --source-root /path/to/pinned/pi`，复核 checkout HEAD、文件 SHA-256、行号、固定链接与正文证据引用；也可用 `--fetch` 从固定提交读取。核验脚本不执行 Pi，也不将文件匹配视为运行能力复现。本文只是固定研究，没有为 Pi Durable 新增日更、提醒或持续监控。

## Raven Harness 改进研究

[Raven 专题](https://agentlab.dairui1.com/capabilities/raven) 沿反馈、候选、校验和安装追踪 Curator，固定官方提交 `e6c0344cb7ce00db25d554e4bb671ec1909a8f9f`。19 条证据区分静态源码、作者案例、技术报告与远端 CI；未运行上游测试、真实模型或基准，不把可选 probe 的装配检查写成效果验收，也不把 HarnessBank v2 的成绩归给当前 Curator。

Raven 同时接入官方软件 release 与 source-only 日更，匹配 `vX.Y.Z`，排除 `tech-report-v1` 等文档标签。最新 release 对应的静态 Prompt、工具注册、ACP 权限及 Curator 源文件可在版本页查看；静态源码不是 Runtime Prompt 捕获。固定 main 研究与软件 release 数据分别标识，后者不会悄悄改写前者。

在 `apps/agent-history` 执行 `node scripts/verify_raven_sources.mjs --source-tree /path/to/pinned/Raven --report /path/to/technical-report.pdf`，核对源文件哈希、行号、两段代码摘录、图标与报告哈希；或用 `--fetch` 从固定公开来源复核。该命令不运行 Raven。

## Raft 协作基础设施研究

[Raft 多智能体博客](https://agentlab.dairui1.com/capabilities/raft-multi-agent) 左侧完整保留 Tenny 的 AX 文章中文译文与五张官网配图，右侧按段落展开九则长篇研究：19 段固定源码、9 幅机制图，追踪收件箱、可见性、发送检查、草稿恢复、任务认领和待验证实验。代码片段逐行核对固定版本，图示不冒充运行记录；手机上下衔接，可关闭批注连续读原文。依委托人转述的作者许可发布中文翻译，不刊载英文全文。原架构研究页保留不变。

新文来源核验：在 `apps/agent-history` 执行 `node scripts/verify_raft_sources.mjs --study=raft-multi-agent --fetch`；离线可用 `--source-tree <固定源码目录>`。该命令只检查文件哈希和行号，不执行 Raft。

[Raft 专题](https://agentlab.dairui1.com/capabilities/raft-collaboration) 沿消息可见性、任务认领、runtime 恢复和权限边界，分析官方 `v1.13.0-source.1` 发布镜像，固定公开提交 `05f7d8fd77d2535f993d5d90b85118438bc18216`。研究数据含 18 条文件证据与 6 项未知问题，可从专题索引和全站导航进入。

这是 FSL-1.1-ALv2 的 source-available 项目，不按宽松开源 Coding Agent 归类。当前只收录固定版本研究，未接入自动版本日更或持续监控，也没有把静态 Prompt 伪装成 Runtime Prompt 捕获。未安装 Raft、未运行上游测试或多 Agent 实验；AgentLab 测试只验证本站的数据和界面。

从 `apps/agent-history` 运行 `node scripts/verify_raft_sources.mjs --fetch`，可按固定 commit 重新读取证据文件并校验 SHA-256、行号范围和来源链接；不会执行或安装上游代码。网络失败和文件不匹配都会返回失败，不降级成已验证。已有平铺文件缓存时可用 `--source-dir <目录>` 离线校验。上游全文仅保留在忽略的本地缓存中，公开内容为原创分析、定位与哈希，上游许可证不受 AgentLab 的 MIT 许可替代。

## Agent 数据访问

### 向 AgentHot 供稿

`https://agentlab.dairui1.com/data/syndication.json` 是供聚合站使用的扁平快照，由正常
`npm run build` 从同一份完整版本分析生成，不再次调用模型。原有 `/data/feed.json` 与 skill 查询不变。

- `items` 包含所有 `complete` / `reviewed` 且通过本站现有信号规则的版本，不按任意分数或条数截断。
- `id` 固定为 `agentlab:release:<agent>:<version>`。正文是 AgentLab 分析而非厂商声明，保留证据摘要、原始来源与明确的新鲜度。
- `url` 使用稳定的 `?mode=compare&agent=<agent>&version=<version>`。页面会找该版本的相邻前版；历史补录不会改变文章身份。
- `publishedAt` 采用上游发布日期；无发布日期时用采集日期并标记 `dateKind: captured`，不能冒充新闻发布日期。AgentHot 首版不公开这类条目。
- `sourceFreshness` 独立于 `analysisStatus`，取 `fresh`、`stale`、`degraded`、`not-synced`、`not-collected` 或 `unknown`。分析完成不代表上游来源已经更新；AgentHot 首版仅公开 `fresh` 条目。
- `revision` 是完整供稿条目的确定性 SHA-256；`snapshotDigest` 是包含 `exportedAt` 的整个快照的 SHA-256，均不包含自身字段。递归按对象键排序，数组保留顺序，按 UTF-8 JSON 编码。
- `generatedAt` 沿用 manifest 的最新采集证据时间，不是构建或修订时间，不能用于快照排序。
- `exportedAt` 是供稿快照的构建时间。语义内容不变时复用旧值；发生修订时按当前时间递增，至少比本地上一份快照晚 1 毫秒。消费方拒绝更旧快照，以及时间相同但摘要不同的快照，防止缓存或部署回滚复活撤回内容。无旧产物的全新构建使用当前时间；不能自动绕过消费方的旧快照保护。
- `suppressed` 显式列出当前因分析未完成或无信号而不再准入的版本；`withdrawn` 只来自人工撤回声明。列表中缺席从不意味着撤回。
- `sources` 保留无 URL 的 source-only 占位溯源，但每篇必须至少有一条真实公开来源 URL；不输出 Runtime Prompt 全文。

人工撤回在 `apps/agent-history/public/syndication-withdrawals.json` 中写入
`{"id":"agentlab:release:codex:1.2.3","reason":"具体撤回原因"}`，经过测试和正常发布后生效。
撤回记录可以保留已退出当前目录的历史 ID；删除撤回记录代表允许重新按现有证据准入，而非新文章。
研究专题暂不供稿：索引中的 `verifiedAt` 是核验日期，不能替代尚未记录的初次发布日期。

协议、修订、抑制、撤回、来源校验及稳定深链的测试在 `tests/syndication.test.js`。
部署门禁会从当前完整数据重新计算供稿内容，并检查 `public` / `dist` 一致性，不会在只读验证时生成新时间。

项目内置 [`agentlab-update-feed`](.codex/skills/agentlab-update-feed/SKILL.md) skill，指导 Agent 组合 `feedAgent`、`signal`、`priority` 等 filter，将公开更新情报输出为 Markdown，并沿 manifest 获取指定版本的原始 Prompt Markdown。skill 安装后只访问 `agentlab.dairui1.com` 的公开数据，不依赖本仓库 checkout。

安装到当前项目，并在交互提示中选择要使用的 Agent：

```bash
npx skills add https://github.com/dairui1/agentlab/tree/main/.codex/skills/agentlab-update-feed
```

全局安装给 Codex，可在任意项目中使用：

```bash
npx skills add https://github.com/dairui1/agentlab/tree/main/.codex/skills/agentlab-update-feed \
  --global --agent codex --yes
```

安装后直接告诉 Agent，例如：“使用 `agentlab-update-feed` 查询 Codex 最近 10 条高价值 Tools 更新，并返回 Markdown。”Agent 会从线上 manifest 和 feed 组合 filter，不需要克隆本仓库。

在本仓库开发或调试 skill 时，也可以直接运行内置脚本：

```bash
node .codex/skills/agentlab-update-feed/scripts/query-feed.mjs \
  --filter 'feedAgent=codex&signal=tools&priority=high&limit=10&format=markdown'
```

## 写作语气

项目里也放了一份 [`de-ai-ify`](.codex/skills/de-ai-ify/SKILL.md) skill。研究文章、交互提示、证据说明和报错文案在发布前都要照着它过一遍：少说套话，多讲清楚“哪一步、出了什么事、读者接下来能做什么”。口语化不能拿来糊弄事实，尤其不能编造个人经历，也不能把文件里的静态线索写成已经亲手跑通的结果。

仓库运维使用 [`agentlab-release-ops`](.codex/skills/agentlab-release-ops/SKILL.md) skill。它把每日流水线的 launchd 核查、上游与官方源码同步、AI 队列门禁、安全恢复、测试构建、Wrangler 发布和双域 manifest 验收收在同一套流程里。这个 skill 需要 AgentLab checkout 和本机发布环境，不是面向公开 feed 的只读查询器。

## 仓库结构

```text
agentlab/
  apps/agent-history/
    public/             # Web 应用源码与静态资源
      capabilities/    # 固定构建研究数据与兼容详情页
      dossiers/        # 跨 Agent 比较研究数据与证据
    scripts/            # 同步、规范化、分析、构建和发布脚本
    tests/              # Python 与 Node.js 测试
    ops/                # 本机日更自动化
```

生成的上游缓存、公开数据产物、Evidence、AI 分析和构建目录不提交到 Git。它们可以从相同的公开来源和脚本重新生成。

## 证据与安全边界

- 只使用公开、可引用、用户自有或明确允许保存的材料。
- 不提交账号 Token、内部日志、私有工作区内容、非公开系统提示词或未授权泄露源码。
- 来源事实、产品观察、工程推断和待验证问题必须分层表达。
- 已安装产品研究必须钉住构建版本与文件摘要；打包产物不是上游源码，组件存在也不等于运行路径已命中。
- 上游快照被视为不可信输入；构建过程限制文件类型、大小、路径和产物范围。
- 模型分析不等同于上游声明，应用会单独标记推断和确定性证据。

## 参与项目

欢迎修正错误事实和失效来源、接入新的官方证据、改进数据流水线，以及优化更新情报和版本比较体验。提交前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 许可证

AgentLab 使用 [MIT License](LICENSE) 开源。

## 致谢

- [Phistory](https://github.com/WEIFENG2333/phistory) 提供跨 Agent 的公开版本快照。
- 各 Agent 的官方文档、公开仓库和发布记录构成 AgentLab 的主要事实来源。

AgentLab 与被研究的 Agent 项目及其厂商没有隶属或背书关系。项目中出现的名称和商标归各自权利人所有。
