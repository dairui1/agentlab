(function initGrokBotCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.grokBotCore = api;
})(typeof globalThis === "object" ? globalThis : this, function buildGrokBotCore() {
  "use strict";

  const claimKinds = new Set(["official", "author-claim", "community-interpretation", "correction"]);
  const repositoryKinds = new Set(["source-code", "repository-doc", "manifest"]);

  function normalized(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function evidenceById(data) {
    return new Map((data?.evidence || []).map((item) => [item.id, item]));
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

  function validateDossier(data) {
    const errors = [];
    const commit = data?.sourceRevision?.commit || "";
    const layerIds = new Set((data?.layers || []).map((layer) => layer.id));
    const receipt = data?.verification?.receipt;
    if (data?.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
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
      if (item.kind === "local-verification" && !String(item.url).startsWith((receipt?.url || "") + "#")) {
        errors.push("本地验证 " + (item.id || "未知") + " 未指向验证收据");
      }
      if (!item.statement || !item.layer || !item.kind || !item.url) errors.push(`证据 ${item.id || "未知"} 缺少必要字段`);
      if (repositoryKinds.has(item.kind) && !String(item.url).includes(`/blob/${commit}/`)) {
        errors.push(`仓库证据 ${item.id || "未知"} 未固定到源码提交`);
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

  return { claimKinds, repositoryKinds, attributionLabels, evidenceById, validateDossier, mechanismById, filterEvidence, xClaimLabel };
});
