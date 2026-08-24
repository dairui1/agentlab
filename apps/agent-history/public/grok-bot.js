(function initGrokBotRadar() {
  "use strict";

  const core = window.grokBotCore;
  const state = { data: null, selected: "", evidenceQuery: "", evidenceLayer: "all", evidenceKind: "all" };
  const $ = (id) => document.getElementById(id);
  const kindLabels = {
    "source-code": "固定源码",
    "repository-doc": "仓库文档",
    manifest: "重建清单",
    "official-doc": "官方文档",
    "local-verification": "本地复跑",
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

  function refreshIcons() {
    window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
  }

  function attributionText(item) {
    return core.attributionLabels(state.data, item?.attributions).join(" / ");
  }

  function safeHref(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function externalLink(href, className, label) {
    const link = el("a", className, label);
    link.href = safeHref(href) || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function fillList(id, values) {
    $(id).replaceChildren(...(values || []).map((value) => el("li", "", value)));
  }

  function renderHeader() {
    const { data } = state;
    $("sourceCommit").textContent = data.sourceRevision.commit.slice(0, 12);
    $("verifiedAt").textContent = data.verifiedAt;
    $("researchModel").textContent = data.researchModel.replace("gpt-", "GPT-").replace("-sol", " Sol");
    $("thesis").textContent = data.thesis;
    $("heroImage").src = data.hero.src;
    $("heroImage").alt = data.hero.alt;
    $("heroCaption").textContent = data.hero.caption;
    $("heroSource").href = safeHref(data.hero.sourceUrl) || data.sourceRevision.url;
  }

  function renderLayers() {
    $("layerGrid").replaceChildren(...state.data.layers.map((layer) => {
      const item = externalLink(layer.url, "grok-layer", "");
      item.dataset.tone = layer.tone;
      const header = el("header");
      header.append(el("span", "", layer.index), el("strong", "", layer.label), icon("arrow-up-right"));
      item.append(header, el("h3", "", layer.title), el("p", "", layer.summary), el("small", "", layer.boundary));
      return item;
    }));
  }

  function mechanismButton(mechanism) {
    const button = el("button", "grok-mechanism-button");
    button.type = "button";
    button.role = "tab";
    button.id = "mechanism-tab-" + mechanism.id;
    button.dataset.mechanism = mechanism.id;
    button.tabIndex = mechanism.id === state.selected ? 0 : -1;
    button.setAttribute("aria-controls", "mechanismInspector");
    button.setAttribute("aria-selected", String(mechanism.id === state.selected));
    button.append(el("span", "", mechanism.index), icon(mechanism.icon), el("strong", "", mechanism.title));
    button.addEventListener("click", () => selectMechanism(mechanism.id, true));
    button.addEventListener("keydown", (event) => moveMechanismFocus(event, mechanism.id));
    return button;
  }

  function moveMechanismFocus(event, currentId) {
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const mechanisms = state.data.mechanisms;
    const currentIndex = mechanisms.findIndex((item) => item.id === currentId);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = mechanisms.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (currentIndex + 1) % mechanisms.length;
    else nextIndex = (currentIndex - 1 + mechanisms.length) % mechanisms.length;
    const next = mechanisms[nextIndex];
    selectMechanism(next.id, true);
    document.getElementById("mechanism-tab-" + next.id)?.focus();
  }

  function renderMechanismList() {
    $("mechanismList").replaceChildren(...state.data.mechanisms.map(mechanismButton));
  }

  function selectMechanism(id, updateUrl = false) {
    const mechanism = core.mechanismById(state.data, id);
    if (!mechanism) return;
    state.selected = mechanism.id;
    document.querySelectorAll("[data-mechanism]").forEach((button) => {
      const selected = button.dataset.mechanism === mechanism.id;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $("mechanismInspector").setAttribute("aria-labelledby", "mechanism-tab-" + mechanism.id);
    $("mechanismMeta").textContent = mechanism.index + " · " + mechanism.layer + " · " + attributionText(mechanism);
    $("mechanismName").textContent = mechanism.title;
    $("mechanismConfidence").textContent = "置信度 " + mechanism.confidence;
    $("mechanismQuestion").textContent = mechanism.question;
    $("mechanismVerdict").textContent = mechanism.verdict;
    $("mechanismFlow").style.setProperty("--flow-columns", String(Math.min(mechanism.steps.length, 6)));
    $("mechanismFlow").replaceChildren(...mechanism.steps.map((step, index) => {
      const item = el("li");
      item.append(el("span", "", String(index + 1).padStart(2, "0")), el("strong", "", step));
      return item;
    }));
    fillList("mechanismFacts", mechanism.facts);
    fillList("mechanismBoundaries", mechanism.boundaries);
    fillList("mechanismUnknowns", mechanism.unknowns);
    const evidenceMap = core.evidenceById(state.data);
    $("mechanismEvidence").replaceChildren(...mechanism.evidence.map((idValue) => {
      const evidence = evidenceMap.get(idValue);
      const link = externalLink(evidence?.url, "", idValue);
      link.title = evidence?.statement || idValue;
      return link;
    }));
    if (updateUrl) {
      const url = new URL(location.href);
      url.hash = mechanism.id;
      history.replaceState(null, "", url);
    }
    refreshIcons();
  }

  function renderProviders() {
    $("providerRows").replaceChildren(...state.data.providers.map((provider) => {
      const row = el("tr");
      row.dataset.tone = provider.tone;
      const identity = el("td");
      identity.append(el("strong", "", provider.label), el("span", "", provider.origin));
      const auth = el("td");
      auth.append(el("span", "", provider.auth), el("small", "", provider.continuity));
      [identity, el("td", "", provider.path), el("td", "", provider.context), el("td", "", provider.tools), auth].forEach((cell) => row.append(cell));
      return row;
    }));
  }

  function renderXSignals() {
    $("xSignalGrid").replaceChildren(...state.data.xSignals.map((signal) => {
      const link = externalLink(signal.url, "grok-x-card", "");
      link.dataset.kind = signal.claimKind;
      const meta = el("div", "grok-x-meta");
      const labels = el("div");
      labels.append(el("span", "", core.xClaimLabel(signal.claimKind)), el("span", "grok-attribution", attributionText(signal)));
      meta.append(labels, el("time", "", signal.publishedAt));
      const author = el("div", "grok-x-author");
      author.append(el("strong", "", signal.author), el("span", "", signal.handle), icon("arrow-up-right"));
      const boundary = el("small", "", signal.boundary);
      boundary.prepend(el("b", "", "边界 "));
      link.append(meta, author, el("h3", "", signal.title), el("p", "", signal.summary), boundary);
      return link;
    }));
  }

  function renderRisks() {
    $("riskList").replaceChildren(...state.data.risks.map((risk) => {
      const item = el("article", "grok-risk");
      item.dataset.severity = risk.severity;
      item.append(el("span", "", risk.id), el("strong", "", risk.title), el("p", "", risk.summary));
      return item;
    }));
  }

  function renderVerification() {
    const verification = state.data.verification;
    $("verificationEnvironment").textContent = verification.environment;
    $("verificationBoundary").textContent = verification.boundary;
    $("verificationReceipt").href = safeHref(verification.receipt.url) || "#";
    $("verificationReceipt").title = verification.receipt.sha256;
    $("verificationReceipt").querySelector("span").textContent = verification.receipt.label;
    $("verificationGrid").replaceChildren(...verification.checks.map((check) => {
      const item = el("article", "grok-verification-item");
      item.dataset.tone = check.tone;
      const header = el("header");
      header.append(icon(check.tone === "pass" ? "circle-check-big" : check.tone === "blocked" ? "circle-slash-2" : "triangle-alert"), el("strong", "", check.label));
      item.append(header, el("code", "", check.command), el("p", "", check.result));
      return item;
    }));
  }

  function setFilterOptions(id, values, labels) {
    const select = $(id);
    const current = select.value;
    const all = el("option", "", "全部");
    all.value = "all";
    const options = [...values].sort((left, right) => left.localeCompare(right, "zh-CN")).map((value) => {
      const option = el("option", "", labels?.[value] || value);
      option.value = value;
      return option;
    });
    select.replaceChildren(all, ...options);
    select.value = options.some((option) => option.value === current) ? current : "all";
  }

  function renderEvidence() {
    const items = core.filterEvidence(state.data, {
      query: state.evidenceQuery,
      layer: state.evidenceLayer,
      kind: state.evidenceKind,
    });
    $("evidenceCount").textContent = items.length + " / " + state.data.evidence.length + " 条证据";
    $("resetEvidenceFilters").disabled = !state.evidenceQuery && state.evidenceLayer === "all" && state.evidenceKind === "all";
    if (!items.length) {
      const empty = el("div", "grok-evidence-empty");
      empty.append(el("strong", "", "没有匹配证据"), el("p", "", "调整搜索词或归层筛选。"));
      $("evidenceGrid").replaceChildren(empty);
      return;
    }
    $("evidenceGrid").replaceChildren(...items.map((item) => {
      const link = externalLink(item.url, "grok-evidence-item", "");
      const meta = el("div");
      meta.append(
        el("strong", "", item.id),
        el("span", "", kindLabels[item.kind] || item.kind),
        el("span", "", item.layer),
        el("span", "grok-attribution", attributionText(item))
      );
      link.append(meta, el("p", "", item.statement), el("code", "", item.locator), icon("arrow-up-right"));
      return link;
    }));
    refreshIcons();
  }

  function bindEvidenceControls() {
    setFilterOptions("evidenceLayerFilter", new Set(state.data.evidence.map((item) => item.layer)));
    setFilterOptions("evidenceKindFilter", new Set(state.data.evidence.map((item) => item.kind)), kindLabels);
    $("evidenceSearch").addEventListener("input", (event) => {
      state.evidenceQuery = event.target.value.trim();
      renderEvidence();
    });
    $("evidenceLayerFilter").addEventListener("change", (event) => {
      state.evidenceLayer = event.target.value;
      renderEvidence();
    });
    $("evidenceKindFilter").addEventListener("change", (event) => {
      state.evidenceKind = event.target.value;
      renderEvidence();
    });
    $("resetEvidenceFilters").addEventListener("click", () => {
      state.evidenceQuery = "";
      state.evidenceLayer = "all";
      state.evidenceKind = "all";
      $("evidenceSearch").value = "";
      $("evidenceLayerFilter").value = "all";
      $("evidenceKindFilter").value = "all";
      renderEvidence();
      $("evidenceSearch").focus();
    });
  }

  function render() {
    renderHeader();
    renderLayers();
    renderMechanismList();
    renderProviders();
    renderXSignals();
    renderRisks();
    renderVerification();
    bindEvidenceControls();
    renderEvidence();
    const requested = location.hash.slice(1);
    selectMechanism(core.mechanismById(state.data, requested)?.id || state.data.mechanisms[0].id);
    $("grokStatus").hidden = true;
    $("grokRadar").setAttribute("aria-busy", "false");
    refreshIcons();
  }

  async function start() {
    try {
      if (!core) throw new Error("页面核心模块未加载");
      const response = await fetch("/dossiers/grok-bot-reconstruction.json", { cache: "no-store" });
      if (!response.ok) throw new Error("研究数据读取失败（" + response.status + "）");
      state.data = await response.json();
      const errors = core.validateDossier(state.data);
      if (errors.length) throw new Error(errors.join("；"));
      render();
    } catch (error) {
      $("grokStatus").classList.add("is-error");
      $("grokStatus").replaceChildren(icon("circle-alert"), el("span", "", error instanceof Error ? error.message : "研究数据读取失败"));
      $("grokRadar").setAttribute("aria-busy", "false");
      refreshIcons();
    }
  }

  start();
})();
