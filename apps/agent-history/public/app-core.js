(function attachAgentHistoryCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AgentHistoryCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createAgentHistoryCore() {
  "use strict";

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    for (const value of (values || []).flat()) {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }

  function buildOutlineItems(release) {
    const sections = Array.isArray(release?.sections) ? release.sections : [];
    const tools = Array.isArray(release?.tools) ? release.tools : [];
    return [
      ...sections.map((section) => ({ ...section, key: `section:${section.id}`, kind: "section" })),
      ...tools.map((tool) => ({ ...tool, key: `tool:${tool.id}`, kind: "tool" })),
    ];
  }

  function resolveOutlineKey(items, requested) {
    if (typeof requested !== "string" || !requested) return null;
    const exact = (items || []).find((item) => item.key === requested);
    if (exact) return exact.key;
    if (requested.includes(":")) return null;
    return (items || []).find((item) => item.id === requested)?.key || null;
  }

  function selectRangeEntries(versions, entries, left, right) {
    const orderedVersions = (versions || []).map((item) => (
      typeof item === "string" ? item : item?.version
    ));
    const leftIndex = orderedVersions.indexOf(left);
    const rightIndex = orderedVersions.indexOf(right);
    if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) return [];
    const start = Math.min(leftIndex, rightIndex) + 1;
    const end = Math.max(leftIndex, rightIndex) + 1;
    const byVersion = new Map((entries || []).map((entry) => [entry.version, entry]));
    return orderedVersions.slice(start, end).map((version) => byVersion.get(version)).filter(Boolean);
  }

  function combineEntryStats(entries, reverse = false) {
    const list = entries || [];
    let additions = list.reduce((sum, entry) => sum + (Number(entry.stats?.additions) || 0), 0);
    let deletions = list.reduce((sum, entry) => sum + (Number(entry.stats?.deletions) || 0), 0);
    if (reverse) [additions, deletions] = [deletions, additions];
    return {
      additions,
      deletions,
      changedSections: uniqueStrings(list.map((entry) => entry.stats?.changedSections || [])),
      toolsAdded: uniqueStrings(list.map((entry) => entry.stats?.toolsAdded || [])),
      toolsRemoved: uniqueStrings(list.map((entry) => entry.stats?.toolsRemoved || [])),
      toolsModified: uniqueStrings(list.map((entry) => entry.stats?.toolsModified || [])),
    };
  }

  const sourceLayerDefinitions = [
    { id: "official", label: "官方功能", aliases: ["official", "release", "release-notes", "feature", "official-release", "official-changelog"] },
    { id: "code", label: "Code", aliases: ["code", "source", "package", "artifact", "official-code-compare"] },
    { id: "runtime-prompt", label: "Runtime Prompt", aliases: ["runtime-prompt", "runtime_prompt", "prompt", "trace", "phistory-prompt", "phistory-prompt-capture", "phistory-trace"] },
    { id: "static-prompt", label: "Static Prompt", aliases: ["static-prompt", "static_prompt", "static", "staticprompt", "phistory-static-prompt"] },
    { id: "tools", label: "Tools", aliases: ["tools", "tool", "tool-schema", "tool_schema", "phistory-tools"] },
  ];

  function stringValue(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function normalizeSourceLayerId(value) {
    const normalized = stringValue(value).toLowerCase().replace(/[\s_]+/g, "-");
    return sourceLayerDefinitions.find((definition) => (
      definition.id === normalized || definition.aliases.includes(normalized)
    ))?.id || "";
  }

  function sourceLayerState(status, fallback = "available") {
    const value = stringValue(status).toLowerCase();
    if (!value) return fallback;
    if (/(changed|change|updated|new|added|removed|modified|变化|更新|新增|移除)/.test(value)) return "changed";
    if (/(unchanged|same|verified|no-change|no change|一致|无变化|已核验)/.test(value)) return "unchanged";
    if (/(missing|unavailable|unknown|not-collected|not-synced|未接入|未采集|未知)/.test(value)) return "missing";
    if (/(stale|pending|待|过期)/.test(value)) return "pending";
    return "available";
  }

  function sourceObject(value, key = "") {
    if (typeof value === "string") {
      const isUrl = /^https?:\/\//i.test(value) || value.startsWith("/");
      return { type: key || value, ...(isUrl ? { url: value } : { status: value }) };
    }
    return value && typeof value === "object" ? { type: key, ...value } : null;
  }

  function sourceUrlPriority(source, id) {
    const type = stringValue(source?.sourceType || source?.type).toLowerCase();
    if (id === "official" && type === "official-release") return 100;
    if (id === "code" && type === "official-code-compare") return 100;
    if (id === "runtime-prompt" && type === "phistory-prompt-capture") return 100;
    if (id === "tools" && type === "phistory-tools") return 100;
    if (id === "static-prompt" && type === "phistory-static-prompt") return 100;
    if (type === "official-changelog") return 70;
    if (type === "phistory-trace") return 30;
    return 50;
  }

  function explicitSourceLayers(entry) {
    const values = [];
    [entry?.layers, entry?.sourceLayers, entry?.sources].forEach((sourceGroup) => {
      if (Array.isArray(sourceGroup)) {
        sourceGroup.forEach((source) => values.push(sourceObject(source)));
      } else if (sourceGroup && typeof sourceGroup === "object") {
        Object.entries(sourceGroup).forEach(([key, source]) => {
          values.push(sourceObject(source, key));
          if (key === "official" && source?.codeChange) {
            values.push(sourceObject(source.codeChange, "code"));
          }
        });
      }
    });
    const byId = new Map();
    values.filter(Boolean).forEach((source) => {
      const id = normalizeSourceLayerId(
        source.id || source.type || source.sourceType || source.kind || source.layer || source.label,
      );
      if (!id) return;
      const current = byId.get(id) || {};
      const candidateUrl = stringValue(source.url || source.href || source.sourceUrl);
      const candidatePriority = sourceUrlPriority(source, id);
      const replaceUrl = candidateUrl && candidatePriority >= (current.urlPriority || 0);
      byId.set(id, {
        ...current,
        ...source,
        id,
        url: replaceUrl ? candidateUrl : current.url,
        urlPriority: Math.max(current.urlPriority || 0, candidateUrl ? candidatePriority : 0),
      });
    });
    return byId;
  }

  function changeCount(value, keys) {
    return keys.reduce((sum, key) => sum + (Number(value?.[key]) || 0), 0);
  }

  function explicitLayerChangeState(id, layer) {
    if (!layer) return "";
    if (id === "runtime-prompt") {
      return changeCount(layer, ["additions", "deletions"]) > 0
        || (Array.isArray(layer.changedSections) && layer.changedSections.length) ? "changed" : "unchanged";
    }
    if (id === "tools") {
      return [layer.added, layer.removed, layer.modified]
        .some((items) => Array.isArray(items) && items.length) ? "changed" : "unchanged";
    }
    if (id === "static-prompt") {
      const changes = layer.changes || {};
      if (changeCount(changes, ["addedCount", "removedCount", "modifiedCount"]) > 0) return "changed";
      if (layer.comparisonStatus === "complete") return "unchanged";
    }
    if (id === "official") {
      const notes = layer.release?.notes;
      if (stringValue(notes?.text) || layer.release?.title || layer.release?.hasNotes || layer.hasNotes) {
        return "changed";
      }
    }
    if (id === "code") {
      if (changeCount(layer, ["filesObserved", "additionsObserved", "deletionsObserved"]) > 0
        || (Array.isArray(layer.keyFiles) && layer.keyFiles.length)) return "changed";
      if (layer.status === "available") return "unchanged";
    }
    return "";
  }

  function sourceLayerStatusLabel(id, rawStatus, state, fallback) {
    if (state === "changed") return "有变化";
    if (state === "unchanged") return "核验无变化";
    if (state === "missing") return /not-synced/i.test(rawStatus) ? "未同步" : "未接入";
    if (state === "pending") return "等待同步";
    if (/^(available|complete|ready)$/i.test(rawStatus)) {
      if (id === "code") return "产物已归档";
      if (id === "static-prompt") return "已采集";
      return "来源已接入";
    }
    return rawStatus || fallback;
  }

  function hasToolChanges(stats) {
    return [stats?.toolsAdded, stats?.toolsRemoved, stats?.toolsModified]
      .some((values) => Array.isArray(values) && values.length > 0);
  }

  function hasRuntimePromptChanges(stats) {
    return (stats?.changedSections || []).some((section) => (
      !/(?:^|\s)tools?(?:$|\s)/i.test(String(section))
      && !/(?:metadata|version|billing|trace)/i.test(String(section))
    ));
  }

  function normalizeSourceLayers(entry, release, previousRelease) {
    const explicit = explicitSourceLayers(entry);
    const stats = entry?.stats || {};
    const runtimeChanged = hasRuntimePromptChanges(stats);
    const toolsChanged = hasToolChanges(stats)
      || (stats.changedSections || []).some((section) => /tools?/i.test(String(section)));
    const staticPrompt = release?.staticPrompt;
    const previousStaticPrompt = previousRelease?.staticPrompt;
    const staticChanged = Boolean(staticPrompt && previousStaticPrompt)
      && staticPrompt.sha256 !== previousStaticPrompt.sha256;

    const derived = {
      official: {
        state: release?.releaseNotesUrl || entry?.officialSourceUrl ? "available" : "missing",
        status: release?.releaseNotesUrl || entry?.officialSourceUrl ? "来源已接入" : "未接入",
        url: entry?.officialSourceUrl || release?.releaseNotesUrl || "",
      },
      code: {
        state: release?.tarballUrl || release?.codeSourceUrl ? "available" : "missing",
        status: release?.tarballUrl || release?.codeSourceUrl ? "产物已归档" : "未接入",
        url: release?.codeSourceUrl || release?.tarballUrl || "",
      },
      "runtime-prompt": {
        state: runtimeChanged ? "changed" : "unchanged",
        status: runtimeChanged ? "有变化" : "核验无变化",
        url: release?.promptSourceUrl || entry?.promptSourceUrl || entry?.sourceUrl || "",
      },
      "static-prompt": {
        state: staticPrompt ? (staticChanged ? "changed" : "unchanged") : "missing",
        status: staticPrompt ? (staticChanged ? "有变化" : "核验无变化") : "未采集",
        url: staticPrompt?.sourceUrl || "",
      },
      tools: {
        state: toolsChanged ? "changed" : "unchanged",
        status: toolsChanged ? "有变化" : "核验无变化",
        url: release?.promptSourceUrl || entry?.promptSourceUrl || entry?.sourceUrl || "",
      },
    };

    return sourceLayerDefinitions.map((definition) => {
      const explicitLayer = explicit.get(definition.id);
      const base = derived[definition.id];
      if (!explicitLayer) return { id: definition.id, label: definition.label, ...base };
      const explicitStatus = stringValue(explicitLayer.status || explicitLayer.state || explicitLayer.change);
      const explicitChangeState = explicitLayerChangeState(definition.id, explicitLayer);
      const state = explicitChangeState || sourceLayerState(explicitStatus, base.state);
      return {
        id: definition.id,
        label: stringValue(explicitLayer.label) || definition.label,
        state,
        status: sourceLayerStatusLabel(definition.id, explicitStatus, state, base.status),
        url: stringValue(explicitLayer.url) || base.url,
      };
    });
  }

  function normalizeImplications(entry) {
    const raw = entry?.implications ?? entry?.recommendations ?? entry?.agentImplications;
    const values = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" ? Object.values(raw) : raw ? [raw] : [];
    return values.map((item) => {
      if (typeof item === "string") return { text: stringValue(item), basis: "模型建议" };
      if (!item || typeof item !== "object") return null;
      return {
        text: stringValue(item.text || item.summary || item.recommendation || item.action || item.title),
        basis: stringValue(item.basis || item.source || item.category) || "模型建议",
      };
    }).filter((item) => item?.text);
  }

  function deriveImplications(entries) {
    const explicit = (entries || []).flatMap(normalizeImplications);
    if (explicit.length) {
      const seen = new Set();
      return explicit.filter((item) => {
        if (seen.has(item.text)) return false;
        seen.add(item.text);
        return true;
      }).slice(0, 4);
    }
    const stats = combineEntryStats(entries || []);
    const changedLayers = new Set((entries || []).flatMap((entry) => (
      normalizeSourceLayers(entry, null, null)
        .filter((layer) => layer.state === "changed")
        .map((layer) => layer.id)
    )));
    const implications = [];
    if (hasToolChanges(stats)) {
      implications.push({
        basis: "Tools",
        text: "检查自研 Agent 的工具注册、参数 schema 与权限边界，并为工具增删建立兼容性回归。",
      });
    }
    if (hasRuntimePromptChanges(stats)) {
      implications.push({
        basis: "Runtime Prompt",
        text: "把 Runtime Prompt 分区版本化，针对指令优先级、Context 拼装和行为约束补充回归样例。",
      });
    }
    if (changedLayers.has("static-prompt")) {
      implications.push({
        basis: "Static Prompt",
        text: "把 Static Prompt 集合纳入可追溯资产清单，针对新增、移除和修改项验证运行时注入条件。",
      });
    }
    if (changedLayers.has("official") && changedLayers.has("code")) {
      implications.push({
        basis: "官方 + Code",
        text: "将官方能力点转成可复现验收用例，并沿 compare 与关键文件验证实现机制后再决定是否迁移。",
      });
    } else if (changedLayers.has("official")) {
      implications.push({
        basis: "官方功能",
        text: "将官方发布说明中的能力点转成可复现验收用例，再判断是否值得进入自研 Agent 路线图。",
      });
    } else if (changedLayers.has("code")) {
      implications.push({
        basis: "Code",
        text: "沿官方 compare 与关键文件定位实现机制，优先验证可迁移的架构选择而不是复刻表面行为。",
      });
    }
    if (!implications.length) {
      implications.push({
        basis: "证据边界",
        text: "没有观察到足以驱动实现调整的变化，不应仅根据版本号修改自研 Agent。",
      });
    }
    return implications.slice(0, 4);
  }

  function entrySignalTypes(entry, release, previousRelease) {
    const stats = entry?.stats || {};
    const layers = normalizeSourceLayers(entry, release, previousRelease);
    const types = [];
    if (hasRuntimePromptChanges(stats) || layers.find((layer) => layer.id === "runtime-prompt")?.state === "changed") {
      types.push("prompt");
    }
    if (hasToolChanges(stats) || layers.find((layer) => layer.id === "tools")?.state === "changed") {
      types.push("tools");
    }
    if (layers.some((layer) => ["official", "code", "static-prompt"].includes(layer.id) && layer.state === "changed")) {
      types.push("ecosystem");
    }
    return uniqueStrings(types);
  }

  function isNoChangeEntry(entry, release, previousRelease) {
    const stats = entry?.stats || {};
    const linesChanged = (Number(stats.additions) || 0) + (Number(stats.deletions) || 0) > 0;
    const sourceChanged = normalizeSourceLayers(entry, release, previousRelease)
      .some((layer) => layer.state === "changed");
    return !linesChanged && !hasToolChanges(stats) && !hasRuntimePromptChanges(stats) && !sourceChanged;
  }

  function importanceScore(entry, release, previousRelease) {
    const stats = entry?.stats || {};
    const toolChanges = (stats.toolsAdded?.length || 0) + (stats.toolsRemoved?.length || 0);
    const toolModifications = stats.toolsModified?.length || 0;
    const lineChanges = (Number(stats.additions) || 0) + (Number(stats.deletions) || 0);
    const signals = entrySignalTypes(entry, release, previousRelease);
    let score = Math.min(60, toolChanges * 16 + toolModifications * 8);
    if (signals.includes("prompt")) score += 22;
    if (signals.includes("ecosystem")) score += 28;
    score += Math.min(18, Math.log2(lineChanges + 1) * 2.6);
    if (normalizeImplications(entry).length) score += 12;
    if (["complete", "generated", "reviewed"].includes(String(entry?.analysisStatus).toLowerCase())) score += 4;
    return Math.round(score);
  }

  function resolveImportance(entry, score) {
    const explicit = String(entry?.importance || "").toLowerCase();
    if (["high", "medium", "low"].includes(explicit)) return explicit;
    if (score >= 80) return "high";
    if (score >= 34) return "medium";
    return "low";
  }

  function filterValues(value) {
    return uniqueStrings(Array.isArray(value) ? value : [value]).filter((item) => item !== "all");
  }

  function buildIntelligenceItems(datasets, options = {}) {
    const agentFilters = filterValues(options.agent);
    const signalFilters = filterValues(options.signal);
    const importanceFilter = stringValue(options.importance);
    const limit = Number.isFinite(options.limit) ? options.limit : 18;
    const items = [];
    (datasets || []).forEach((dataset) => {
      if (agentFilters.length && !agentFilters.includes(dataset.agent?.id)) return;
      const versions = dataset.history?.versions || [];
      const releases = new Map(versions.map((release) => [release.version, release]));
      const versionIndex = new Map(versions.map((release, index) => [release.version, index]));
      (dataset.changelog?.entries || []).forEach((entry) => {
        if (!entry?.previousVersion) return;
        if (String(entry.importance || "").toLowerCase() === "none") return;
        const release = releases.get(entry.version);
        const index = versionIndex.get(entry.version);
        const previousRelease = releases.get(entry.previousVersion) || (index > 0 ? versions[index - 1] : null);
        const noChange = isNoChangeEntry(entry, release, previousRelease);
        const signals = entrySignalTypes(entry, release, previousRelease);
        if (noChange) return;
        if (!noChange && !signals.length && !normalizeImplications(entry).length) return;
        if (signalFilters.length && !signalFilters.some((signal) => signals.includes(signal))) return;
        const score = importanceScore(entry, release, previousRelease);
        const importance = resolveImportance(entry, score);
        if (importanceFilter && importanceFilter !== "all" && importance !== importanceFilter) return;
        items.push({
          agent: dataset.agent,
          entry,
          release,
          previousRelease,
          noChange,
          signals,
          score,
          importance,
          capturedAt: release?.publishedAt || entry.capturedAt || release?.capturedAt || "",
        });
      });
    });
    return items.sort((left, right) => {
      const leftDay = stringValue(left.capturedAt).slice(0, 10);
      const rightDay = stringValue(right.capturedAt).slice(0, 10);
      if (leftDay !== rightDay) return rightDay.localeCompare(leftDay);
      return right.score - left.score
        || Date.parse(right.capturedAt || 0) - Date.parse(left.capturedAt || 0);
    }).slice(0, limit);
  }

  function dataHealth(manifest, datasets) {
    const entries = (datasets || []).flatMap((dataset) => dataset.changelog?.entries || []);
    const explicit = manifest?.dataHealth || manifest?.health || {};
    const explicitCounts = manifest?.analysisCounts || explicit.analysisCounts || {};
    const complete = Number(explicitCounts.complete ?? explicitCounts.analyzed);
    const stale = Number(manifest?.staleCount ?? explicit.staleCount ?? explicitCounts.stale);
    const analyzedFallback = entries.filter((entry) => (
      ["complete", "generated", "reviewed"].includes(String(entry.analysisStatus || "").toLowerCase())
    )).length;
    const staleFallback = entries.filter((entry) => (
      !["complete", "generated", "reviewed"].includes(String(entry.analysisStatus || "").toLowerCase())
    )).length;
    const officialSources = manifest?.officialSources || {};
    const ingestion = manifest?.ingestion || {};
    return {
      lastSync: stringValue(manifest?.lastSyncAt || manifest?.lastSync || explicit.lastSyncAt || explicit.lastSync),
      latestEvidence: stringValue(manifest?.latestEvidenceAt || explicit.latestEvidenceAt || manifest?.generatedAt),
      total: entries.length,
      analyzed: Number.isFinite(complete) ? complete : analyzedFallback,
      stale: Number.isFinite(stale) ? stale : staleFallback,
      officialStatus: stringValue(officialSources.status),
      officialWarningCount: Number(officialSources.warningCount) || 0,
      rejectedCaptures: Number(ingestion.rejectedCaptures) || 0,
    };
  }

  return Object.freeze({
    buildOutlineItems,
    buildIntelligenceItems,
    combineEntryStats,
    dataHealth,
    deriveImplications,
    entrySignalTypes,
    isNoChangeEntry,
    normalizeSourceLayers,
    resolveImportance,
    resolveOutlineKey,
    selectRangeEntries,
    sourceLayerDefinitions,
    uniqueStrings,
  });
});
