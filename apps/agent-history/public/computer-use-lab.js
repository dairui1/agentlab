(function () {
  "use strict";

  const core = window.ComputerUseLabCore;
  const lab = document.querySelector("[data-cua-trace-lab]");
  if (!core || !lab) return;

  const scenarioSelect = lab.querySelector("[data-cua-trace-select]");
  const context = lab.querySelector("[data-cua-trace-context]");
  const overview = lab.querySelector("[data-cua-trace-overview]");
  const rail = lab.querySelector("[data-cua-trace-rail]");
  const detail = lab.querySelector("[data-cua-trace-detail]");
  const loading = lab.querySelector("[data-cua-trace-loading]");
  const state = { study: null, scenarioId: core.scenarios[0].id, step: 0 };
  const statusMeta = {
    pass: { label: "场景先算通过", icon: "check" },
    blocked: { label: "停在这里", icon: "octagon-x" },
    unknown: { label: "还说不准", icon: "circle-help" },
    next: { label: "接着做这个", icon: "arrow-right" },
    skipped: { label: "还没走到", icon: "minus" },
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const node = el("i");
    node.dataset.lucide = name;
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function createIcons() {
    window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
  }

  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set("trace", state.scenarioId);
    url.searchParams.set("traceStep", String(state.step));
    history.replaceState(history.state, "", url);
  }

  function renderOverview(scenario) {
    context.textContent = `${scenario.title}。${scenario.summary}`;
    overview.replaceChildren();
    for (const [label, value] of [
      ["推演结论", scenario.verdict],
      ["现在能重试吗", scenario.retry],
      ["有一条不能破", scenario.invariant],
    ]) {
      const item = el("div");
      item.append(el("small", "", label), el("strong", "", value));
      overview.append(item);
    }
  }

  function selectStep(index, focus = false) {
    state.step = Math.min(core.layers.length - 1, Math.max(0, index));
    render();
    updateUrl();
    if (focus) requestAnimationFrame(() => document.getElementById(`cuaTraceStep${state.step}`)?.focus());
  }

  function renderRail(scenario) {
    rail.replaceChildren();
    scenario.layers.forEach((layer, index) => {
      const meta = statusMeta[layer.status];
      const button = el("button", "cua-trace-step");
      button.type = "button";
      button.id = `cuaTraceStep${index}`;
      button.dataset.status = layer.status;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === state.step));
      button.setAttribute("aria-controls", "cuaTraceDetail");
      button.tabIndex = index === state.step ? 0 : -1;
      const mark = el("span", "cua-trace-step-mark");
      mark.append(icon(meta.icon));
      const copy = el("span", "cua-trace-step-copy");
      copy.append(el("small", "", `${String(index + 1).padStart(2, "0")} · ${meta.label}`), el("strong", "", layer.label));
      button.append(mark, copy);
      button.addEventListener("click", () => selectStep(index, true));
      button.addEventListener("keydown", (event) => {
        const next = event.key === "ArrowDown" || event.key === "ArrowRight" ? index + 1
          : event.key === "ArrowUp" || event.key === "ArrowLeft" ? index - 1
            : event.key === "Home" ? 0
              : event.key === "End" ? scenario.layers.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        selectStep((next + scenario.layers.length) % scenario.layers.length, true);
      });
      rail.append(button);
    });
  }

  function factBlock(label, value) {
    const block = el("div");
    block.append(el("small", "", label), el("p", "", value));
    return block;
  }

  function navButton(name, label, index, disabled) {
    const button = el("button", "icon-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.disabled = disabled;
    button.append(icon(name));
    button.addEventListener("click", () => selectStep(index, true));
    return button;
  }

  function renderDetail(scenario) {
    const layer = scenario.layers[state.step];
    const meta = statusMeta[layer.status];
    detail.replaceChildren();
    detail.setAttribute("aria-labelledby", `cuaTraceStep${state.step}`);
    detail.dataset.status = layer.status;

    const heading = el("header", "cua-trace-detail-heading");
    const title = el("div");
    title.append(el("span", "", `${String(state.step + 1).padStart(2, "0")} · ${layer.label} · ${meta.label}`), el("h4", "", layer.title));
    const position = el("strong", "cua-trace-position", `${state.step + 1} / ${scenario.layers.length}`);
    heading.append(title, position);

    const description = el("p", "cua-trace-description", layer.description);
    const method = el("p", "cua-trace-interface");
    method.append(el("span", "", "这一步走的接口"), el("code", "", layer.interface));

    const facts = el("div", "cua-trace-facts");
    facts.append(factBlock("眼下能确定", layer.known), factBlock("现在还不知道", layer.unknown));

    const recovery = el("div", "cua-trace-recovery");
    const next = el("div");
    next.append(icon("corner-down-right"), el("span", "", "接下来怎么做"), el("p", "", layer.next));
    const avoid = el("div");
    avoid.append(icon("shield-alert"), el("span", "", "别走这条近路"), el("p", "", layer.avoid));
    recovery.append(next, avoid);

    const footer = el("footer", "cua-trace-footer");
    const evidence = el("button", "cua-trace-evidence", `看这层的实现依据 · ${layer.evidence.join(" · ")}`);
    evidence.type = "button";
    evidence.dataset.evidence = layer.evidence.join(" ");
    evidence.setAttribute("data-evidence-trigger", "");
    evidence.setAttribute("aria-controls", "articleEvidence");
    const nav = el("div", "cua-trace-nav");
    nav.append(
      navButton("arrow-left", "回到上一步", state.step - 1, state.step === 0),
      navButton("arrow-right", "走到下一步", state.step + 1, state.step === scenario.layers.length - 1),
    );
    footer.append(evidence, nav);
    detail.append(heading, description, method, facts, recovery, footer);
  }

  function render() {
    const scenario = core.resolveScenario(state.study, state.scenarioId);
    renderOverview(scenario);
    renderRail(scenario);
    renderDetail(scenario);
    createIcons();
  }

  function init(study) {
    if (study?.id !== "computer-use") throw new Error("拿到的不是 Computer Use 研究资料");
    state.study = study;
    const selection = core.resolveSelection(location.href);
    state.scenarioId = selection.scenarioId;
    state.step = selection.step;
    scenarioSelect.replaceChildren();
    core.scenarios.forEach((scenario) => {
      const option = el("option", "", scenario.label);
      option.value = scenario.id;
      scenarioSelect.append(option);
    });
    scenarioSelect.value = state.scenarioId;
    scenarioSelect.addEventListener("change", () => {
      state.scenarioId = scenarioSelect.value;
      state.step = core.focusIndex(state.scenarioId);
      render();
      updateUrl();
    });
    loading.hidden = true;
    lab.setAttribute("aria-busy", "false");
    render();
    updateUrl();
  }

  document.addEventListener("agentlab:study-loaded", (event) => {
    try {
      init(event.detail?.study);
    } catch (error) {
      loading.textContent = `这块没加载出来：${error.message}。刷新页面后再试。`;
      loading.dataset.state = "error";
      lab.dataset.state = "error";
      lab.setAttribute("aria-busy", "false");
    }
  }, { once: true });

  document.addEventListener("agentlab:study-error", (event) => {
    loading.textContent = `这块没加载出来：${event.detail?.message || "研究资料暂时拿不到"}。刷新页面后再试。`;
    loading.dataset.state = "error";
    lab.dataset.state = "error";
    lab.setAttribute("aria-busy", "false");
  }, { once: true });
})();
