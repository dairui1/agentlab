(() => {
  "use strict";

  const body = document.body;
  const source = body.dataset.runSource;
  const explorer = document.querySelector("[data-run-explorer]");
  const loading = document.querySelector("[data-run-loading]");
  const stageTabs = document.querySelector("[data-stage-tabs]");
  const stageQuestion = document.querySelector("[data-stage-question]");
  const lanes = document.querySelector("[data-run-lanes]");
  const traceTabs = document.querySelector("[data-trace-tabs]");
  const traceSummary = document.querySelector("[data-trace-summary]");
  const traceGroups = document.querySelector("[data-trace-groups]");
  let study = null;
  let activeStage = 0;
  let activeProduct = "codex";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDuration(ms) {
    return `${(Number(ms) / 1000).toFixed(1)} 秒`;
  }

  function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function renderStaticData() {
    document.querySelector("[data-full-prompt]").textContent = study.experiment.prompt;
    document.querySelector("[data-run-boundary]").textContent = study.experiment.boundary;
    document.querySelector("[data-hidden-verifier]").textContent = study.experiment.hiddenVerifier;

    document.querySelector("[data-run-findings]").innerHTML = study.findings.map((finding, index) => `
      <article class="run-finding">
        <span>0${index + 1}</span>
        <h3>${escapeHtml(finding.title)}</h3>
        <p>${escapeHtml(finding.text)}</p>
      </article>
    `).join("");

    const receipt = [
      ["初始提交", study.experiment.fixtureCommit],
      ["同一条件 SHA-256", study.experiment.promptSha256],
      ["运行环境", `Node ${study.experiment.nodeVersion}`],
      ["Codex 原始事件", study.products.find((item) => item.id === "codex").rawEventSha256],
      ["Claude 原始事件", study.products.find((item) => item.id === "claude").rawEventSha256],
      ["独立结果", "两份结果均为 hidden acceptance ok"]
    ];
    document.querySelector("[data-run-receipt]").innerHTML = receipt.map(([term, value]) => `
      <div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>
    `).join("");

    document.querySelector("[data-run-sources]").innerHTML = study.sources.map((item) => `
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(item.label)}<i data-lucide="external-link" aria-hidden="true"></i>
      </a>
    `).join("");
  }

  function renderStageTabs() {
    stageTabs.innerHTML = study.stageLabels.map((stage, index) => `
      <button
        class="run-stage-tab"
        id="runStageTab${index}"
        type="button"
        role="tab"
        aria-selected="${index === activeStage}"
        aria-controls="runStagePanel"
        data-stage-index="${index}"
      >
        <span>${escapeHtml(stage.number)}</span>
        <strong>${escapeHtml(stage.label)}</strong>
      </button>
    `).join("");

    stageTabs.querySelectorAll("[data-stage-index]").forEach((button) => {
      button.addEventListener("click", () => {
        activeStage = Number(button.dataset.stageIndex);
        renderStageTabs();
        renderStage();
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const last = study.stageLabels.length - 1;
        if (event.key === "Home") activeStage = 0;
        else if (event.key === "End") activeStage = last;
        else if (event.key === "ArrowLeft") activeStage = activeStage === 0 ? last : activeStage - 1;
        else activeStage = activeStage === last ? 0 : activeStage + 1;
        renderStageTabs();
        renderStage();
        stageTabs.querySelector(`[data-stage-index="${activeStage}"]`)?.focus();
      });
    });
  }

  function renderStage() {
    const label = study.stageLabels[activeStage];
    stageQuestion.textContent = label.question;
    lanes.id = "runStagePanel";
    lanes.setAttribute("role", "tabpanel");
    lanes.setAttribute("aria-labelledby", `runStageTab${activeStage}`);
    lanes.innerHTML = study.products.map((product) => {
      const stage = product.stages[activeStage];
      return `
        <article class="run-lane run-lane--${escapeHtml(product.id)}">
          <header class="run-lane-head">
            <div class="run-product">
              <span class="run-product-mark" aria-hidden="true"></span>
              <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.version)}</small></div>
            </div>
            <span class="run-state">${escapeHtml(stage.state)}</span>
          </header>
          <h3>${escapeHtml(stage.heading)}</h3>
          <p class="run-mechanism">${escapeHtml(stage.mechanism)}</p>
          <blockquote class="run-quote">${escapeHtml(stage.quote)}</blockquote>
          <div class="run-transition"><i data-lucide="workflow" aria-hidden="true"></i><span>${escapeHtml(stage.transition)}</span></div>
          <ul class="run-evidence-list">
            ${stage.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `;
    }).join("");
    refreshIcons();
  }

  function renderTraceTabs() {
    traceTabs.innerHTML = study.products.map((product) => `
      <button
        class="run-trace-tab"
        id="runTraceTab${escapeHtml(product.id)}"
        type="button"
        role="tab"
        aria-selected="${product.id === activeProduct}"
        aria-controls="runTracePanel"
        data-trace-product="${escapeHtml(product.id)}"
      >${escapeHtml(product.name)}</button>
    `).join("");

    traceTabs.querySelectorAll("[data-trace-product]").forEach((button) => {
      button.addEventListener("click", () => {
        activeProduct = button.dataset.traceProduct;
        renderTraceTabs();
        renderTrace();
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        activeProduct = activeProduct === study.products[0].id ? study.products[1].id : study.products[0].id;
        renderTraceTabs();
        renderTrace();
        traceTabs.querySelector(`[data-trace-product="${activeProduct}"]`)?.focus();
      });
    });
  }

  function renderTrace() {
    const product = study.products.find((item) => item.id === activeProduct);
    traceSummary.innerHTML = [
      ["调用方式", product.invocation],
      ["Goal 回合", `${product.goalRounds} 轮`],
      ["总耗时", formatDuration(product.durationMs)],
      ["最终结果", product.result]
    ].map(([label, value]) => `
      <div class="run-trace-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
    `).join("");

    traceGroups.id = "runTracePanel";
    traceGroups.setAttribute("role", "tabpanel");
    traceGroups.setAttribute("aria-labelledby", `runTraceTab${product.id}`);
    traceGroups.innerHTML = product.trace.map((group, groupIndex) => `
      <details class="run-trace-group"${groupIndex === 0 ? " open" : ""}>
        <summary><strong>${escapeHtml(group.phase)}</strong><span>${group.events.length} 个任务相关事件</span></summary>
        <ol class="run-event-list">
          ${group.events.map((event) => `
            <li class="run-event">
              <time>${escapeHtml(event.at)}</time>
              <span class="run-event-type">${escapeHtml(event.type)}</span>
              <div><strong>${escapeHtml(event.label)}</strong><p>${escapeHtml(event.detail)}</p></div>
            </li>
          `).join("")}
        </ol>
      </details>
    `).join("");
  }

  async function init() {
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      study = await response.json();
      if (!Array.isArray(study.products) || study.products.length !== 2) throw new Error("invalid matched-run data");
      renderStaticData();
      renderStageTabs();
      renderStage();
      renderTraceTabs();
      renderTrace();
      explorer.setAttribute("aria-busy", "false");
      loading.hidden = true;
      refreshIcons();
    } catch (error) {
      explorer.setAttribute("aria-busy", "false");
      loading.textContent = `真实运行数据载入失败：${error.message}`;
    }
  }

  refreshIcons();
  init();
})();
