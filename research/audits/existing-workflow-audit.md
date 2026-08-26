# Grok Bot、Goal Mode 与 DSH 研究工作流复盘

核验日期：2026-08-25
范围：只使用 AgentLab 仓库中已提交的产物、测试、Git 历史与忽略规则；不把旧对话或外部记忆当作事实来源。

## 结论

三项研究已经反复跑出同一条真实流水线：**兴趣触发的问题 -> 固定研究对象 -> 建立架构地图 -> 沿关键控制链读源码 -> 按证据边界形成判断 -> 补最小验证 -> 手工改写为网页与交互 -> 测试、构建、发布**。

AgentLab 已经擅长保存最后三步的公开产物，却没有稳定保存前四步的研究现场。源码副本、原始 capture、工作状态与中间证据位于被忽略的目录或没有进入仓库；问题树、阅读路径、否决过的解释和“为什么继续深挖”也没有统一资产。因此网站能证明结论经过了认真整理，却不能让下一次本地 Agent 从同一研究状态继续。

## 三项研究怎样发生

| 阶段 | Goal Mode | DeepSeek Harness | Grok Bot |
| --- | --- | --- | --- |
| 立题 | 用一个尖锐比较问题约束范围：目标存在哪里、谁续轮、谁停、谁判完成；不做产品总分 | 先问插件化 Harness 如何组装和扩展，后来又分出版本雷达与插件生态 | 先判定非官方重建到底交付了什么，再追完整 runner 与作者 Router 是否等价 |
| 固定对象 | Codex 固定源码提交；Claude 固定本地发布二进制版本与哈希，但在线文档仍会漂移 | 架构专题固定提交 `47f9438`；版本雷达则持续跟随 npm、tag、GitHub Release | 固定重建仓库提交 `a9f633e`，并把官方产品、重建 runtime、作者扩展分层 |
| 架构理解 | 从 thread state、工具合同、idle scheduler、accounting 与 Stop hook 拼出两套控制面 | 从 profile/bundle/patch、Cordis service、typed event、SessionEvent 与 Agent Loop 建立职责图 | 从 renderer、Electron main、coordinator、gateway/host、turn runtime、executors、persistence 建进程和状态地图 |
| 机制追踪 | 沿 set -> turn end -> completion boundary -> next turn 比较状态、预算、恢复和验收权 | 沿 profile 解析 -> service 注入 -> turn/step -> event log -> protocol 追扩展落点 | 从 `sendPrompt` 入口追到两套 turn engine，再追消息交付、工具投影、恢复、安全门和 Router 断层 |
| 验证 | 主要是固定源码、官方合同和发布包静态证据；动态误判率、崩溃计量仍列为未知 | 架构专题明确没有 runtime trace；版本情报另有来源同步、构建与部署新鲜度校验 | clean clone 中执行安装、两套 typecheck、frontend build、测试与 audit；用内容寻址收据保存结果，原生 package/smoke 被阻塞 |
| 写作 | JSON 证据 + 长文 + 五场景双泳道交互实验 | 架构文章 + 版本雷达；插件榜单在 7 分钟后被撤回，改成硬编码能力地图 | 机制结论优先，源码考古、provider、X 讨论和可折叠证据账本随后；第二轮从 36 条证据扩到 78 条 |
| 发布 | 专题 JSON、HTML、交互 JS/CSS 与大型 UI 测试共同提交 | 固定架构页、自动更新的 release 数据面、独立雷达页和测试分别维护 | 单独 dossier、验证收据、页面、交互逻辑、样式与 schema 校验一起发布 |

## 反复出现、值得保留的研究资产

1. **研究问题与边界**：三项研究都因一句明确问题而收敛；`scope`、`boundary` 和“不做总分/不外推”的声明比宽泛选题更有约束力。
2. **固定研究对象**：仓库、完整 commit、产品版本、发布日期、本地二进制 SHA、核验时间。它们决定结论能否重访。
3. **架构地图**：不是 package 清单，而是入口、进程/服务、状态所有者、transport、生命周期和 failure boundary。
4. **机制调用链**：入口到关键状态变化的逐段路径，并标出完整路径、旁路、dormant path 和作者扩展。
5. **原子证据账本**：稳定 ID、事实/推断类型、artifact、locator、hash、固定链接、statement、boundary。
6. **未知项**：每个未知不仅写“不知道”，还写需要什么 trace、实验或上游材料才能回答。
7. **验证收据**：环境、命令、退出码、结果、阻塞原因与结论边界；Grok Bot 已经给出目前最完整的形态。
8. **公开解释模型**：一句 thesis、关键机制、渐进讲解、可检索证据和只在合适处出现的交互演示。
9. **发布验证**：schema/UI 测试、构建、导航、部署新鲜度。这是发布层资产，不应和“研究结论已被运行验证”混为一谈。

## 上下文在哪里丢失

- `.codex-research/` 整体被忽略；当前本地目录保留了其他研究的源码副本与 findings，但没有一套由仓库追踪的统一入口。换机器、clean clone 或新 Agent 都无法从 Git 恢复这些现场。
- `apps/agent-history/analysis/evidence/`、`public/data/` 与生成数据同样被忽略。自动化能再生成部分 release 数据，但一次源码研究的原始 capture、阅读状态与拒绝证据没有通用恢复合同。
- Goal Mode 的公开测试甚至明确要求“不暴露本地研究轨迹”。这对网站是正确的隐私边界，却也说明仓库中缺少另一个私有/本地但结构化的研究层。
- 发布 JSON 保存的是筛选后的证据和结论，不保存问题树、候选解释、搜索日志、读过但否决的路径、尚未写入文章的发现，以及下一步从哪里继续。
- 三项研究的 schema 不一致。Goal Mode/DSH 使用紧凑 `scope + evidence + unknowns`；Grok Bot 另有 `layers + mechanisms + deepDive + verification`。后续 Agent 不能依赖一份共同研究合同。
- 本地二进制能用哈希固定身份，但发布物本身与提取步骤没有进入可恢复资产；在线文档链接则会漂移。几个月后只能看到当时结论，难以重放取证过程。
- Git commit 记录了结果迭代，却没有记录触发迭代的质量判断。Goal Mode 在不到两小时内连续补证据和追版本；Grok Bot 在首版后约两小时加深；原因只能从 diff 反推。

## 重复的手工劳动

- 每个专题都手写一套 JSON、长 HTML、专用 JS/CSS、证据抽屉和大量结构测试；研究结构与展示结构耦合。
- 源码固定、文件定位、hash、GitHub blob URL、事实/推断分类和 boundary 都由人/Agent 重复组装，没有共用生成器或 lint contract。
- 架构与调用链先在研究者脑中形成，再手工翻译成文章段落、表格、flow 和交互组件；没有可同时驱动知识库、文章与课件的中间表示。
- DSH 的插件榜单实现包含同步脚本、测试和 776 行快照，7 分钟后整套删除并改为能力分类，暴露出“先做页面，再确认它回答什么问题”的返工。
- DSH 版本雷达、DSH 架构专题和插件能力图散落在不同数据链路；同一对象的版本、架构、生态和实操没有一个研究主页或共同索引。
- 每次更新产品版本，都要同时修改证据、文章、交互场景和测试中的硬编码版本。Goal Mode 一上午三次提交就是直接证据。

## 展示缺口

- **能读，尚不能复刻**：页面能讲结论和调用链，但没有把“修改/复刻一个机制”变成可下载、可运行的最小实现或 workshop。
- **能列验证，尚不能做实验**：Grok Bot 展示静态验证收据；Goal Mode 有交互解释，但交互是预设场景，不运行真实实现；DSH 架构明确没有 runtime trace。
- **能看证据，尚不能从问题反查**：证据抽屉围绕当前文章组织，缺少跨研究的机制、入口、状态面、failure mode 与源码符号索引。
- **能展示架构，尚不能渐进展开**：Goal Mode 的双泳道是最接近课件的载体；DSH 仍以文章/表格为主，Grok Bot 虽有 tab 与节点，但大部分复杂关系仍依赖长文本阅读。
- **缺少 freshness 视图**：固定版本研究本身是诚实的，但网页没有统一告诉读者哪些结论仍适用、上游已变化到哪里、哪些证据需要重验。
- **插件探索没有回答“哪个好玩、怎么用”**：当前 DSH 能力地图没有实际插件条目、安装路径、最小演示、运行收据或体验判断；它解释了类别，没完成生态探索任务。

## 对后续地图的事实约束

1. 研究协议必须先服务本地 Git 研究现场，再由同一结构生成公开视图；不能继续以网页文件作为唯一持久资产。
2. “研究完成”至少要分别检查：架构可讲、关键链可追、动机有证据或被标为推断、比较维度明确、存在可修改/复刻资产、至少一个关键结论有最小实验。三项现状都只覆盖其中一部分。
3. 共用 schema 应容纳项目解剖、机制比较和生态探索的差异，但必须统一 revision、question、architecture、traces、evidence、unknowns、experiments、publication 与 freshness。
4. 公开层继续隐藏本地敏感路径和不可发布材料；隐藏不等于丢弃，应在本地研究层保留可恢复的索引、状态和 provenance。
5. 交互课件应从研究中间表示选择性生成。Goal Mode 证明 2D 状态/泳道交互有效；不是所有研究都需要 3D。
6. 首个实施切片应拿一项真实研究贯通“立题 -> 固定源码 -> 架构 -> 一条机制链 -> 最小实验 -> 文章/交互发布”，而不是先造通用门户或再次扩张情报页。

## 仓库证据指针

- Goal Mode：`apps/agent-history/public/capabilities/goal-mode.json`、`goal-mode.html`、`goal-mode-lab-*`；提交 `b2c8be1`、`fa30126`、`57ec55c`。
- DeepSeek Harness：`apps/agent-history/public/capabilities/deepseek-harness-architecture.*`、`deepseek-harness.*`；提交 `9422002`、`9ef9d8c`、`bc3bcb3`、`cf0f5d6`、`e2a323e`。
- Grok Bot：`apps/agent-history/public/dossiers/grok-bot-reconstruction.json`、内容寻址验证收据、`grok-bot.*`；提交 `987f2e9`、`22c0acb`。
- 研究现场边界：`.gitignore` 对 `.codex-research/`、`apps/agent-history/analysis/evidence/`、`apps/agent-history/public/data/` 的规则。
