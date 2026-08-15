(function attachComputerUsePlayback() {
  "use strict";

  const root = document.querySelector("[data-cua-playback]");
  const core = window.ComputerUsePlaybackCore;
  if (!root || !core) return;

  const refs = {
    scenarioTabs: root.querySelector("[data-cua-scenario-tabs]"),
    scenarioSelect: root.querySelector("[data-cua-scenario-select]"),
    desktop: root.querySelector("[data-cua-desktop]"),
    windowTitle: root.querySelector(".cua-window-bar > strong"),
    windowState: root.querySelector("[data-cua-window-state]"),
    newTask: root.querySelector("[data-cua-new-task]"),
    composer: root.querySelector("[data-cua-composer]"),
    composerInput: root.querySelector("[data-cua-composer-input]"),
    submitTask: root.querySelector("[data-cua-submit-task]"),
    createdTask: root.querySelector("[data-cua-created-task]"),
    createdText: root.querySelector("[data-cua-created-text]"),
    taskCount: root.querySelector("[data-cua-task-count]"),
    notice: root.querySelector("[data-cua-desktop-notice]"),
    axOverlay: root.querySelector("[data-cua-ax-overlay]"),
    cursor: root.querySelector("[data-cua-cursor]"),
    screenBadge: root.querySelector("[data-cua-screen-badge]"),
    frameTitle: root.querySelector("[data-cua-frame-title]"),
    caption: root.querySelector("[data-cua-caption]"),
    phase: root.querySelector("[data-cua-phase]"),
    stepLabel: root.querySelector("[data-cua-step-label]"),
    callStatus: root.querySelector("[data-cua-call-status]"),
    callActor: root.querySelector("[data-cua-call-actor]"),
    callName: root.querySelector("[data-cua-call-name]"),
    callArgs: root.querySelector("[data-cua-call-args]"),
    callResult: root.querySelector("[data-cua-call-result]"),
    decision: root.querySelector("[data-cua-decision]"),
    evidenceLinks: root.querySelector("[data-cua-evidence-links]"),
    timeline: root.querySelector("[data-cua-timeline]"),
    restart: root.querySelector("[data-cua-restart]"),
    previous: root.querySelector("[data-cua-previous]"),
    play: root.querySelector("[data-cua-play]"),
    next: root.querySelector("[data-cua-next]"),
    scrubber: root.querySelector("[data-cua-scrubber]"),
    progress: root.querySelector("[data-cua-progress]"),
    premise: root.querySelector("[data-cua-premise]"),
  };

  const phaseLabels = {
    route: "选择入口",
    authorize: "策略判定",
    observe: "观察界面",
    decide: "决定下一步",
    act: "执行动作",
    verify: "回读验证",
    premise: "场景前提",
    unknown: "结果未知",
  };
  const markerLayouts = {
    AXList: { x: 6, y: 26, w: 17, h: 45 },
    AXTextField: { x: 25, y: 40, w: 67, h: 9 },
    AXStaticText: { x: 30, y: 66, w: 42, h: 8 },
    "新建任务": { x: 78, y: 20, w: 15, h: 8 },
    "保存": { x: 84, y: 49, w: 8, h: 8 },
  };
  const actorLabels = {
    agent: "Agent 当前调用",
    model: "模型正在决策",
    "trusted wrapper": "可信 wrapper 内部调用",
    "agent memory": "Agent 已有状态",
  };
  const state = {
    mounted: false,
    scenarioId: core.scenarioIds[0],
    frame: 0,
    view: "screen",
    playing: false,
    timer: null,
    visible: true,
  };

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function icon(name) {
    const item = node("i");
    item.dataset.lucide = name;
    item.setAttribute("aria-hidden", "true");
    return item;
  }

  function refreshIcons() {
    window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
  }

  function scenario() {
    return core.getScenario(state.scenarioId);
  }

  function currentFrame() {
    return scenario().frames[state.frame];
  }

  function callVisualStatus(toolState) {
    if (toolState === "request") return { key: "running", label: "进行中" };
    if (toolState === "planned") return { key: "ready", label: "待执行" };
    if (toolState === "response") return { key: "success", label: "已返回" };
    if (["timeout", "cached"].includes(toolState)) return { key: "unknown", label: "待核对" };
    if (toolState === "cancelled") return { key: "blocked", label: "已停住" };
    if (toolState === "decision") return { key: "ready", label: "已决定" };
    return { key: "ready", label: "已记录" };
  }

  function markerLayout(axNode, index) {
    const exact = markerLayouts[axNode.label];
    if (exact) return exact;
    const role = markerLayouts[axNode.role];
    if (role) return role;
    return { x: 29 + index * 5, y: 36 + index * 7, w: 35, h: 8 };
  }

  function renderAx(frame) {
    const markers = (frame.ax?.nodes || []).map((axNode, index) => {
      const marker = node("span", "cua-ax-marker");
      const layout = markerLayout(axNode, index);
      marker.style.setProperty("--ax-x", layout.x);
      marker.style.setProperty("--ax-y", layout.y);
      marker.style.setProperty("--ax-w", layout.w);
      marker.style.setProperty("--ax-h", layout.h);
      marker.dataset.selected = String(Boolean(axNode.target));
      const value = axNode.value ? ` = ${axNode.value}` : "";
      marker.append(node("span", "", `[${axNode.index}] ${axNode.role} ${axNode.label}${value}`));
      return marker;
    });
    refs.axOverlay.replaceChildren(...markers);
  }

  function renderDesktop(frame) {
    const desktop = frame.desktop || {};
    const freshTask = (desktop.tasks || []).find((task) => task.fresh);
    refs.windowTitle.textContent = desktop.app || "Deskboard";
    refs.windowState.textContent = [desktop.revision, desktop.notice].filter(Boolean).join(" · ") || desktop.windowTitle || "今天";
    refs.composer.hidden = desktop.view !== "editor";
    refs.composerInput.value = desktop.draft || "";
    refs.createdTask.hidden = !freshTask || desktop.view === "editor";
    refs.createdText.textContent = freshTask?.label || "";
    refs.taskCount.textContent = freshTask && desktop.view !== "editor" ? "4" : "3";
    refs.notice.hidden = !desktop.notice;
    refs.notice.textContent = desktop.notice || "";
    refs.desktop.dataset.focus = desktop.focus || "none";
    for (const element of [refs.newTask, refs.composerInput, refs.submitTask, refs.createdTask]) delete element.dataset.active;
    if (desktop.focus === "add-button") refs.newTask.dataset.active = "true";
    if (desktop.focus === "task-input") refs.composerInput.dataset.active = "true";
    if (desktop.focus === "save-button") refs.submitTask.dataset.active = "true";
    if (desktop.focus === "task-4") refs.createdTask.dataset.active = "true";

    const cursor = frame.cursor || {};
    refs.cursor.hidden = !cursor.visible;
    refs.cursor.style.setProperty("--cursor-x", Number.isFinite(cursor.x) ? cursor.x : 50);
    refs.cursor.style.setProperty("--cursor-y", Number.isFinite(cursor.y) ? cursor.y : 50);
    refs.cursor.dataset.pressed = String(cursor.state === "pressed");
    refs.cursor.title = cursor.label || "Agent 光标";
    renderAx(frame);
  }

  function evidenceHref(id) {
    const url = new URL(location.href);
    url.searchParams.set("study", "computer-use");
    url.searchParams.set("evidence", id);
    url.searchParams.delete("type");
    url.searchParams.delete("q");
    url.searchParams.delete("agent");
    return `${url.pathname}${url.search}`;
  }

  function renderEvidence(frame) {
    const links = (frame.evidence || []).map((id) => {
      const link = node("a", "", id);
      link.href = evidenceHref(id);
      link.setAttribute("aria-label", `查看当前步骤证据 ${id}`);
      return link;
    });
    refs.evidenceLinks.replaceChildren(...links);
  }

  function renderTimeline(activeScenario) {
    if (refs.timeline.dataset.scenario !== activeScenario.id) {
      const steps = activeScenario.frames.map((frame, index) => {
        const item = node("li");
        const button = node("button");
        button.type = "button";
        button.dataset.frame = String(index);
        button.setAttribute("aria-label", `跳到第 ${index + 1} 步：${frame.title}`);
        button.append(node("code", "", String(index + 1).padStart(2, "0")), node("span", "", frame.title));
        item.append(button);
        return item;
      });
      refs.timeline.replaceChildren(...steps);
      refs.timeline.dataset.scenario = activeScenario.id;
    }
    refs.timeline.querySelectorAll("button[data-frame]").forEach((button) => {
      if (Number(button.dataset.frame) === state.frame) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    refs.timeline.querySelector('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderPlayButton() {
    refs.play.replaceChildren(icon(state.playing ? "pause" : "play"), node("span", "", state.playing ? "暂停" : "播放"));
    refs.play.setAttribute("aria-label", state.playing ? "暂停回放" : "播放回放");
  }

  function syncUrl() {
    const href = core.selectionHref(location.href, state.scenarioId, state.frame, state.view === "agent");
    history.replaceState(null, "", href);
  }

  function render(options = {}) {
    const activeScenario = scenario();
    state.frame = core.clampFrame(activeScenario, state.frame);
    const frame = currentFrame();
    const status = callVisualStatus(frame.tool?.state);
    refs.scenarioSelect.value = activeScenario.id;
    refs.scenarioTabs.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.scenario === activeScenario.id;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll("[data-cua-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.cuaView === state.view));
    });
    refs.desktop.dataset.view = state.view;
    refs.screenBadge.textContent = state.view === "agent" ? "截图 + Accessibility 标注" : "人眼看到的屏幕";
    refs.frameTitle.textContent = frame.title;
    refs.caption.textContent = frame.caption;
    refs.phase.textContent = phaseLabels[frame.phase] || frame.phase;
    refs.stepLabel.textContent = `步骤 ${state.frame + 1} / ${activeScenario.frames.length}`;
    refs.callStatus.dataset.status = status.key;
    refs.callStatus.textContent = status.label;
    refs.callActor.textContent = actorLabels[frame.tool?.actor] || "Agent 当前调用";
    refs.callName.textContent = frame.tool?.name || "无工具调用";
    refs.callArgs.textContent = frame.tool?.args || "";
    refs.callResult.dataset.status = status.key;
    refs.callResult.textContent = frame.tool?.result || "";
    refs.decision.textContent = frame.ax?.note || frame.caption;
    refs.premise.textContent = `${frame.premise} 这不是一次真实会话录屏。`;
    refs.scrubber.max = String(activeScenario.frames.length - 1);
    refs.scrubber.value = String(state.frame);
    refs.progress.value = `${state.frame + 1} / ${activeScenario.frames.length}`;
    refs.previous.disabled = state.frame === 0;
    refs.next.disabled = state.frame === activeScenario.frames.length - 1;
    renderDesktop(frame);
    renderEvidence(frame);
    renderTimeline(activeScenario);
    renderPlayButton();
    if (options.url !== false) syncUrl();
    refreshIcons();
  }

  function stopPlayback(renderButton = true) {
    state.playing = false;
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    if (renderButton) {
      renderPlayButton();
      refreshIcons();
    }
  }

  function seek(frame, options = {}) {
    stopPlayback(false);
    state.frame = core.clampFrame(scenario(), frame);
    render(options);
  }

  function play() {
    if (state.playing) {
      stopPlayback();
      return;
    }
    if (!state.visible || document.hidden) return;
    const activeScenario = scenario();
    if (state.frame === activeScenario.frames.length - 1) state.frame = 0;
    state.playing = true;
    render();
    state.timer = window.setInterval(() => {
      const next = core.nextFrame(scenario(), state.frame);
      if (next === state.frame) {
        stopPlayback();
        return;
      }
      state.frame = next;
      render();
    }, 2200);
  }

  function selectScenario(id) {
    stopPlayback(false);
    state.scenarioId = core.getScenario(id).id;
    state.frame = 0;
    render();
  }

  function setView(view) {
    state.view = view === "agent" ? "agent" : "screen";
    render();
  }

  function buildScenarioControls() {
    const tabs = core.scenarios.map((item) => {
      const button = node("button", "", item.label);
      button.type = "button";
      button.role = "tab";
      button.dataset.scenario = item.id;
      button.setAttribute("aria-controls", "cuaWorkspace");
      return button;
    });
    const options = core.scenarios.map((item) => {
      const option = node("option", "", item.label);
      option.value = item.id;
      return option;
    });
    refs.scenarioTabs.replaceChildren(...tabs);
    refs.scenarioSelect.replaceChildren(...options);
  }

  function bindControls() {
    refs.scenarioTabs.addEventListener("click", (event) => {
      const button = event.target.closest?.("button[data-scenario]");
      if (button) selectScenario(button.dataset.scenario);
    });
    refs.scenarioTabs.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const index = core.scenarioIds.indexOf(state.scenarioId);
      const next = (index + delta + core.scenarioIds.length) % core.scenarioIds.length;
      selectScenario(core.scenarioIds[next]);
      refs.scenarioTabs.querySelector(`[data-scenario="${core.scenarioIds[next]}"]`)?.focus();
    });
    refs.scenarioSelect.addEventListener("change", () => selectScenario(refs.scenarioSelect.value));
    root.querySelectorAll("[data-cua-view]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.cuaView));
    });
    refs.restart.addEventListener("click", () => seek(0));
    refs.previous.addEventListener("click", () => seek(core.previousFrame(scenario(), state.frame)));
    refs.next.addEventListener("click", () => seek(core.nextFrame(scenario(), state.frame)));
    refs.play.addEventListener("click", play);
    refs.scrubber.addEventListener("input", () => seek(refs.scrubber.value));
    refs.timeline.addEventListener("click", (event) => {
      const button = event.target.closest?.("button[data-frame]");
      if (button) seek(button.dataset.frame);
    });
    root.querySelector(".cua-workspace").addEventListener("keydown", (event) => {
      if (["BUTTON", "INPUT", "SELECT", "A"].includes(event.target.tagName)) return;
      if (event.key === "ArrowRight") seek(core.nextFrame(scenario(), state.frame));
      else if (event.key === "ArrowLeft") seek(core.previousFrame(scenario(), state.frame));
      else if (event.key === "Home") seek(0);
      else if (event.key === "End") seek(scenario().frames.length - 1);
      else if (event.key === " ") play();
      else return;
      event.preventDefault();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopPlayback();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        state.visible = entries[0]?.isIntersecting !== false;
        if (!state.visible) stopPlayback();
      }, { threshold: 0.08 }).observe(root);
    }
  }

  function mount(study) {
    if (state.mounted || study?.id !== "computer-use") return;
    state.mounted = true;
    const selection = core.resolveSelection(location.href);
    state.scenarioId = selection.scenarioId;
    state.frame = selection.frame;
    state.view = selection.axVisible ? "agent" : "screen";
    buildScenarioControls();
    bindControls();
    root.hidden = false;
    render({ url: false });
  }

  window.addEventListener("agentlab:research-detail-ready", (event) => mount(event.detail?.study));
}());
