# AgentLab 全站界面走查

日期：2026-09-05。预览：`http://127.0.0.1:8789/`。设计约定见 [DESIGN.md](DESIGN.md)。

## 范围与方法

这一轮不再用首页或内页首屏代替全站验收。枚举 13 个 HTML、13 个查询参数专题详情、6 个附加机制入口及版本比较模式，共 33 个去重入口。

每个入口检查 1440 x 1000 和 390 x 844 两个视口，共 66 项。实际滚动覆盖 351 个位置；有限长页面均到达页尾。更新情报是无限列表，不声称滚完全部历史。长文章按段落所在区域检查布局，不重新审核研究结论。

截图复核结合 DOM 几何检查：逐路由检查标题、载入、资源及页面宽度；按页面模板检查首屏、中部、底部和展开状态。没有把“保存了截图”当成全部交互已经通过。

## 本轮修正

- 将长文章、专题详情、机制工作台、Goal/CUA 实验、DSH 和 Grok 的文字层级接入同一设计方向。内页辅助字号最低 12px，阅读正文不靠小字压缩。
- 缩小内页标题并稳定行高，压缩手机文章和专题详情开头的冗余间距。研究内容、证据编号、版本边界和原始链接不改写。
- 展开的证据改为文档内分隔结构；修复模型路由和 Tool 专题在打开证据库后，长环境变量撑出手机屏幕的问题。
- 补齐 Browser Use、DeepSeek 架构文章和机制工作台的导航选中态。
- 单操作比较在桌面隐藏重复的操作说明列，把空间还给三个产品；“全部操作”仍保留操作名称列。扩大参数标签和资源证据列，避免字段与按钮挤在一起。
- DSH/Grok 使用共用底色与深色变量。修复 DSH 深色分类标签及强调色对比度，消除长版本标题的单字尾行。
- Grok 去掉独立深色宣传块，保留真实截图与归因说明，提高截图显示尺度，深色模式不再出现整块亮色底板。

## 全部入口

下表的“通过”指两个视口都已完成页面级检查；不代表穷举每条数据或所有筛选组合。编号对应截图文件。

| 编号 | 入口 | 桌面 / 手机 |
| --- | --- | --- |
| 0 | `/capabilities` | 通过 |
| 1 | `/capabilities/browser-use` | 通过 |
| 2 | `/capabilities/computer-use` | 通过 |
| 3 | `/capabilities/deepseek-harness-architecture` | 通过 |
| 4 | `/capabilities/exo-recursive-harness` | 通过 |
| 5 | `/capabilities/goal-mode-real-run` | 通过 |
| 6 | `/capabilities/goal-mode` | 通过 |
| 7 | `/capabilities/kimi-computer-use` | 通过 |
| 8 | `/capabilities/token-budget-context` | 通过 |
| 9 | `/deepseek-harness` | 通过 |
| 10 | `/grok-bot` | 通过 |
| 11 | `/` | 通过；无限列表不穷举历史 |
| 12 | `/mechanisms` | 通过 |
| 13 | `/?mode=compare` | 通过 |
| 14 | `/capabilities?study=goal-mode` | 通过 |
| 15 | `/capabilities?study=exo-recursive-harness` | 通过 |
| 16 | `/capabilities?study=deepseek-harness-architecture` | 通过 |
| 17 | `/capabilities?study=subagent-orchestration` | 通过 |
| 18 | `/capabilities?study=session-resume` | 通过 |
| 19 | `/mechanisms?mechanism=session-resume` | 通过 |
| 20 | `/capabilities?study=context-compaction` | 通过 |
| 21 | `/mechanisms?mechanism=context-compaction` | 通过 |
| 22 | `/capabilities?study=token-budget-context` | 通过 |
| 23 | `/capabilities?study=model-routing` | 通过；展开溢出已修复 |
| 24 | `/mechanisms?mechanism=model-routing` | 通过 |
| 25 | `/capabilities?study=permission-sandbox` | 通过 |
| 26 | `/mechanisms?mechanism=permission-sandbox` | 通过 |
| 27 | `/capabilities?study=tool-contract` | 通过；展开溢出已修复 |
| 28 | `/mechanisms?mechanism=tool-contract` | 通过 |
| 29 | `/capabilities?study=mcp-dynamic-tools` | 通过 |
| 30 | `/mechanisms?mechanism=mcp-dynamic-tools` | 通过 |
| 31 | `/capabilities?study=browser-use` | 通过 |
| 32 | `/capabilities?study=computer-use` | 通过 |

## 交互检查

| 功能 | 实际验证 |
| --- | --- |
| 专题目录 | 搜索无结果，重置后恢复 13 个条目 |
| 13 个专题详情 | 每个都展开完整记录及第一条证据；长术语溢出修复后复测 |
| 7 篇证据文章 | 每篇打开第一处证据、关闭抽屉、检查焦点回到触发按钮 |
| 7 个机制 | 手机和桌面各切换五种视图，35 个状态均呈现非空内容、页面不横向溢出 |
| 机制全部操作 | 桌面展开共 97 个操作行；检查参数标签，修复 Session 的长标签 |
| 机制证据 | 手机打开与关闭检查器，焦点恢复到原证据按钮 |
| Goal Mode | 五个场景逐个切换，进入最后阶段，双产品状态正常呈现 |
| CUA 故障实验 | 五个故障场景切换；文章动作投递切到“停止”面板 |
| CUA 可视化回放 | 下一步改变进度，切换 Agent 视野，播放按钮变为暂停，再暂停 |
| TokenBudget | 切到 TokenBudget 路径，对应面板显示 |
| Goal 真实运行 | 切到最终验收关键帧及 Claude Code 轨迹，事件记录正常呈现 |
| DSH | 切换第二个版本，版本标题随选择更新 |
| Grok | 10 个机制标签和 4 个深入研究标签逐个切换 |
| 版本比较 | 默认版本组合、分析、事实证据与 Monaco 差异区域正常载入；第一轮已检查视图与换行控件 |

公共布局另补查 320px 和 1024px，共 16 项，无页面级横向溢出。五类内页模板检查深色模式与减少动画媒体条件，DSH 标签修复后重新截图。此项不是完整 WCAG 审计。

## 验证与证据

- `npm test`：134 个 Python 测试、186 个 Node 测试通过。
- `npm run build`：1527 个版本、21 个 Agent 构建成功；最后样式修正后重新生成 dist。
- `python3 scripts/verify_deploy.py`：21 个 Agent 的部署数据检查通过。这是本地检查，不是线上发布。
- `git diff --check`：通过。
- 新增 `tests/design-system.test.js`，约束路由清单覆盖、共享导航及当前上下文、内页字号、主题变量、证据长词换行和比较列宽。

本地截图与原始记录在 `artifacts/ui-design-2026-09-05/full-site/`，不作为站点公开资源。`audit-final.json` 是 66 项最终页面记录，`final-{编号}-{宽度}-{top|middle|bottom}.png` 是截图命名规则；短页可能没有独立中部截图。

`interactions.json` 保留首轮展开时发现的失败及复测记录，不能只读取其中初次结果。`mechanism-views-final.json`、`final-checks.json`、`breakpoints.json`、`dark-audit.json` 分别保留视图、修复复测、附加断点和主题记录。字体和列宽最后调整的补充截图以 `mechanism-final-` 开头。

## 设计评审与限制

内页经过两次独立截图评审，固定简报，分别为 7/10 和 7.5/10。这是主观反馈，不是功能通过标准。

仍可继续深化三点：比较页按语义字段逐行对齐；将结论依据入口放得更靠近论点；给 Grok 证据图增加明确标注的局部放大。当前没有为了视觉对齐补写“不适用”或“未知”，也没有裁掉图片中的归因上下文。此类信息重组应另做有证据约束的设计迭代。

没有穷举 1527 个版本的所有比较组合、每个外部来源链接、全部证据条目及筛选组合，也没有用屏幕阅读器完成端到端审计。研究文本准确性不属于本轮视觉验收结论。

本报告记录提交前的界面验收；未安装依赖，未修改研究数据。后续提交、推送和发布状态以 Git 记录与发布回执为准。
