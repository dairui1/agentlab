(function () {
  "use strict";

  const app = document.getElementById("contractApp");
  const status = document.getElementById("contractStatus");
  const canvas = document.getElementById("canvasContent");
  const inspector = document.getElementById("evidenceInspector");
  const agentMeta = {
    "claude-code": { label: "Claude Code", icon: "/agent-icons/claude-code.png" },
    codex: { label: "Codex", icon: "/agent-icons/codex.png" },
    opencode: { label: "opencode", icon: "/agent-icons/opencode.png" },
  };
  const viewCopy = {
    compare: ["CONTROL REFERENCE", "操作速查", "primitive、默认行为、返回通道与危险边界放在同一个比较行。"],
    flows: ["OBSERVABLE LIFECYCLE", "生命周期", "图中只画公开合同可观测的状态与控制，不冒充内部 scheduler 实现。"],
    failures: ["FAILURE / SIDE EFFECT", "失败面", "按重复执行、payload 丢失、文件冲突与资源生命周期排序。"],
    resources: ["ISOLATION / LIMITS", "隔离与资源", "Conversation、workspace、permission 与 limits 分开陈述，数字保留分母和作用域。"],
    changes: ["CONTRACT COMPATIBILITY", "版本变化", "只保留会改变调用、默认值、返回值、限额或 failure shape 的节点。"],
  };
  const state = { view: "compare", operation: "all", claim: null, contextClaims: [], inspectorContext: "" };
  let workbench;
  let claimById;
  let unknownById;

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

  function clear(node) {
    node.replaceChildren();
    return node;
  }

  function agentLabel(agent, version) {
    const meta = agentMeta[agent];
    const node = el("span", "contract-agent");
    const image = el("img");
    image.src = meta.icon;
    image.alt = "";
    node.append(image, el("strong", "", meta.label));
    if (version) node.append(el("code", "", version));
    return node;
  }

  function statusTag(value) {
    const labels = { exposed: "已暴露", partial: "有边界", "not-exposed": "未暴露", unknown: "未知" };
    const tag = el("span", "contract-status-tag", labels[value] || value);
    tag.dataset.state = value;
    return tag;
  }

  function evidenceButton(ids, unknown, contextLabel) {
    const all = [...new Set([...(ids || []), ...(unknown ? [unknown] : [])])];
    const button = el("button", "inspect-evidence", unknown && !ids?.length ? "未知合同" : `证据 ${ids?.length || 0}`);
    button.type = "button";
    button.setAttribute("aria-label", unknown && !ids?.length ? "检查未知合同" : `检查 ${ids?.length || 0} 条证据`);
    button.append(icon(unknown && !ids?.length ? "circle-help" : "scan-search"));
    button.addEventListener("click", () => openInspector(all[0], all, true, contextLabel, button));
    return button;
  }

  function safeLink(link, kind) {
    const anchor = el("a", "inspector-link");
    anchor.href = link.url;
    anchor.append(icon(kind === "compare" ? "git-compare-arrows" : "external-link"), el("span", "", link.label));
    if (kind === "source") {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    } else {
      anchor.dataset.agentlabComparison = "";
    }
    return anchor;
  }

  function collectRefs(value, key, target = []) {
    if (!value || typeof value !== "object") return target;
    if (Array.isArray(value)) {
      value.forEach((item) => collectRefs(item, key, target));
    } else {
      Object.entries(value).forEach(([field, item]) => {
        if (field === key) {
          const values = Array.isArray(item) ? item : [item];
          target.push(...values.filter((entry) => typeof entry === "string" && /^(CC|CX|OC|KU)-\d+$/.test(entry)));
        } else {
          collectRefs(item, key, target);
        }
      });
    }
    return target;
  }

  function validate(summary, evidence, dossier) {
    const claims = new Set(evidence.claims.map((item) => item.id));
    const unknowns = new Set(summary.unknowns.map((item) => item.id));
    const missingClaims = collectRefs(dossier, "claims").filter((id) => !claims.has(id));
    const missingUnknowns = collectRefs(dossier, "unknown").filter((id) => !unknowns.has(id));
    if (!claims.has(dossier.defaultClaim)) missingClaims.push(dossier.defaultClaim);
    if (missingClaims.length || missingUnknowns.length) throw new Error("控制合同存在无法定位的证据引用");
    if (dossier.operations.length < 8 || dossier.flows.length < 4 || dossier.hazards.length < 8) throw new Error("控制合同数据不完整");
  }

  function renderHeader() {
    document.getElementById("contractTitle").textContent = workbench.title;
    document.getElementById("contractSubtitle").textContent = workbench.subtitle;
    document.getElementById("contractDate").textContent = `AUDIT ${workbench.verifiedAt}`;
    const snapshots = document.getElementById("snapshotLine");
    workbench.snapshots.forEach((item) => {
      const record = el("div", "contract-snapshot");
      record.dataset.agent = item.agent;
      record.append(agentLabel(item.agent), el("code", "", item.version), el("span", "", item.grade));
      snapshots.append(record);
    });
  }

  function renderSharpEdges() {
    const strip = document.getElementById("sharpEdgeStrip");
    strip.append(el("strong", "sharp-edge-title", "最容易写错的 5 个合同"));
    workbench.sharpEdges.forEach((item) => {
      const button = el("button", "sharp-edge");
      button.type = "button";
      const copy = el("span", "sharp-edge-copy");
      copy.append(el("strong", "", item.label), el("span", "", item.text));
      button.append(copy, icon("chevron-right"));
      button.addEventListener("click", () => {
        state.view = item.view;
        state.operation = item.operation || "all";
        state.contextClaims = item.claims;
        openInspector(item.claims[0], item.claims, false, `关键合同 / ${item.label}`);
        renderWorkspace();
      });
      strip.append(button);
    });
  }

  function renderOperationRail() {
    const list = document.getElementById("operationList");
    workbench.operations.forEach((operation) => {
      const button = el("button", "operation-button");
      button.type = "button";
      button.dataset.operation = operation.id;
      button.append(icon(operation.icon), el("span", "", operation.label));
      button.addEventListener("click", () => {
        state.view = "compare";
        state.operation = operation.id;
        renderWorkspace();
      });
      list.append(button);
    });
    document.getElementById("showAllOperations").addEventListener("click", () => {
      state.view = "compare";
      state.operation = "all";
      renderWorkspace();
    });
  }

  function renderCompare() {
    const operations = state.operation === "all" ? workbench.operations : workbench.operations.filter((item) => item.id === state.operation);
    const table = el("div", "operation-table");
    table.setAttribute("role", "table");
    const head = el("div", "operation-row operation-head");
    ["操作合同", ...Object.keys(agentMeta).map((agent) => agentMeta[agent].label)].forEach((label) => {
      const cell = el("div", "", label);
      cell.setAttribute("role", "columnheader");
      head.append(cell);
    });
    table.append(head);
    operations.forEach((operation) => {
      const row = el("article", "operation-row");
      row.dataset.operation = operation.id;
      const name = el("header", "operation-name");
      name.append(icon(operation.icon), el("strong", "", operation.label), el("p", "", operation.question));
      row.append(name);
      Object.keys(agentMeta).forEach((agent) => {
        const data = operation.cells[agent];
        const cell = el("div", "operation-cell");
        cell.dataset.agent = agent;
        cell.append(el("span", "mobile-agent-label", agentMeta[agent].label));
        cell.append(el("span", "operation-surface", data.surface || (agent === "claude-code" ? "Claude control surface" : agent === "codex" ? "collaboration tool" : "TaskTool")));
        const cellHead = el("div", "operation-cell-head");
        cellHead.append(statusTag(data.status), evidenceButton(data.claims, data.unknown, `${operation.label} / ${agentMeta[agent].label}`));
        const primitive = el("code", "operation-primitive", data.primitive);
        const call = el("div", "operation-field");
        call.append(el("span", "operation-field-label", "CALL / SIGNAL"), primitive);
        const guarantee = el("div", "operation-field");
        guarantee.append(el("span", "operation-field-label", "OBSERVABLE CONTRACT"), el("p", "operation-contract", data.contract));
        const details = el("dl", "operation-details");
        (data.details || []).forEach((detail) => {
          const line = el("div");
          line.append(el("dt", "", detail.label), el("dd", "", detail.value));
          details.append(line);
        });
        const edge = el("p", "operation-edge");
        edge.append(icon("triangle-alert"), el("strong", "", "TRAP"), el("span", "", data.edge));
        cell.append(cellHead, call, guarantee);
        if (data.details?.length) cell.append(details);
        cell.append(edge);
        row.append(cell);
      });
      table.append(row);
    });
    canvas.append(table);
  }

  function renderFlows() {
    const list = el("div", "flow-list");
    workbench.flows.forEach((flow) => {
      const article = el("article", "flow-record");
      article.dataset.agent = flow.agent;
      const heading = el("header", "flow-heading");
      heading.append(agentLabel(flow.agent), el("strong", "", flow.label), el("span", "", flow.scope));
      const track = el("div", "flow-track");
      flow.steps.forEach((step, index) => {
        const node = el("div", "flow-node");
        node.append(el("strong", "", step.label), el("span", "", step.meta));
        track.append(node);
        if (index < flow.steps.length - 1) track.append(icon("arrow-right"));
      });
      const controls = el("div", "flow-controls");
      flow.controls.forEach((control) => {
        const row = el("div", `flow-control ${control.danger ? "is-danger" : ""}`);
        row.append(el("code", "", control.primitive), el("span", "", control.effect), evidenceButton(control.claims, null, `${flow.label} / ${control.primitive}`));
        controls.append(row);
      });
      article.append(heading, track, controls);
      list.append(article);
    });
    canvas.append(list);
  }

  function renderFailures() {
    const table = el("div", "hazard-table");
    const head = el("div", "hazard-row hazard-head");
    ["风险", "可核验合同", "不能做的假设", "证据"].forEach((label) => head.append(el("div", "", label)));
    table.append(head);
    workbench.hazards.forEach((hazard) => {
      const row = el("article", "hazard-row");
      row.dataset.severity = hazard.severity;
      const title = el("div", "hazard-name");
      title.append(el("span", "", hazard.kind), el("strong", "", hazard.title));
      const contract = el("div", "hazard-contract", hazard.contract);
      if (hazard.unknown) contract.append(el("small", "", `未核验 · ${hazard.unknown}`));
      const diagnostics = el("dl", "hazard-diagnostics");
      [["TRIGGER", hazard.trigger], ["SIGNAL", hazard.signal], ["RECOVERY", hazard.recovery]].forEach(([label, value]) => {
        const line = el("div");
        line.append(el("dt", "", label), el("dd", "", value));
        diagnostics.append(line);
      });
      contract.append(diagnostics);
      const assumption = el("div", "hazard-assumption");
      assumption.append(icon("x"), el("span", "", hazard.doNotAssume));
      row.append(title, contract, assumption, evidenceButton(hazard.claims, null, `失败面 / ${hazard.title}`));
      table.append(row);
    });
    canvas.append(table);
  }

  function comparisonTable(rows, className) {
    const table = el("div", className);
    const head = el("div", "resource-row resource-head");
    ["合同维度", ...Object.keys(agentMeta).map((id) => agentMeta[id].label)].forEach((label) => head.append(el("div", "", label)));
    table.append(head);
    rows.forEach((row) => {
      const line = el("article", "resource-row");
      const label = el("strong", "resource-label", row.label || row.metric);
      line.append(label);
      Object.keys(agentMeta).forEach((agent) => {
        const value = row.cells ? row.cells[agent] : row[agent];
        const cell = el("div", "resource-cell");
        cell.append(el("span", "mobile-agent-label", agentMeta[agent].label), el("p", "", value));
        line.append(cell);
      });
      const refs = el("div", "resource-evidence");
      refs.append(evidenceButton(row.claims, row.unknown, `隔离与资源 / ${row.label || row.metric}`));
      line.append(refs);
      table.append(line);
    });
    return table;
  }

  function renderResources() {
    const isolation = el("section", "resource-section");
    isolation.append(el("h3", "", "状态与隔离"), el("p", "resource-intro", "对话历史与 mutable workspace 是两条独立轨道。"));
    isolation.append(comparisonTable(workbench.isolation, "resource-table"));
    const limits = el("section", "resource-section");
    limits.append(el("h3", "", "限额与作用域"), el("p", "resource-intro", "这里不做容量排名；每个数字的对象和分母不同。"));
    limits.append(comparisonTable(workbench.limits, "resource-table"));
    canvas.append(isolation, limits);
  }

  function renderChanges() {
    const list = el("div", "change-list");
    workbench.changes.forEach((change) => {
      const row = el("article", "change-row");
      row.dataset.agent = change.agent;
      const who = el("div", "change-who");
      who.append(agentLabel(change.agent), el("time", "", change.date));
      const contract = el("div", "change-contract");
      contract.append(el("code", "", change.version), el("strong", "", change.impact), el("span", "", change.path));
      const link = safeLink({ label: change.url.startsWith("/") ? "打开 diff" : "打开来源", url: change.url }, change.url.startsWith("/") ? "compare" : "source");
      row.append(who, contract, link);
      list.append(row);
    });
    canvas.append(list);
  }

  function renderInspectorRecord(id) {
    const container = clear(document.getElementById("inspectorContent"));
    const claim = claimById.get(id);
    const unknown = unknownById.get(id);
    if (!claim && !unknown) {
      document.getElementById("inspectorTitle").textContent = "选择一条合同";
      container.append(el("p", "inspector-empty", "没有找到这条证据记录。"));
      return;
    }
    if (unknown) {
      document.getElementById("inspectorTitle").textContent = unknown.title;
      const badge = el("span", "inspector-type", "未知合同");
      badge.dataset.type = "unknown";
      container.append(badge, el("code", "inspector-id", unknown.id), el("p", "inspector-statement", unknown.text));
      const needed = el("section", "inspector-boundary");
      needed.append(el("span", "", "需要补充"), el("p", "", unknown.needed));
      container.append(needed);
    } else {
      document.getElementById("inspectorTitle").textContent = claim.title;
      const meta = el("div", "inspector-meta");
      meta.append(agentLabel(claim.agent, claim.version), el("span", "", claim.layer));
      const badge = el("span", "inspector-type", "事实");
      badge.dataset.type = "fact";
      const statement = el("section", "inspector-guarantee");
      statement.append(el("span", "", "可核验合同"), el("p", "", claim.statement));
      const boundary = el("section", "inspector-boundary");
      boundary.append(el("span", "", "不能外推"), el("p", "", claim.boundary));
      const signals = el("div", "inspector-signals");
      claim.signals.forEach((signal) => signals.append(el("code", "", signal)));
      const links = el("div", "inspector-links");
      links.append(safeLink(claim.source, "source"), safeLink(claim.compare, "compare"));
      container.append(badge, el("code", "inspector-id", claim.id), meta, statement, boundary, signals, links);
    }
    if (state.contextClaims.length > 1) {
      const related = el("div", "inspector-related");
      related.append(el("span", "", "同一合同中的证据"));
      state.contextClaims.forEach((relatedId) => {
        const button = el("button", "", relatedId);
        button.type = "button";
        button.setAttribute("aria-pressed", String(relatedId === id));
        button.addEventListener("click", () => openInspector(relatedId, state.contextClaims, true, state.inspectorContext));
        related.append(button);
      });
      container.append(related);
    }
  }

  function renderDefaultInspector() {
    if (state.claim) return;
    const selectedOperation = workbench.operations.find((item) => item.id === state.operation);
    const compareDefault = selectedOperation
      ? [selectedOperation.cells["claude-code"].claims?.[0] || selectedOperation.cells["claude-code"].unknown, `${selectedOperation.label} / Claude Code`]
      : [workbench.defaultClaim, "创建 child / Claude Code"];
    const defaults = {
      compare: compareDefault,
      flows: ["CC-02", "生命周期 / Claude Agent"],
      failures: ["OC-02", "失败面 / task_id silent fresh"],
      resources: ["CC-06", "隔离与资源 / mutable workspace"],
      changes: ["OC-04", "版本变化 / capability gate"],
    };
    const [claim, label] = defaults[state.view];
    document.getElementById("inspectorContext").textContent = `DEFAULT EVIDENCE · ${label}`;
    renderInspectorRecord(claim);
  }

  function openInspector(id, context = [id], update = true, contextLabel = state.inspectorContext, trigger) {
    state.claim = id;
    state.contextClaims = context;
    state.inspectorContext = contextLabel || "";
    document.getElementById("inspectorContext").textContent = state.inspectorContext ? `EVIDENCE · ${state.inspectorContext}` : "EVIDENCE INSPECTOR";
    document.querySelectorAll(".inspect-evidence.is-active").forEach((button) => {
      button.classList.remove("is-active");
      button.removeAttribute("aria-pressed");
    });
    if (trigger) {
      trigger.classList.add("is-active");
      trigger.setAttribute("aria-pressed", "true");
    }
    inspector.classList.add("is-open");
    positionInspector();
    renderInspectorRecord(id);
    if (update) updateUrl();
  }

  function positionInspector() {
    const workspace = document.getElementById("contractWorkspace");
    if (!workspace.hidden) {
      inspector.style.setProperty("--inspector-top", `${Math.max(8, workspace.getBoundingClientRect().top)}px`);
    }
  }

  function updateUrl() {
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.set("view", state.view);
    if (state.view === "compare" && state.operation !== "all") url.searchParams.set("operation", state.operation);
    else url.searchParams.delete("operation");
    if (state.claim) url.searchParams.set("claim", state.claim);
    else url.searchParams.delete("claim");
    history.replaceState(null, "", url);
  }

  function renderWorkspace(update = true) {
    clear(canvas);
    const copy = viewCopy[state.view];
    const operation = workbench.operations.find((item) => item.id === state.operation);
    document.getElementById("contractWorkspace").dataset.view = state.view;
    document.getElementById("contractPanel").dataset.view = state.view;
    document.getElementById("canvasKicker").textContent = copy[0];
    document.getElementById("canvasTitle").textContent = state.view === "compare" && operation ? operation.label : copy[1];
    document.getElementById("canvasDescription").textContent = state.view === "compare" && operation ? operation.question : copy[2];
    document.querySelectorAll("[data-view]").forEach((button) => {
      const selected = button.dataset.view === state.view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected) document.getElementById("contractPanel").setAttribute("aria-labelledby", button.id);
    });
    document.querySelectorAll("[data-operation]").forEach((button) => button.setAttribute("aria-pressed", String(state.view === "compare" && button.dataset.operation === state.operation)));
    document.getElementById("showAllOperations").setAttribute("aria-pressed", String(state.view === "compare" && state.operation === "all"));
    ({ compare: renderCompare, flows: renderFlows, failures: renderFailures, resources: renderResources, changes: renderChanges })[state.view]();
    renderDefaultInspector();
    if (update) updateUrl();
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  function bindStaticControls() {
    const tabs = [...document.querySelectorAll("[data-view]")];
    tabs.forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        renderWorkspace();
      });
      button.addEventListener("keydown", (event) => {
        const current = tabs.indexOf(button);
        const next = event.key === "ArrowRight" ? (current + 1) % tabs.length
          : event.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length
            : event.key === "Home" ? 0
              : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
      });
    });
    document.getElementById("closeInspector").addEventListener("click", () => {
      inspector.classList.remove("is-open");
      state.claim = null;
      state.contextClaims = [];
      state.inspectorContext = "";
      document.getElementById("inspectorContext").textContent = "EVIDENCE INSPECTOR";
      document.querySelectorAll(".inspect-evidence.is-active").forEach((button) => {
        button.classList.remove("is-active");
        button.removeAttribute("aria-pressed");
      });
      document.getElementById("inspectorTitle").textContent = "选择一条合同";
      clear(document.getElementById("inspectorContent")).append(el("p", "inspector-empty", "点击任意“证据”按钮，在不离开当前比较位置的情况下检查版本、来源和边界。"));
      updateUrl();
    });
  }

  function restoreState() {
    const url = new URL(location.href);
    const hashClaim = url.hash.match(/^#evidence-(.+)$/)?.[1];
    const view = url.searchParams.get("view");
    const operation = url.searchParams.get("operation");
    const claim = url.searchParams.get("claim") || hashClaim;
    if (viewCopy[view]) state.view = view;
    if (operation === "all" || workbench.operations.some((item) => item.id === operation)) state.operation = operation;
    if (claimById.has(claim) || unknownById.has(claim)) openInspector(claim, [claim], false, `DEEP LINK / ${claim}`);
  }

  Promise.all([
    fetch("/dossiers/subagent-workbench.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject(new Error("工作台数据读取失败"))),
    fetch("/dossiers/subagent-evidence.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject(new Error("证据数据读取失败"))),
    fetch("/dossiers/subagent-orchestration.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject(new Error("未知项数据读取失败"))),
  ]).then(([dossier, evidence, summary]) => {
    validate(summary, evidence, dossier);
    workbench = dossier;
    state.view = workbench.defaultView;
    state.operation = workbench.defaultOperation;
    claimById = new Map(evidence.claims.map((item) => [item.id, item]));
    unknownById = new Map(summary.unknowns.map((item) => [item.id, item]));
    renderHeader();
    renderSharpEdges();
    renderOperationRail();
    bindStaticControls();
    restoreState();
    document.querySelectorAll("#contractHeader, #sharpEdgeStrip, #viewTabs, #contractWorkspace").forEach((node) => { node.hidden = false; });
    if (state.claim) positionInspector();
    status.hidden = true;
    app.setAttribute("aria-busy", "false");
    renderWorkspace(false);
  }).catch((error) => {
    status.textContent = `控制合同载入失败：${error.message}`;
    status.dataset.state = "error";
    app.setAttribute("aria-busy", "false");
  });

  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}());
