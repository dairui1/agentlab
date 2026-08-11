(function attachGoalModeLabCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GoalModeLabCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createGoalModeLabCore() {
  "use strict";

  const stages = Object.freeze([
    { id: "set", label: "目标已设" },
    { id: "turn-end", label: "本轮结束" },
    { id: "boundary", label: "边界判断" },
    { id: "next", label: "下一步" },
  ]);

  const lane = (status, title, known, consequence, boundary, evidence) => ({
    status, title, known, consequence, boundary, evidence,
  });

  const scenarios = Object.freeze([
    {
      id: "evidence-missing",
      label: "说完成了，证据还缺",
      title: "worker 说“做完了”，验收证据却没有凑齐",
      summary: "两边都想阻止草率收工，但把判断放在了不同位置：Codex 要 worker 自己做完成审计；Claude Code 另叫一个 evaluator 看对话记录。",
      stages: [
        {
          codex: lane("active", "目标住进 thread 状态", "运行时保存完整 objective；完成前，它仍是 active。", "后续轮次不必靠聊天记录重新猜目标。", "这只保存成功条件，不会自动证明成功。", ["GM-01", "GM-02"]),
          claude: lane("active", "条件挂到 Stop hook", "会话里有一条 goal condition，每轮停止时都要评估。", "worker 可以先正常工作，停下时再交给 evaluator。", "目标是 session-scoped；它没有改写工具权限。", ["GM-09", "GM-10", "GM-13"]),
        },
        {
          codex: lane("audit", "worker 准备结束这一轮", "continuation prompt 要求逐项核对显式要求，不得重定义成功。", "证据不足时，worker 应保留 active，而不是调用 complete。", "这仍是同一个 worker 的自我审计，不是独立裁判。", ["GM-04", "GM-08"]),
          claude: lane("evaluate", "Stop hook 叫来 evaluator", "一个较小模型会根据对话里呈现的内容检查 condition。", "worker 的“完成”不是最终答案，evaluator 还会给一次 met / unmet。", "evaluator 不能自己读文件或跑命令，只看被写进对话的材料。", ["GM-09", "GM-11"]),
        },
        {
          codex: lane("uncertain", "完成权限在 worker 手里", "只有 worker 能用受约束的 update_goal 把状态改成 complete。", "按提示做对了，它会继续查缺口；判断错了，运行时也可能接受 complete。", "持久状态能防丢目标，不能替代外部验收。", ["GM-04", "GM-08", "GM-14"]),
          claude: lane("unmet", "裁判只能审对话里的证词", "若证据缺失已经显露在对话里，evaluator 可以判 unmet 并说明原因。", "系统据此再开一轮，让 worker 补证据。", "文件里其实缺什么、测试是否真通过，没被呈现就看不到。", ["GM-09", "GM-11", "GM-14"]),
        },
        {
          codex: lane("continue", "保持 active，再起一轮", "线程空闲且 goal 仍 active 时，运行时会注入隐藏 continuation。", "下一轮沿原 objective 继续；若 worker 已误报 complete，则不会再续。", "“是否完成”的质量仍取决于 worker 的验证。", ["GM-05", "GM-08"]),
          claude: lane("continue", "unmet 就把理由送回下一轮", "evaluator 的 unmet reason 会成为下一轮继续工作的依据。", "condition 达成才自动清 goal；否则循环继续。", "外审比自审多一道门，但裁判的视野更窄。", ["GM-09", "GM-10", "GM-11"]),
        },
      ],
    },
    {
      id: "same-blocker",
      label: "同一阻塞，第三次出现",
      title: "同一个外部阻塞，已经连续撞了第三轮",
      summary: "Codex 给 blocked 一条明确的三轮审计规则；Claude Code 的核心问题仍是 condition 是否达成，阻塞通常得写进条件或由人停止。",
      stages: [
        {
          codex: lane("active", "目标仍 active，阻塞不是完成", "目标状态和聊天内容分开保存，前两次受阻不会抹掉 objective。", "运行时仍会尝试让任务推进。", "只有真正无法继续时才该转 blocked。", ["GM-02", "GM-07"]),
          claude: lane("active", "condition 仍未达成", "Stop hook 关心的是成功条件，不会先创建一条 blocked 状态。", "只要 evaluator 判 unmet，就仍有理由继续一轮。", "阻塞上限若没写进 condition，系统没有同构的三轮门槛。", ["GM-09", "GM-10"]),
        },
        {
          codex: lane("counting", "第三次遇到同一堵点", "goal 提示要求辨认“同一阻塞条件”连续出现的次数。", "这轮终于满足 blocked 审计的次数前提。", "困难、慢或想问人，不自动等于 blocked。", ["GM-07", "GM-08"]),
          claude: lane("evaluate", "每轮照常触发 Stop 评估", "evaluator 会再次检查 condition，并能看到对话里前几轮的阻塞说明。", "它可以继续判 unmet，也可能按 condition 里的退出条款结束。", "三次本身不是内建状态转移规则。", ["GM-09", "GM-11"]),
        },
        {
          codex: lane("blocked", "worker 可以把目标标成 blocked", "受约束的 update_goal 允许 complete 或 blocked；blocked 要通过三轮同因审计。", "状态从 active 变为 blocked，自动 continuation 停下。", "是否真是同一个堵点，仍由模型根据工作现场判断。", ["GM-04", "GM-07", "GM-08"]),
          claude: lane("unmet", "裁判多半只会说“还没达成”", "没有满足 condition 时，evaluator 返回 unmet reason。", "理由回到 worker，默认路径是继续，而不是进入一条持久 blocked 状态。", "要停在第三次，需把次数/时间边界写进 condition，或由用户清除 goal。", ["GM-09", "GM-10", "GM-14"]),
        },
        {
          codex: lane("stopped", "停在 blocked，等外部变化", "blocked goal 不会在 idle 时自行续跑；用户之后可以恢复。", "阻塞被保留下来，线程不会空转烧预算。", "resume 后，三轮 blocked 审计会重新开始。", ["GM-05", "GM-07", "GM-08"]),
          claude: lane("continue", "unmet 再开一轮，除非条件另有边界", "Stop hook 的循环继续运作，直到 met、清除 goal 或其他会话边界介入。", "写得好的 condition 可以把“受阻三轮就停”变成可评估条件。", "这是 prompt 条件，不是和 Codex blocked 等价的运行时状态。", ["GM-09", "GM-10", "GM-14"]),
        },
      ],
    },
    {
      id: "budget-edge",
      label: "token budget 到线",
      title: "任务还没做完，但 Codex 的 token budget 已经到线",
      summary: "Codex 把预算做成运行时会计和状态；Claude Code 可以在 condition 里写轮数或时间边界，但那是 evaluator 读文字后判断，不是同一种硬门。",
      stages: [
        {
          codex: lane("budgeted", "创建目标时显式带了 token budget", "只有用户明确要求，goal 才记录 token budget。", "运行时从目标开始累计非缓存输入和输出 token。", "预算不是完成标准，碰线也不能假装任务已完成。", ["GM-04", "GM-06"]),
          claude: lane("bounded", "边界写在 condition 文本里", "condition 可以写“最多 N 轮”或时间条件，让 evaluator 一起判断。", "边界与成功条件都由模型从对话中解释。", "这不是独立的 token 计数状态，也不改变模型权限。", ["GM-09", "GM-14"]),
        },
        {
          codex: lane("accounting", "本轮结束，运行时结算用量", "goal runtime 会串行更新 tokens_used 与 time_used。", "并发进度不会各算各的，预算判断有统一账本。", "计数口径是实现定义的 token 用量，不等于费用账单。", ["GM-02", "GM-06"]),
          claude: lane("evaluate", "本轮结束，evaluator 读 condition", "Stop hook 仍执行 met / unmet 判断，也能显示会话内花费。", "若文字边界已满足，evaluator 可以据此收束。", "condition 里的“预算”仍是语义判断，不是运行时 token 闸门。", ["GM-09", "GM-10", "GM-14"]),
        },
        {
          codex: lane("budget-limited", "运行时先判 budget_limited", "累计 token 到线后，状态转为 budget_limited，并向当前轮注入收尾提示。", "系统要求停止实质工作、交代进度，且不许仅因预算到线调用 complete。", "硬停能控制消耗，但不会替用户完成剩余验收。", ["GM-06", "GM-07"]),
          claude: lane("semantic", "裁判判断文字边界算不算到了", "evaluator 只能依据 condition 和对话里可见的信息做决定。", "若写了上限，它可能结束；没写，就仍按成功条件判 unmet。", "它没有与 Codex budget_limited 同构的持久状态。", ["GM-09", "GM-11", "GM-14"]),
        },
        {
          codex: lane("stopped", "收尾后停在 budget_limited", "运行时不会再自动续跑 substantive work。", "用户能看到目标没完成、用量到哪、还剩什么。", "之后如何继续由用户决定，不能由模型私自扩大预算。", ["GM-06", "GM-07"]),
          claude: lane("condition-led", "按 condition 的判决继续或结束", "判 unmet 就再开一轮；判 met 或命中写入的退出条件就清 goal。", "灵活性高，边界也更依赖 condition 写得清楚。", "显示 token spend 不等于用 token 状态机强制停机。", ["GM-09", "GM-10", "GM-14"]),
        },
      ],
    },
    {
      id: "resume",
      label: "关掉再恢复",
      title: "任务中途离开，之后恢复同一个会话",
      summary: "两边都能把未完成目标找回来，但续的是不同东西：Codex 续持久 thread goal 及用量；Claude Code 从 transcript 恢复 Stop hook，同时重置本次显示的计数基线。",
      stages: [
        {
          codex: lane("persisted", "goal 跟着已保存的 thread", "objective、status、token budget、tokens used 和耗时都有持久字段。", "目标不是一段只能活在当前上下文的提醒。", "临时、未保存的 session 不能承载 goal。", ["GM-01", "GM-02", "GM-03"]),
          claude: lane("session", "condition 先属于当前 session", "active goal 通过 Stop hook 驱动，状态也会写进 transcript 供恢复。", "正常会话里能跨多轮保持同一条件。", "它的产品边界仍是 session-scoped goal。", ["GM-09", "GM-10", "GM-12"]),
        },
        {
          codex: lane("interrupted", "线程离开时 goal 仍未完成", "持久状态保留 active 以及累计用量。", "重新打开线程时，不必把旧聊天重新压成一条新目标。", "外部工作区可能已经变化，恢复后仍要重新核对现场。", ["GM-02", "GM-08"]),
          claude: lane("interrupted", "会话 transcript 留下 active goal 记录", "已达成或已清除的 goal 不会被当成 active 恢复。", "未完成条件有机会在 resume 时重新注册。", "恢复依据是 transcript 留痕，不是独立的 thread goal 数据表。", ["GM-10", "GM-12"]),
        },
        {
          codex: lane("restored", "恢复持久 goal 与账本", "运行时重新读出 objective、status 和累计 usage。", "预算判断延续原来的总账，不会因为重开界面从零开始。", "恢复状态不代表沿用旧观察；工作区才是当前事实。", ["GM-02", "GM-05", "GM-06"]),
          claude: lane("restored", "从 transcript 重挂 Stop hook", "active condition 会恢复，但 turn count、timer 与 token baseline 重新起算。", "目标语义接上了，状态面板里的这几项统计却是新一段。", "跨恢复比较数字时，不能把新基线误当成任务全程总量。", ["GM-10", "GM-12"]),
        },
        {
          codex: lane("continue", "active 就从 thread idle 边界续跑", "恢复后仍 active 的 goal 可触发隐藏 continuation，并沿原 objective 工作。", "状态和累计预算共同约束下一轮。", "如果是 paused、blocked 或 usage_limited，要由用户恢复，不会偷偷开工。", ["GM-05", "GM-07"]),
          claude: lane("continue", "恢复后的 Stop hook 接管下一次停止", "worker 继续工作；一轮结束，evaluator 再判 condition。", "未达成就继续，达成就清 goal。", "统计重置不等于 condition 重置，也不等于拥有独立工作区验证能力。", ["GM-09", "GM-11", "GM-12"]),
        },
      ],
    },
  ]);

  function clampStep(value, maximum = stages.length - 1) {
    const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(maximum, Math.max(0, Math.trunc(parsed)));
  }

  function findScenario(id) {
    return scenarios.find((scenario) => scenario.id === id) || null;
  }

  function resolveScenario(study, requestedId) {
    if (study?.id && study.id !== "goal-mode") {
      throw new Error("拿到的不是 Goal Mode 研究资料");
    }
    return findScenario(requestedId) || scenarios[0];
  }

  function resolveSelection(href, fallbackScenarioId, fallbackStep) {
    const url = new URL(href, "https://agentlab.local");
    const requestedId = url.searchParams.get("goalCase") || fallbackScenarioId;
    const scenario = findScenario(requestedId) || scenarios[0];
    const requestedStep = url.searchParams.has("goalStep")
      ? url.searchParams.get("goalStep")
      : fallbackStep;
    return {
      scenarioId: scenario.id,
      step: clampStep(requestedStep === undefined ? 0 : requestedStep),
    };
  }

  return Object.freeze({ stages, scenarios, findScenario, resolveScenario, resolveSelection, clampStep });
});
