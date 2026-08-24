(function initGrokBotCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.grokBotCore = api;
})(typeof globalThis === "object" ? globalThis : this, function buildGrokBotCore() {
  "use strict";

  const claimKinds = new Set(["official", "author-claim", "community-interpretation", "correction"]);
  const repositoryKinds = new Set(["source-code", "repository-doc", "manifest"]);
  const deepDiveStatuses = new Set([
    "live-path",
    "recovery-path",
    "gated",
    "shared-package",
    "reconstructed-ui",
    "reconstruction-drift",
    "author-extension",
    "dormant",
    "partial",
  ]);

  function normalized(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function evidenceById(data) {
    return new Map((data?.evidence || []).map((item) => [item.id, item]));
  }

  function evidenceSourceLinks(item) {
    if (Array.isArray(item?.links) && item.links.length > 0) return item.links;
    return item?.url ? [{ label: item.id || "source", url: item.url }] : [];
  }

  function hasValidAttributions(item, layerIds) {
    return Array.isArray(item?.attributions)
      && item.attributions.length > 0
      && item.attributions.every((id) => layerIds.has(id));
  }

  function attributionLabels(data, ids) {
    const labels = new Map((data?.layers || []).map((layer) => [layer.id, layer.label]));
    return (ids || []).map((id) => labels.get(id)).filter(Boolean);
  }

  function deepDiveCollections(data) {
    return {
      architecture: data?.deepDive?.architecture?.nodes || [],
      harness: data?.deepDive?.harness || [],
      features: data?.deepDive?.features || [],
      curiosities: data?.deepDive?.curiosities || [],
    };
  }

  function validateDossier(data) {
    const errors = [];
    const commit = data?.sourceRevision?.commit || "";
    const layerIds = new Set((data?.layers || []).map((layer) => layer.id));
    const receipt = data?.verification?.receipt;
    if (data?.schemaVersion !== 2) errors.push("schemaVersion 必须为 2");
    if (!/^[0-9a-f]{40}$/.test(commit)) errors.push("源码提交必须固定为 40 位 SHA");
    if (data?.researchModel !== "gpt-5.6-sol") errors.push("研究模型必须记录为 gpt-5.6-sol");
    if (!Array.isArray(data?.layers) || data.layers.length !== 3) errors.push("必须明确区分三层事实");
    if (!Array.isArray(data?.mechanisms) || data.mechanisms.length < 8) errors.push("机制拆解不得少于 8 项");
    if (!Array.isArray(data?.evidence) || data.evidence.length < 20) errors.push("证据账本不得少于 20 条");
    if (!Array.isArray(data?.xSignals) || data.xSignals.length < 5) errors.push("X 讨论样本不得少于 5 条");
    if (
      !receipt
      || !/^[0-9a-f]{64}$/.test(receipt.sha256 || "")
      || receipt.url !== "/dossiers/grok-bot-verification-" + receipt.sha256 + ".json"
    ) errors.push("本地验证必须指向内容寻址收据");

    const evidenceIds = new Set();
    (data?.evidence || []).forEach((item) => {
      if (!item.id || evidenceIds.has(item.id)) errors.push(`证据 ID 无效或重复：${item.id || "空"}`);
      evidenceIds.add(item.id);
      if (!hasValidAttributions(item, layerIds)) errors.push("证据 " + (item.id || "未知") + " 缺少三层归因");
      const sourceLinks = evidenceSourceLinks(item);
      if (item.kind === "local-verification" && sourceLinks.some((link) => !String(link.url).startsWith((receipt?.url || "") + "#"))) {
        errors.push("本地验证 " + (item.id || "未知") + " 未指向验证收据");
      }
      if (!item.statement || !item.layer || !item.kind || !item.url) errors.push(`证据 ${item.id || "未知"} 缺少必要字段`);
      if (sourceLinks.some((link) => !link?.label || !link?.url)) errors.push(`证据 ${item.id || "未知"} 的源码链接无效`);
      if (repositoryKinds.has(item.kind) && sourceLinks.some((link) => !String(link.url).includes(`/blob/${commit}/`))) {
        errors.push(`仓库证据 ${item.id || "未知"} 未固定到源码提交`);
      }
      const locatorParts = String(item.locator || "").split(";").map((part) => part.trim()).filter(Boolean);
      if (repositoryKinds.has(item.kind) && locatorParts.length > 1 && sourceLinks.length < locatorParts.length) {
        errors.push(`复合证据 ${item.id || "未知"} 未暴露全部源码锚点`);
      }
    });

    const mechanismIds = new Set();
    (data?.mechanisms || []).forEach((mechanism) => {
      if (!mechanism.id || mechanismIds.has(mechanism.id)) errors.push(`机制 ID 无效或重复：${mechanism.id || "空"}`);
      mechanismIds.add(mechanism.id);
      if (!hasValidAttributions(mechanism, layerIds)) errors.push("机制 " + (mechanism.id || "未知") + " 缺少三层归因");
      if (!mechanism.title || !mechanism.verdict || !mechanism.layer) errors.push(`机制 ${mechanism.id || "未知"} 缺少结论`);
      if (!Array.isArray(mechanism.evidence) || mechanism.evidence.length < 2) errors.push(`机制 ${mechanism.id || "未知"} 证据不足`);
      (mechanism.evidence || []).forEach((id) => {
        if (!evidenceIds.has(id)) errors.push(`机制 ${mechanism.id || "未知"} 引用了不存在的证据 ${id}`);
      });
    });

    const collections = deepDiveCollections(data);
    const minimums = { architecture: 7, harness: 8, features: 8, curiosities: 12 };
    Object.entries(collections).forEach(([name, items]) => {
      if (items.length < minimums[name]) errors.push(`源码考古 ${name} 不得少于 ${minimums[name]} 项`);
      const ids = new Set();
      items.forEach((item) => {
        if (!item.id || ids.has(item.id)) errors.push(`源码考古 ${name} ID 无效或重复：${item.id || "空"}`);
        ids.add(item.id);
        if (!hasValidAttributions(item, layerIds)) errors.push(`源码考古 ${item.id || "未知"} 缺少三层归因`);
        if (!deepDiveStatuses.has(item.status)) errors.push(`源码考古 ${item.id || "未知"} 缺少能力状态`);
        if (!item.title || !item.summary || !item.whyItMatters || !item.boundary) errors.push(`源码考古 ${item.id || "未知"} 缺少结论或边界`);
        if (!Array.isArray(item.evidence) || item.evidence.length < 1) errors.push(`源码考古 ${item.id || "未知"} 缺少证据`);
        item.evidence?.forEach((id) => {
          if (!evidenceIds.has(id)) errors.push(`源码考古 ${item.id || "未知"} 引用了不存在的证据 ${id}`);
        });
        if (name === "architecture" && (!item.role || !item.transport || !item.state || !item.failureBoundary)) {
          errors.push(`架构节点 ${item.id || "未知"} 缺少进程边界`);
        }
        if (name !== "architecture" && !item.mechanism) errors.push(`源码考古 ${item.id || "未知"} 缺少实现机制`);
      });
    });

    (data?.xSignals || []).forEach((signal) => {
      if (!hasValidAttributions(signal, layerIds)) errors.push("X 讨论 " + (signal.id || "未知") + " 缺少三层归因");
      if (!claimKinds.has(signal.claimKind)) errors.push(`X 讨论 ${signal.id || "未知"} 使用了不允许的事实类型`);
      if (!signal.url || !signal.summary || !signal.boundary) errors.push(`X 讨论 ${signal.id || "未知"} 缺少来源或边界`);
    });

    return errors;
  }

  function mechanismById(data, id) {
    return (data?.mechanisms || []).find((mechanism) => mechanism.id === id) || data?.mechanisms?.[0] || null;
  }

  function filterEvidence(data, filters = {}) {
    const query = normalized(filters.query);
    return (data?.evidence || []).filter((item) => {
      if (filters.layer && filters.layer !== "all" && item.layer !== filters.layer) return false;
      if (filters.kind && filters.kind !== "all" && item.kind !== filters.kind) return false;
      if (!query) return true;
      return normalized([item.id, item.statement, item.locator, item.layer, item.kind].join(" ")).includes(query);
    });
  }

  function xClaimLabel(kind) {
    return {
      official: "官方发布",
      "author-claim": "作者陈述",
      "community-interpretation": "社区解读",
      correction: "纠偏讨论",
    }[kind] || "来源未分类";
  }

  return {
    claimKinds,
    repositoryKinds,
    deepDiveStatuses,
    attributionLabels,
    evidenceById,
    evidenceSourceLinks,
    deepDiveCollections,
    validateDossier,
    mechanismById,
    filterEvidence,
    xClaimLabel,
  };
});
