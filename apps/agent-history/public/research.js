(function () {
  "use strict";

  const app = document.getElementById("researchApp");
  const status = document.getElementById("researchStatus");
  const indexView = document.getElementById("researchIndex");
  const detailView = document.getElementById("researchDetail");
  const productLabels = {
    "claude-code": "Claude Code",
    codex: "Codex",
    opencode: "opencode",
    "cross-product": "跨产品",
  };
  const state = {
    manifest: null,
    study: null,
    records: [],
    topic: "all",
    product: "all",
    type: "all",
    query: "",
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

  function formatDate(value) {
    const parts = String(value || "").split("-");
    if (parts.length !== 3) return value || "日期未知";
    return `${parts[0]} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
  }

  function safeHref(value) {
    if (typeof value !== "string") return null;
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  async function fetchJson(url, label) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${label}读取失败（${response.status}）`);
    return response.json();
  }

  function validateManifest(data) {
    if (!data || !Array.isArray(data.studies) || !data.studies.length) throw new Error("专题索引格式不正确");
    const ids = new Set();
    data.studies.forEach((study) => {
      if (
        !study.id || !study.title || !study.verifiedAt || !study.fact
        || !Array.isArray(study.products) || !study.products.length
        || !Array.isArray(study.sourceKinds)
        || !Array.isArray(study.headlineEvidence) || !study.headlineEvidence.length
        || !Number.isInteger(study.evidenceCount) || !Number.isInteger(study.unknownCount)
        || !(study.data || (study.evidence && study.summary))
      ) {
        throw new Error("专题索引缺少必要字段");
      }
      if (ids.has(study.id)) throw new Error(`专题 ID 重复：${study.id}`);
      ids.add(study.id);
    });
    return data;
  }

  function setOptions(select, options, allLabel, selected) {
    const all = el("option", "", allLabel);
    all.value = "all";
    const nodes = [all, ...options.map((option) => {
      const node = el("option", "", option.label);
      node.value = option.value;
      return node;
    })];
    select.replaceChildren(...nodes);
    select.value = nodes.some((node) => node.value === selected) ? selected : "all";
  }

  function updateIndexUrl() {
    const url = new URL(location.href);
    url.searchParams.delete("study");
    url.searchParams.delete("evidence");
    for (const [key, value] of [["topic", state.topic], ["product", state.product]]) {
      if (value === "all") url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    history.replaceState(null, "", url);
  }

  function researchHref(study) {
    const url = new URL("/capabilities.html", location.origin);
    url.searchParams.set("study", study.id);
    return `${url.pathname}${url.search}`;
  }

  function makeStudyItem(study) {
    const article = el("article", "research-item");
    article.dataset.kind = study.kind;
    const link = el("a", "research-item-link");
    link.href = researchHref(study);
    link.setAttribute("aria-label", `查看专题：${study.title}`);
    const rail = el("span", "research-item-rail");
    rail.setAttribute("aria-hidden", "true");
    const content = el("span", "research-item-content");
    const meta = el("span", "research-item-meta");
    meta.append(
      el("span", "research-kind", study.kindLabel),
      el("span", "", study.topic),
      el("span", "", study.products.map((product) => `${product.label} ${product.version}`).join(" · ")),
    );
    const title = el("strong", "research-item-title", study.title);
    const fact = el("span", "research-item-fact", study.fact);
    const footer = el("span", "research-item-footer");
    const sourceList = el("span", "research-source-list");
    study.sourceKinds.forEach((source) => sourceList.append(el("span", "", source)));
    const counts = el("span", "research-item-counts");
    counts.append(
      el("span", "", `证据项 ${study.evidenceCount}`),
      el("span", "", `尚未证明 ${study.unknownCount}`),
    );
    const open = el("span", "research-open", "查看事实与证据");
    open.append(icon("arrow-right"));
    footer.append(sourceList, counts, open);
    content.append(meta, title, fact, footer);
    link.append(rail, content);
    article.append(link);
    return article;
  }

  function renderIndexFeed() {
    const matching = state.manifest.studies
      .filter((study) => state.topic === "all" || study.topic === state.topic)
      .filter((study) => state.product === "all" || study.products.some((product) => product.id === state.product))
      .sort((left, right) => right.verifiedAt.localeCompare(left.verifiedAt) || left.title.localeCompare(right.title, "zh-CN"));
    document.getElementById("researchResultCount").textContent = `共 ${matching.length} 个专题`;
    document.getElementById("resetResearchFilters").disabled = state.topic === "all" && state.product === "all";

    if (!matching.length) {
      const empty = el("div", "research-empty");
      empty.append(el("strong", "", "当前筛选没有专题"), el("p", "", "可以调整主题或产品筛选。"));
      document.getElementById("researchFeed").replaceChildren(empty);
      return;
    }

    const nodes = [];
    let date = null;
    matching.forEach((study) => {
      if (study.verifiedAt !== date) {
        date = study.verifiedAt;
        nodes.push(el("h2", "research-date-divider", formatDate(date)));
      }
      nodes.push(makeStudyItem(study));
    });
    document.getElementById("researchFeed").replaceChildren(...nodes);
    refreshIcons();
  }

  function restoreIndexFilters() {
    const url = new URL(location.href);
    const topics = new Set(state.manifest.studies.map((study) => study.topic));
    const products = new Set(state.manifest.studies.flatMap((study) => study.products.map((product) => product.id)));
    state.topic = topics.has(url.searchParams.get("topic")) ? url.searchParams.get("topic") : "all";
    state.product = products.has(url.searchParams.get("product")) ? url.searchParams.get("product") : "all";
  }

  function bindIndexControls() {
    const topic = document.getElementById("researchTopicFilter");
    const product = document.getElementById("researchProductFilter");
    const topics = [...new Set(state.manifest.studies.map((study) => study.topic))]
      .sort((left, right) => left.localeCompare(right, "zh-CN"))
      .map((value) => ({ value, label: value }));
    const productMap = new Map();
    state.manifest.studies.forEach((study) => study.products.forEach((item) => productMap.set(item.id, item.label.replace(" Desktop", "").replace(" for macOS", ""))));
    const products = [...productMap].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
    setOptions(topic, topics, "全部主题", state.topic);
    setOptions(product, products, "全部产品", state.product);
    topic.addEventListener("change", () => {
      state.topic = topic.value;
      renderIndexFeed();
      updateIndexUrl();
    });
    product.addEventListener("change", () => {
      state.product = product.value;
      renderIndexFeed();
      updateIndexUrl();
    });
    document.getElementById("resetResearchFilters").addEventListener("click", () => {
      state.topic = state.product = "all";
      topic.value = product.value = "all";
      renderIndexFeed();
      updateIndexUrl();
    });
  }

  function renderIndex() {
    const studies = state.manifest.studies;
    const latest = studies.map((study) => study.verifiedAt).sort().at(-1);
    document.getElementById("researchIndexMeta").textContent = `${studies.length} 个专题 · 最近核验 ${formatDate(latest)}`;
    restoreIndexFilters();
    bindIndexControls();
    renderIndexFeed();
    indexView.hidden = false;
  }

  function capabilityAgent(study) {
    return study.products.length === 1 ? study.products[0].id : "cross-product";
  }

  function normalizeClaim(claim, study, schema) {
    const type = schema === "capability"
      ? (claim.kind === "inference" ? "inference" : "fact")
      : (claim.type === "inference" ? "inference" : "fact");
    const agent = schema === "capability"
      ? capabilityAgent(study)
      : (claim.agent === "cross-agent" ? "cross-product" : claim.agent);
    const fields = [
      claim.id, claim.title, claim.statement, claim.boundary, claim.layer, claim.grade,
      claim.artifact, claim.locator, claim.sha256, ...(claim.signals || []),
      claim.source?.label, claim.source?.url, claim.compare?.label,
    ].filter(Boolean);
    return {
      id: claim.id,
      type,
      agent,
      version: claim.version || study.products.find((product) => product.id === agent)?.version || "",
      confidence: String(claim.confidence || "").toLocaleLowerCase(),
      title: claim.title,
      statement: claim.statement,
      boundary: claim.boundary,
      layer: claim.layer,
      grade: claim.grade,
      signals: claim.signals || [],
      artifact: claim.artifact,
      locator: claim.locator,
      sha256: claim.sha256,
      source: claim.source,
      compare: claim.compare,
      search: fields.join(" ").toLocaleLowerCase(),
    };
  }

  function normalizeUnknown(item, study) {
    const agent = capabilityAgent(study);
    return {
      id: item.id,
      type: "unknown",
      agent,
      version: study.products.find((product) => product.id === agent)?.version || "",
      title: item.title,
      statement: item.text,
      needed: item.needed,
      search: [item.id, item.title, item.text, item.needed].filter(Boolean).join(" ").toLocaleLowerCase(),
    };
  }

  async function loadStudyRecords(study) {
    if (study.data) {
      const data = await fetchJson(study.data, "研究数据");
      if (!Array.isArray(data.evidence) || !Array.isArray(data.unknowns)) throw new Error("研究数据格式不正确");
      return [
        ...data.evidence.map((claim) => normalizeClaim(claim, study, "capability")),
        ...data.unknowns.map((item) => normalizeUnknown(item, study)),
      ];
    }
    const [evidence, summary] = await Promise.all([
      fetchJson(study.evidence, "事实证据"),
      fetchJson(study.summary, "未知项"),
    ]);
    if (!Array.isArray(evidence.claims) || !Array.isArray(summary.unknowns)) throw new Error("比较研究数据格式不正确");
    return [
      ...evidence.claims.map((claim) => normalizeClaim(claim, study, "comparison")),
      ...summary.unknowns.map((item) => normalizeUnknown(item, study)),
    ];
  }

  function typeLabel(type) {
    return { fact: "事实", inference: "推断", unknown: "尚未证明" }[type] || type;
  }

  function confidenceLabel(value) {
    return { high: "把握高", medium: "把握中等", low: "把握有限", "high for capture": "捕获证据把握高" }[value] || value;
  }

  function makeMetaRow(label, value) {
    const row = el("div");
    row.append(el("dt", "", label), el("dd", "", String(value)));
    return row;
  }

  function makeRecordLinks(record) {
    const links = el("div", "research-evidence-links");
    for (const [data, fallback, iconName] of [[record.source, "打开公开来源", "external-link"], [record.compare, "打开版本比较", "git-compare-arrows"]]) {
      const href = safeHref(data?.url);
      if (!href) continue;
      const anchor = el("a", "", "");
      anchor.href = href;
      anchor.append(icon(iconName), el("span", "", data.label || fallback));
      if (/^https?:/.test(href)) {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
      }
      links.append(anchor);
    }
    return links;
  }

  function updateEvidenceUrl(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("evidence", id);
    else url.searchParams.delete("evidence");
    history.replaceState(null, "", url);
  }

  function makeEvidenceRecord(record) {
    const details = el("details", "research-evidence-row");
    details.id = `evidence-${record.id}`;
    details.dataset.recordType = record.type;
    details.dataset.agent = record.agent || "cross-product";
    const summary = el("summary", "research-evidence-summary");
    const rail = el("span", "research-evidence-rail");
    rail.setAttribute("aria-hidden", "true");
    const copy = el("span", "research-evidence-copy");
    const meta = el("span", "research-evidence-meta");
    meta.append(el("span", "research-evidence-kind", typeLabel(record.type)), el("code", "", record.id));
    if (record.agent && record.agent !== "cross-product") meta.append(el("span", "", `${productLabels[record.agent] || record.agent}${record.version ? ` ${record.version}` : ""}`));
    if (record.confidence) meta.append(el("span", "", confidenceLabel(record.confidence)));
    copy.append(meta, el("strong", "", record.title), el("span", "research-evidence-statement", record.statement));
    const expand = el("span", "research-evidence-expand", record.type === "unknown" ? "核验缺口" : "证据与边界");
    expand.append(icon("chevron-down"));
    summary.append(rail, copy, expand);
    details.append(summary);

    const body = el("div", "research-evidence-body");
    if (record.type === "unknown") {
      const needed = el("div", "research-needed");
      needed.append(el("strong", "", "还需要"), el("p", "", record.needed));
      body.append(needed);
    } else {
      const evidenceMeta = el("dl", "research-evidence-location");
      const rows = [
        ["证据层", record.layer],
        ["证据等级", record.grade],
        ["文件", record.artifact],
        ["具体位置", record.locator],
        ["SHA-256", record.sha256],
        ["可见信号", record.signals.length ? record.signals.join(" · ") : null],
      ].filter(([, value]) => value);
      rows.forEach(([label, value]) => evidenceMeta.append(makeMetaRow(label, value)));
      if (rows.length) body.append(evidenceMeta);
      const boundary = el("div", "research-boundary");
      boundary.append(el("strong", "", "边界"), el("p", "", record.boundary));
      body.append(boundary);
      const links = makeRecordLinks(record);
      if (links.childElementCount) body.append(links);
    }
    details.append(body);
    details.addEventListener("toggle", () => {
      if (details.open) {
        document.querySelectorAll(".research-evidence-row[open]").forEach((other) => {
          if (other !== details) other.open = false;
        });
        updateEvidenceUrl(record.id);
      } else if (new URL(location.href).searchParams.get("evidence") === record.id) {
        updateEvidenceUrl(null);
      }
    });
    return details;
  }

  function updateDetailUrl() {
    const url = new URL(location.href);
    if (state.type === "all") url.searchParams.delete("type");
    else url.searchParams.set("type", state.type);
    url.searchParams.delete("agent");
    if (state.query.trim()) url.searchParams.set("q", state.query.trim());
    else url.searchParams.delete("q");
    url.searchParams.delete("evidence");
    history.replaceState(null, "", url);
  }

  function matchingRecords() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.records.filter((record) => (
      (state.type === "all" || record.type === state.type)
      && (!query || record.search.includes(query))
    ));
  }

  function renderEvidenceList() {
    const matching = matchingRecords();
    const factCount = matching.filter((record) => record.type === "fact").length;
    const inferenceCount = matching.filter((record) => record.type === "inference").length;
    const unknownCount = matching.filter((record) => record.type === "unknown").length;
    const parts = [`${factCount} 条事实`];
    if (inferenceCount) parts.push(`${inferenceCount} 条推断`);
    if (unknownCount) parts.push(`${unknownCount} 项尚未证明`);
    document.getElementById("researchEvidenceCount").textContent = parts.join(" · ");
    document.getElementById("resetEvidenceFilters").disabled = state.type === "all" && !state.query;
    if (!matching.length) {
      const empty = el("div", "research-empty");
      empty.append(el("strong", "", "没有匹配的事实"), el("p", "", "可以清除搜索或调整筛选。"));
      document.getElementById("researchEvidenceList").replaceChildren(empty);
    } else {
      document.getElementById("researchEvidenceList").replaceChildren(...matching.map(makeEvidenceRecord));
    }
    refreshIcons();
  }

  function restoreDetailFilters() {
    const url = new URL(location.href);
    const types = new Set(["all", "fact", "inference", "unknown"]);
    state.type = types.has(url.searchParams.get("type")) ? url.searchParams.get("type") : "all";
    state.query = url.searchParams.get("q") || "";
    if (url.searchParams.has("agent")) {
      url.searchParams.delete("agent");
      history.replaceState(null, "", url);
    }
  }

  function bindDetailControls() {
    const search = document.getElementById("researchEvidenceSearch");
    const type = document.getElementById("researchEvidenceType");
    search.value = state.query;
    type.value = state.type;
    search.addEventListener("input", () => {
      state.query = search.value;
      renderEvidenceList();
      updateDetailUrl();
    });
    type.addEventListener("change", () => {
      state.type = type.value;
      renderEvidenceList();
      updateDetailUrl();
    });
    document.getElementById("resetEvidenceFilters").addEventListener("click", () => {
      state.type = "all";
      state.query = "";
      search.value = "";
      type.value = "all";
      renderEvidenceList();
      updateDetailUrl();
    });
  }

  function renderProducts(study) {
    const container = document.getElementById("researchProducts");
    study.products.forEach((product) => {
      const item = el("span", "research-product");
      item.append(el("strong", "", product.label), el("code", "", product.version));
      container.append(item);
    });
  }

  function renderHeadlineEvidence(study) {
    const byId = new Map(state.records.map((record) => [record.id, record]));
    const container = document.getElementById("researchHeadlineEvidence");
    container.append(el("span", "", "结论依据"));
    study.headlineEvidence.forEach((id) => {
      const record = byId.get(id);
      if (!record || record.type === "unknown") throw new Error(`结论依据无法解析：${id}`);
      const url = new URL(location.href);
      url.search = "";
      url.searchParams.set("study", study.id);
      url.searchParams.set("evidence", id);
      const anchor = el("a", "", id);
      anchor.href = `${url.pathname}${url.search}`;
      anchor.setAttribute("aria-label", `查看结论依据 ${id}：${record.title}`);
      container.append(anchor);
    });
  }

  async function renderDetail(study) {
    state.study = study;
    state.records = await loadStudyRecords(study);
    const evidenceCount = state.records.filter((record) => record.type !== "unknown").length;
    const unknownCount = state.records.filter((record) => record.type === "unknown").length;
    if (evidenceCount !== study.evidenceCount || unknownCount !== study.unknownCount) throw new Error("专题索引与证据数据不一致");
    document.title = `${study.title} · 专题研究 · AgentLab`;
    document.querySelector('meta[name="description"]').content = study.fact;
    document.getElementById("researchDetailTitle").textContent = study.title;
    document.getElementById("researchDetailFact").textContent = study.fact;
    const meta = document.getElementById("researchDetailMeta");
    meta.append(el("span", "research-kind", study.kindLabel), el("span", "", study.topic), el("span", "", `核验于 ${formatDate(study.verifiedAt)}`));
    renderProducts(study);
    renderHeadlineEvidence(study);
    const legacy = document.getElementById("researchLegacyLink");
    legacy.href = study.legacyHref;
    legacy.querySelector("span").textContent = study.evidence ? "打开操作比较视图" : "打开完整实现笔记";
    restoreDetailFilters();
    bindDetailControls();
    renderEvidenceList();
    detailView.hidden = false;

    const requestedEvidence = new URL(location.href).searchParams.get("evidence");
    if (requestedEvidence) {
      const requested = document.getElementById(`evidence-${CSS.escape(requestedEvidence)}`);
      if (requested) {
        requested.open = true;
        requestAnimationFrame(() => requested.scrollIntoView({ block: "start" }));
      }
    }
  }

  async function init() {
    state.manifest = validateManifest(await fetchJson("/research-index.json", "专题索引"));
    const requested = new URL(location.href).searchParams.get("study");
    const study = state.manifest.studies.find((item) => item.id === requested);
    if (requested && !study) throw new Error("找不到这个专题");
    if (study) await renderDetail(study);
    else renderIndex();
    status.hidden = true;
    app.setAttribute("aria-busy", "false");
    refreshIcons();
  }

  init().catch((error) => {
    status.replaceChildren(el("strong", "", "专题读取失败"), el("span", "", error.message));
    status.dataset.state = "error";
    app.setAttribute("aria-busy", "false");
  });

  refreshIcons();
}());
