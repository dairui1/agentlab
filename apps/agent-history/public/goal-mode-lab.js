(function () {
  "use strict";

  const core = window.GoalModeLabCore;
  const lab = document.querySelector("[data-goal-mode-lab]");
  if (!core || !lab) return;

  const caseSelect = lab.querySelector("[data-goal-case-select]");
  const summary = lab.querySelector("[data-goal-case-summary]");
  const tabs = lab.querySelector("[data-goal-stage-tabs]");
  const lanes = lab.querySelector("[data-goal-lanes]");
  const loading = lab.querySelector("[data-goal-loading]");
  const state = { study: null, scenarioId: core.scenarios[0].id, step: 0 };
  const statusLabels = {
    active: "目标生效",
    audit: "自行审计",
    evaluate: "外部评估",
    uncertain: "仍有误判面",
    unmet: "条件未满足",
    continue: "继续一轮",
    counting: "累计阻塞",
    blocked: "标记阻塞",
    failed: "失败结束",
    stopped: "停止续跑",
    budgeted: "预算已设",
    "condition-bound": "Goal 无预算字段",
    accounting: "运行时计数",
    "budget-limited": "预算到线",
    independent: "通用开关并列",
    semantic: "语义判断",
    "condition-led": "条件驱动",
    waiting: "等待空闲",
    deferred: "暂缓评估",
    armed: "Hook 已恢复",
    persisted: "持久保存",
    session: "会话范围",
    interrupted: "任务中断",
    restored: "状态恢复",
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function required(node, label) {
    if (!node) throw new Error(`页面里缺少${label}`);
    return node;
  }

  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set("goalCase", state.scenarioId);
    url.searchParams.set("goalStep", String(state.step));
    history.replaceState(history.state, "", url);
  }

  function setStep(index, focus = false) {
    state.step = core.clampStep(index);
    render();
    updateUrl();
    if (focus) {
      requestAnimationFrame(() => document.getElementById(`goalModeStage${state.step}`)?.focus());
    }
  }

  function stageKeydown(event, index) {
    const last = core.stages.length - 1;
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setStep(next, true);
  }

  function renderTabs() {
    tabs.replaceChildren();
    core.stages.forEach((stage, index) => {
      const button = el("button", "goal-mode-stage-tab");
      button.type = "button";
      button.id = `goalModeStage${index}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === state.step));
      button.setAttribute("aria-controls", "goalModeLanes");
      button.tabIndex = index === state.step ? 0 : -1;
      button.append(
        el("span", "goal-mode-stage-number", String(index + 1).padStart(2, "0")),
        el("strong", "", stage.label),
      );
      button.addEventListener("click", () => setStep(index, true));
      button.addEventListener("keydown", (event) => stageKeydown(event, index));
      tabs.append(button);
    });
  }

  function evidenceButton(ids) {
    const button = el("button", "goal-mode-evidence", `查看依据 · ${ids.join(" · ")}`);
    button.type = "button";
    button.dataset.evidence = ids.join(" ");
    button.setAttribute("data-evidence-trigger", "");
    button.setAttribute("aria-controls", "articleEvidence");
    return button;
  }

  function fact(label, text) {
    const row = el("div", "goal-mode-lane-fact");
    row.append(el("dt", "", label), el("dd", "", text));
    return row;
  }

  function renderLane(product, data) {
    const laneNode = el("section", `goal-mode-lane goal-mode-lane--${product.toLowerCase().replaceAll(" ", "-")}`);
    laneNode.setAttribute("aria-label", `${product} 在当前阶段的处理`);

    const heading = el("header", "goal-mode-lane-heading");
    const productLabel = el("div", "goal-mode-product");
    productLabel.append(el("span", "goal-mode-product-mark"), el("strong", "", product));
    const status = el("span", "goal-mode-status", statusLabels[data.status] || data.status);
    status.dataset.status = data.status;
    heading.append(productLabel, status);

    const facts = el("dl", "goal-mode-lane-facts");
    facts.append(
      fact("现在发生什么", data.known),
      fact("它会带来什么", data.consequence),
      fact("别把结论说过头", data.boundary),
    );

    laneNode.append(heading, el("h4", "", data.title), facts, evidenceButton(data.evidence));
    return laneNode;
  }

  function render() {
    const scenario = core.resolveScenario(state.study, state.scenarioId);
    const stage = scenario.stages[state.step];
    summary.textContent = `${scenario.title}。${scenario.summary}`;
    renderTabs();
    lanes.setAttribute("aria-labelledby", `goalModeStage${state.step}`);
    lanes.replaceChildren(renderLane("Codex", stage.codex), renderLane("Claude Code", stage.claude));
  }

  function showError(message) {
    loading.hidden = false;
    loading.textContent = `这块没加载出来：${message}。刷新页面后再试。`;
    loading.dataset.state = "error";
    lab.dataset.state = "error";
    lab.setAttribute("aria-busy", "false");
  }

  function init(study) {
    if (study?.id !== "goal-mode") throw new Error("拿到的不是 Goal Mode 研究资料");
    required(caseSelect, "场景选择器");
    required(summary, "场景说明");
    required(tabs, "阶段切换");
    required(lanes, "双轨对比区");
    required(loading, "加载状态");

    state.study = study;
    const selection = core.resolveSelection(location.href, state.scenarioId, state.step);
    state.scenarioId = selection.scenarioId;
    state.step = selection.step;

    caseSelect.replaceChildren();
    core.scenarios.forEach((scenario) => {
      const option = el("option", "", scenario.label);
      option.value = scenario.id;
      caseSelect.append(option);
    });
    caseSelect.value = state.scenarioId;
    caseSelect.addEventListener("change", () => {
      state.scenarioId = caseSelect.value;
      state.step = 0;
      render();
      updateUrl();
    });

    loading.hidden = true;
    lab.dataset.state = "ready";
    lab.setAttribute("aria-busy", "false");
    render();
    updateUrl();
  }

  document.addEventListener("agentlab:study-loaded", (event) => {
    try {
      init(event.detail?.study);
    } catch (error) {
      showError(error.message);
    }
  }, { once: true });

  document.addEventListener("agentlab:study-error", (event) => {
    showError(event.detail?.message || "研究资料暂时拿不到");
  }, { once: true });
})();
