(function () {
  "use strict";

  const app = document.getElementById("researchApp");
  const status = document.getElementById("researchStatus");
  const indexView = document.getElementById("researchIndex");
  const detailView = document.getElementById("researchDetail");
  const productLabels = {
    "claude-code": "Claude Code",
    codex: "Codex",
    "deepseek-harness": "DeepSeek Harness",
    "exo": "Exo",
    opencode: "opencode",
    "cross-product": "跨产品",
  };
  const state = {
    manifest: null,
    study: null,
    records: [],
    topic: "all",
    product: "all",
    indexQuery: "",
    type: "all",
    query: "",
    requestedEvidence: null,
    invalidEvidence: null,
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
        !study.id || !study.title || !study.question || !study.implication || !study.boundary || !study.verifiedAt || !study.fact
        || !Array.isArray(study.products) || !study.products.length
        || !Array.isArray(study.sourceKinds)
        || !Array.isArray(study.headlineEvidence) || study.headlineEvidence.length < 3 || study.headlineEvidence.length > 5
        || !Number.isInteger(study.evidenceCount) || !Number.isInteger(study.unknownCount)
        || !Number.isInteger(study.editorialRank)
        || !(study.data || (study.evidence && study.summary))
      ) {
        throw new Error("专题索引缺少必要字段");
      }
      if (ids.has(study.id)) throw new Error(`专题 ID 重复：${study.id}`);
      if (study.featured && (
        !Array.isArray(study.leadPaths) || study.leadPaths.length < 2
        || study.leadPaths.some((path) => !path.label || !Array.isArray(path.steps) || path.steps.length < 2)
      )) throw new Error("焦点专题缺少可读的路径对照");
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
    url.searchParams.delete("type");
    url.searchParams.delete("q");
    url.searchParams.delete("agent");
    url.searchParams.delete("replay");
    url.searchParams.delete("frame");
    url.searchParams.delete("ax");
    for (const [key, value] of [["topic", state.topic], ["product", state.product]]) {
      if (value === "all") url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (state.indexQuery.trim()) url.searchParams.set("search", state.indexQuery.trim());
    else url.searchParams.delete("search");
    history.replaceState(null, "", url);
  }

  function researchHref(study) {
    return window.ResearchNavigation.studyHref(location.href, study.id, {
      topic: state.topic,
      product: state.product,
      search: state.indexQuery,
    });
  }

  function makeStudyItem(study) {
    const article = el("article", "research-item");
    article.dataset.kind = study.kind;
    const link = el("a", "research-item-link");
    link.href = researchHref(study);
    link.setAttribute("aria-label", `查看专题：${study.question}`);
    const content = el("div", "research-item-copy");
    const meta = el("span", "research-item-meta");
    meta.append(
      el("span", "research-kind", study.kindLabel),
      el("span", "", study.title),
      el("span", "", study.products.map((product) => product.label).join(" · ")),
    );
    const title = el("strong", "research-item-title", study.question);
    const fact = el("span", "research-item-fact", study.fact);
    content.append(meta, title, fact);
    const decision = el("div", "research-item-decision");
    decision.append(el("span", "", "工程判断"), el("p", "", study.implication));
    const open = el("span", "research-item-open");
    open.append(icon("arrow-right"));
    link.append(content, decision, open);
    article.append(link);
    return article;
  }

  function indexSearchText(study) {
    return [
      study.title, study.question, study.fact, study.implication, study.topic,
      ...study.sourceKinds,
      ...study.products.flatMap((product) => [product.label, product.version]),
    ].filter(Boolean).join(" ").toLocaleLowerCase();
  }

  function makeLeadStudy(study) {
    const link = el("a", "research-lead-link");
    link.href = researchHref(study);
    link.setAttribute("aria-label", `阅读本期焦点：${study.question}`);
    const copy = el("div", "research-lead-copy");
    const meta = el("div", "research-lead-meta");
    meta.append(el("span", "research-kind", "本期焦点"), el("span", "", study.title), el("span", "", study.topic));
    const decision = el("div", "research-lead-decision");
    decision.append(el("span", "", "工程判断"), el("p", "", study.implication));
    const footer = el("div", "research-lead-footer");
    footer.append(
      el("span", "", study.products.map((product) => `${product.label} ${product.version}`).join(" · ")),
      el("span", "research-lead-open", "阅读全文"),
    );
    footer.lastElementChild.append(icon("arrow-right"));
    copy.append(meta, el("h2", "research-lead-title", study.question), el("p", "research-lead-fact", study.fact), decision, footer);

    const visual = el("div", "research-lead-visual");
    visual.append(el("span", "", "两条控制路径"));
    (study.leadPaths || []).forEach((path) => {
      const row = el("div", "research-path");
      const steps = el("div", "research-path-steps");
      path.steps.forEach((step) => steps.append(el("span", "", step)));
      row.append(el("strong", "", path.label), steps);
      visual.append(row);
    });
    link.append(copy, visual);
    return link;
  }

  function renderIndexFeed() {
    const query = state.indexQuery.trim().toLocaleLowerCase();
    const matching = state.manifest.studies
      .filter((study) => state.topic === "all" || study.topic === state.topic)
      .filter((study) => state.product === "all" || study.products.some((product) => product.id === state.product))
      .filter((study) => !query || indexSearchText(study).includes(query))
      .sort((left, right) => left.editorialRank - right.editorialRank);
    document.getElementById("researchResultCount").textContent = `共 ${matching.length} 个专题`;
    document.getElementById("resetResearchFilters").disabled = state.topic === "all" && state.product === "all" && !state.indexQuery;

    if (!matching.length) {
      const empty = el("div", "research-empty");
      empty.append(el("strong", "", "当前筛选没有专题"), el("p", "", "可以调整主题或产品筛选。"));
      document.getElementById("researchFeed").replaceChildren(empty);
      return;
    }

    const groups = new Map();
    matching.forEach((study) => {
      if (!groups.has(study.topic)) groups.set(study.topic, []);
      groups.get(study.topic).push(study);
    });
    const nodes = [...groups].map(([topic, studies]) => {
      const group = el("section", "research-topic-group");
      const heading = el("header", "research-topic-heading");
      heading.append(el("h2", "", topic), el("p", "", `${studies.length} 个问题`));
      const items = el("div", "research-topic-items");
      studies.forEach((study) => items.append(makeStudyItem(study)));
      group.append(heading, items);
      return group;
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
    state.indexQuery = url.searchParams.get("search") || "";
  }

  function bindIndexControls() {
    const topic = document.getElementById("researchTopicFilter");
    const product = document.getElementById("researchProductFilter");
    const search = document.getElementById("researchIndexSearch");
    const topics = [...new Set(state.manifest.studies.map((study) => study.topic))]
      .sort((left, right) => left.localeCompare(right, "zh-CN"))
      .map((value) => ({ value, label: value }));
    const productMap = new Map();
    state.manifest.studies.forEach((study) => study.products.forEach((item) => productMap.set(item.id, item.label.replace(" Desktop", "").replace(" for macOS", ""))));
    const products = [...productMap].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
    setOptions(topic, topics, "全部主题", state.topic);
    setOptions(product, products, "全部产品", state.product);
    search.value = state.indexQuery;
    if (state.topic !== "all" || state.product !== "all" || state.indexQuery) {
      document.querySelector(".research-filter-disclosure").open = true;
    }
    search.addEventListener("input", () => {
      state.indexQuery = search.value;
      renderIndexFeed();
      updateIndexUrl();
    });
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
      state.indexQuery = "";
      search.value = "";
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
    const featured = studies.find((study) => study.featured) || [...studies].sort((left, right) => left.editorialRank - right.editorialRank)[0];
    document.getElementById("researchLead").replaceChildren(makeLeadStudy(featured));
    bindIndexControls();
    renderIndexFeed();
    indexView.hidden = false;
    const cleanUrl = new URL(location.href);
    for (const key of ["replay", "frame", "ax"]) cleanUrl.searchParams.delete(key);
    if (cleanUrl.href !== location.href) history.replaceState(null, "", cleanUrl);
  }

  function capabilityAgent(study) {
    return study.products.length === 1 ? study.products[0].id : "cross-product";
  }

  function normalizeClaim(claim, study, schema) {
    const type = schema === "capability"
      ? (claim.kind === "inference" ? "inference" : "observation")
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
    return { fact: "事实", observation: "观察", inference: "推断", unknown: "尚未证明" }[type] || type;
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
      (state.type === "all" || record.type === state.type || (state.type === "fact" && record.type === "observation"))
      && (!query || record.search.includes(query))
    ));
  }

  function renderEvidenceList() {
    const matching = matchingRecords();
    const factCount = matching.filter((record) => record.type === "fact").length;
    const observationCount = matching.filter((record) => record.type === "observation").length;
    const inferenceCount = matching.filter((record) => record.type === "inference").length;
    const unknownCount = matching.filter((record) => record.type === "unknown").length;
    const parts = [];
    if (factCount) parts.push(`${factCount} 条事实`);
    if (observationCount) parts.push(`${observationCount} 条观察`);
    if (inferenceCount) parts.push(`${inferenceCount} 条推断`);
    if (unknownCount) parts.push(`${unknownCount} 项尚未证明`);
    document.getElementById("researchEvidenceCount").textContent = parts.join(" · ");
    document.getElementById("resetEvidenceFilters").disabled = state.type === "all" && !state.query;
    const notice = state.invalidEvidence
      ? el("div", "research-evidence-notice", `找不到证据 ${state.invalidEvidence}，已显示完整证据库。`)
      : null;
    if (!matching.length) {
      const empty = el("div", "research-empty");
      empty.append(el("strong", "", "没有匹配的事实"), el("p", "", "可以清除搜索或调整筛选。"));
      document.getElementById("researchEvidenceList").replaceChildren(...[notice, empty].filter(Boolean));
    } else {
      document.getElementById("researchEvidenceList").replaceChildren(...[notice, ...matching.map(makeEvidenceRecord)].filter(Boolean));
    }
    refreshIcons();
  }

  function restoreDetailFilters() {
    const request = window.ResearchNavigation.detailRequest(
      location.href,
      new Set(state.records.map((record) => record.id)),
    );
    state.type = request.type;
    state.query = request.query;
    state.requestedEvidence = request.requestedEvidence;
    state.invalidEvidence = request.invalidEvidence;
    if (request.href !== location.href) history.replaceState(null, "", request.href);
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
    study.headlineEvidence.forEach((id) => {
      const record = byId.get(id);
      if (!record || record.type === "unknown") throw new Error(`结论依据无法解析：${id}`);
      const url = new URL(location.href);
      url.searchParams.delete("type");
      url.searchParams.delete("q");
      url.searchParams.delete("agent");
      url.searchParams.set("study", study.id);
      url.searchParams.set("evidence", id);
      const row = el("article", "research-key-row");
      const copy = el("div", "research-key-copy");
      copy.append(el("strong", "", record.title), el("p", "", record.statement));
      const anchor = el("a", "", "查看证据与边界");
      anchor.href = `${url.pathname}${url.search}`;
      anchor.setAttribute("aria-label", `查看结论依据 ${id}：${record.title}`);
      anchor.append(icon("arrow-down"));
      row.append(el("code", "", id), copy, anchor);
      container.append(row);
    });
    const remaining = state.records.filter((record) => record.type !== "unknown").length - study.headlineEvidence.length;
    if (remaining > 0) container.append(el("p", "research-key-more", `其余 ${remaining} 条记录保留在下方证据库`));
  }

  async function renderDetail(study) {
    if (study.id !== "computer-use") {
      const cleanUrl = new URL(location.href);
      for (const key of ["replay", "frame", "ax"]) cleanUrl.searchParams.delete(key);
      if (cleanUrl.href !== location.href) history.replaceState(null, "", cleanUrl);
    }
    state.study = study;
    state.records = await loadStudyRecords(study);
    const evidenceCount = state.records.filter((record) => record.type !== "unknown").length;
    const unknownCount = state.records.filter((record) => record.type === "unknown").length;
    if (evidenceCount !== study.evidenceCount || unknownCount !== study.unknownCount) throw new Error("专题索引与证据数据不一致");
    document.title = `${study.title} · 专题研究 · AgentLab`;
    document.querySelector('meta[name="description"]').content = `${study.question} ${study.fact}`;
    document.getElementById("researchDetailTitle").textContent = study.title;
    document.getElementById("researchDetailQuestion").textContent = study.question;
    document.getElementById("researchDetailFact").textContent = study.fact;
    document.getElementById("researchImplication").textContent = study.implication;
    document.getElementById("researchBoundary").textContent = study.boundary;
    const meta = document.getElementById("researchDetailMeta");
    meta.append(el("span", "research-kind", study.kindLabel), el("span", "", study.topic), el("span", "", `核验于 ${formatDate(study.verifiedAt)}`));
    const back = document.querySelector(".research-back");
    const backUrl = new URL(location.href);
    backUrl.searchParams.delete("study");
    backUrl.searchParams.delete("evidence");
    backUrl.searchParams.delete("type");
    backUrl.searchParams.delete("q");
    backUrl.searchParams.delete("agent");
    backUrl.searchParams.delete("replay");
    backUrl.searchParams.delete("frame");
    backUrl.searchParams.delete("ax");
    back.href = `${backUrl.pathname}${backUrl.search}`;
    renderProducts(study);
    renderHeadlineEvidence(study);
    const legacy = document.getElementById("researchLegacyLink");
    legacy.href = study.legacyHref;
    legacy.querySelector("span").textContent = study.evidence ? "查看完整比较工作台" : "查看完整实现笔记";
    document.getElementById("researchScope").textContent = `结论仅适用于 ${study.products.map((product) => `${product.label} ${product.version}`).join("、")}。直接证据、跨证据推断和未知项分别呈现；没有证据的部分不补成叙事。`;
    restoreDetailFilters();
    bindDetailControls();
    renderEvidenceList();
    detailView.hidden = false;
    window.dispatchEvent(new CustomEvent("agentlab:research-detail-ready", {
      detail: { study, records: state.records },
    }));

    const requestedEvidence = state.requestedEvidence;
    if (requestedEvidence) {
      const requested = document.getElementById(`evidence-${CSS.escape(requestedEvidence)}`);
      if (requested) {
        document.getElementById("researchArchive").open = true;
        requested.open = true;
        requestAnimationFrame(() => {
          requested.scrollIntoView({ block: "start" });
          requested.querySelector("summary")?.focus({ preventScroll: true });
        });
      }
    } else if (state.type !== "all" || state.query || state.invalidEvidence) {
      document.getElementById("researchArchive").open = true;
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
