import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const revision = "467f0a19016f0ac4d63b8d17a1f0da9ba07f232c";
const repository = "XiaomiMiMo/mimoagent";
const reportUrl = "https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Pro-RL/blob/73875d0/MiMo_V2_6_technical_report.pdf";
const reportHash = "fb81e6e083801b3358f084ed6be953dc23b0d2e434690f4541d5eae03e01e7af";
const output = fileURLToPath(new URL("../../public/capabilities/mimoagent.json", import.meta.url));
const specs = [
  ["MI-26", "NOTICE", 6, 34, "官方说明交代了对齐对象", "NOTICE 将 Codex 工具语义与 prompt 标为重实现，Claude 工具标为跟随 schema 和描述；黑盒则安装运行第三方 CLI，部分安装器带补丁。", "给出了对齐对象，没有披露全部合同的原始采集过程或等价性校准结果。"],
  ["MI-01", "AGENTS.md", 30, 46, "白盒对齐和黑盒执行是两条路径", "cc-agent / codex-agent 由 mimoagent 管理循环；claude-code / codex 启动真实上游 scaffold，模型对象只提供配置。", "这是官方源码说明，不是对两条路径行为等价的认证。"],
  ["MI-02", "src/mimoagent/agents/cc/cc_agent.py", 50, 141, "Claude 风格的工具合同", "CCAgent 使用独立工具目录、上下文用量提示和默认关闭的 AntiHackGuard。Compact 由模型决定；文本中残留的工具调用可触发格式反馈。", "示例配置才加入 Grep、Glob、Compact；不能把工具目录等同于所有工具默认开启。"],
  ["MI-03", "src/mimoagent/agents/cc/cc_agent.py", 146, 201, "压缩由下一次 query 执行", "Compact 请求先和工具返回配对；下一次 query 请求纯文本摘要，再重建 system、压缩边界、原始任务锚点和摘要。", "这是小米白盒实现，不证明与 Claude Code 的私有压缩实现相同。"],
  ["MI-04", "src/mimoagent/agents/codex/codex_agent.py", 53, 110, "Codex 白盒主动删去产品合同", "源码说明 core prompt 保留工程行为、删除部分产品交互；PTC 默认开启，自动压缩默认关闭。", "删减出于 RL 设计。所谓 Codex-aligned 不是整套 Codex 产品的复制品。"],
  ["MI-05", "src/mimoagent/agents/codex/codex_agent.py", 166, 202, "复用 code-mode host，但保留自己的循环", "PTC 建立 CodeModeRuntime；嵌套工具仍由配置目录决定。未形成结构化工具调用的文本可直接结束白盒 rollout。", "JavaScript 宿主的复用不等于复用完整 CLI；CC 路径的格式纠错也不同。"],
  ["MI-06", "src/mimoagent/agents/blackbox/claude_code.py", 61, 177, "Claude 黑盒不走原生 step", "默认固定 CLI 2.1.269；step 不执行，run 安装、准备、启动、收集。self.messages 只追加任务和最终回复，完整日志另行复制。", "这里能确认控制流和落盘选择，不能恢复闭源工具内部实现。"],
  ["MI-07", "src/mimoagent/agents/blackbox/claude_code.py", 239, 337, "同一模型接入多个 Claude 路由", "从共享 model 配置派生端点与模型名，并把 Sonnet、Opus、Haiku 和子 Agent 路由设为同一模型；后续轮次使用 continue。", "extra_env 可再覆盖；请求实际抵达哪个服务仍需要网络侧证据。"],
  ["MI-08", "src/mimoagent/agents/blackbox/resources/run_claude_sdk.py", 34, 56, "无人值守的问答替代", "AskUserQuestion 自动选择每题的第一个选项；没有选项则填空，其余工具允许原输入。", "这是固定策略，不是理解用户偏好的模拟。探针只运行回调，SDK 返回类型为替身。"],
  ["MI-09", "src/mimoagent/agents/blackbox/resources/run_claude_sdk.py", 95, 181, "保留 preset，同时改动运行设置", "使用 claude_code preset、bypassPermissions、默认禁用 WebSearch，并把流读取缓冲设为 256 MiB（可覆盖）；日志序列化允许 default=str。", "不能把此配置下的成绩写成默认交互版 Claude Code 的成绩；大缓冲的收益未在本研究测量。"],
  ["MI-10", "src/mimoagent/agents/blackbox/codex.py", 234, 275, "Codex provider 配置接管模型端点", "写入 CODEX_HOME 下的 config.toml 和 auth.json；默认关闭 web_search，instruction_path 可替换内置指令。", "描述限定在此适配器的固定快照，不作为所有 Codex 版本的通用使用说明。"],
  ["MI-11", "src/mimoagent/agents/blackbox/codex.py", 312, 368, "真实 CLI 的启动与续接", "调用 codex exec；后续轮次追加 resume --last，使用 JSON 事件输出，并绕过 CLI 审批和沙箱。", "任务必须在外层隔离环境中执行；本地探针仅记录命令字符串，没有启动 Codex。"],
  ["MI-12", "src/mimoagent/agents/blackbox/codex.py", 364, 447, "事件流不是训练 token 流", "优先复制事件日志，失败后最多读取末尾 2,000,000 字节；提取最终回复和 usage，api_calls 用消息数近似。", "NDJSON 事件、可见 reasoning 摘要及汇总用量都不能替代逐请求 token IDs、log-probabilities 与训练掩码。"],
  ["MI-13", "src/mimoagent/run/utils/save.py", 23, 106, "统一轨迹直接序列化 agent.messages", "save_traj 写入消息、模型查询参数与统计；黑盒适配器查询参数为空时不会凭空补出完整 tools 或中间调用。", "必须同时检查各 scaffold 的原始日志和额外采集链，不能把统一 JSON 当成无损训练样本。"],
  ["MI-14", "src/mimoagent/agents/blackbox/opencode.py", 114, 178, "OpenCode 也经过实验配置", "保留 snapshot、LSP、formatter，关闭自动更新和项目配置；默认移除 todowrite，并用固定标题避免额外标题生成。", "部分改动来自端点兼容性。这里记录行为差异，不提供规避服务限制的操作建议。"],
  ["MI-15", "src/mimoagent/agents/blackbox/resources/install-hermes.sh", 51, 114, "Hermes 安装时带有源码补丁", "安装脚本调整历史 thinking block 的保留，并自检补丁是否生效。", "这一路径不能标成完全未修改的上游。是否改善训练或缓存须另外测量。"],
  ["MI-16", "src/mimoagent/environments/detached.py", 141, 229, "长任务脱离长连接", "长命令放入独立会话，输出写远端文件，用短 exec 探测退出标记；可按日志修改时间启用停滞 watchdog。", "长连接断开不必结束进程，但这不是进程崩溃后的完整工作恢复协议。"],
  ["MI-17", "src/mimoagent/run/extra/batch.py", 392, 466, "批处理连接任务、Agent 与评分", "agent.type 决定执行路径；支持多轮查询和可选 user-agent；Agent 结束后才 attach_rollout 并 calculate_reward。", "执行 Completed 和任务评分通过是两个状态。"],
  ["MI-18", "src/mimoagent/environments/datasets/base.py", 337, 386, "先看交付现场，再运行 verifier", "先捕获 model_patch，再执行可选 rubric judge，最后运行可能改动 testbed 的 verifier；错误结果携带额外诊断。", "同容器里的 judge 不是硬安全隔离；下游不能只读 reward=0 而丢弃错误类型。"],
  ["MI-19", "src/mimoagent/agents/user_agent.py", 168, 265, "真正模拟的是后续用户", "可选 UserAgentDriver 用独立模型与共享环境交替生成追问；通过 query_N.md 交付，按轮数和状态终止。", "这与模拟目标 Agent 是两回事，也不是人类偏好有效性的证明。"],
  ["MI-20", "src/mimoagent/agents/blackbox/resources/install-codex.sh", 33, 79, "固定安装版本和完整组件", "默认安装 Codex 0.154.0，检查版本与 code-mode host 是否齐全。", "安装脚本也允许 latest；本研究固定的是源码快照，没有安装或验证上游 CLI 二进制。"],
  ["MI-21", "example_configs/swe_cc_agent.yaml", 1, 60, "白盒并不复制完整 Claude prompt", "CC 示例配置用简短通用 system_template，选入八种工具，并启用上下文用量提示。", "这个示例不能证明论文四个 mini-harness 与仓库配置一一对应。"],
  ["MI-22", "src/mimoagent/agents/codex/codex_agent.py", 338, 378, "Codex 白盒采用本地摘要压缩", "可选压缩通过普通 Responses 请求得到摘要，重建历史；不用专用 compact 端点。", "不能把白盒压缩行为外推成真实 Codex 的远程压缩策略。"],
];

const unknowns = [
  ["训练四个 mini-harness 的精确映射", "论文的 mini-harness1-4 没有在所读材料中逐一绑定公开配置与 revision。", "补齐训练时完整配置、混合比例、模型 checkpoint 和工具版本。"],
  ["黑盒轨迹如何进入真实训练器", "该仓库的适配与落盘链未展示完整的服务端 token 采集及优化器数据流。", "在授权自建端点记录最终请求、输出 token IDs、logprobs、策略版本和 loss mask，再检查训练入口。"],
  ["白盒与原版的行为距离", "工具名相同仍可能有截断、压缩、纠错与退出条件的差异。", "对相同任务和模型进行 paired runs，分别统计工具错误、上下文变化、token 成本与任务成绩。"],
  ["原版 CLI 的真实端到端可运行性", "本次没有启动生产 CLI、模型 API、Docker 或 Kubernetes。", "在隔离容器执行一条可验收的代码任务，保留网络请求、原始日志和 verifier 结果。"],
  ["多 harness 的独立因果收益", "公开结果展示迁移提升，但本研究没有验证等算力的单 harness 对照与统计显著性。", "固定任务、训练预算、起点模型与评分器，仅改变 harness 多样性。"],
];

export async function buildStudy(sourceTree) {
  assert.equal(execFileSync("git", ["-C", sourceTree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), revision, "Unexpected source revision");
  const evidence = [];
  for (const [id, artifact, lineStart, lineEnd, title, statement, boundary] of specs) {
    const bytes = await readFile(path.join(sourceTree, artifact));
    assert.ok(lineStart > 0 && lineEnd <= bytes.toString().trimEnd().split("\n").length, id);
    evidence.push({ id, kind: "observation", confidence: "high", title, statement, artifact,
      locator: `L${lineStart}-L${lineEnd}`, lineStart, lineEnd,
      sha256: createHash("sha256").update(bytes).digest("hex"), boundary,
      source: { label: `MiMo Agent · ${path.basename(artifact)}`, url: `https://github.com/${repository}/blob/${revision}/${artifact}#L${lineStart}-L${lineEnd}` },
    });
  }
  for (const [id, locator, title, statement, boundary] of [
    ["MI-23", "§4.2.5 · p.13", "训练用可重组 mini-harness", "技术报告解释：生产 harness 的额外约束不被任务奖励完整覆盖，且模块耦合；因此用最小循环、prompt、工具和上下文管理重组训练配置。", "作者的方法论说明，不是黑盒内部逆向过程，也不是每项机制已有独立消融。"],
    ["MI-24", "Figure 10 · p.23; Table 7 · p.36", "在保留 harness 上测试迁移", "Figure 10 报告 DeepSWE v1.1 的三个保留 harness 均值约从 50% 升到 66%；Table 7 的 9B 独立实验另给出 SFT 与 multi-harness RL 分数。", "作者报告，未复现。两个实验不能混为一个，也不能由趋势图单独推出多样性的因果收益。"],
    ["MI-25", "§6.2 · pp.27-29", "完整 RL 系统超出适配器仓库", "报告描述固定 actor 池的多租户执行、同组共用 harness 配置，以及把 token/logprob 等大载荷和调度元数据分开的 Payload Porter。", "论文基础设施不能直接算作 mimoagent 当前公开源码已具备的完整训练能力。"],
  ]) evidence.push({ id, kind: "observation", confidence: "high", title, statement,
    artifact: "MiMo_V2_6_technical_report.pdf", locator, sha256: reportHash, boundary,
    source: { label: "小米官方技术报告", url: reportUrl }, evidenceClass: "author-report" });
  return {
    id: "mimoagent", title: "MiMo Agent：黑盒接入与白盒训练", product: "MiMo Agent",
    subtitle: "原版 CLI、mini-harness 与训练轨迹之间的区别",
    description: "沿一条代码修复任务，拆解小米如何复用真实 Coding Agent、重组白盒训练环境，以及日志距离 RL 样本还差什么。",
    verifiedAt: "2026-09-28", status: "active",
    source: { repository, revision, branch: "mimo-oss", commitDate: "2026-09-21T14:01:34-07:00", license: "MIT", evidenceClass: "official-source-static-and-local-contract-tests", trackingMode: "fixed-commit", runtimeExperiment: "synthetic-contract-only", realCliExperiment: "not-run" },
    boundary: "固定官方源码、技术报告与本地离线合同测试。431 项上游测试通过，7 项 Linux 测试跳过；另有合成事件探针。没有执行真实 CLI、模型 API、容器任务或 RL 训练；作者成绩不是独立复现。",
    evidence, unknowns: unknowns.map(([title, text, needed], index) => ({ id: `MI-KU-0${index + 1}`, title, text, needed })),
    verification: { upstreamPassed: 431, upstreamSkipped: 7, probe: "/capabilities/mimoagent-probe.json", realModelCalls: 0, reportSha256: reportHash },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , sourceTree, mode = "--check"] = process.argv;
  assert.ok(sourceTree && ["--check", "--write"].includes(mode), "Usage: node build_evidence.mjs SOURCE_TREE [--check|--write]");
  const study = await buildStudy(sourceTree);
  if (mode === "--write") await writeFile(output, JSON.stringify(study, null, 2) + "\n");
  else assert.deepEqual(JSON.parse(await readFile(output, "utf8")), study, "Source evidence drift");
  console.log(`${mode}: ${study.evidence.length} evidence records; ${new Set(specs.map((s) => s[1])).size} fixed source files`);
}
