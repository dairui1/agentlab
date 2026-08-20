(function initAgentHistory() {
  "use strict";

  const monacoHelpers = window.PromptHistoryMonacoView;
  const diffCore = window.PromptHistoryCore;
  const appCore = window.AgentHistoryCore;
  if (!appCore) throw new Error("Agent history helpers failed to load");
  const FEED_PAGE_SIZE = 48;

  const state = {
    manifest: null,
    mode: "intelligence",
    agent: null,
    history: null,
    changelog: null,
    changelogError: null,
    intelligenceDatasets: [],
    intelligenceErrors: [],
    feedAgents: [],
    feedSignals: [],
    feedImportance: "all",
    feedLimit: FEED_PAGE_SIZE,
    feedLoadPending: false,
    openFeedFilter: null,
    feedScrollY: 0,
    feedReturnTarget: null,
    comparisonFromFeed: false,
    left: null,
    right: null,
    section: null,
    view: "request",
    wrap: true,
    releaseDetailsOpen: false,
    analysisExpanded: false,
    loadRequest: 0,
    compareRequest: 0,
    monacoPromise: null,
    editor: null,
    models: null,
    diffListener: null,
    sectionDecorations: [],
    historyCache: new Map(),
    changelogCache: new Map(),
    darkScheme: window.matchMedia("(prefers-color-scheme: dark)"),
  };

  const activePromptUrls = () => {
    if (!state.history) return [];
    return [state.left, state.right]
      .map((version) => versionEntry(version)?.promptUrl)
      .filter(Boolean)
      .map((url) => staticAssetUrl(url, "实际请求"));
  };

  state.promptCache = monacoHelpers?.createAsyncTextLru
    ? monacoHelpers.createAsyncTextLru(8, activePromptUrls)
    : createTextCache(8, activePromptUrls);

  const elements = {
    intelligenceModeButton: document.getElementById("intelligenceModeButton"),
    compareModeButton: document.getElementById("compareModeButton"),
    intelligenceView: document.getElementById("intelligenceView"),
    compareView: document.getElementById("compareView"),
    backToFeed: document.getElementById("backToFeed"),
    dataHealth: document.getElementById("dataHealth"),
    feedFilterControls: document.getElementById("feedFilterControls"),
    feedAgentFilter: document.getElementById("feedAgentFilter"),
    feedAgentFilterPanel: document.getElementById("feedAgentFilterPanel"),
    feedAgentFilterSummary: document.getElementById("feedAgentFilterSummary"),
    feedAgentFilterCount: document.getElementById("feedAgentFilterCount"),
    feedAgentFilterSearch: document.getElementById("feedAgentFilterSearch"),
    feedAgentFilterOptions: document.getElementById("feedAgentFilterOptions"),
    feedAgentFilterEmpty: document.getElementById("feedAgentFilterEmpty"),
    feedSignalFilter: document.getElementById("feedSignalFilter"),
    feedSignalFilterPanel: document.getElementById("feedSignalFilterPanel"),
    feedSignalFilterSummary: document.getElementById("feedSignalFilterSummary"),
    feedSignalFilterCount: document.getElementById("feedSignalFilterCount"),
    feedSignalFilterOptions: document.getElementById("feedSignalFilterOptions"),
    feedImportanceToggle: document.getElementById("feedImportanceToggle"),
    resetFeedFilters: document.getElementById("resetFeedFilters"),
    feedResultCount: document.getElementById("feedResultCount"),
    intelligenceFeed: document.getElementById("intelligenceFeed"),
    agentSwitch: document.getElementById("agentSwitch"),
    sourceLink: document.getElementById("sourceLink"),
    pageStatus: document.getElementById("pageStatus"),
    agentName: document.getElementById("agentName"),
    sourceMeta: document.getElementById("sourceMeta"),
    leftVersion: document.getElementById("leftVersion"),
    rightVersion: document.getElementById("rightVersion"),
    swapVersions: document.getElementById("swapVersions"),
    hunkCount: document.getElementById("hunkCount"),
    additionCount: document.getElementById("additionCount"),
    deletionCount: document.getElementById("deletionCount"),
    changelogBand: document.getElementById("changelogBand"),
    analysisCondenseToggle: document.getElementById("analysisCondenseToggle"),
    changelogTitle: document.getElementById("changelogTitle"),
    changelogRange: document.getElementById("changelogRange"),
    changelogSummary: document.getElementById("changelogSummary"),
    changelogHighlights: document.getElementById("changelogHighlights"),
    interpretationLabel: document.getElementById("interpretationLabel"),
    analysisEyebrow: document.getElementById("analysisEyebrow"),
    analysisStatus: document.getElementById("analysisStatus"),
    sourceLayerList: document.getElementById("sourceLayerList"),
    implicationsList: document.getElementById("implicationsList"),
    categoryList: document.getElementById("categoryList"),
    changeMetrics: document.getElementById("changeMetrics"),
    releaseDetailsToggle: document.getElementById("releaseDetailsToggle"),
    releaseDetails: document.getElementById("releaseDetails"),
    requestTab: document.getElementById("requestTab"),
    structureTab: document.getElementById("structureTab"),
    wrapToggle: document.getElementById("wrapToggle"),
    promptMeta: document.getElementById("promptMeta"),
    workspace: document.getElementById("workspace"),
    outlinePane: document.getElementById("outlinePane"),
    outlineVersion: document.getElementById("outlineVersion"),
    sectionCount: document.getElementById("sectionCount"),
    sectionSearch: document.getElementById("sectionSearch"),
    sectionList: document.getElementById("sectionList"),
    leftLegend: document.getElementById("leftLegend"),
    rightLegend: document.getElementById("rightLegend"),
    selectedSectionLabel: document.getElementById("selectedSectionLabel"),
    diffEditor: document.getElementById("diffEditor"),
    editorPlaceholder: document.getElementById("editorPlaceholder"),
  };

  const categoryLabels = {
    baseline: "基线",
    prompt: "Prompt",
    tools: "工具",
    release: "官方发布",
    code: "Code",
    "static-prompt": "Static Prompt",
    metadata: "元数据",
    "no-change": "无可见变化",
  };

  const analysisLabels = {
    complete: "分析完成",
    generated: "分析完成",
    reviewed: "已人工复核",
    pending: "等待分析",
    fallback: "规则摘要",
    error: "分析失败",
    failed: "分析失败",
    loading: "分析中",
  };

  const signalLabels = {
    prompt: "Prompt",
    tools: "Tools",
    ecosystem: "官方 / Code / Static",
  };

  const feedSignalOptions = Object.entries(signalLabels).map(([id, label]) => ({ id, label }));

  const agentIconUrls = {
    "claude-code": "/agent-icons/claude-code.png",
    codex: "/agent-icons/codex.png",
    antigravity: "/agent-icons/antigravity.png",
    grok: "/agent-icons/grok.png",
    "kimi-code": "/agent-icons/kimi-code.png",
    mimo: "/agent-icons/mimo.png",
    openclaw: "/agent-icons/openclaw.png",
    hermes: "/agent-icons/hermes.png",
    kimi: "/agent-icons/kimi.png",
    opencode: "/agent-icons/opencode.png",
    pi: "/agent-icons/pi.png",
    omp: "/agent-icons/omp.svg",
    "minimax-code": "/agent-icons/minimax-code.svg",
    goose: "/agent-icons/goose.svg",
    cline: "/agent-icons/cline.svg",
    "qwen-code": "/agent-icons/qwen-code.svg",
    reasonix: "/agent-icons/reasonix.svg",
    "deepseek-harness": "/agent-icons/deepseek-harness.svg",
  };

  const sourceLayerIcons = {
    official: "badge-check",
    code: "code-2",
    "runtime-prompt": "messages-square",
    "static-prompt": "files",
    tools: "wrench",
  };

  const importanceLabels = {
    high: "高价值",
    medium: "值得关注",
    low: "细节变化",
  };

  let feedLoadObserver = null;

  function refreshIcons() {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
    }
  }

  function createTextCache(limit, protectedKeys) {
    const values = new Map();
    const pending = new Map();
    return {
      load(key, loader) {
        if (values.has(key)) {
          const value = values.get(key);
          values.delete(key);
          values.set(key, value);
          return Promise.resolve(value);
        }
        if (pending.has(key)) return pending.get(key);
        const request = Promise.resolve()
          .then(loader)
          .then((value) => {
            pending.delete(key);
            values.set(key, value);
            const protectedSet = new Set(protectedKeys());
            while (values.size > limit) {
              const oldest = [...values.keys()].find((item) => !protectedSet.has(item));
              if (!oldest) break;
              values.delete(oldest);
            }
            return value;
          })
          .catch((error) => {
            pending.delete(key);
            throw error;
          });
        pending.set(key, request);
        return request;
      },
    };
  }

  function displayVersion(version) {
    if (!version) return "—";
    return String(version).startsWith("v") ? String(version) : `v${version}`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(Number.isFinite(value) ? value : 0);
  }

  function formatBytes(value) {
    if (!Number.isFinite(value) || value < 0) return "大小未知";
    if (value < 1024) return `${formatNumber(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatCaptured(value, includeTime = false) {
    if (!value) return "时间未知";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  }

  function shortDigest(value) {
    return typeof value === "string" && value.length > 10 ? `${value.slice(0, 10)}…` : value || "—";
  }

  function textValue(value, fallback = "暂无摘要。") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    for (const value of values.flat()) {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }

  function staticAssetUrl(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${label}缺少静态资源地址`);
    const clean = value.trim().replace(/^\.\//, "");
    const url = new URL(clean.startsWith("/") ? clean : `/${clean}`, window.location.origin);
    if (url.origin !== window.location.origin || url.protocol === "data:") {
      throw new Error(`${label}必须使用同源静态资源`);
    }
    return `${url.pathname}${url.search}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`数据加载失败 (${response.status})`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("数据格式无效");
    return payload;
  }

  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`实际请求加载失败 (${response.status})`);
    return response.text();
  }

  function cachedJson(cache, url) {
    if (!cache.has(url)) {
      const request = fetchJson(url).catch((error) => {
        cache.delete(url);
        throw error;
      });
      cache.set(url, request);
    }
    return cache.get(url);
  }

  function versionEntry(version) {
    return state.history?.versions?.find((entry) => entry.version === version) || null;
  }

  function versionIndex(version) {
    return state.history?.versions?.findIndex((entry) => entry.version === version) ?? -1;
  }

  function sourceUrlForAgent(agent) {
    if (typeof agent?.sourceUrl === "string" && agent.sourceUrl) return agent.sourceUrl;
    if (typeof state.manifest?.upstream === "string") return state.manifest.upstream;
    if (typeof state.manifest?.upstream?.url === "string") return state.manifest.upstream.url;
    return "https://phistory.cc/";
  }

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    const hasComparisonState = ["left", "right", "section", "view"].some((key) => params.has(key));
    return {
      mode: params.get("mode") === "compare" || hasComparisonState ? "compare" : "intelligence",
      agent: params.get("agent"),
      feedAgents: uniqueStrings(params.getAll("feedAgent")),
      feedSignals: uniqueStrings(params.getAll("signal"))
        .filter((signal) => feedSignalOptions.some((option) => option.id === signal)),
      feedImportance: params.get("priority") === "high" ? "high" : "all",
      left: params.get("left"),
      right: params.get("right"),
      section: params.get("section"),
      view: params.get("view") === "structure" ? "structure" : "request",
      wrap: params.get("wrap") !== "0",
    };
  }

  function replaceListParams(url, key, values) {
    url.searchParams.delete(key);
    values.forEach((value) => url.searchParams.append(key, value));
  }

  function applyFeedParams(url) {
    replaceListParams(url, "feedAgent", state.feedAgents);
    replaceListParams(url, "signal", state.feedSignals);
    if (state.feedImportance === "high") url.searchParams.set("priority", "high");
    else url.searchParams.delete("priority");
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    if (state.mode !== "compare") {
      ["mode", "agent", "left", "right", "view", "wrap", "section"].forEach((key) => (
        url.searchParams.delete(key)
      ));
      applyFeedParams(url);
      window.history.replaceState(window.history.state, "", url);
      return;
    }
    const values = {
      mode: "compare",
      agent: state.agent?.id,
      left: state.left,
      right: state.right,
      view: state.view,
      wrap: state.wrap ? "1" : "0",
      section: state.section,
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value == null || value === "") url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    });
    applyFeedParams(url);
    window.history.replaceState(window.history.state, "", url);
  }

  function setPageError(message) {
    elements.pageStatus.textContent = message;
    elements.pageStatus.hidden = !message;
  }

  function setEditorPlaceholder(message, kind = "loading", fallbackText = "") {
    elements.diffEditor.dataset.state = kind;
    elements.editorPlaceholder.dataset.kind = kind;
    const fragment = document.createDocumentFragment();
    if (kind === "loading") {
      const spinner = document.createElement("span");
      spinner.className = "loading-spinner";
      spinner.setAttribute("aria-hidden", "true");
      fragment.appendChild(spinner);
    }
    const text = document.createElement("p");
    text.textContent = message;
    fragment.appendChild(text);
    if (fallbackText) {
      const pre = document.createElement("pre");
      pre.textContent = fallbackText;
      fragment.appendChild(pre);
    }
    elements.editorPlaceholder.replaceChildren(fragment);
  }

  function upstreamUrl() {
    if (typeof state.manifest?.upstream === "string") return state.manifest.upstream;
    return state.manifest?.upstream?.url || "https://phistory.cc/";
  }

  function renderMode() {
    const comparing = state.mode === "compare";
    if (comparing) {
      if (state.openFeedFilter) setFeedFilterMenu(null);
      disconnectFeedLoadObserver();
    }
    elements.intelligenceView.hidden = comparing;
    elements.compareView.hidden = !comparing;
    elements.intelligenceModeButton.setAttribute("aria-pressed", String(!comparing));
    elements.compareModeButton.setAttribute("aria-pressed", String(comparing));
    if (!comparing) {
      elements.sourceLink.href = upstreamUrl();
      elements.sourceLink.title = "打开情报数据来源";
      elements.sourceLink.setAttribute("aria-label", "打开情报数据来源");
    } else if (state.agent) {
      elements.sourceLink.href = sourceUrlForAgent(state.agent);
    }
    document.title = comparing && state.agent
      ? `${state.agent.label} ${displayVersion(state.right)} · AgentLab`
      : "AgentLab · Agent 更新情报";
    if (!comparing) bindFeedLoadObserver();
  }

  function validateManifest(manifest) {
    if (!Array.isArray(manifest.agents) || !manifest.agents.length) {
      throw new Error("Agent 清单中没有可用数据源");
    }
    for (const agent of manifest.agents) {
      if (!agent?.id || !agent?.label || !agent?.historyUrl || !agent?.changelogUrl) {
        throw new Error("Agent 清单记录不完整");
      }
    }
    return manifest;
  }

  function validateHistory(payload, agent) {
    if (!Array.isArray(payload.versions) || !payload.versions.length) {
      throw new Error(`${agent.label} 暂无版本快照`);
    }
    for (const release of payload.versions) {
      if (!release?.version || !release?.promptUrl || !Array.isArray(release.sections)) {
        throw new Error(`${agent.label} 的历史数据不完整`);
      }
    }
    return payload;
  }

  function validateFeed(payload) {
    if (!Array.isArray(payload?.datasets)) throw new Error("情报索引格式无效");
    const agents = new Map(state.manifest.agents.map((agent) => [agent.id, agent]));
    const seen = new Set();
    const datasets = payload.datasets.map((dataset) => {
      const agent = agents.get(dataset?.agent);
      if (!agent || seen.has(agent.id)) throw new Error("情报索引包含未知或重复 Agent");
      if (!Array.isArray(dataset?.history?.versions) || !Array.isArray(dataset?.changelog?.entries)) {
        throw new Error(`${agent.label} 的情报索引不完整`);
      }
      if (dataset.history.versions.some((release) => !release?.version)) {
        throw new Error(`${agent.label} 的情报版本索引不完整`);
      }
      seen.add(agent.id);
      return { agent, history: dataset.history, changelog: dataset.changelog };
    });
    if (seen.size !== agents.size) throw new Error("情报索引未覆盖全部 Agent");
    return datasets;
  }

  function feedFilterDefinition(kind) {
    const agentFilter = kind === "agent";
    return {
      kind,
      values: agentFilter ? state.feedAgents : state.feedSignals,
      options: agentFilter ? state.manifest?.agents || [] : feedSignalOptions,
      trigger: agentFilter ? elements.feedAgentFilter : elements.feedSignalFilter,
      panel: agentFilter ? elements.feedAgentFilterPanel : elements.feedSignalFilterPanel,
      summary: agentFilter ? elements.feedAgentFilterSummary : elements.feedSignalFilterSummary,
      count: agentFilter ? elements.feedAgentFilterCount : elements.feedSignalFilterCount,
      optionsElement: agentFilter ? elements.feedAgentFilterOptions : elements.feedSignalFilterOptions,
      allLabel: agentFilter ? "全部 Agent" : "全部信号",
      ariaLabel: agentFilter ? "按 Agent 筛选" : "按信号类型筛选",
    };
  }

  function makeFeedFilterOption(kind, option) {
    const label = document.createElement("label");
    label.className = "feed-filter-option";
    label.dataset.feedFilterSearchValue = option.label.toLocaleLowerCase();

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = option.id;
    input.dataset.feedFilterOption = kind;

    const check = document.createElement("span");
    check.className = "feed-filter-check";
    check.setAttribute("aria-hidden", "true");
    const checkIcon = document.createElement("i");
    checkIcon.dataset.lucide = "check";
    check.appendChild(checkIcon);

    const copy = document.createElement("span");
    copy.className = "feed-filter-option-copy";
    if (kind === "agent") {
      const iconUrl = agentIconUrls[option.id];
      if (iconUrl) {
        const icon = document.createElement("span");
        icon.className = "feed-filter-agent-icon";
        icon.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.src = iconUrl;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        icon.appendChild(image);
        copy.appendChild(icon);
      } else {
        const dot = document.createElement("span");
        dot.className = "feed-filter-agent-dot";
        dot.dataset.tone = String(agentTone(option.id));
        dot.setAttribute("aria-hidden", "true");
        copy.appendChild(dot);
      }
    }
    const text = document.createElement("span");
    text.className = "feed-filter-option-label";
    text.textContent = option.label;
    copy.appendChild(text);
    label.append(input, check, copy);
    return label;
  }

  function renderFeedFilterOptions() {
    ["agent", "signal"].forEach((kind) => {
      const definition = feedFilterDefinition(kind);
      definition.optionsElement.replaceChildren(
        ...definition.options.map((option) => makeFeedFilterOption(kind, option)),
      );
    });
    refreshIcons();
  }

  function setFeedFilterMenu(kind, { focus = false, returnFocus = false } = {}) {
    const previous = state.openFeedFilter;
    state.openFeedFilter = kind;
    ["agent", "signal"].forEach((filterKind) => {
      const definition = feedFilterDefinition(filterKind);
      const open = filterKind === kind;
      definition.trigger.setAttribute("aria-expanded", String(open));
      definition.panel.hidden = !open;
      definition.trigger.closest("[data-feed-filter-picker]").dataset.open = String(open);
    });
    if (focus && kind) {
      window.requestAnimationFrame(() => {
        const definition = feedFilterDefinition(kind);
        const target = kind === "agent"
          ? elements.feedAgentFilterSearch
          : definition.optionsElement.querySelector("input[type='checkbox']");
        target?.focus();
      });
    } else if (returnFocus && previous) {
      feedFilterDefinition(previous).trigger.focus();
    }
  }

  function applyRequestedFeedFilters(requested) {
    const requestedAgents = new Set(requested.feedAgents || []);
    const requestedSignals = new Set(requested.feedSignals || []);
    state.feedAgents = state.manifest.agents
      .map((agent) => agent.id)
      .filter((agentId) => requestedAgents.has(agentId));
    state.feedSignals = feedSignalOptions
      .map((option) => option.id)
      .filter((signal) => requestedSignals.has(signal));
    state.feedImportance = requested.feedImportance || "all";
  }

  function renderFeedFilterControl(kind) {
    const definition = feedFilterDefinition(kind);
    const selected = new Set(definition.values);
    const selectedOptions = definition.options.filter((option) => selected.has(option.id));
    definition.optionsElement.querySelectorAll("[data-feed-filter-option]").forEach((input) => {
      input.checked = selected.has(input.value);
    });
    definition.summary.textContent = selectedOptions[0]?.label || definition.allLabel;
    definition.count.hidden = selectedOptions.length < 2;
    definition.count.textContent = selectedOptions.length > 1 ? `+${selectedOptions.length - 1}` : "";
    definition.trigger.dataset.active = String(selectedOptions.length > 0);
    const selectionLabel = selectedOptions.length
      ? selectedOptions.map((option) => option.label).join("、")
      : definition.allLabel;
    definition.trigger.setAttribute("aria-label", `${definition.ariaLabel}：${selectionLabel}`);
    definition.trigger.title = selectionLabel;
    const clearButton = definition.panel.querySelector("[data-feed-filter-clear]");
    if (clearButton) clearButton.disabled = selectedOptions.length === 0;
  }

  function renderFeedControls() {
    renderFeedFilterControl("agent");
    renderFeedFilterControl("signal");
    const highValueOnly = state.feedImportance === "high";
    elements.feedImportanceToggle.setAttribute("aria-pressed", String(highValueOnly));
    elements.feedImportanceToggle.title = highValueOnly ? "显示全部价值等级" : "只显示高价值情报";
    const hasFilters = state.feedAgents.length > 0 || state.feedSignals.length > 0 || highValueOnly;
    elements.resetFeedFilters.disabled = !hasFilters;
  }

  function agentTone(agentId) {
    return [...String(agentId)]
      .reduce((total, character) => total + character.codePointAt(0), 0) % 6;
  }

  function renderDataHealth() {
    const health = appCore.dataHealth(state.manifest, state.intelligenceDatasets);
    const loadedAgents = state.intelligenceDatasets.length;
    const hasErrors = state.intelligenceErrors.length > 0;
    const officialWarning = ["stale", "degraded", "not-synced"].includes(health.officialStatus);
    const sourceWarning = officialWarning || health.rejectedCaptures > 0;
    elements.dataHealth.dataset.state = hasErrors || sourceWarning
      ? "warning"
      : health.stale > 0 ? "pending" : "healthy";
    const indicator = document.createElement("span");
    indicator.className = "health-indicator";
    indicator.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = hasErrors
      ? `数据健康 · ${loadedAgents}/${state.manifest.agents.length} 个 Agent 可用`
      : `数据健康 · ${formatNumber(health.analyzed)}/${formatNumber(health.total)} 已处理`;
    const detail = document.createElement("span");
    const evidenceLabel = health.lastSync
      ? `同步于 ${formatCaptured(health.lastSync, true)}`
      : health.latestEvidence ? `最新证据 ${formatCaptured(health.latestEvidence, true)}` : "时间未知";
    const details = [evidenceLabel];
    if (health.stale > 0) details.push(`${formatNumber(health.stale)} 条等待分析`);
    if (health.officialStatus === "stale") details.push("官方来源使用已验证缓存");
    if (health.officialStatus === "degraded") details.push("官方来源状态异常");
    if (health.officialStatus === "not-synced") details.push("官方来源未同步");
    if (health.rejectedCaptures > 0) {
      details.push(`${formatNumber(health.rejectedCaptures)} 条上游快照已隔离`);
    }
    detail.textContent = details.join(" · ");
    copy.append(title, detail);
    elements.dataHealth.replaceChildren(indicator, copy);
  }

  function feedFactLabels(item) {
    const stats = item.entry.stats || {};
    const measured = [];
    const toolAdded = stats.toolsAdded?.length || 0;
    const toolRemoved = stats.toolsRemoved?.length || 0;
    const toolModified = stats.toolsModified?.length || 0;
    if (toolAdded) measured.push(`Tools +${toolAdded}`);
    if (toolRemoved) measured.push(`Tools -${toolRemoved}`);
    if (toolModified) measured.push(`Tools 调整 ${toolModified}`);
    const lineChanges = (Number(stats.additions) || 0) + (Number(stats.deletions) || 0);
    if (lineChanges) measured.push(`Prompt +${formatNumber(stats.additions)} / -${formatNumber(stats.deletions)}`);
    const staticLayer = item.entry.layers?.staticPrompt;
    const staticChanges = staticLayer?.changes;
    const staticCount = (Number(staticChanges?.addedCount) || 0)
      + (Number(staticChanges?.removedCount) || 0)
      + (Number(staticChanges?.modifiedCount) || 0);
    if (staticCount) measured.push(`Static Prompt ${formatNumber(staticCount)} 项`);
    const layers = appCore.normalizeSourceLayers(item.entry, item.release, item.previousRelease);
    const sources = [];
    if (layers.find((layer) => layer.id === "official")?.state === "changed") sources.push("官方发布说明");
    if (layers.find((layer) => layer.id === "code")?.state === "changed") sources.push("Code 变化");
    if (!measured.length && !sources.length && item.noChange) measured.push("核验无变化");
    return { measured: measured.slice(0, 4), sources: sources.slice(0, 2) };
  }

  function comparisonHref(item) {
    if (item.agent.id === "deepseek-harness") {
      const dedicated = new URL("/deepseek-harness.html", window.location.origin);
      dedicated.searchParams.set("version", item.entry.version);
      return dedicated.href;
    }
    const url = new URL(window.location.href);
    const values = {
      mode: "compare",
      agent: item.agent.id,
      left: item.entry.previousVersion || item.entry.version,
      right: item.entry.version,
      view: "request",
      wrap: state.wrap ? "1" : "0",
    };
    Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.delete("section");
    applyFeedParams(url);
    return url.href;
  }

  function makeFeedItem(item) {
    const article = document.createElement("article");
    const importance = item.importance;
    article.className = "intelligence-item";
    article.dataset.importance = importance;

    const link = document.createElement("a");
    link.className = "intelligence-item-button";
    link.href = comparisonHref(item);
    link.dataset.intelligenceAgent = item.agent.id;
    link.dataset.intelligenceVersion = item.entry.version;
    link.setAttribute("aria-label", `查看 ${item.agent.label} ${displayVersion(item.entry.version)} 的证据与版本比较`);

    const rail = document.createElement("span");
    rail.className = "intelligence-rail";
    rail.setAttribute("aria-hidden", "true");

    const content = document.createElement("span");
    content.className = "intelligence-content";
    const meta = document.createElement("span");
    meta.className = "intelligence-meta";
    const agent = document.createElement("strong");
    agent.className = "agent-badge";
    agent.dataset.tone = String(agentTone(item.agent.id));
    agent.textContent = item.agent.label;
    const version = document.createElement("span");
    version.className = "feed-version";
    version.textContent = displayVersion(item.entry.version);
    const date = document.createElement("time");
    date.dateTime = item.capturedAt || "";
    date.textContent = formatCaptured(item.capturedAt);
    const priority = document.createElement("span");
    priority.className = "importance-badge";
    priority.dataset.importance = importance;
    priority.textContent = importanceLabels[importance];
    meta.append(agent, version, date, priority);

    const title = document.createElement("span");
    title.className = "intelligence-title";
    title.textContent = textValue(item.entry.title, `${item.agent.label} ${displayVersion(item.entry.version)} 更新`);
    const summary = document.createElement("span");
    summary.className = "intelligence-summary";
    summary.textContent = textValue(item.entry.summary);

    const footer = document.createElement("span");
    footer.className = "intelligence-footer";
    const facts = document.createElement("span");
    facts.className = "feed-facts";
    const factGroups = feedFactLabels(item);
    factGroups.measured.forEach((label) => {
      const fact = document.createElement("span");
      fact.className = "feed-fact-measured";
      fact.title = "证据统计：来自请求快照的可量化差异";
      fact.textContent = label;
      facts.appendChild(fact);
    });
    factGroups.sources.forEach((label) => {
      const fact = document.createElement("span");
      fact.className = "feed-fact-source";
      fact.title = "证据来源：该来源在本版本有可追溯变化";
      fact.textContent = label;
      facts.appendChild(fact);
    });
    const analysisKind = document.createElement("span");
    analysisKind.className = "feed-analysis-kind";
    const isAnalyzed = ["complete", "generated", "reviewed"].includes(String(item.entry.analysisStatus).toLowerCase());
    analysisKind.textContent = isAnalyzed ? "本地 Codex 解读" : "规则摘要";
    const action = document.createElement("span");
    action.className = "feed-open-label";
    const actionIcon = document.createElement("i");
    actionIcon.dataset.lucide = "arrow-right";
    actionIcon.setAttribute("aria-hidden", "true");
    action.append("查看证据", actionIcon);
    footer.append(facts, analysisKind, action);
    content.append(meta, title, summary, footer);
    link.append(rail, content);
    article.appendChild(link);
    return article;
  }

  function disconnectFeedLoadObserver() {
    feedLoadObserver?.disconnect();
    feedLoadObserver = null;
  }

  function loadNextFeedPage({ focusFirstNewItem = false } = {}) {
    if (state.feedLoadPending) return;
    const sentinel = elements.intelligenceFeed.querySelector("[data-feed-load-more-sentinel]");
    if (!sentinel) return;
    const previousCount = elements.intelligenceFeed.querySelectorAll("[data-intelligence-agent]").length;
    state.feedLoadPending = true;
    disconnectFeedLoadObserver();
    try {
      state.feedLimit += FEED_PAGE_SIZE;
      renderIntelligenceFeed();
    } finally {
      state.feedLoadPending = false;
    }
    if (!focusFirstNewItem) return;
    window.requestAnimationFrame(() => {
      elements.intelligenceFeed.querySelectorAll("[data-intelligence-agent]")[previousCount]
        ?.focus({ preventScroll: true });
    });
  }

  function bindFeedLoadObserver() {
    disconnectFeedLoadObserver();
    if (state.mode !== "intelligence" || !("IntersectionObserver" in window)) return;
    const sentinel = elements.intelligenceFeed.querySelector("[data-feed-load-more-sentinel]");
    if (!sentinel) return;
    feedLoadObserver = new window.IntersectionObserver((entries, observer) => {
      const visibleEntry = entries.find((entry) => entry.isIntersecting);
      if (!visibleEntry || !visibleEntry.target.isConnected) return;
      observer.unobserve(visibleEntry.target);
      loadNextFeedPage();
    }, {
      root: null,
      rootMargin: "700px 0px",
      threshold: 0,
    });
    feedLoadObserver.observe(sentinel);
  }

  function renderIntelligenceFeed() {
    renderFeedControls();
    const options = {
      agent: state.feedAgents,
      signal: state.feedSignals,
      importance: state.feedImportance,
      limit: Number.MAX_SAFE_INTEGER,
    };
    const matchingItems = appCore.buildIntelligenceItems(state.intelligenceDatasets, options);
    const items = matchingItems.slice(0, state.feedLimit);
    const highValueOnly = state.feedImportance === "high";
    const visibleCount = formatNumber(items.length);
    const totalCount = formatNumber(matchingItems.length);
    elements.feedResultCount.textContent = items.length < matchingItems.length
      ? `已加载 ${visibleCount} 条 · 共 ${totalCount} 条`
      : `共 ${totalCount} 条${highValueOnly ? "高价值" : "情报"}`;
    elements.feedResultCount.setAttribute(
      "aria-label",
      `显示 ${visibleCount} 条，共 ${totalCount} 条${highValueOnly ? "高价值情报" : "情报"}`,
    );
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "feed-empty";
      const title = document.createElement("strong");
      title.textContent = state.intelligenceDatasets.length
        ? highValueOnly ? "当前组合没有高价值情报" : "当前筛选没有有效变化"
        : "情报数据暂不可用";
      const summary = document.createElement("p");
      summary.textContent = state.intelligenceDatasets.length
        ? highValueOnly
          ? "可调整 Agent、信号，或关闭高价值筛选。"
          : "可调整 Agent 或信号筛选查看其他更新。"
        : "请稍后重试；版本比较仍可从顶部入口打开。";
      empty.append(title, summary);
      elements.intelligenceFeed.replaceChildren(empty);
      disconnectFeedLoadObserver();
      return;
    }
    // 排序键与展示键必须一致：上游按 UTC 日期排序，展示用本地日期，
    // 跨时区会拆出重复的日期组，因此按本地日期标签稳定重排后再分组。
    const feedDayLabel = (item) => {
      const date = new Date(item.capturedAt || "");
      return Number.isNaN(date.getTime()) ? "" : formatCaptured(item.capturedAt);
    };
    const orderedItems = [...items].sort((left, right) => (
      feedDayLabel(right).localeCompare(feedDayLabel(left))
    ));
    const nodes = [];
    let currentDay = null;
    orderedItems.forEach((item) => {
      const dayLabel = feedDayLabel(item) || "时间未知";
      if (dayLabel !== currentDay) {
        currentDay = dayLabel;
        const divider = document.createElement("h2");
        divider.className = "feed-date-divider";
        divider.textContent = dayLabel;
        nodes.push(divider);
      }
      nodes.push(makeFeedItem(item));
    });
    if (items.length < matchingItems.length) {
      const more = document.createElement("div");
      more.className = "feed-load-more";
      more.dataset.feedLoadMoreSentinel = "true";
      const remaining = Math.min(FEED_PAGE_SIZE, matchingItems.length - items.length);
      if ("IntersectionObserver" in window) {
        const status = document.createElement("div");
        status.className = "feed-load-more-status";
        status.setAttribute("aria-hidden", "true");
        const spinner = document.createElement("span");
        spinner.className = "loading-spinner";
        spinner.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = `正在载入更早的 ${formatNumber(remaining)} 条`;
        status.append(spinner, label);
        more.appendChild(status);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.feedLoadMore = "true";
        const icon = document.createElement("i");
        icon.dataset.lucide = "chevron-down";
        icon.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = `加载更早的 ${formatNumber(remaining)} 条`;
        button.append(icon, label);
        more.appendChild(button);
      }
      nodes.push(more);
    }
    elements.intelligenceFeed.replaceChildren(...nodes);
    refreshIcons();
    bindFeedLoadObserver();
  }

  async function loadIntelligence() {
    let feedError = null;
    if (state.manifest.feedUrl) {
      try {
        const feedUrl = staticAssetUrl(state.manifest.feedUrl, "情报索引");
        state.intelligenceDatasets = validateFeed(await fetchJson(feedUrl));
        state.intelligenceErrors = [];
        renderDataHealth();
        renderIntelligenceFeed();
        return;
      } catch (error) {
        feedError = error;
      }
    }
    const results = await Promise.allSettled(state.manifest.agents.map(async (agent) => {
      const historyUrl = staticAssetUrl(agent.historyUrl, "历史清单");
      const changelogUrl = staticAssetUrl(agent.changelogUrl, "变更解读");
      const [history, changelog] = await Promise.all([
        cachedJson(state.historyCache, historyUrl),
        cachedJson(state.changelogCache, changelogUrl),
      ]);
      return {
        agent,
        history: validateHistory(history, agent),
        changelog: Array.isArray(changelog?.entries) ? changelog : { entries: [] },
      };
    }));
    state.intelligenceDatasets = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    state.intelligenceErrors = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (feedError) state.intelligenceErrors.push(feedError);
    renderDataHealth();
    renderIntelligenceFeed();
  }

  function renderAgentSwitch() {
    const fragment = document.createDocumentFragment();
    state.manifest.agents.forEach((agent) => {
      const option = document.createElement("option");
      option.value = agent.id;
      option.textContent = agent.label;
      fragment.appendChild(option);
    });
    elements.agentSwitch.replaceChildren(fragment);
    elements.agentSwitch.value = state.agent?.id || "";
    elements.agentSwitch.title = state.agent?.description || "";
  }

  function renderAgentContext() {
    const agent = state.agent;
    if (!agent) return;
    const releaseCount = Number.isFinite(agent.releaseCount)
      ? agent.releaseCount
      : state.history?.versions?.length || 0;
    const latestVersion = agent.latestVersion || state.history?.versions?.at(-1)?.version;
    elements.agentName.textContent = agent.label;
    elements.agentName.title = agent.description || agent.label;
    elements.sourceMeta.textContent = `${formatNumber(releaseCount)} 份快照 · 最新 ${displayVersion(latestVersion)}`;
    elements.sourceMeta.title = agent.description || "";
    elements.sourceLink.href = sourceUrlForAgent(agent);
    elements.sourceLink.title = `打开 ${agent.label} 上游来源`;
    elements.sourceLink.setAttribute("aria-label", `打开 ${agent.label} 上游来源`);
    renderAgentSwitch();
  }

  function populateVersionSelect(select) {
    const fragment = document.createDocumentFragment();
    [...state.history.versions].reverse().forEach((release) => {
      const option = document.createElement("option");
      option.value = release.version;
      option.textContent = `${displayVersion(release.version)} · ${formatCaptured(release.capturedAt)}`;
      fragment.appendChild(option);
    });
    select.replaceChildren(fragment);
  }

  function chooseVersions(requested = {}) {
    const versions = state.history.versions.map((entry) => entry.version);
    const latest = versions.at(-1);
    const previous = versions.at(-2) || latest;
    state.left = versions.includes(requested.left) ? requested.left : previous;
    state.right = versions.includes(requested.right) ? requested.right : latest;
    state.view = requested.view === "structure" ? "structure" : "request";
    state.wrap = requested.wrap !== false;
    state.section = appCore.resolveOutlineKey(currentOutlineItems(), requested.section);
  }

  async function selectAgent(agentId, requested = {}) {
    const request = ++state.loadRequest;
    const agent = state.manifest.agents.find((item) => item.id === agentId)
      || state.manifest.agents.find((item) => item.id === state.manifest.defaultAgent)
      || state.manifest.agents[0];

    state.agent = agent;
    state.history = null;
    state.changelog = null;
    state.changelogError = null;
    state.releaseDetailsOpen = false;
    state.analysisExpanded = false;
    renderAgentContext();
    setPageError("");
    setEditorPlaceholder(`正在读取 ${agent.label} 历史`, "loading");
    elements.leftVersion.disabled = true;
    elements.rightVersion.disabled = true;
    elements.swapVersions.disabled = true;

    const historyUrl = staticAssetUrl(agent.historyUrl, "历史清单");
    const changelogUrl = staticAssetUrl(agent.changelogUrl, "变更解读");
    const [historyResult, changelogResult] = await Promise.allSettled([
      cachedJson(state.historyCache, historyUrl),
      cachedJson(state.changelogCache, changelogUrl),
    ]);
    if (request !== state.loadRequest) return;
    if (historyResult.status === "rejected") throw historyResult.reason;

    state.history = validateHistory(historyResult.value, agent);
    if (changelogResult.status === "fulfilled" && Array.isArray(changelogResult.value.entries)) {
      state.changelog = changelogResult.value;
    } else {
      state.changelog = { entries: [] };
      state.changelogError = changelogResult.status === "rejected"
        ? changelogResult.reason
        : new Error("变更解读数据格式无效");
    }

    chooseVersions(requested);
    populateVersionSelect(elements.leftVersion);
    populateVersionSelect(elements.rightVersion);
    elements.leftVersion.disabled = false;
    elements.rightVersion.disabled = false;
    elements.swapVersions.disabled = false;
    renderAgentContext();
    syncControls();
    syncUrl();
    await renderComparison();
    renderMode();
  }

  function selectedChangelogEntries() {
    if (!state.history || !state.changelog) return [];
    return appCore.selectRangeEntries(
      state.history.versions,
      state.changelog.entries,
      state.left,
      state.right,
    );
  }

  function isReverseComparison() {
    return versionIndex(state.left) > versionIndex(state.right);
  }

  function combinedStats(entries) {
    return appCore.combineEntryStats(entries, isReverseComparison());
  }

  function normalizedAnalysisStatus(entries) {
    if (state.changelogError) return "error";
    const statuses = entries.map((entry) => String(entry.analysisStatus || "complete").toLowerCase());
    if (statuses.some((status) => status === "pending")) return "pending";
    if (statuses.some((status) => status === "fallback")) return "fallback";
    if (statuses.some((status) => status === "error" || status === "failed")) return "error";
    if (statuses.every((status) => status === "reviewed")) return "reviewed";
    return "complete";
  }

  function makeMetric(label, value, className = "", title = "") {
    const metric = document.createElement("span");
    metric.className = `metric ${className}`.trim();
    if (title) metric.title = title;
    const number = document.createElement("strong");
    number.textContent = formatNumber(value);
    const copy = document.createElement("span");
    copy.textContent = label;
    metric.append(number, copy);
    return metric;
  }

  function safeEvidenceUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function renderSourceLayers(entries) {
    if (!entries.length) {
      elements.sourceLayerList.replaceChildren();
      return;
    }
    const latest = entries.at(-1);
    const release = versionEntry(latest.version);
    const previousRelease = versionEntry(latest.previousVersion) || versionEntry(state.left);
    const aggregate = { ...latest, stats: combinedStats(entries) };
    const layers = appCore.normalizeSourceLayers(aggregate, release, previousRelease);
    const nodes = layers.map((layer) => {
      const href = safeEvidenceUrl(layer.url);
      const node = document.createElement(href ? "a" : "span");
      node.className = "source-layer";
      node.dataset.state = layer.state;
      if (href) {
        node.href = href;
        node.target = "_blank";
        node.rel = "noreferrer";
      }
      const iconBox = document.createElement("span");
      iconBox.className = "source-layer-icon";
      const icon = document.createElement("i");
      icon.dataset.lucide = sourceLayerIcons[layer.id] || "circle";
      icon.setAttribute("aria-hidden", "true");
      iconBox.appendChild(icon);
      const copy = document.createElement("span");
      copy.className = "source-layer-copy";
      const label = document.createElement("strong");
      label.textContent = layer.label;
      const status = document.createElement("span");
      status.textContent = layer.status;
      copy.append(label, status);
      node.append(iconBox, copy);
      if (href) {
        const linkIcon = document.createElement("i");
        linkIcon.className = "source-layer-link";
        linkIcon.dataset.lucide = "arrow-up-right";
        linkIcon.setAttribute("aria-hidden", "true");
        node.appendChild(linkIcon);
      }
      return node;
    });
    elements.sourceLayerList.replaceChildren(...nodes);
  }

  function renderImplications(entries) {
    if (!entries.length) {
      elements.implicationsList.replaceChildren();
      return;
    }
    const implications = appCore.deriveImplications(entries);
    elements.implicationsList.replaceChildren(...implications.map((implication) => {
      const item = document.createElement("li");
      const basis = document.createElement("span");
      basis.textContent = implication.basis;
      const text = document.createElement("p");
      text.textContent = implication.text;
      item.append(basis, text);
      return item;
    }));
  }

  function renderInterpretationProvenance(status, entries = []) {
    const deterministic = entries.length > 0 && entries.every((entry) => (
      String(entry?.generator?.model || entry?.model || "").toLowerCase() === "deterministic-no-change"
    ));
    if (deterministic) {
      elements.analysisEyebrow.querySelector("span").textContent = "本地规则摘要";
      elements.interpretationLabel.dataset.kind = "rule";
      elements.interpretationLabel.textContent = "规则事实摘要，未调用 Codex";
      return;
    }
    if (["complete", "generated", "reviewed"].includes(status)) {
      elements.analysisEyebrow.querySelector("span").textContent = "本地 Codex 推断";
      elements.interpretationLabel.dataset.kind = "inference";
      elements.interpretationLabel.textContent = "本地 Codex 推断，不等同于上游声明";
      return;
    }
    elements.analysisEyebrow.querySelector("span").textContent = status === "error" ? "解读不可用" : "规则摘要";
    elements.interpretationLabel.dataset.kind = status === "error" ? "error" : "rule";
    elements.interpretationLabel.textContent = status === "error"
      ? "解读不可用，仅保留事实证据"
      : "规则事实摘要，等待 Codex 深度分析";
  }

  function renderReleaseDetails(entries) {
    const fragment = document.createDocumentFragment();
    [...entries].reverse().forEach((entry) => {
      const row = document.createElement("article");
      row.className = "release-detail";
      const version = document.createElement("span");
      version.className = "release-detail-version";
      version.textContent = displayVersion(entry.version);
      const title = document.createElement("strong");
      title.textContent = textValue(entry.title, "版本变化");
      const summary = document.createElement("p");
      summary.textContent = textValue(entry.summary);
      row.append(version, title, summary);
      fragment.appendChild(row);
    });
    elements.releaseDetails.replaceChildren(fragment);
    elements.releaseDetails.hidden = !state.releaseDetailsOpen;
    elements.releaseDetailsToggle.setAttribute("aria-expanded", String(state.releaseDetailsOpen));
  }

  function entriesDeclareNoBehaviorChange(entries) {
    return entries.length > 0 && entries.every((entry) => (entry.categories || [])
      .some((category) => /^(no-change|无行为变化|无可见变化)$/i.test(String(category).trim())));
  }

  function renderAnalysisCondensed(condensed) {
    elements.changelogBand.dataset.condensed = String(condensed);
    elements.changelogBand.dataset.expanded = String(state.analysisExpanded);
    elements.analysisCondenseToggle.hidden = !condensed;
    elements.analysisCondenseToggle.setAttribute("aria-expanded", String(state.analysisExpanded));
    elements.analysisCondenseToggle.querySelector("span").textContent = state.analysisExpanded
      ? "收起完整分析与证据"
      : "展开完整分析与证据";
  }

  function renderChangelog() {
    const entries = selectedChangelogEntries();
    const reverse = isReverseComparison();
    const rangeText = `${displayVersion(state.left)} → ${displayVersion(state.right)}`;
    elements.changelogRange.textContent = reverse ? `${rangeText} · 反向` : rangeText;
    renderAnalysisCondensed(entriesDeclareNoBehaviorChange(entries));

    if (!entries.length) {
      const status = state.changelogError ? "error" : state.left === state.right ? "complete" : "pending";
      elements.analysisStatus.dataset.status = status;
      elements.analysisStatus.textContent = state.changelogError ? "解读不可用" : analysisLabels[status];
      renderInterpretationProvenance(status);
      elements.changelogTitle.textContent = state.left === state.right ? "当前选择为同一版本" : "该区间暂无变更解读";
      elements.changelogSummary.textContent = state.changelogError
        ? `实际请求仍可比较；中文解读加载失败：${state.changelogError.message}`
        : state.left === state.right
          ? "请选择两个不同版本查看请求与 Tool Definition 的变化。"
          : "所选版本区间尚未生成本地 Codex 分析。";
      elements.changelogHighlights.replaceChildren();
      elements.changelogHighlights.hidden = true;
      elements.categoryList.replaceChildren();
      elements.changeMetrics.replaceChildren();
      elements.releaseDetailsToggle.hidden = true;
      elements.releaseDetails.hidden = true;
      renderSourceLayers([]);
      renderImplications([]);
      setStats({ hunks: 0, additions: 0, deletions: 0 });
      return;
    }

    const latest = entries.at(-1);
    const status = normalizedAnalysisStatus(entries);
    elements.analysisStatus.dataset.status = status;
    elements.analysisStatus.textContent = analysisLabels[status] || "分析完成";
    renderInterpretationProvenance(status, entries);
    elements.changelogTitle.textContent = entries.length === 1
      ? textValue(latest.title, `${displayVersion(latest.version)} 版本变化`)
      : `${entries.length} 个版本的累计变化`;

    const reversePrefix = reverse ? "当前按反向版本顺序比较。" : "";
    elements.changelogSummary.textContent = entries.length === 1
      ? `${reversePrefix}${textValue(latest.summary)}`
      : `${reversePrefix}区间覆盖 ${entries.length} 次发布；最近一次变化：${textValue(latest.summary)}`;

    const highlights = uniqueStrings(
      [...entries].reverse().map((entry) => Array.isArray(entry.highlights) ? entry.highlights : []),
    ).slice(0, 4);
    const highlightFragment = document.createDocumentFragment();
    highlights.forEach((highlight) => {
      const item = document.createElement("li");
      item.textContent = highlight;
      highlightFragment.appendChild(item);
    });
    elements.changelogHighlights.replaceChildren(highlightFragment);
    elements.changelogHighlights.hidden = highlights.length === 0;

    const categories = uniqueStrings(entries.map((entry) => entry.categories || []));
    const categoryFragment = document.createDocumentFragment();
    categories.forEach((category) => {
      const chip = document.createElement("span");
      chip.className = "category-chip";
      chip.textContent = categoryLabels[category] || category;
      categoryFragment.appendChild(chip);
    });
    elements.categoryList.replaceChildren(categoryFragment);

    const stats = combinedStats(entries);
    const evidence = latest.evidenceDigest;
    const metrics = [
      makeMetric("新增行", stats.additions, "metric-add"),
      makeMetric("删除行", stats.deletions, "metric-delete"),
      makeMetric("变更结构", stats.changedSections.length),
      makeMetric("新增工具", reverse ? stats.toolsRemoved.length : stats.toolsAdded.length, "metric-add"),
      makeMetric("移除工具", reverse ? stats.toolsAdded.length : stats.toolsRemoved.length, "metric-delete"),
      makeMetric("调整工具", stats.toolsModified.length),
    ];
    if (evidence) {
      const digest = document.createElement("span");
      digest.className = "metric evidence-metric";
      digest.title = evidence;
      digest.textContent = `证据 ${shortDigest(evidence)}`;
      metrics.push(digest);
    }
    elements.changeMetrics.replaceChildren(...metrics);
    renderSourceLayers(entries);
    renderImplications(entries);
    setStats({
      hunks: stats.changedSections.length,
      additions: stats.additions,
      deletions: stats.deletions,
    });

    elements.releaseDetailsToggle.hidden = entries.length < 2;
    if (entries.length > 1) renderReleaseDetails(entries);
    else elements.releaseDetails.hidden = true;
  }

  function setStats(stats) {
    if (stats.available === false) {
      elements.hunkCount.textContent = "—";
      elements.additionCount.textContent = "—";
      elements.deletionCount.textContent = "—";
      return;
    }
    elements.hunkCount.textContent = formatNumber(stats.hunks);
    elements.additionCount.textContent = formatNumber(stats.additions);
    elements.deletionCount.textContent = formatNumber(stats.deletions);
  }

  function currentOutlineItems() {
    return appCore.buildOutlineItems(versionEntry(state.right));
  }

  function selectedSection() {
    return currentOutlineItems().find((section) => section.key === state.section) || null;
  }

  function sectionIsTool(section) {
    return section.kind === "tool" || /(?:^|[\s._/-])(?:tool|tools|function|functions)(?:$|[\s._/-])/i.test(
      `${section.id || ""} ${section.label || ""}`,
    );
  }

  function outlineChangedNames() {
    const entries = selectedChangelogEntries();
    if (!entries.length) return new Set();
    const stats = combinedStats(entries);
    const names = new Set();
    [
      ...stats.changedSections,
      ...stats.toolsAdded,
      ...stats.toolsRemoved,
      ...stats.toolsModified,
    ].forEach((name) => names.add(String(name).trim().toLocaleLowerCase()));
    return names;
  }

  function sectionHasChanges(section, changedNames) {
    return [section.label, section.id]
      .some((name) => changedNames.has(String(name || "").trim().toLocaleLowerCase()));
  }

  function makeSectionButton(section, changedNames = new Set()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "section-button";
    button.dataset.section = section.key;
    button.setAttribute("aria-current", String(section.key === state.section));
    const changed = section.kind !== "request" && sectionHasChanges(section, changedNames);
    button.dataset.changed = String(changed);
    if (changed) button.title = "本次比较区间内该结构有变化";
    const icon = document.createElement("i");
    icon.dataset.lucide = section.kind === "request"
      ? "file-text"
      : sectionIsTool(section) ? "wrench" : "text-cursor-input";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "section-label";
    label.textContent = section.label;
    const lines = document.createElement("span");
    lines.className = "section-lines";
    lines.textContent = changed ? "变更" : `${section.startLine}–${section.endLine}`;
    if (changed) lines.dataset.changed = "true";
    button.append(icon, label, lines);
    return button;
  }

  function renderOutline() {
    const leftRelease = versionEntry(state.left);
    const rightRelease = versionEntry(state.right);
    if ([leftRelease, rightRelease].some(
      (release) => release?.runtimeCapture?.promptStatus === "unavailable",
    )) {
      elements.sectionList.replaceChildren();
      elements.outlineVersion.textContent = `${displayVersion(state.right)} · Runtime Prompt 未公开`;
      elements.sectionCount.textContent = "0 项";
      elements.sectionCount.title = "当前比较包含未公开的 Runtime Prompt 捕获";
      elements.selectedSectionLabel.textContent = "Runtime Prompt 未公开捕获";
      return;
    }
    const items = currentOutlineItems();
    const changedNames = outlineChangedNames();
    const query = elements.sectionSearch.value.trim().toLocaleLowerCase("zh-CN");
    const requestItem = {
      id: "request",
      key: "",
      kind: "request",
      label: "完整请求",
      startLine: 1,
      endLine: versionEntry(state.right)?.lineCount || 1,
    };
    const requestMatches = "完整请求 full request".includes(query);
    const filtered = items.filter((section) => (
      `${section.label || ""} ${section.id || ""}`.toLocaleLowerCase("zh-CN").includes(query)
    ));
    elements.outlineVersion.textContent = `${displayVersion(state.right)} · 目标请求`;
    const changedCount = items.filter((section) => sectionHasChanges(section, changedNames)).length;
    elements.sectionCount.textContent = query
      ? `${filtered.length}/${items.length} 项`
      : changedCount ? `${changedCount} 项变更 / 共 ${items.length} 项` : `共 ${items.length} 项`;
    elements.sectionCount.title = "目标版本的请求结构与 Tool Definition 数量";

    const fragment = document.createDocumentFragment();
    if (requestMatches) fragment.appendChild(makeSectionButton(requestItem, changedNames));
    if (!filtered.length && !requestMatches) {
      const empty = document.createElement("p");
      empty.className = "section-empty";
      empty.textContent = query ? "没有匹配的结构" : "该版本未提供结构索引";
      fragment.appendChild(empty);
    } else {
      [
        ["section", "请求结构"],
        ["tool", "Tool Definition"],
      ].forEach(([kind, label]) => {
        const group = filtered.filter((item) => item.kind === kind);
        if (!group.length) return;
        const heading = document.createElement("p");
        heading.className = "outline-group-label";
        heading.textContent = label;
        fragment.appendChild(heading);
        group.forEach((section) => fragment.appendChild(makeSectionButton(section, changedNames)));
      });
    }
    elements.sectionList.replaceChildren(fragment);
    elements.selectedSectionLabel.textContent = selectedSection()?.label || "完整请求";
    refreshIcons();
  }

  function syncControls() {
    elements.leftVersion.value = state.left;
    elements.rightVersion.value = state.right;
    elements.leftLegend.textContent = displayVersion(state.left);
    elements.rightLegend.textContent = displayVersion(state.right);
    elements.requestTab.setAttribute("aria-selected", String(state.view === "request"));
    elements.structureTab.setAttribute("aria-selected", String(state.view === "structure"));
    elements.requestTab.tabIndex = state.view === "request" ? 0 : -1;
    elements.structureTab.tabIndex = state.view === "structure" ? 0 : -1;
    elements.workspace.dataset.view = state.view;
    elements.outlinePane.hidden = state.view !== "structure";
    elements.wrapToggle.setAttribute("aria-pressed", String(state.wrap));
    elements.wrapToggle.title = state.wrap ? "关闭长行换行" : "开启长行换行";
    elements.wrapToggle.querySelector("span").textContent = state.wrap ? "换行" : "横滚";
    if (state.editor) {
      state.editor.updateOptions({ wordWrap: state.wrap ? "on" : "off", diffWordWrap: "inherit" });
      requestAnimationFrame(() => state.editor?.layout());
    }
    renderOutline();
  }

  function loadPrompt(release) {
    const url = staticAssetUrl(release.promptUrl, "实际请求");
    return state.promptCache.load(url, () => fetchText(url));
  }

  function loadMonaco() {
    if (window.monaco?.editor) return Promise.resolve(window.monaco);
    if (state.monacoPromise) return state.monacoPromise;
    state.monacoPromise = new Promise((resolve, reject) => {
      let settled = false;
      let timeout;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        window.removeEventListener("error", handleRuntimeError);
        callback(value);
      };
      const handleRuntimeError = (event) => {
        if (String(event.filename || "").includes("/vendor/monaco/")) {
          finish(reject, new Error("Monaco Editor 运行时初始化失败"));
        }
      };
      window.addEventListener("error", handleRuntimeError);
      timeout = window.setTimeout(
        () => finish(reject, new Error("Monaco Editor 初始化超时")),
        15000,
      );
      const script = document.createElement("script");
      script.src = "/vendor/monaco/vs/loader.js";
      script.async = true;
      script.addEventListener("error", () => finish(reject, new Error("Monaco Editor 本地资源加载失败")));
      script.addEventListener("load", () => {
        if (typeof window.require !== "function" || !window.require.config) {
          finish(reject, new Error("Monaco Editor 加载器初始化失败"));
          return;
        }
        window.require.config({ paths: { vs: "/vendor/monaco/vs" } });
        window.require(
          ["vs/editor/editor.main"],
          () => window.monaco?.editor
            ? finish(resolve, window.monaco)
            : finish(reject, new Error("Monaco Editor 初始化失败")),
          (error) => finish(
            reject,
            error instanceof Error ? error : new Error("Monaco Editor 初始化失败"),
          ),
        );
      });
      document.head.appendChild(script);
    }).catch((error) => {
      state.monacoPromise = null;
      throw error;
    });
    return state.monacoPromise;
  }

  function ensureEditor(monaco) {
    if (state.editor) return state.editor;
    monaco.editor.setTheme(state.darkScheme.matches ? "vs-dark" : "vs");
    state.editor = monaco.editor.createDiffEditor(elements.diffEditor, {
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: false,
      enableSplitViewResizing: false,
      renderIndicators: true,
      renderMarginRevertIcon: false,
      diffAlgorithm: "advanced",
      ignoreTrimWhitespace: false,
      wordWrap: state.wrap ? "on" : "off",
      diffWordWrap: "inherit",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace",
      fontSize: 12,
      lineHeight: 19,
      letterSpacing: 0,
      lineNumbersMinChars: 4,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      folding: true,
      glyphMargin: false,
      stickyScroll: { enabled: false },
      guides: { indentation: false },
      padding: { top: 10, bottom: 18 },
      accessibilityVerbosity: "off",
      hideUnchangedRegions: { enabled: false },
    });
    return state.editor;
  }

  function disposeModels() {
    state.diffListener?.dispose();
    state.diffListener = null;
    if (state.editor) state.editor.setModel(null);
    state.models?.original?.dispose();
    state.models?.modified?.dispose();
    state.models = null;
    state.sectionDecorations = [];
  }

  function updateStatsFromEditor() {
    if (!state.editor) return;
    const changes = state.editor.getLineChanges();
    if (!changes) return;
    if (monacoHelpers?.statsFromLineChanges) {
      setStats(monacoHelpers.statsFromLineChanges(changes));
      return;
    }
    let additions = 0;
    let deletions = 0;
    changes.forEach((change) => {
      if (change.modifiedEndLineNumber) {
        additions += Math.max(0, change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1);
      }
      if (change.originalEndLineNumber) {
        deletions += Math.max(0, change.originalEndLineNumber - change.originalStartLineNumber + 1);
      }
    });
    setStats({ hunks: changes.length, additions, deletions });
  }

  function revealSelectedSection(focus = false) {
    if (!state.editor || !window.monaco) return;
    const modified = state.editor.getModifiedEditor();
    const model = modified.getModel();
    const section = selectedSection();
    state.sectionDecorations = modified.deltaDecorations(state.sectionDecorations, []);
    elements.selectedSectionLabel.textContent = section?.label || "完整请求";
    if (!section || !model) return;
    const start = Math.max(1, Math.min(Number(section.startLine) || 1, model.getLineCount()));
    const end = Math.max(start, Math.min(Number(section.endLine) || start, model.getLineCount()));
    const range = new window.monaco.Range(start, 1, end, model.getLineMaxColumn(end));
    state.sectionDecorations = modified.deltaDecorations([], [{
      range,
      options: {
        isWholeLine: true,
        className: "agentlab-section-line",
        linesDecorationsClassName: "agentlab-section-gutter",
      },
    }]);
    modified.revealRangeInCenter(range, window.monaco.editor.ScrollType.Smooth);
    if (focus) modified.focus();
  }

  async function renderDiff(compareRequest) {
    const leftRelease = versionEntry(state.left);
    const rightRelease = versionEntry(state.right);
    if (!leftRelease || !rightRelease) return;
    const promptUnavailable = [leftRelease, rightRelease].some(
      (release) => release.runtimeCapture?.promptStatus === "unavailable",
    );
    if (promptUnavailable) {
      disposeModels();
      setStats({ available: false });
      elements.promptMeta.textContent = "Runtime Prompt 未公开捕获";
      setEditorPlaceholder(
        "所选版本至少一侧没有公开的 Runtime Prompt 捕获，无法生成实际请求差异。",
        "unavailable",
      );
      return;
    }
    setEditorPlaceholder("正在加载实际请求", "loading");
    elements.promptMeta.textContent = `${formatBytes(leftRelease.bytes)} → ${formatBytes(rightRelease.bytes)}`;

    let leftText = "";
    let rightText = "";
    try {
      [leftText, rightText] = await Promise.all([loadPrompt(leftRelease), loadPrompt(rightRelease)]);
      if (compareRequest !== state.compareRequest) return;
      if (diffCore?.diffLineStats && diffCore?.splitTextLines) {
        const lineStats = diffCore.diffLineStats(
          diffCore.splitTextLines(leftText),
          diffCore.splitTextLines(rightText),
        );
        elements.additionCount.textContent = formatNumber(lineStats.additions);
        elements.deletionCount.textContent = formatNumber(lineStats.deletions);
      }
      const monaco = await loadMonaco();
      if (compareRequest !== state.compareRequest) return;
      const editor = ensureEditor(monaco);
      disposeModels();
      const suffix = `${state.agent.id}-${compareRequest}`;
      const original = monaco.editor.createModel(
        leftText,
        "markdown",
        monaco.Uri.parse(`inmemory://agentlab/${suffix}/left-${encodeURIComponent(state.left)}.md`),
      );
      const modified = monaco.editor.createModel(
        rightText,
        "markdown",
        monaco.Uri.parse(`inmemory://agentlab/${suffix}/right-${encodeURIComponent(state.right)}.md`),
      );
      state.models = { original, modified };
      editor.setModel(state.models);
      editor.updateOptions({ wordWrap: state.wrap ? "on" : "off", diffWordWrap: "inherit" });
      state.diffListener = editor.onDidUpdateDiff(updateStatsFromEditor);
      elements.diffEditor.dataset.state = "ready";
      requestAnimationFrame(() => {
        editor.layout();
        updateStatsFromEditor();
        revealSelectedSection(false);
      });
    } catch (error) {
      if (compareRequest !== state.compareRequest) return;
      setEditorPlaceholder(error.message || "实际请求差异加载失败", "error", rightText.slice(0, 120000));
    }
  }

  async function renderComparison() {
    if (!state.history) return;
    const compareRequest = ++state.compareRequest;
    const leftRelease = versionEntry(state.left);
    const rightRelease = versionEntry(state.right);
    elements.leftLegend.textContent = displayVersion(state.left);
    elements.rightLegend.textContent = displayVersion(state.right);
    elements.promptMeta.textContent = rightRelease
      ? `${formatBytes(leftRelease?.bytes)} → ${formatBytes(rightRelease.bytes)} · ${formatCaptured(rightRelease.capturedAt, true)}`
      : "—";
    renderChangelog();
    renderOutline();
    await renderDiff(compareRequest);
  }

  function changePair() {
    state.left = elements.leftVersion.value;
    state.right = elements.rightVersion.value;
    if (!currentOutlineItems().some((section) => section.key === state.section)) state.section = null;
    state.releaseDetailsOpen = false;
    state.analysisExpanded = false;
    syncControls();
    syncUrl();
    renderComparison();
  }

  async function openComparison(agentId, version, options = {}) {
    const dataset = state.intelligenceDatasets.find((item) => item.agent.id === agentId);
    const versions = dataset?.history?.versions || [];
    const index = versions.findIndex((release) => release.version === version);
    const previousVersion = index > 0 ? versions[index - 1].version : version;
    state.feedScrollY = window.scrollY;
    state.feedReturnTarget = { agent: agentId, version };
    if (options.pushHistory) {
      window.history.pushState({ agentLabView: "compare-from-feed" }, "", options.href || window.location.href);
      state.comparisonFromFeed = true;
    }
    state.mode = "compare";
    renderMode();
    window.scrollTo({ top: 0, behavior: "auto" });
    await selectAgent(agentId, { left: previousVersion, right: version, view: "request", wrap: state.wrap });
  }

  async function showComparisonMode() {
    state.comparisonFromFeed = false;
    state.mode = "compare";
    renderMode();
    if (state.history && state.agent) {
      syncUrl();
      await renderComparison();
      return;
    }
    await selectAgent(state.manifest.defaultAgent || state.manifest.agents[0].id, {});
  }

  function restoreFeedPosition() {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: state.feedScrollY, behavior: "auto" });
      if (!state.feedReturnTarget) return;
      const { agent, version } = state.feedReturnTarget;
      const link = elements.intelligenceFeed.querySelector(
        `[data-intelligence-agent="${CSS.escape(agent)}"][data-intelligence-version="${CSS.escape(version)}"]`,
      );
      link?.focus({ preventScroll: true });
    });
  }

  function showIntelligenceMode(options = {}) {
    state.mode = "intelligence";
    renderMode();
    if (options.sync !== false) syncUrl();
    if (options.restore === false) window.scrollTo({ top: 0, behavior: "auto" });
    else restoreFeedPosition();
  }

  function returnToIntelligence() {
    if (state.comparisonFromFeed) {
      state.comparisonFromFeed = false;
      window.history.back();
      return;
    }
    showIntelligenceMode();
  }

  elements.intelligenceModeButton.addEventListener("click", returnToIntelligence);
  elements.backToFeed.addEventListener("click", returnToIntelligence);
  elements.compareModeButton.addEventListener("click", () => {
    showComparisonMode().catch(handleFatalError);
  });

  function applyFeedFilterChange() {
    state.feedLimit = FEED_PAGE_SIZE;
    syncUrl();
    renderIntelligenceFeed();
  }

  function setFeedFilterSelection(kind, values) {
    if (kind === "agent") state.feedAgents = values;
    else state.feedSignals = values;
    applyFeedFilterChange();
  }

  function toggleFeedFilterValue(kind, value, selected) {
    const definition = feedFilterDefinition(kind);
    const values = new Set(definition.values);
    if (selected) values.add(value);
    else values.delete(value);
    setFeedFilterSelection(
      kind,
      definition.options.map((option) => option.id).filter((optionId) => values.has(optionId)),
    );
  }

  function filterAgentOptions() {
    const query = elements.feedAgentFilterSearch.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    elements.feedAgentFilterOptions.querySelectorAll("[data-feed-filter-search-value]").forEach((option) => {
      const visible = !query || option.dataset.feedFilterSearchValue.includes(query);
      option.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    elements.feedAgentFilterEmpty.hidden = visibleCount > 0;
  }

  elements.feedAgentFilter.addEventListener("click", () => {
    const open = state.openFeedFilter === "agent";
    setFeedFilterMenu(open ? null : "agent", { focus: !open });
  });

  elements.feedSignalFilter.addEventListener("click", () => {
    const open = state.openFeedFilter === "signal";
    setFeedFilterMenu(open ? null : "signal", { focus: !open });
  });

  elements.feedFilterControls.addEventListener("change", (event) => {
    const input = event.target.closest("[data-feed-filter-option]");
    if (!input) return;
    toggleFeedFilterValue(input.dataset.feedFilterOption, input.value, input.checked);
  });

  elements.feedFilterControls.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-feed-filter-clear]");
    if (!clearButton) return;
    const kind = clearButton.dataset.feedFilterClear;
    const trigger = feedFilterDefinition(kind).trigger;
    setFeedFilterSelection(kind, []);
    setFeedFilterMenu(null);
    trigger.focus();
  });

  elements.feedAgentFilterSearch.addEventListener("input", filterAgentOptions);

  document.addEventListener("click", (event) => {
    if (!state.openFeedFilter) return;
    const picker = feedFilterDefinition(state.openFeedFilter).trigger.closest("[data-feed-filter-picker]");
    if (picker.contains(event.target)) return;
    setFeedFilterMenu(null);
  });

  document.addEventListener("focusin", (event) => {
    if (!state.openFeedFilter) return;
    const picker = feedFilterDefinition(state.openFeedFilter).trigger.closest("[data-feed-filter-picker]");
    if (!picker.contains(event.target)) setFeedFilterMenu(null);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.openFeedFilter) return;
    event.preventDefault();
    setFeedFilterMenu(null, { returnFocus: true });
  });

  elements.feedImportanceToggle.addEventListener("click", () => {
    state.feedImportance = state.feedImportance === "high" ? "all" : "high";
    applyFeedFilterChange();
  });

  elements.resetFeedFilters.addEventListener("click", () => {
    state.feedAgents = [];
    state.feedSignals = [];
    state.feedImportance = "all";
    setFeedFilterMenu(null);
    applyFeedFilterChange();
  });

  elements.intelligenceFeed.addEventListener("click", (event) => {
    const loadMore = event.target.closest("[data-feed-load-more]");
    if (loadMore) {
      loadNextFeedPage({ focusFirstNewItem: true });
      return;
    }
    const link = event.target.closest("[data-intelligence-agent][data-intelligence-version]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openComparison(link.dataset.intelligenceAgent, link.dataset.intelligenceVersion, {
      href: link.href,
      pushHistory: true,
    }).catch(handleFatalError);
  });

  elements.agentSwitch.addEventListener("change", () => {
    const agent = elements.agentSwitch.value;
    if (!agent || agent === state.agent?.id) return;
    selectAgent(agent, { view: state.view, wrap: state.wrap }).catch(handleFatalError);
  });

  elements.leftVersion.addEventListener("change", changePair);
  elements.rightVersion.addEventListener("change", changePair);

  elements.swapVersions.addEventListener("click", () => {
    [elements.leftVersion.value, elements.rightVersion.value] = [
      elements.rightVersion.value,
      elements.leftVersion.value,
    ];
    changePair();
  });

  function setView(view) {
    state.view = view === "structure" ? "structure" : "request";
    syncControls();
    syncUrl();
    if (state.view === "structure" && state.section) {
      requestAnimationFrame(() => revealSelectedSection(false));
    }
  }

  elements.requestTab.addEventListener("click", () => setView("request"));
  elements.structureTab.addEventListener("click", () => setView("structure"));

  elements.wrapToggle.addEventListener("click", () => {
    state.wrap = !state.wrap;
    syncControls();
    syncUrl();
  });

  elements.sectionSearch.addEventListener("input", renderOutline);

  elements.sectionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-section]");
    if (!button) return;
    state.section = button.dataset.section || null;
    renderOutline();
    syncUrl();
    revealSelectedSection(true);
  });

  elements.analysisCondenseToggle.addEventListener("click", () => {
    state.analysisExpanded = !state.analysisExpanded;
    renderAnalysisCondensed(elements.changelogBand.dataset.condensed === "true");
  });

  elements.releaseDetailsToggle.addEventListener("click", () => {
    state.releaseDetailsOpen = !state.releaseDetailsOpen;
    elements.releaseDetails.hidden = !state.releaseDetailsOpen;
    elements.releaseDetailsToggle.setAttribute("aria-expanded", String(state.releaseDetailsOpen));
  });

  state.darkScheme.addEventListener?.("change", () => {
    if (window.monaco?.editor) window.monaco.editor.setTheme(state.darkScheme.matches ? "vs-dark" : "vs");
  });

  function handleFatalError(error) {
    const message = error instanceof Error ? error.message : "页面初始化失败";
    setPageError(message);
    setEditorPlaceholder(message, "error");
  }

  async function initialize() {
    refreshIcons();
    try {
      state.manifest = validateManifest(await fetchJson("/data/manifest.json"));
      const requested = readUrlState();
      state.mode = requested.mode;
      applyRequestedFeedFilters(requested);
      renderFeedFilterOptions();
      renderFeedControls();
      renderMode();
      const intelligenceRequest = loadIntelligence().catch((error) => {
        state.intelligenceErrors = [error];
        renderDataHealth();
        renderIntelligenceFeed();
      });
      if (state.mode === "compare") {
        const requestedAgent = state.manifest.agents.some((agent) => agent.id === requested.agent)
          ? requested.agent
          : state.manifest.defaultAgent;
        await selectAgent(requestedAgent, requested);
      }
      await intelligenceRequest;
    } catch (error) {
      handleFatalError(error);
    }
  }

  window.addEventListener("popstate", (event) => {
    if (!state.manifest) return;
    const requested = readUrlState();
    const previousAgents = state.feedAgents;
    const previousSignals = state.feedSignals;
    const previousImportance = state.feedImportance;
    applyRequestedFeedFilters(requested);
    const feedFiltersChanged = previousAgents.length !== state.feedAgents.length
      || previousAgents.some((value, index) => value !== state.feedAgents[index])
      || previousSignals.length !== state.feedSignals.length
      || previousSignals.some((value, index) => value !== state.feedSignals[index])
      || previousImportance !== state.feedImportance;
    if (feedFiltersChanged) state.feedLimit = FEED_PAGE_SIZE;
    if (requested.mode !== "compare") {
      state.comparisonFromFeed = false;
      renderIntelligenceFeed();
      showIntelligenceMode({ sync: false });
      return;
    }
    state.comparisonFromFeed = event.state?.agentLabView === "compare-from-feed";
    state.mode = "compare";
    renderMode();
    if (requested.agent && requested.agent !== state.agent?.id) {
      selectAgent(requested.agent, requested).catch(handleFatalError);
      return;
    }
    if (!state.history) {
      showComparisonMode().catch(handleFatalError);
      return;
    }
    chooseVersions(requested);
    syncControls();
    renderComparison();
  });

  initialize();
})();
