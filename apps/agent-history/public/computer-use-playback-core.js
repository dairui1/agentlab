(function attachComputerUsePlaybackCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComputerUsePlaybackCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createComputerUsePlaybackCore() {
  "use strict";

  const DEFAULT_SCENARIO_ID = "normal-loop";
  const neutralTasks = [
    { id: "task-1", label: "核对发布清单", done: false },
    { id: "task-2", label: "整理访谈笔记", done: false },
    { id: "task-3", label: "更新测试基线", done: true },
  ];

  function desktop(overrides) {
    return {
      app: "Deskboard",
      windowTitle: "Today",
      revision: "r1",
      view: "list",
      tasks: neutralTasks,
      draft: "",
      focus: null,
      notice: null,
      ...overrides,
    };
  }

  function tool(name, state, args, result, actor = "agent") {
    return { name, state, args, result, actor };
  }

  function cursor(visible, x = 0, y = 0, label = "", state = "idle") {
    return { visible, x, y, label, state };
  }

  function ax(mode, generation, nodes, note) {
    return { mode, generation, nodes, note };
  }

  const rawScenarios = [
    {
      id: "normal-loop",
      label: "正常完成一项任务",
      title: "观察、动作、读回：新增一条任务",
      summary: "用一个中性的任务 App 复原 Computer Use 合同里的正常闭环。画面与返回值是教学状态，不是运行录屏。",
      frames: [
        {
          id: "normal-route",
          phase: "route",
          title: "先判断是否真的需要控制界面",
          caption: "场景假定没有更窄的 connector、API 或 CLI，Agent 才把“新增一条任务”交给 Computer Use。",
          premise: "这是证据支持的合同复原；Deskboard、任务文字和画面均为中性教学场景。",
          desktop: desktop({ focus: "task-list" }),
          tool: tool("route", "decision", "检查可用的专用能力", "选择 Computer Use 作为 UI fallback", "model"),
          cursor: cursor(false),
          ax: ax("hidden", "none", [], "还没有读取窗口状态。"),
          evidence: ["CU-04", "CU-05"],
        },
        {
          id: "normal-authorize",
          phase: "authorize",
          title: "定向读取之前，wrapper 先问 App Policy",
          caption: "即使下一步只是 get_app_state，定向访问也先经本地 transport 查询目标 App 是否允许。",
          premise: "本场景把 App Policy 与 macOS 屏幕、Accessibility 权限都设为已放行；这不是所有会话的默认事实。",
          desktop: desktop({ focus: "window" }),
          tool: tool("getAppPolicy", "response", "{ app: 'Deskboard' }", "allowed", "trusted wrapper"),
          cursor: cursor(false),
          ax: ax("hidden", "none", [], "策略结论不包含窗口内容。"),
          evidence: ["CU-11", "CU-12", "CU-13"],
        },
        {
          id: "normal-observe-list",
          phase: "observe",
          title: "Agent 先读截图与 AX，再决定点哪里",
          caption: "get_app_state 返回同一窗口的一份 AppState。AX 给出 Add 的最新 element index，截图保留视觉位置。",
          premise: "返回内容按已公开的 AppState 合同复原，不代表 Deskboard 的真实 AX 树。",
          desktop: desktop({ focus: "add-button" }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard' }", "AppState · screenshot + accessibility text"),
          cursor: cursor(false),
          ax: ax("full", "state-01", [
            { index: 11, role: "AXList", label: "Today", target: false },
            { index: 17, role: "AXButton", label: "新建任务", target: true },
          ], "element 17 只属于 state-01。"),
          evidence: ["CU-14", "CU-15"],
        },
        {
          id: "normal-plan-add",
          phase: "decide",
          title: "从最新状态里选一个局部动作",
          caption: "Agent 使用刚拿到的 element 17，而不是从旧画面抄坐标。此帧只形成动作参数，还没有副作用。",
          premise: "模型如何推理不是静态发行包能完整还原的；这里只呈现合同要求它依据最新状态决策。",
          desktop: desktop({ focus: "add-button" }),
          tool: tool("click", "planned", "{ app: 'Deskboard', element_index: 17 }", "尚未发送", "model"),
          cursor: cursor(true, 83, 27, "element 17", "target"),
          ax: ax("full", "state-01", [
            { index: 17, role: "AXButton", label: "新建任务", target: true },
          ], "动作参数引用当前 AppState。"),
          evidence: ["CU-05", "CU-10", "CU-15"],
        },
        {
          id: "normal-act-add",
          phase: "act",
          title: "typed action 经本地 transport 只动一步",
          caption: "click 被整理成 typed request，送往 CUAService。教学画面随后切到编辑态，但调用成功仍不等于整项任务完成。",
          premise: "画面变化是本场景给定的结果，不是对所有 App 行为的推断。",
          desktop: desktop({ view: "editor", revision: "r2", focus: "task-input", notice: "新建任务" }),
          tool: tool("click", "response", "{ app: 'Deskboard', element_index: 17 }", "action result returned"),
          cursor: cursor(true, 83, 27, "click", "pressed"),
          ax: ax("stale", "state-01", [
            { index: 17, role: "AXButton", label: "新建任务", target: false },
          ], "界面已经变化，state-01 的 index 不再拿来继续操作。"),
          evidence: ["CU-10", "CU-12", "CU-13"],
        },
        {
          id: "normal-verify-editor",
          phase: "verify",
          title: "动作后立刻重新观察编辑态",
          caption: "新的 AppState 确认输入框真的出现，并给它一个新 index。闭环靠 readback，而不是靠上一帧的 action result。",
          premise: "本帧把编辑态出现设为场景事实；真实会话必须读取自己的结果。",
          desktop: desktop({ view: "editor", revision: "r2", focus: "task-input", notice: "新建任务" }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard' }", "AppState state-02"),
          cursor: cursor(false),
          ax: ax("diff", "state-02", [
            { index: 24, role: "AXTextField", label: "任务名称", target: true },
            { index: 29, role: "AXButton", label: "保存", target: false },
          ], "state-02 替换上一帧的定位依据。"),
          evidence: ["CU-05", "CU-14", "CU-15"],
        },
        {
          id: "normal-act-type",
          phase: "act",
          title: "只把文本写进最新输入框",
          caption: "set_value 指向 state-02 的 element 24。设值与保存被拆成两个动作，Agent 会先读回文字，再决定是否提交。",
          premise: "“整理发布清单”只是中性示例文本，不来自真实用户或真实会话。",
          desktop: desktop({ view: "editor", revision: "r3", draft: "整理发布清单", focus: "task-input" }),
          tool: tool("set_value", "response", "{ app: 'Deskboard', element_index: 24, value: '整理发布清单' }", "action result returned"),
          cursor: cursor(true, 54, 37, "element 24", "typing"),
          ax: ax("stale", "state-02", [
            { index: 24, role: "AXTextField", label: "任务名称", value: "", target: true },
          ], "输入产生了界面变化，下一步先读回。"),
          evidence: ["CU-05", "CU-10", "CU-12", "CU-13", "CU-15"],
        },
        {
          id: "normal-verify-draft",
          phase: "verify",
          title: "读回文本与新的保存按钮 index",
          caption: "Agent 确认文本已经出现，再使用 state-03 里的保存按钮。它没有把 set_value 的返回值当成业务完成。",
          premise: "本场景假定 readback 看见完整文本；若真实 readback 不一致，Agent 应停下重新规划。",
          desktop: desktop({ view: "editor", revision: "r3", draft: "整理发布清单", focus: "save-button" }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard' }", "AppState state-03"),
          cursor: cursor(false),
          ax: ax("diff", "state-03", [
            { index: 41, role: "AXTextField", label: "任务名称", value: "整理发布清单", target: false },
            { index: 46, role: "AXButton", label: "保存", target: true },
          ], "保存按钮的 index 取自最新 state-03。"),
          evidence: ["CU-05", "CU-14", "CU-15"],
        },
        {
          id: "normal-act-save",
          phase: "act",
          title: "Agent 点击最新状态里的保存按钮",
          caption: "第二个有副作用的动作仍然只引用新状态。收到 action result 后，流程还没有宣布完成。",
          premise: "保存按钮的具体视觉和行为属于教学场景，不是 CUAService 对任意 App 的保证。",
          desktop: desktop({ view: "editor", revision: "r4", draft: "整理发布清单", focus: "save-button", notice: "正在保存" }),
          tool: tool("click", "response", "{ app: 'Deskboard', element_index: 46 }", "action result returned"),
          cursor: cursor(true, 88, 54, "element 46", "pressed"),
          ax: ax("stale", "state-03", [
            { index: 46, role: "AXButton", label: "保存", target: true },
          ], "是否保存成功仍要看下一份状态。"),
          evidence: ["CU-10", "CU-12", "CU-13"],
        },
        {
          id: "normal-verify-complete",
          phase: "verify",
          title: "最终 readback 看见新任务，才收束",
          caption: "新截图与 AX 都出现“整理发布清单”。Agent 此时才能报告完成；若看不见，就不能拿 action result 补结论。",
          premise: "这是正常分支的场景结果，不是一次真实操作记录。",
          desktop: desktop({
            revision: "r4",
            tasks: [...neutralTasks, { id: "task-4", label: "整理发布清单", done: false, fresh: true }],
            focus: "task-4",
            notice: "已保存",
          }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard' }", "AppState state-04 · task visible"),
          cursor: cursor(false),
          ax: ax("diff", "state-04", [
            { index: 52, role: "AXStaticText", label: "整理发布清单", target: true },
          ], "可见结果支持“任务已新增”。"),
          evidence: ["CU-05", "CU-14", "CU-15"],
        },
      ],
    },
    {
      id: "stale-element",
      label: "页面刷新，旧 index 过期",
      title: "不拿上一帧的 element 42 硬点",
      summary: "页面刷新是这条教学分支的明确前提。静态证据不知道旧 index 在服务端会怎样失败，所以 Agent 先用 disableDiff 完整重读。",
      frames: [
        {
          id: "stale-premise",
          phase: "premise",
          title: "场景前提：页面已刷新，手里只有旧状态",
          caption: "缓存的 state-old 把“新建任务”标成 element 42；教学画面现在已经是 r2。两者不再属于同一帧。",
          premise: "页面刷新由场景给定，不是静态证据声称每次操作前都会发生。",
          desktop: desktop({ revision: "r2", focus: "add-button", notice: "页面已刷新" }),
          tool: tool("get_app_state", "cached", "state-old", "旧 AppState，不是当前 readback", "agent memory"),
          cursor: cursor(true, 83, 27, "old element 42", "warning"),
          ax: ax("stale", "state-old", [
            { index: 42, role: "AXButton", label: "新建任务", target: true },
          ], "旧 index 与当前页面 revision 不匹配。"),
          evidence: ["CU-05", "CU-15", "CU-KU-03"],
        },
        {
          id: "stale-stop",
          phase: "decide",
          title: "先停住：旧 index 的真实失败方式未知",
          caption: "合同要求使用最新 index，但没有证据保证服务一定拒绝 element 42。Agent 因此不把“可能 fail closed”当护栏。",
          premise: "这里没有发送 click；也不会虚构旧 index 已被服务拒绝。",
          desktop: desktop({ revision: "r2", focus: "add-button", notice: "等待新状态" }),
          tool: tool("click", "cancelled", "{ element_index: 42 }", "未发送：定位依据过期", "model"),
          cursor: cursor(false),
          ax: ax("stale", "state-old", [
            { index: 42, role: "AXButton", label: "新建任务", target: false },
          ], "服务端如何处理旧 index 仍属未知。"),
          evidence: ["CU-05", "CU-15", "CU-KU-03"],
        },
        {
          id: "stale-request-full",
          phase: "observe",
          title: "上下文断了，就请求完整 AX 树",
          caption: "Agent 调用 get_app_state，并显式设置 disableDiff=true，避免拿一段没有基线的 diff 继续猜。",
          premise: "该参数来自固定构建里的观察合同。",
          desktop: desktop({ revision: "r2", focus: "window", notice: "正在读取完整状态" }),
          tool: tool("get_app_state", "request", "{ app: 'Deskboard', disableDiff: true }", "等待完整 AppState"),
          cursor: cursor(false),
          ax: ax("loading", "pending", [], "旧树不参与这次定位。"),
          evidence: ["CU-05", "CU-14", "CU-15"],
        },
        {
          id: "stale-fresh-state",
          phase: "observe",
          title: "完整 readback 给出新的 element 57",
          caption: "state-new 重新把视觉位置和 AX 语义对齐。Agent 只认这一次返回的 index。",
          premise: "element 57 是教学场景数据，不代表真实 App 的固定编号。",
          desktop: desktop({ revision: "r2", focus: "add-button" }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard', disableDiff: true }", "AppState state-new · full tree"),
          cursor: cursor(false),
          ax: ax("full", "state-new", [
            { index: 51, role: "AXList", label: "Today", target: false },
            { index: 57, role: "AXButton", label: "新建任务", target: true },
          ], "新动作只引用 state-new。"),
          evidence: ["CU-14", "CU-15"],
        },
        {
          id: "stale-act-fresh",
          phase: "act",
          title: "用新 index 做一个单步动作",
          caption: "click 引用 element 57。旧的 42 没有被重试，也没有被偷偷改成坐标。",
          premise: "本场景假定点击后出现编辑态；调用回执本身仍不代表最终完成。",
          desktop: desktop({ revision: "r3", view: "editor", focus: "task-input", notice: "新建任务" }),
          tool: tool("click", "response", "{ app: 'Deskboard', element_index: 57 }", "action result returned"),
          cursor: cursor(true, 83, 27, "element 57", "pressed"),
          ax: ax("stale", "state-new", [
            { index: 57, role: "AXButton", label: "新建任务", target: true },
          ], "界面变化后，新树也不再作为下一动作依据。"),
          evidence: ["CU-10", "CU-12", "CU-13", "CU-15"],
        },
        {
          id: "stale-verify",
          phase: "verify",
          title: "再读一次，确认 fresh index 点中了预期目标",
          caption: "新 AppState 看见编辑框，才说明恢复路径有效。若仍不是预期界面，就继续观察而不是复用 57。",
          premise: "这是场景分支的可见结果，不是对陈旧 index 行为的补证。",
          desktop: desktop({ revision: "r3", view: "editor", focus: "task-input" }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard' }", "AppState · editor visible"),
          cursor: cursor(false),
          ax: ax("diff", "state-after-click", [
            { index: 63, role: "AXTextField", label: "任务名称", target: true },
          ], "恢复完成，但 index 仍只对这一帧有效。"),
          evidence: ["CU-05", "CU-14", "CU-15", "CU-KU-03"],
        },
      ],
    },
    {
      id: "transport-timeout",
      label: "动作超时，副作用未知",
      title: "timeout 后先看结果，不重放动作",
      summary: "transport timeout 不能证明动作没发生。分支先保留未知，再立即 get_app_state；教学结果假定 readback 已看见新增任务，因此不重放。",
      frames: [
        {
          id: "timeout-observe",
          phase: "observe",
          title: "保存前有一份最新编辑状态",
          caption: "Agent 已从 state-20 读回完整任务文字，并看见保存按钮的 element 31。",
          premise: "Deskboard、草稿文字与 element 31 是合同复原中的中性状态，不是真实 trace。",
          desktop: desktop({ view: "editor", revision: "r3", draft: "整理发布清单", focus: "save-button" }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard' }", "AppState state-20"),
          cursor: cursor(false),
          ax: ax("full", "state-20", [
            { index: 27, role: "AXTextField", label: "任务名称", value: "整理发布清单", target: false },
            { index: 31, role: "AXButton", label: "保存", target: true },
          ], "保存动作将引用最新 state-20。"),
          evidence: ["CU-14", "CU-15"],
        },
        {
          id: "timeout-plan",
          phase: "decide",
          title: "计划一次保存 click，不预排第二次",
          caption: "Agent 只生成一个保存动作。是否继续，要等这一步之后的可见状态。",
          premise: "模型的完整推理不可见；本帧只复原合同要求的局部动作。",
          desktop: desktop({ view: "editor", revision: "r3", draft: "整理发布清单", focus: "save-button" }),
          tool: tool("click", "planned", "{ app: 'Deskboard', element_index: 31 }", "尚未发送", "model"),
          cursor: cursor(true, 88, 54, "element 31", "target"),
          ax: ax("full", "state-20", [
            { index: 31, role: "AXButton", label: "保存", target: true },
          ], "没有第二次 click 排队。"),
          evidence: ["CU-05", "CU-10", "CU-15"],
        },
        {
          id: "timeout-send",
          phase: "act",
          title: "保存请求已经交给 transport",
          caption: "typed request 带着 deadline 发往本地服务。此刻只能确认保存请求进入调用链，不能确认任务是否落盘。",
          premise: "这不是服务端执行 trace；静态实现只支持描述客户端请求与 transport。",
          desktop: desktop({ view: "editor", revision: "r3", draft: "整理发布清单", focus: "save-button", notice: "请求处理中" }),
          tool: tool("click", "request", "{ app: 'Deskboard', element_index: 31 }", "pending"),
          cursor: cursor(true, 88, 54, "click", "pressed"),
          ax: ax("stale", "state-20", [
            { index: 31, role: "AXButton", label: "保存", target: true },
          ], "请求发出后，旧状态不能回答副作用。"),
          evidence: ["CU-10", "CU-12", "CU-13"],
        },
        {
          id: "timeout-unknown",
          phase: "unknown",
          title: "deadline 到了：动作可能没做，也可能已做",
          caption: "client 收到 timeout，但没有 durable action receipt 或 exactly-once 证明。画面保持未判定，不替缺失回执补成功或失败。",
          premise: "副作用未知是这里唯一有证据的结论。",
          desktop: desktop({ view: "editor", revision: "r3", draft: "整理发布清单", focus: null, notice: "结果未知" }),
          tool: tool("click", "timeout", "{ app: 'Deskboard', element_index: 31 }", "timeout · side effect unknown"),
          cursor: cursor(false),
          ax: ax("unknown", "none", [], "动作后还没有新的 AppState。"),
          evidence: ["CU-13", "CU-KU-04"],
        },
        {
          id: "timeout-readback",
          phase: "verify",
          title: "下一帧必须 get_app_state，而不是再点一次",
          caption: "恢复连接后，第一件事是读取同一个 App。重放 click 会把未知副作用变成可能的重复副作用。",
          premise: "本帧只发观察请求；没有重放 element 31。",
          desktop: desktop({ view: "editor", revision: "r3", draft: "整理发布清单", focus: "window", notice: "正在读取当前状态" }),
          tool: tool("get_app_state", "request", "{ app: 'Deskboard', disableDiff: true }", "waiting for readback"),
          cursor: cursor(false),
          ax: ax("loading", "pending", [], "先拿到可见结果，再决定是否需要动作。"),
          evidence: ["CU-05", "CU-14", "CU-15", "CU-KU-04"],
        },
        {
          id: "timeout-no-replay",
          phase: "verify",
          title: "场景分支：readback 已看见结果，所以不重放",
          caption: "这条教学分支假定新任务已经出现在列表。Agent 据此收束；它没有把 timeout 改写成成功，而是让新的界面事实给出答案。",
          premise: "“结果已出现”是场景给定的 readback，不是静态代码对 timeout 结果的保证。",
          desktop: desktop({
            revision: "r4",
            tasks: [...neutralTasks, { id: "task-4", label: "整理发布清单", done: false, fresh: true }],
            focus: "task-4",
            notice: "读回后已可见",
          }),
          tool: tool("get_app_state", "response", "{ app: 'Deskboard', disableDiff: true }", "AppState · requested result visible"),
          cursor: cursor(false),
          ax: ax("full", "state-21", [
            { index: 38, role: "AXStaticText", label: "整理发布清单", target: true },
          ], "readback 支持停止重试；它不提供通用 exactly-once 保证。"),
          evidence: ["CU-05", "CU-14", "CU-15", "CU-KU-04"],
        },
      ],
    },
  ];

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const scenarios = deepFreeze(rawScenarios);
  const scenarioIds = Object.freeze(scenarios.map((scenario) => scenario.id));

  function getScenario(id) {
    return scenarios.find((scenario) => scenario.id === id) || scenarios[0];
  }

  function scenarioAndFrame(scenarioOrFrame, frame) {
    if (frame === undefined) return { scenario: getScenario(DEFAULT_SCENARIO_ID), value: scenarioOrFrame };
    if (scenarioOrFrame && typeof scenarioOrFrame === "object" && Array.isArray(scenarioOrFrame.frames)) {
      return { scenario: scenarioOrFrame, value: frame };
    }
    return { scenario: getScenario(scenarioOrFrame), value: frame };
  }

  function clampFrame(scenarioOrFrame, frame) {
    const resolved = scenarioAndFrame(scenarioOrFrame, frame);
    const numeric = Number(resolved.value);
    const index = Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
    return Math.min(resolved.scenario.frames.length - 1, Math.max(0, index));
  }

  function nextFrame(scenarioOrFrame, frame) {
    const resolved = scenarioAndFrame(scenarioOrFrame, frame);
    return clampFrame(resolved.scenario, clampFrame(resolved.scenario, resolved.value) + 1);
  }

  function previousFrame(scenarioOrFrame, frame) {
    const resolved = scenarioAndFrame(scenarioOrFrame, frame);
    return clampFrame(resolved.scenario, clampFrame(resolved.scenario, resolved.value) - 1);
  }

  function axVisible(value) {
    return value === true || value === 1 || ["1", "true", "on", "show"].includes(String(value || "").toLowerCase());
  }

  function resolveSelection(href) {
    const url = new URL(href || "https://agentlab.local", "https://agentlab.local");
    const scenario = getScenario(url.searchParams.get("replay"));
    return {
      scenarioId: scenario.id,
      frame: clampFrame(scenario, url.searchParams.get("frame")),
      axVisible: axVisible(url.searchParams.get("ax")),
    };
  }

  function selectionHref(href, scenarioId, frame, showAx) {
    const url = new URL(href || "https://agentlab.local", "https://agentlab.local");
    const scenario = getScenario(scenarioId);
    url.searchParams.set("replay", scenario.id);
    url.searchParams.set("frame", String(clampFrame(scenario, frame)));
    url.searchParams.set("ax", axVisible(showAx) ? "1" : "0");
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return Object.freeze({
    scenarios,
    scenarioIds,
    getScenario,
    resolveSelection,
    selectionHref,
    clampFrame,
    nextFrame,
    previousFrame,
  });
});
