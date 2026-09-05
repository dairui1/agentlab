(function () {
  "use strict";

  const app = document.getElementById("contractApp");
  const status = document.getElementById("contractStatus");
  const canvas = document.getElementById("canvasContent");
  const inspector = document.getElementById("evidenceInspector");
  const inspectorBackdrop = document.getElementById("inspectorBackdrop");
  const inspectorModalQuery = window.matchMedia("(max-width: 1280px)");
  const agentMeta = {
    "claude-code": { label: "Claude Code", icon: "/agent-icons/claude-code.png" },
    codex: { label: "Codex", icon: "/agent-icons/codex.png" },
    opencode: { label: "opencode", icon: "/agent-icons/opencode.png" },
    "cross-agent": { label: "跨 Agent", icon: "/assets/agentlab-mark.png" },
  };
  const productAgents = ["claude-code", "codex", "opencode"];
  const defaultViewCopy = {
    compare: ["事实对照", "操作速查", "primitive、默认行为、返回通道与危险边界放在同一个比较行。"],
    flows: ["可观测链路", "生命周期", "图中只画公开合同可观测的状态与控制，不冒充内部 scheduler 实现。"],
    failures: ["失败与副作用", "失败面", "按重复执行、payload 丢失、文件冲突与资源生命周期排序。"],
    resources: ["隔离与限额", "隔离与资源", "Conversation、workspace、permission 与 limits 分开陈述，数字保留分母和作用域。"],
    changes: ["版本事实", "版本变化", "只保留会改变调用、默认值、返回值、限额或 failure shape 的节点。"],
  };
  const dossierRegistry = {
    "subagent-orchestration": {
      label: "Sub-agent 编排",
      description: "创建、寻址、等待与结果回收",
      icon: "network",
      href: "/mechanisms",
      evidence: "/dossiers/subagent-evidence.json",
      summary: "/dossiers/subagent-orchestration.json",
      workbench: "/dossiers/subagent-workbench.json",
    },
    "context-compaction": {
      label: "上下文压缩",
      description: "触发、摘要、重注入与持久化",
      icon: "fold-vertical",
      href: "/mechanisms?mechanism=context-compaction",
      evidence: "/dossiers/context-compaction-evidence.json",
      summary: "/dossiers/context-compaction-summary.json",
      workbench: "/dossiers/context-compaction-workbench.json",
    },
    "permission-sandbox": {
      label: "权限、审批与沙箱",
      description: "规则、授权作用域、执行隔离与拒绝恢复",
      icon: "shield-check",
      href: "/mechanisms?mechanism=permission-sandbox",
      evidence: "/dossiers/permission-sandbox-evidence.json",
      summary: "/dossiers/permission-sandbox-summary.json",
      workbench: "/dossiers/permission-sandbox-workbench.json",
    },
    "session-resume": {
      label: "Session 持久化与恢复",
      description: "寻址、落盘、恢复、分叉、回退与重放",
      icon: "history",
      href: "/mechanisms?mechanism=session-resume",
      evidence: "/dossiers/session-resume-evidence.json",
      summary: "/dossiers/session-resume-summary.json",
      workbench: "/dossiers/session-resume-workbench.json",
    },
    "tool-contract": {
      label: "Tool 调用与失败语义",
      description: "目录、身份、执行结果、重试与终态收敛",
      icon: "wrench",
      href: "/mechanisms?mechanism=tool-contract",
      evidence: "/dossiers/tool-contract-evidence.json",
      summary: "/dossiers/tool-contract-summary.json",
      workbench: "/dossiers/tool-contract-workbench.json",
    },
    "model-routing": {
      label: "模型路由与回退",
      description: "模型解析、Reasoning、重试与回退边界",
      icon: "route",
      href: "/mechanisms?mechanism=model-routing",
      evidence: "/dossiers/model-routing-evidence.json",
      summary: "/dossiers/model-routing-summary.json",
      workbench: "/dossiers/model-routing-workbench.json",
    },
    "mcp-dynamic-tools": {
      label: "MCP 与动态工具",
      description: "注册、发现、目录版本、调用权限与动态 Host",
      icon: "plug-zap",
      href: "/mechanisms?mechanism=mcp-dynamic-tools",
      evidence: "/dossiers/mcp-dynamic-tools-evidence.json",
      summary: "/dossiers/mcp-dynamic-tools-summary.json",
      workbench: "/dossiers/mcp-dynamic-tools-workbench.json",
    },
  };
  const requestedDossier = new URL(location.href).searchParams.get("mechanism");
  const dossierId = dossierRegistry[requestedDossier] ? requestedDossier : "subagent-orchestration";
  const dossierConfig = dossierRegistry[dossierId];
  const collectionChunks = { flows: 6, failures: 12, changes: 10 };
  const state = { view: "compare", operation: "all", claim: null, contextClaims: [], inspectorContext: "", collections: {} };
  let workbench;
  let claimById;
  let unknownById;
  let inspectorReturnFocus;

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

  function collectionState(view) {
    if (!state.collections[view]) {
      state.collections[view] = { filters: {}, query: "", limit: collectionChunks[view] || 12 };
    }
    return state.collections[view];
  }

  function renderCollectionController(records, config) {
    const current = collectionState(config.view);
    const toolbar = el("div", "collection-toolbar");
    const summary = el("div", "collection-summary");
    const count = el("strong", "", `${records.length} ${config.noun}`);
    const shown = el("span", "");
    summary.append(icon("list-filter"), count, shown);
    toolbar.append(summary);

    const facets = (config.facets || []).filter((facet) => facet.options.length > 1);
    facets.forEach((facet) => {
      const allowed = new Set(["all", ...facet.options.map((option) => option.value)]);
      if (!allowed.has(current.filters[facet.key])) current.filters[facet.key] = "all";
      const group = el("div", "collection-facet");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", facet.label);
      [{ value: "all", label: "全部" }, ...facet.options].forEach((option) => {
        const button = el("button", "", option.label);
        button.type = "button";
        button.dataset.facet = facet.key;
        button.dataset.value = option.value;
        button.addEventListener("click", () => {
          current.filters[facet.key] = option.value;
          current.limit = collectionChunks[config.view] || records.length;
          apply();
          updateUrl();
        });
        group.append(button);
      });
      toolbar.append(group);
    });

    const search = el("label", "collection-search");
    search.append(icon("search"));
    const input = el("input");
    input.type = "search";
    input.value = current.query;
    input.placeholder = config.placeholder;
    input.setAttribute("aria-label", config.placeholder);
    input.addEventListener("input", () => {
      current.query = input.value;
      current.limit = collectionChunks[config.view] || records.length;
      apply();
      updateUrl();
    });
    search.append(input);
    toolbar.append(search);

    const empty = el("p", "collection-empty", "没有匹配的合同记录。");
    const more = el("button", "collection-more");
    more.type = "button";
    more.append(icon("chevron-down"), el("span", "", `再显示 ${collectionChunks[config.view] || 12} 条`));
    more.addEventListener("click", () => {
      current.limit += collectionChunks[config.view] || records.length;
      apply();
    });

    function apply() {
      const query = current.query.trim().toLocaleLowerCase();
      const matching = records.filter((record) => {
        const facetMatch = facets.every((facet) => {
          const selected = current.filters[facet.key] || "all";
          if (selected === "all") return true;
          const value = facet.value(record.item);
          return Array.isArray(value) ? value.includes(selected) : value === selected;
        });
        const haystack = (record.search || JSON.stringify(record.item)).toLocaleLowerCase();
        return facetMatch && (!query || haystack.includes(query));
      });
      const visible = new Set(matching.slice(0, current.limit));
      records.forEach((record) => { record.node.hidden = !visible.has(record); });
      shown.textContent = `显示 ${Math.min(matching.length, current.limit)} / ${matching.length}`;
      empty.hidden = matching.length !== 0;
      more.hidden = matching.length <= current.limit;
      toolbar.querySelectorAll("[data-facet]").forEach((button) => {
        button.setAttribute("aria-pressed", String((current.filters[button.dataset.facet] || "all") === button.dataset.value));
      });
    }

    return { toolbar, empty, more, apply };
  }

  function evidenceButton(ids, unknown, contextLabel) {
    const validUnknown = unknown && unknownById?.has(unknown) ? unknown : null;
    const all = [...new Set([...(ids || []), ...(validUnknown ? [validUnknown] : [])])];
    if (!all.length) return el("span", "inspect-evidence-note", unknown || "暂无证据");
    const evidenceCount = ids?.length || 0;
    const label = validUnknown && !evidenceCount ? "未知合同" : validUnknown ? `证据 ${evidenceCount} · 未知 1` : `证据 ${evidenceCount}`;
    const button = el("button", "inspect-evidence", label);
    button.type = "button";
    button.setAttribute("aria-label", validUnknown && !evidenceCount ? `检查未知合同：${contextLabel}` : `检查 ${label}：${contextLabel}`);
    button.append(icon(validUnknown && !evidenceCount ? "circle-help" : "scan-search"));
    button.addEventListener("click", () => openInspector(all[0], all, true, contextLabel, button));
    return button;
  }

  function safeLink(link, kind) {
    const anchor = el("a", "inspector-link");
    const external = /^https?:\/\//.test(link.url);
    anchor.href = link.url;
    anchor.append(icon(kind === "compare" && !external ? "git-compare-arrows" : "external-link"), el("span", "", link.label));
    if (kind === "source" || kind === "compare" || external) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    return anchor;
  }

  function collectRefs(value, key, target = []) {
    if (!value || typeof value !== "object") return target;
    const addRefs = (item) => {
      if (typeof item === "string" && /^[A-Z][A-Z0-9-]*-\d+$/.test(item)) target.push(item);
      else if (Array.isArray(item)) item.forEach(addRefs);
      else if (item && typeof item === "object") Object.values(item).forEach(addRefs);
    };
    if (Array.isArray(value)) {
      value.forEach((item) => collectRefs(item, key, target));
    } else {
      Object.entries(value).forEach(([field, item]) => {
        if (field === key || field === `${key}ByAgent`) addRefs(item);
        else {
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
    const minimums = dossier.minimums || { operations: 8, flows: 4, hazards: 8 };
    if (dossier.operations.length < minimums.operations || dossier.flows.length < minimums.flows || dossier.hazards.length < minimums.hazards) {
      throw new Error("控制合同数据不完整");
    }
  }

  function focusMechanismItem(position = "current") {
    const items = [...document.querySelectorAll("#mechanismMenu [data-mechanism]")];
    if (!items.length) return;
    const target = position === "first" ? items[0]
      : position === "last" ? items.at(-1)
        : items.find((item) => item.getAttribute("aria-current") === "page") || items[0];
    target.focus();
  }

  function setMechanismMenu(open, focusPosition) {
    const trigger = document.getElementById("mechanismMenuTrigger");
    const menu = document.getElementById("mechanismMenu");
    trigger.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    if (open && focusPosition) requestAnimationFrame(() => focusMechanismItem(focusPosition));
  }

  function renderMechanismMenu() {
    const menu = clear(document.getElementById("mechanismMenu"));
    Object.entries(dossierRegistry).forEach(([id, config]) => {
      const link = el("a");
      link.href = config.href;
      link.dataset.mechanism = id;
      const iconBox = el("span", "mechanism-menu-icon");
      iconBox.setAttribute("aria-hidden", "true");
      iconBox.append(icon(config.icon));
      const copy = el("span", "mechanism-menu-copy");
      copy.append(el("strong", "", config.label), el("small", "", config.description));
      link.append(iconBox, copy, icon("check"));
      link.lastElementChild.classList.add("mechanism-menu-check");
      menu.append(link);
    });
  }

  function renderHeader() {
    document.getElementById("contractTitle").textContent = workbench.title;
    document.getElementById("contractSubtitle").textContent = workbench.subtitle;
    document.getElementById("contractDate").textContent = `核验于 ${workbench.verifiedAt}`;
    document.title = `${workbench.title} · 专题研究 · AgentLab`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = workbench.description || workbench.subtitle;
    renderMechanismMenu();
    const mechanismItems = [...document.querySelectorAll("[data-mechanism]")];
    const currentMechanism = mechanismItems.find((item) => item.dataset.mechanism === dossierId);
    mechanismItems.forEach((item) => {
      if (item === currentMechanism) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    const mechanismLabel = currentMechanism?.querySelector("strong")?.textContent || workbench.title;
    document.getElementById("mechanismMenuLabel").textContent = mechanismLabel;
    const dossierCount = Object.keys(dossierRegistry).length;
    document.querySelector(".mechanism-switcher-label").textContent = `比较专题 · ${dossierCount} 个`;
    document.getElementById("mechanismMenuTrigger").setAttribute("aria-label", `切换比较专题（共 ${dossierCount} 个），当前：${mechanismLabel}`);
    if (workbench.views) {
      document.querySelectorAll("[data-view]").forEach((button) => {
        const label = workbench.views[button.dataset.view]?.label;
        if (label) button.querySelector("span").textContent = label;
      });
    }
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
    strip.append(el("strong", "sharp-edge-title", workbench.sharpEdgeTitle || `最容易写错的 ${workbench.sharpEdges.length} 个合同`));
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
    document.getElementById("operationRailTitle").textContent = workbench.operationRailLabel || "开发者要做什么";
    const list = document.getElementById("operationList");
    const groupById = new Map((workbench.operationGroups || []).map((group) => [group.id, group]));
    let currentGroup = null;
    workbench.operations.forEach((operation) => {
      if (operation.group && operation.group !== currentGroup && groupById.has(operation.group)) {
        currentGroup = operation.group;
        const heading = el("div", "rail-heading");
        heading.append(el("span", "", groupById.get(operation.group).label));
        list.append(heading);
      }
      const button = el("button", "operation-button");
      button.type = "button";
      button.dataset.operation = operation.id;
      button.append(icon(operation.icon), el("span", "", operation.label));
      button.addEventListener("click", () => {
        resetInspectorSelection();
        state.view = "compare";
        state.operation = operation.id;
        renderWorkspace();
      });
      list.append(button);
    });
    document.getElementById("showAllOperations").addEventListener("click", () => {
      resetInspectorSelection();
      state.view = "compare";
      state.operation = "all";
      renderWorkspace();
    });
  }

  function renderCompare() {
    const operations = state.operation === "all" ? workbench.operations : workbench.operations.filter((item) => item.id === state.operation);
    const table = el("div", "operation-table");
    table.setAttribute("role", "table");
    if (state.operation !== "all") {
      table.classList.add("is-single-operation");
      table.setAttribute("aria-label", operations[0].label);
    }
    const head = el("div", "operation-row operation-head");
    ["操作合同", ...productAgents.map((agent) => agentMeta[agent].label)].forEach((label) => {
      const cell = el("div", "", label);
      cell.setAttribute("role", "columnheader");
      head.append(cell);
    });
    table.append(head);
    operations.forEach((operation) => {
      const row = el("article", "operation-row");
      row.setAttribute("role", "row");
      row.dataset.operation = operation.id;
      const name = el("header", "operation-name");
      name.setAttribute("role", "rowheader");
      name.append(icon(operation.icon), el("strong", "", operation.label), el("p", "", operation.question));
      row.append(name);
      productAgents.forEach((agent) => {
        const data = operation.cells[agent];
        const cell = el("div", "operation-cell");
        cell.setAttribute("role", "cell");
        cell.dataset.agent = agent;
        cell.append(el("span", "mobile-agent-label", agentMeta[agent].label));
        cell.append(el("span", "operation-surface", data.surface || (agent === "claude-code" ? "Claude control surface" : agent === "codex" ? "collaboration tool" : "TaskTool")));
        const cellHead = el("div", "operation-cell-head");
        cellHead.append(statusTag(data.status), evidenceButton(data.claims, data.unknown, `${operation.label} / ${agentMeta[agent].label}`));
        const primitive = el("code", "operation-primitive", data.primitive);
        const call = el("div", "operation-field");
        call.append(el("span", "operation-field-label", "CALL / SIGNAL"), primitive);
        const guarantee = el("div", "operation-field");
        guarantee.append(el("span", "operation-field-label", "已核对行为"), el("p", "operation-contract", data.contract));
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
    const records = [];
    workbench.flows.forEach((flow) => {
      const article = el("article", "flow-record");
      article.classList.add("collection-record");
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
      records.push({ item: flow, node: article });
    });
    const controller = renderCollectionController(records, {
      view: "flows",
      noun: "条链路",
      placeholder: "搜索链路、状态或控制",
      facets: [{
        key: "agent",
        label: "按 Agent 筛选链路",
        options: productAgents.filter((agent) => workbench.flows.some((flow) => flow.agent === agent)).map((agent) => ({ value: agent, label: agentMeta[agent].label })),
        value: (flow) => flow.agent,
      }],
    });
    canvas.append(controller.toolbar, list, controller.empty, controller.more);
    controller.apply();
  }

  function renderFailures() {
    const table = el("div", "hazard-table");
    const records = [];
    const head = el("div", "hazard-row hazard-head");
    ["风险", "可核验合同", "不能做的假设", "证据"].forEach((label) => head.append(el("div", "", label)));
    table.append(head);
    const kindLabels = {
      observed_behavior: "已观察行为",
      contract_gap: "合同缺口",
      integration_trap: "集成陷阱",
    };
    workbench.hazards.forEach((hazard) => {
      const row = el("article", "hazard-row");
      row.classList.add("collection-record");
      row.dataset.severity = hazard.severity;
      const title = el("div", "hazard-name");
      title.append(el("span", "", `${hazard.severity} · ${kindLabels[hazard.kind] || hazard.kind}`), el("strong", "", hazard.title));
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
      row.append(title, contract, assumption, evidenceButton(hazard.claims, hazard.unknown, `失败面 / ${hazard.title}`));
      table.append(row);
      records.push({ item: hazard, node: row });
    });
    const familyLabels = {
      "Readiness & ownership": "就绪与 Owner",
      "Registration & identity": "注册与身份",
      "Catalog / exposure consistency": "目录与暴露一致性",
      "Authority / isolation / context": "权限、隔离与上下文",
      "Error / recovery / replay": "错误、恢复与重放",
      "Result projection": "结果投影",
      "Liveness / budgets": "存活性与预算",
    };
    const families = [...new Set(workbench.hazards.map((hazard) => hazard.family).filter(Boolean))];
    const severities = [...new Set(workbench.hazards.map((hazard) => hazard.severity).filter(Boolean))];
    const facets = [];
    if (families.length) facets.push({
      key: "family",
      label: "按风险族筛选",
      options: families.map((value) => ({ value, label: familyLabels[value] || value })),
      value: (hazard) => hazard.family,
    });
    if (severities.length > 1) facets.push({
      key: "severity",
      label: "按优先级筛选",
      options: severities.map((value) => ({ value, label: value })),
      value: (hazard) => hazard.severity,
    });
    const controller = renderCollectionController(records, {
      view: "failures",
      noun: "个风险",
      placeholder: "搜索风险、触发或恢复动作",
      facets,
    });
    canvas.append(controller.toolbar, table, controller.empty, controller.more);
    controller.apply();
  }

  function comparisonTable(rows, className) {
    const table = el("div", className);
    const head = el("div", "resource-row resource-head");
    ["合同维度", ...productAgents.map((id) => agentMeta[id].label), "证据"].forEach((label) => head.append(el("div", "", label)));
    table.append(head);
    rows.forEach((row) => {
      const line = el("article", "resource-row");
      const label = el("strong", "resource-label", row.label || row.metric);
      line.append(label);
      productAgents.forEach((agent) => {
        const value = row.cells ? row.cells[agent] : row[agent];
        const cell = el("div", "resource-cell");
        cell.append(el("span", "mobile-agent-label", agentMeta[agent].label), el("p", "", value));
        if (row.claimsByAgent) {
          const marker = el("div", "resource-cell-evidence");
          marker.append(evidenceButton(row.claimsByAgent[agent] || [], row.unknownByAgent?.[agent], `隔离与资源 / ${row.label || row.metric} / ${agentMeta[agent].label}`));
          cell.append(marker);
        }
        line.append(cell);
      });
      const refs = el("div", "resource-evidence");
      if (row.claimsByAgent) refs.append(el("span", "resource-source-count", "逐列"));
      else refs.append(evidenceButton(row.claims, row.unknown, `隔离与资源 / ${row.label || row.metric}`));
      line.append(refs);
      table.append(line);
    });
    return table;
  }

  function renderResources() {
    const copy = workbench.resourceCopy || {};
    const isolation = el("section", "resource-section");
    isolation.append(
      el("h3", "", copy.primaryTitle || "状态与隔离"),
      el("p", "resource-intro", copy.primaryIntro || "对话历史与 mutable workspace 是两条独立轨道。"),
    );
    isolation.append(comparisonTable(workbench.isolation, "resource-table"));
    const limits = el("section", "resource-section");
    limits.append(
      el("h3", "", copy.secondaryTitle || "限额与作用域"),
      el("p", "resource-intro", copy.secondaryIntro || "这里不做容量排名；每个数字的对象和分母不同。"),
    );
    limits.append(comparisonTable(workbench.limits, "resource-table"));
    canvas.append(isolation, limits);
  }

  function renderChanges() {
    const list = el("div", "change-list");
    const records = [];
    workbench.changes.forEach((change) => {
      const row = el("article", "change-row");
      row.classList.add("collection-record");
      row.dataset.agent = change.agent;
      const who = el("div", "change-who");
      who.append(agentLabel(change.agent));
      if (change.date && change.date !== change.version) who.append(el("time", "", change.date));
      if (change.evidenceClass) {
        const provenance = el("span", "change-provenance", change.evidenceClass === "current-docs" ? "当前文档" : "固定历史");
        provenance.dataset.type = change.evidenceClass;
        who.append(provenance);
      }
      const contract = el("div", "change-contract");
      contract.append(el("code", "", change.version), el("strong", "", change.impact), el("span", "", change.path));
      if (change.claims?.length) contract.append(evidenceButton(change.claims, change.unknown, `版本变化 / ${change.version}`));
      else if (change.unknown) contract.append(evidenceButton([], change.unknown, `版本变化 / ${change.version}`));
      const links = el("div", "change-links");
      const sources = change.sources?.length
        ? change.sources
        : [{ label: change.url.startsWith("/") ? "打开 diff" : "打开来源", url: change.url }];
      sources.forEach((source) => links.append(safeLink(source, source.url.startsWith("/") ? "compare" : "source")));
      row.append(who, contract, links);
      list.append(row);
      records.push({ item: change, node: row });
    });
    const controller = renderCollectionController(records, {
      view: "changes",
      noun: "条变化",
      placeholder: "搜索版本、影响或路径",
      facets: [{
        key: "agent",
        label: "按 Agent 筛选版本变化",
        options: productAgents.filter((agent) => workbench.changes.some((change) => change.agent === agent)).map((agent) => ({ value: agent, label: agentMeta[agent].label })),
        value: (change) => change.agent,
      }],
    });
    canvas.append(controller.toolbar, list, controller.empty, controller.more);
    controller.apply();
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
      if (unknown.experiment) {
        const experiment = el("section", "inspector-guarantee");
        experiment.append(el("span", "", "验证实验"), el("p", "", unknown.experiment));
        container.append(experiment);
      }
      if (unknown.observable) {
        const observable = el("section", "inspector-boundary");
        observable.append(el("span", "", "观察信号"), el("p", "", unknown.observable));
        container.append(observable);
      }
    } else {
      document.getElementById("inspectorTitle").textContent = claim.title;
      const meta = el("div", "inspector-meta");
      meta.append(agentLabel(claim.agent, claim.version), el("span", "", claim.layer));
      if (claim.grade) meta.append(el("span", "", claim.grade));
      if (claim.confidence) meta.append(el("span", "", `置信度 ${claim.confidence}`));
      const grade = claim.grade || "";
      const evidenceType = claim.type === "inference"
        ? "inference"
        : grade.includes("CURRENT-DOCS") || grade === "DOCS-FORWARD"
          ? "current-docs"
          : grade === "EXACT-HISTORY"
            ? "exact-history"
            : grade === "PROTOCOL"
              ? "protocol"
              : "pinned-evidence";
      const evidenceLabels = {
        "pinned-evidence": "固定证据",
        inference: "机制推断",
        "current-docs": "当前文档",
        "exact-history": "固定历史",
        protocol: "协议合同",
      };
      const statementLabels = {
        "pinned-evidence": "可核验合同",
        inference: "证据支持的推断",
        "current-docs": "当前文档合同",
        "exact-history": "历史版本合同",
        protocol: "协议层合同",
      };
      const badge = el("span", "inspector-type", evidenceLabels[evidenceType]);
      badge.dataset.type = evidenceType;
      const statement = el("section", "inspector-guarantee");
      statement.append(el("span", "", statementLabels[evidenceType]), el("p", "", claim.statement));
      const boundary = el("section", "inspector-boundary");
      boundary.append(el("span", "", "不能外推"), el("p", "", claim.boundary));
      const signals = el("div", "inspector-signals");
      claim.signals.forEach((signal) => signals.append(el("code", "", signal)));
      const links = el("div", "inspector-links");
      links.append(safeLink(claim.source, "source"));
      if (claim.compare) links.append(safeLink(claim.compare, "compare"));
      container.append(badge, el("code", "inspector-id", claim.id), meta, statement, boundary, signals, links);
      if (claim.disproof) {
        const disproof = el("section", "inspector-boundary");
        disproof.append(el("span", "", "推翻实验"), el("p", "", claim.disproof));
        container.append(disproof);
      }
    }
    const reverseRelationIds = [...claimById.values()]
      .filter((candidate) => candidate.id !== id
        && ([...(candidate.dependsOn || []), ...(candidate.unknowns || []), ...(candidate.supports || [])].includes(id)))
      .map((candidate) => candidate.id);
    const relationIds = claim
      ? [...(claim.dependsOn || []), ...(claim.unknowns || []), ...(claim.supports || [])]
      : [...(unknown?.relatedClaims || [])];
    const relatedIds = [...new Set([...state.contextClaims, ...relationIds, ...reverseRelationIds])].filter((relatedId) => claimById.has(relatedId) || unknownById.has(relatedId));
    if (relatedIds.length > 1 || relationIds.length) {
      const related = el("div", "inspector-related");
      related.append(el("span", "", relationIds.length ? "支持证据与验证项" : "同一合同中的证据"));
      relatedIds.forEach((relatedId) => {
        const record = claimById.get(relatedId) || unknownById.get(relatedId);
        const owner = record?.agent ? agentMeta[record.agent]?.label || record.agent : "验证项";
        const layer = unknownById.has(relatedId) ? "未知" : record?.type === "inference" ? "推断" : "证据";
        const button = el("button", "", `${owner} · ${record?.title || relatedId} · ${layer}`);
        button.type = "button";
        button.setAttribute("aria-pressed", String(relatedId === id));
        button.addEventListener("click", () => openInspector(relatedId, relatedIds, true, state.inspectorContext));
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
    const fallbackDefaults = {
      compare: compareDefault,
      flows: ["CC-02", "生命周期 / Claude Agent"],
      failures: ["OC-02", "失败面 / task_id silent fresh"],
      resources: ["CC-06", "隔离与资源 / mutable workspace"],
      changes: ["OC-04", "版本变化 / capability gate"],
    };
    const configured = workbench.viewDefaults?.[state.view];
    const [claim, label] = state.view === "compare" && selectedOperation
      ? compareDefault
      : configured ? [configured.claim, configured.label] : fallbackDefaults[state.view];
    document.getElementById("inspectorContext").textContent = `默认证据 · ${label}`;
    renderInspectorRecord(claim);
  }

  function openInspector(id, context = [id], update = true, contextLabel = state.inspectorContext, trigger) {
    if (!inspector.classList.contains("is-open")) {
      inspectorReturnFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    state.claim = id;
    state.contextClaims = context;
    state.inspectorContext = contextLabel || "";
    document.getElementById("inspectorContext").textContent = state.inspectorContext ? `证据 · ${state.inspectorContext}` : "证据";
    document.querySelectorAll(".inspect-evidence.is-active").forEach((button) => {
      button.classList.remove("is-active");
      button.removeAttribute("aria-pressed");
    });
    if (trigger) {
      trigger.classList.add("is-active");
      trigger.setAttribute("aria-pressed", "true");
    }
    inspector.classList.add("is-open");
    inspector.scrollTop = 0;
    syncInspectorMode();
    positionInspector();
    renderInspectorRecord(id);
    if (inspectorModalQuery.matches) requestAnimationFrame(() => document.getElementById("closeInspector").focus());
    if (update) updateUrl();
  }

  function resetInspectorSelection() {
    state.claim = null;
    state.contextClaims = [];
    state.inspectorContext = "";
    inspector.classList.remove("is-open");
    syncInspectorMode();
    document.getElementById("inspectorContext").textContent = "证据";
    document.querySelectorAll(".inspect-evidence.is-active").forEach((button) => {
      button.classList.remove("is-active");
      button.removeAttribute("aria-pressed");
    });
  }

  function syncInspectorMode() {
    const modal = inspectorModalQuery.matches;
    const open = inspector.classList.contains("is-open");
    if (modal) {
      inspector.setAttribute("role", "dialog");
      inspector.setAttribute("aria-modal", "true");
      inspector.setAttribute("aria-hidden", String(!open));
    } else {
      inspector.removeAttribute("role");
      inspector.removeAttribute("aria-modal");
      inspector.removeAttribute("aria-hidden");
    }
    inspectorBackdrop.hidden = !(modal && open);
    document.body.classList.toggle("has-modal-inspector", modal && open);
  }

  function closeInspector(returnFocus = true) {
    const target = inspectorReturnFocus;
    resetInspectorSelection();
    inspectorReturnFocus = null;
    document.getElementById("inspectorTitle").textContent = "选择一条合同";
    clear(document.getElementById("inspectorContent")).append(el("p", "inspector-empty", "点击任意“证据”按钮，在不离开当前比较位置的情况下检查版本、来源和边界。"));
    updateUrl();
    if (returnFocus && target?.isConnected) requestAnimationFrame(() => target.focus());
  }

  function positionInspector() {
    const workspace = document.getElementById("contractWorkspace");
    if (!workspace.hidden) {
      inspector.style.setProperty("--inspector-top", `${Math.max(8, workspace.getBoundingClientRect().top)}px`);
    }
  }

  function revealSelection(container, selected) {
    if (!container || !selected) return;
    const left = selected.offsetLeft;
    const right = left + selected.offsetWidth;
    const top = selected.offsetTop;
    const bottom = top + selected.offsetHeight;
    if (left < container.scrollLeft) container.scrollLeft = Math.max(0, left - 12);
    else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth + 12;
    if (top < container.scrollTop) container.scrollTop = Math.max(0, top - 8);
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight + 8;
  }

  function updateUrl() {
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.set("view", state.view);
    if (state.view === "compare" && state.operation !== "all") url.searchParams.set("operation", state.operation);
    else url.searchParams.delete("operation");
    if (state.claim) url.searchParams.set("claim", state.claim);
    else url.searchParams.delete("claim");
    ["agent", "family", "severity", "q"].forEach((key) => url.searchParams.delete(key));
    const currentCollection = state.collections[state.view];
    if (currentCollection) {
      Object.entries(currentCollection.filters).forEach(([key, value]) => {
        if (value && value !== "all") url.searchParams.set(key, value);
      });
      if (currentCollection.query.trim()) url.searchParams.set("q", currentCollection.query.trim());
    }
    history.replaceState(null, "", url);
  }

  function renderWorkspace(update = true) {
    clear(canvas);
    const configuredCopy = workbench.views?.[state.view];
    const copy = configuredCopy
      ? [defaultViewCopy[state.view][0], configuredCopy.title, configuredCopy.description]
      : defaultViewCopy[state.view];
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
    requestAnimationFrame(() => {
      revealSelection(document.getElementById("viewTabs"), document.querySelector("[data-view][aria-selected=\"true\"]"));
      revealSelection(document.querySelector(".operation-rail"), document.querySelector(".operation-button[aria-pressed=\"true\"]"));
    });
    ({ compare: renderCompare, flows: renderFlows, failures: renderFailures, resources: renderResources, changes: renderChanges })[state.view]();
    renderDefaultInspector();
    if (update) updateUrl();
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  function bindStaticControls() {
    const tabs = [...document.querySelectorAll("[data-view]")];
    tabs.forEach((button) => {
      button.addEventListener("click", () => {
        if (state.view !== button.dataset.view) resetInspectorSelection();
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
    document.getElementById("closeInspector").addEventListener("click", () => closeInspector());
    inspectorBackdrop.addEventListener("click", () => closeInspector());
    inspector.addEventListener("keydown", (event) => {
      if (!inspectorModalQuery.matches || !inspector.classList.contains("is-open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeInspector();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...inspector.querySelectorAll("button:not([disabled]), a[href], input:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    inspectorModalQuery.addEventListener("change", syncInspectorMode);
    syncInspectorMode();
    const mechanismSwitcher = document.getElementById("mechanismSwitcher");
    const mechanismTrigger = document.getElementById("mechanismMenuTrigger");
    const mechanismMenu = document.getElementById("mechanismMenu");
    mechanismTrigger.addEventListener("click", () => {
      const open = mechanismTrigger.getAttribute("aria-expanded") !== "true";
      setMechanismMenu(open, open ? "current" : null);
    });
    mechanismTrigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mechanismTrigger.getAttribute("aria-expanded") === "true") {
        event.preventDefault();
        setMechanismMenu(false);
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        setMechanismMenu(true, event.key === "ArrowUp" || event.key === "End" ? "last" : "first");
      }
    });
    mechanismMenu.addEventListener("keydown", (event) => {
      const items = [...mechanismMenu.querySelectorAll("[data-mechanism]")];
      if (event.key === "Escape") {
        event.preventDefault();
        setMechanismMenu(false);
        mechanismTrigger.focus();
        return;
      }
      const current = items.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (current + 1) % items.length
        : event.key === "ArrowUp" ? (current - 1 + items.length) % items.length
          : event.key === "Home" ? 0
            : event.key === "End" ? items.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      items[next].focus();
    });
    mechanismMenu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-mechanism]");
      if (!item) return;
      event.preventDefault();
      if (item.dataset.mechanism !== dossierId) {
        const next = new URL(item.href, location.origin);
        next.searchParams.set("view", state.view);
        location.href = next;
        return;
      }
      setMechanismMenu(false);
      mechanismTrigger.focus();
    });
    document.addEventListener("focusin", (event) => {
      if (!mechanismSwitcher.contains(event.target)) setMechanismMenu(false);
    });
    document.addEventListener("click", (event) => {
      if (!mechanismSwitcher.contains(event.target)) setMechanismMenu(false);
    });
  }

  function restoreState() {
    const url = new URL(location.href);
    const hashClaim = url.hash.match(/^#evidence-(.+)$/)?.[1];
    const view = url.searchParams.get("view");
    const operation = url.searchParams.get("operation");
    const claim = url.searchParams.get("claim") || hashClaim;
    if (defaultViewCopy[view]) state.view = view;
    if (operation === "all" || workbench.operations.some((item) => item.id === operation)) state.operation = operation;
    const restoredCollection = collectionState(state.view);
    ["agent", "family", "severity"].forEach((key) => {
      const value = url.searchParams.get(key);
      if (value) restoredCollection.filters[key] = value;
    });
    restoredCollection.query = url.searchParams.get("q") || "";
    if (claimById.has(claim) || unknownById.has(claim)) openInspector(claim, [claim], false, `DEEP LINK / ${claim}`);
  }

  Promise.all([
    fetch(dossierConfig.workbench, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject(new Error("工作台数据读取失败"))),
    fetch(dossierConfig.evidence, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject(new Error("证据数据读取失败"))),
    fetch(dossierConfig.summary, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject(new Error("未知项数据读取失败"))),
  ]).then(([dossier, evidence, summary]) => {
    validate(summary, evidence, dossier);
    workbench = dossier;
    state.view = workbench.defaultView;
    state.operation = workbench.defaultOperation;
    claimById = new Map(evidence.claims.map((item) => [item.id, item]));
    unknownById = new Map(summary.unknowns.map((item) => [item.id, item]));
    renderHeader();
    renderOperationRail();
    bindStaticControls();
    restoreState();
    document.querySelectorAll("#contractHeader, #viewTabs, #contractWorkspace").forEach((node) => { node.hidden = false; });
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
