# GPT Prompt 演进专题核验记录

核验日期：2026-09-05。按用户反馈，将长文章改为左右逐段红绿 Diff，分组下方只留简短讲解。此记录说明实现与验证范围，不作为线上部署回执。

## 产物

- 入口：`public/capabilities/gpt-prompt-evolution.html`。
- 原文 Diff：`gpt-prompt-evolution-diff.json`，保留三份固定模板的原始字节。
- 分组与解读：`gpt-prompt-evolution.json` 的 `comparisons`；同文件保留 22 条证据和 6 个待验证问题。
- 来源与哈希：`gpt-prompt-evolution-sources.json`。
- 渲染：`public/gpt-prompt-evolution.js`，复用已安装的 Monaco Diff Editor、共享行数统计及证据抽屉。

仅提供 GPT-5.5 → GPT-5.6、GPT-5.6 → GPT-6 Astra 两步比较，默认第一步。已删除跨版本选项和解读；旧跨版本链接自动回到第一步，并保留换行、相同段落、证据和锚点参数。每步各 10 组，双方均无内容的分组不显示。每个原文件的非空行恰好出现一次，不改写、重复或遗漏；跨位置组合只插入一个无原始行号的空行。

## 固定来源

收集仓库：`3713c676ab49fa0a9f58dc693a153b5c12618dd6`。
OpenAI Codex 对照：`588b781ab4924ce7352488394028e63d74cf807f`。

5.5 与官方模板字节一致。5.6 的 Sol、Terra、Luna 在固定官方提交下共用模板，统一排版后与收集版一致。Astra 仍有一段异步澄清差异，来源说明保留了工具、附件限制以及 30 秒 / 60 秒的区别。没有将模板称作完整运行时请求，也未执行模型行为实验。

## 复核

在 `apps/agent-history` 下运行：

```sh
python3 scripts/audit_gpt_prompt_evolution.py --fetch --check
npm test
npm run build
python3 scripts/verify_deploy.py
```

`--fetch` 只补充缺少的固定来源。去掉 `--check` 会重建来源统计和公开 Diff 输入；哈希不符则失败。

前次完整测试为 134 项 Python、193 项 Node 通过，构建和本地发布数据检查通过。相邻版本调整的回归记录见下方。

相邻版本回归：48 项相关 Node 测试通过，固定原文哈希核验和 `build_dist.mjs` 通过。Playwright 在 1440、1024、390、320 像素及深色模式下检查了两步各 10 组 Diff、红绿标记、原文模型释放、换行、相同段落开关、来源失败重试与证据深链接；旧跨版本 URL 回退及参数保留通过。人工检查窄屏和第二步桌面截图，无页面横向溢出。

发布前全量测试：134 项 Python、194 项 Node 通过。来源统计文件也只保留两个相邻版本对比，并由回归测试约束。

浏览器回执与截图：`tmp/gpt-prompt-diff-ui/`；脚本：`tmp/gpt-prompt-diff-ui.cjs`；测试日志：`tmp/gpt-prompt-diff-tests.log`。使用已有 Playwright，没有安装新依赖。窄屏在 Diff 容器内横向滚动，页面本身不横向溢出。
