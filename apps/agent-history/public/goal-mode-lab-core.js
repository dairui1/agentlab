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
          claude: lane("active", "条件挂到 Stop hook", "会话里有一条 goal condition，来到可评估的停止边界才交给 evaluator。", "worker 可以先正常工作，goal 不会占用一个 coding subagent。", "目标是 session-scoped；它没有改写工具权限。", ["GM-09", "GM-10", "GM-13"]),
        },
        {
          codex: lane("audit", "worker 准备结束这一轮", "continuation prompt 要求逐项核对显式要求，不得重定义成功。", "证据不足时，worker 应保留 active，而不是调用 complete。", "这仍是同一个 worker 的自我审计，不是独立裁判。", ["GM-04", "GM-08"]),
          claude: lane("evaluate", "Stop hook 叫来 evaluator", "一个较小模型会根据对话里呈现的内容检查 condition。", "worker 的“完成”不是最终答案，evaluator 还会给出 met、unmet 或 impossible。", "evaluator 不能自己读文件或跑命令，只看被写进对话的材料。", ["GM-09", "GM-10"]),
        },
        {
          codex: lane("uncertain", "完成权限在 worker 手里", "只有 worker 能用受约束的 update_goal 把状态改成 complete。", "按提示做对了，它会继续查缺口；判断错了，运行时也可能接受 complete。", "持久状态能防丢目标，不能替代外部验收。", ["GM-04", "GM-08", "GM-14"]),
          claude: lane("unmet", "裁判只能审对话里的证词", "若证据缺失已经显露在对话里，evaluator 可以判 unmet 并说明原因。", "系统据此再开一轮，让 worker 补证据。", "文件里其实缺什么、测试是否真通过，没被呈现就看不到。", ["GM-09", "GM-10", "GM-14"]),
        },
        {
          codex: lane("continue", "保持 active，再起一轮", "线程空闲且 goal 仍 active 时，运行时会注入隐藏 continuation。", "下一轮沿原 objective 继续；若 worker 已误报 complete，则不会再续。", "“是否完成”的质量仍取决于 worker 的验证。", ["GM-05", "GM-08"]),
          claude: lane("continue", "unmet 就把理由送回下一轮", "evaluator 的 unmet reason 会成为下一轮继续工作的依据。", "met 会成功结束；impossible 会失败结束；这里证据仍缺，所以继续。", "外审比自审多一道门，但裁判的视野更窄。", ["GM-09", "GM-10"]),
        },
      ],
    },
    {
      id: "same-blocker",
      label: "同一阻塞，第三次出现",
      title: "同一个外部阻塞，已经连续撞了第三轮",
      summary: "Codex 把 blocked 留作可恢复状态，并要求同一阻塞连续三轮；Claude Code 没有同构状态，但 evaluator 可以判 impossible，清掉 goal 并记一次失败。",
      stages: [
        {
          codex: lane("active", "目标仍 active，阻塞不是完成", "目标状态和聊天内容分开保存，前两次受阻不会抹掉 objective。", "运行时仍会尝试让任务推进。", "只有真正无法继续时才该转 blocked。", ["GM-02", "GM-07"]),
          claude: lane("active", "condition 仍未达成", "Stop hook 关心成功条件，也允许 evaluator 判断目标已经不可能完成。", "前两轮若仍有合理路径，可以继续判 unmet。", "Claude 没有和 Codex 同构的三轮 blocked 门槛。", ["GM-09", "GM-10"]),
        },
        {
          codex: lane("counting", "第三次遇到同一堵点", "goal 提示要求辨认“同一阻塞条件”连续出现的次数。", "这轮终于满足 blocked 审计的次数前提。", "困难、慢或想问人，不自动等于 blocked。", ["GM-07", "GM-08"]),
          claude: lane("evaluate", "evaluator 再看阻塞是否可解", "evaluator 会检查 condition，也能看到对话里前几轮的尝试与阻塞说明。", "如果只是暂时没做完，它仍判 unmet；若确实无路可走，可判 impossible。", "三次本身不是内建状态转移规则。", ["GM-09", "GM-10"]),
        },
        {
          codex: lane("blocked", "worker 可以把目标标成 blocked", "受约束的 update_goal 允许 complete 或 blocked；blocked 要通过三轮同因审计。", "状态从 active 变为 blocked，自动 continuation 停下。", "是否真是同一个堵点，仍由模型根据工作现场判断。", ["GM-04", "GM-07", "GM-08"]),
          claude: lane("failed", "裁判可以判 impossible", "当对话足以说明目标已无法完成，evaluator 可返回 impossible。", "系统卸下 Stop hook、清掉 activeGoal，并写一条 failed goal_status。", "这不是“完成”，也不是一条还留在那里的 blocked goal。", ["GM-10", "GM-14"]),
        },
        {
          codex: lane("stopped", "停在 blocked，等外部变化", "blocked goal 不会在 idle 时自行续跑；用户之后可以恢复。", "阻塞被保留下来，线程不会空转烧预算。", "resume 后，三轮 blocked 审计会重新开始。", ["GM-05", "GM-07", "GM-08"]),
          claude: lane("failed", "失败终止，不会自动恢复", "impossible 和 achieved 一样都会让 activeGoal 消失，但 transcript 记录的是 failed。", "之后 resume 不会重挂这枚 hook；要重试，需要用户重新设 goal。", "Codex blocked 保留待恢复状态，Claude impossible 结束这一轮 goal，语义不同。", ["GM-10", "GM-12", "GM-14"]),
        },
      ],
    },
    {
      id: "budget-edge",
      label: "预算、target 与 maxTurns",
      title: "看起来都在限制循环，其实三个开关方向不同",
      summary: "Codex token budget 是 goal 自己的消耗上限；Claude token target 是独立的最低消耗目标；maxTurns 又是非交互 --print 的通用轮数上限。名字挨得近，所有权并不在一起。",
      stages: [
        {
          codex: lane("budgeted", "创建目标时显式带了 token budget", "只有用户明确要求，goal 才记录 token budget。", "运行时从目标开始累计非缓存输入和输出 token。", "预算不是完成标准，碰线也不能假装任务已完成。", ["GM-04", "GM-06"]),
          claude: lane("condition-bound", "activeGoal 自己没有预算字段", "它保存 token 统计基线，但没有 token budget 或 maxTurns。", "交互式 /goal 要限制轮数，仍把边界写进 condition。", "状态页显示 token spend，不等于 goal 拿它做硬刹车。", ["GM-09", "GM-11"]),
        },
        {
          codex: lane("accounting", "本轮结束，运行时结算用量", "goal runtime 会串行更新 tokens_used 与 time_used。", "并发进度不会各算各的，预算判断有统一账本。", "计数口径是实现定义的 token 用量，不等于费用账单。", ["GM-02", "GM-06"]),
          claude: lane("independent", "另外两个通用开关各走各的", "token target 要求至少消耗到目标附近，防的是早停；--max-turns 只管非交互 --print 的总轮数。", "它们可能影响同一次运行，但不会写进 activeGoal。", "token target 是 feature-gated 能力，不能当作所有用户都有的 /goal 配置。", ["GM-11"]),
        },
        {
          codex: lane("budget-limited", "运行时先判 budget_limited", "累计 token 到线后，状态转为 budget_limited，并向当前轮注入收尾提示。", "系统要求停止实质工作、交代进度，且不许仅因预算到线调用 complete。", "硬停能控制消耗，但不会替用户完成剩余验收。", ["GM-06", "GM-07"]),
          claude: lane("semantic", "goal 只判断 condition 到没到", "evaluator 依据 condition 和对话决定 met、unmet 或 impossible。", "写进 condition 的轮数边界可以被语义判断；通用 maxTurns 则可能从外层结束非交互调用。", "两条路都不会生成与 Codex budget_limited 同构的持久状态。", ["GM-10", "GM-11", "GM-14"]),
        },
        {
          codex: lane("stopped", "收尾后停在 budget_limited", "运行时不会再自动续跑 substantive work。", "用户能看到目标没完成、用量到哪、还剩什么。", "之后如何继续由用户决定，不能由模型私自扩大预算。", ["GM-06", "GM-07"]),
          claude: lane("condition-led", "goal 与外层限制分别收场", "unmet 会续 goal；met 或 impossible 会清 goal；外层 maxTurns 到线则结束那次非交互运行。", "用户看到的“停了”可能来自不同开关，排障时先认清是谁停的。", "不能把 token target、maxTurns 和 /goal condition 合称一套 goal budget。", ["GM-10", "GM-11", "GM-14"]),
        },
      ],
    },
    {
      id: "background-running",
      label: "后台 agent 还没回来",
      title: "主线程已经想停，后台工作却还没交结果",
      summary: "两边都不会把“主线程暂时没话说”直接当成目标结束。Codex 的 continuation 要等 thread idle；Claude 则临时摘下 goal hook，明确跳过这次 evaluator。",
      stages: [
        {
          codex: lane("active", "goal 仍在，后台工作也仍在", "thread goal 保持 active；后台工具或子任务还占着执行面。", "目标不会因为主 worker 先安静下来就自动 complete。", "goal runtime 不替后台任务保证成功。", ["GM-02", "GM-05"]),
          claude: lane("active", "Stop hook 已挂，后台任务未收束", "activeGoal 和 session hook 都还在，task registry 能看见后台工作。", "这一轮来到出口时，系统有条件识别“结果还在路上”。", "检测到的是运行状态，不是任务质量。", ["GM-09", "GM-15"]),
        },
        {
          codex: lane("waiting", "还没真正 idle，就不抢开下一轮", "continuation 走 try_start_turn_if_idle；执行面仍忙时不会硬塞新 turn。", "先让正在跑的工作完成或回传，再决定下一步。", "idle gate 只能避免重叠调度，不能验收后台结果。", ["GM-05"]),
          claude: lane("deferred", "临时摘掉 goal hook", "Stop handler 发现后台工作后，先移除匹配的 goal prompt hook。", "这次停止边界不会叫 evaluator，避免缺结果时误判。", "其他 Stop 处理仍可能运行；这里只讨论 goal hook。", ["GM-15"]),
        },
        {
          codex: lane("waiting", "保持 active，等待执行面空闲", "目标状态和累计账本都没有因为等待而被改成 complete。", "后台回传后，runtime 再从当前状态判断能否续开。", "等待多久仍受会话、进程和外部服务约束。", ["GM-02", "GM-05"]),
          claude: lane("armed", "本轮不下 goal 判决，hook 再挂回去", "finally 路径会把刚才临时移除的 goal hook 恢复。", "activeGoal 没清、iterations 也不会因为这次暂缓凭空加一。", "暂缓不是 achieved、unmet 或 impossible 中的任何一种。", ["GM-15"]),
        },
        {
          codex: lane("continue", "后台结束并 idle 后再续", "只要 goal 仍 active，新的 idle 边界仍可触发 continuation。", "下一轮可以把后台结果纳入工作区审计。", "若进程已退出，runtime 不会在离线状态替你续跑。", ["GM-05", "GM-08"]),
          claude: lane("evaluate", "等结果进入对话后再评估", "后台工作回传、下一次真正停止时，恢复后的 Stop hook 才叫 evaluator。", "裁判这时至少有机会看到新证据，再判 met、unmet 或 impossible。", "后台结果若没被 surfaced，transcript-only 盲点仍在。", ["GM-10", "GM-15"]),
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
          claude: lane("continue", "恢复后的 Stop hook 接管下一次停止", "worker 继续工作；一轮结束，evaluator 再判 condition。", "unmet 就继续；met 或 impossible 会清 goal。", "统计重置不等于 condition 重置，也不等于拥有独立工作区验证能力。", ["GM-09", "GM-10", "GM-12"]),
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
