(function () {
  "use strict";

  const root = document.getElementById("dossierRoot");
  const status = document.getElementById("dossierStatus");
  const agentMeta = {
    "claude-code": { label: "Claude Code", icon: "/agent-icons/claude-code.png" },
    codex: { label: "Codex", icon: "/agent-icons/codex.png" },
    opencode: { label: "opencode", icon: "/agent-icons/opencode.png" },
  };
  let claimById = new Map();

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

  function agentLabel(agent, version) {
    const meta = agentMeta[agent];
    const node = el("span", "agent-label");
    const image = el("img");
    image.src = meta.icon;
    image.alt = "";
    node.append(image, el("strong", "", meta.label));
    if (version) node.append(el("code", "", version));
    return node;
  }

  function evidenceLink(link, kind) {
    const anchor = el("a", `evidence-link ${kind === "compare" ? "is-compare" : ""}`);
    anchor.href = link.url;
    anchor.append(icon(kind === "compare" ? "git-compare-arrows" : "external-link"), el("span", "", link.label));
    anchor.dataset.evidenceLink = "";
    if (kind === "compare") {
      anchor.dataset.agentlabComparison = "";
    } else {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    return anchor;
  }

  function claimRef(id, type = "fact") {
    const labels = { fact: "事实", observation: "观察", unknown: "未知" };
    const anchor = el("a", `claim-ref claim-${type}`, `${labels[type]} ${id}`);
    anchor.href = `#evidence-${id}`;
    anchor.dataset.claimRef = id;
    anchor.dataset.claimType = type;
    return anchor;
  }

  function appendRefs(parent, ids, type = "fact") {
    const refs = el("span", "claim-refs");
    (ids || []).forEach((id) => refs.append(claimRef(id, type)));
    parent.append(refs);
  }

  function validate(summary, evidence) {
    if (!Array.isArray(summary.models) || summary.models.length !== 3) throw new Error("控制模型数据不完整");
    if (!Array.isArray(summary.matrix) || summary.matrix.length < 8) throw new Error("工程矩阵数据不完整");
    if (!Array.isArray(evidence.claims) || evidence.claims.length < 12) throw new Error("证据账本数据不完整");
    const ids = new Set(evidence.claims.map((item) => item.id));
    const refs = [
      ...summary.models.flatMap((item) => item.claims || []),
      ...summary.matrix.flatMap((row) => Object.values(row.cells).flatMap((cell) => cell.claims || [])),
      ...summary.anatomies.flatMap((item) => item.claims || []),
      ...summary.observations.flatMap((item) => item.claims || []),
    ];
    if (refs.some((id) => !ids.has(id))) throw new Error("存在无法定位的事实引用");
  }

  function renderHero(data) {
    document.getElementById("dossierKicker").textContent = `MECHANISM ${data.number} · AUDIT ${data.verifiedAt}`;
    document.getElementById("dossierTitle").textContent = data.title;
    document.getElementById("dossierThesis").textContent = data.thesis;
    document.getElementById("dossierScope").textContent = data.scope;
    const strip = document.getElementById("snapshotStrip");
    data.snapshots.forEach((snapshot) => {
      const item = el("div", "snapshot-item");
      item.dataset.agent = snapshot.agent;
      item.append(agentLabel(snapshot.agent), el("strong", "", snapshot.version));
      item.append(el("small", "", `${snapshot.captures} 个版本快照`));
      strip.append(item);
    });
  }

  function renderModels(data) {
    const container = document.getElementById("modelBands");
    data.models.forEach((model) => {
      const article = el("article", "model-band");
      article.dataset.agent = model.agent;
      const heading = el("header");
      heading.append(agentLabel(model.agent, model.version));
      heading.append(el("span", "model-archetype", model.archetype));
      const summary = el("p", "model-summary", model.summary);
      const lanes = el("ol", "control-lanes");
      model.lanes.forEach((lane, index) => {
        const item = el("li");
        item.append(el("span", "", String(index + 1).padStart(2, "0")), el("code", "", lane));
        lanes.append(item);
      });
      article.append(heading, summary, lanes);
      appendRefs(article, model.claims);
      container.append(article);
    });
  }

  function renderMatrix(data) {
    const grid = document.getElementById("matrixGrid");
    const header = el("div", "matrix-row matrix-head");
    header.setAttribute("role", "row");
    ["工程维度", "Claude Code", "Codex", "opencode"].forEach((label) => {
      const cell = el("div", "", label);
      cell.setAttribute("role", "columnheader");
      header.append(cell);
    });
    grid.append(header);
    data.matrix.forEach((row) => {
      const line = el("div", "matrix-row");
      line.setAttribute("role", "row");
      line.dataset.matrixDimension = row.group;
      const dimension = el("div", "matrix-dimension");
      dimension.setAttribute("role", "rowheader");
      dimension.append(el("small", "", row.group), el("strong", "", row.label));
      line.append(dimension);
      Object.keys(agentMeta).forEach((agent) => {
        const item = row.cells[agent];
        const cell = el("div", "matrix-cell");
        cell.setAttribute("role", "cell");
        cell.dataset.agentLabel = agentMeta[agent].label;
        cell.append(el("span", "matrix-mobile-label", agentMeta[agent].label), el("p", "", item.text));
        if (item.claims) appendRefs(cell, item.claims);
        if (item.unknown) appendRefs(cell, [item.unknown], "unknown");
        line.append(cell);
      });
      grid.append(line);
    });
  }

  function claimCard(claim) {
    const article = el("article", "anatomy-claim");
    const title = el("div", "anatomy-claim-title");
    title.append(claimRef(claim.id), el("h3", "", claim.title));
    const meta = el("div", "claim-meta");
    [claim.version, claim.layer, `置信度 ${claim.confidence}`].forEach((value) => meta.append(el("span", "", value)));
    const limits = el("p", "claim-boundary");
    limits.append(el("strong", "", "边界 "), document.createTextNode(claim.boundary));
    const links = el("div", "evidence-links");
    links.append(evidenceLink(claim.source, "source"), evidenceLink(claim.compare, "compare"));
    article.append(title, meta, el("p", "claim-statement", claim.statement), limits, links);
    return article;
  }

  function renderAnatomies(data) {
    data.anatomies.forEach((anatomy, index) => {
      const section = document.getElementById(anatomy.agent);
      const heading = el("header", "mechanism-section-heading");
      const copy = el("div");
      copy.append(agentLabel(anatomy.agent, data.snapshots.find((item) => item.agent === anatomy.agent).version));
      copy.append(el("h2", "", anatomy.title));
      heading.append(el("span", "", String(index + 3).padStart(2, "0")), copy);
      const grid = el("div", "anatomy-claims");
      anatomy.claims.forEach((id) => grid.append(claimCard(claimById.get(id))));
      section.append(heading, grid);
    });
  }

  function renderTimeline(data) {
    const container = document.getElementById("timeline");
    data.timeline.forEach((event) => {
      const article = el("article", "timeline-event");
      article.dataset.agent = event.agent;
      const when = el("div", "timeline-date");
      when.append(el("time", "", event.date), agentLabel(event.agent));
      const body = el("div", "timeline-body");
      body.append(el("code", "", event.version), el("h3", "", event.title), el("p", "", event.text));
      const link = evidenceLink({ label: event.url.startsWith("/") ? "打开版本对比" : "打开发布证据", url: event.url }, event.url.startsWith("/") ? "compare" : "source");
      article.append(when, body, link);
      container.append(article);
    });
  }

  function renderObservations(data) {
    const container = document.getElementById("observationList");
    data.observations.forEach((item) => {
      const article = el("article", "observation-record");
      article.id = `evidence-${item.id}`;
      article.dataset.claimId = item.id;
      article.dataset.claimType = "observation";
      article.dataset.derivedFrom = item.claims.join(" ");
      const type = el("span", "claim-type-label", "观察");
      type.dataset.claimTypeLabel = "";
      article.append(type, el("code", "", item.id), el("h3", "", item.title), el("p", "", item.text));
      appendRefs(article, item.claims);
      container.append(article);
    });
  }

  function renderUnknowns(data) {
    const container = document.getElementById("unknownList");
    data.unknowns.forEach((item) => {
      const article = el("article", "unknown-record");
      article.id = `evidence-${item.id}`;
      article.dataset.claimId = item.id;
      article.dataset.claimType = "unknown";
      const type = el("span", "claim-type-label", "未知");
      type.dataset.claimTypeLabel = "";
      article.append(type, el("code", "", item.id), el("h3", "", item.title), el("p", "", item.text));
      const needed = el("p", "unknown-needed");
      needed.append(el("strong", "", "需要补充 "), document.createTextNode(item.needed));
      article.append(needed);
      container.append(article);
    });
  }

  function factRecord(claim) {
    const article = el("article", "evidence-record");
    article.id = `evidence-${claim.id}`;
    article.dataset.claimId = claim.id;
    article.dataset.claimType = "fact";
    article.dataset.agent = claim.agent;
    const head = el("header", "evidence-record-head");
    const identity = el("div");
    const type = el("span", "claim-type-label", "事实");
    type.dataset.claimTypeLabel = "";
    identity.append(type, el("code", "", claim.id), agentLabel(claim.agent, claim.version));
    head.append(identity, el("span", "confidence", claim.confidence));
    const meta = el("dl", "evidence-meta");
    [["证据层", claim.layer], ["可见信号", claim.signals.join(" · ")]].forEach(([label, value]) => {
      const group = el("div");
      group.append(el("dt", "", label), el("dd", "", value));
      meta.append(group);
    });
    const boundary = el("p", "claim-boundary");
    boundary.append(el("strong", "", "边界 "), document.createTextNode(claim.boundary));
    const links = el("div", "evidence-links");
    links.append(evidenceLink(claim.source, "source"), evidenceLink(claim.compare, "compare"));
    article.append(head, el("h3", "", claim.title), el("p", "claim-statement", claim.statement), meta, boundary, links);
    return article;
  }

  function renderEvidence(evidence) {
    const filters = document.getElementById("evidenceFilters");
    const ledger = document.getElementById("evidenceLedger");
    const options = [{ id: "all", label: "全部 20 条" }, ...Object.entries(agentMeta).map(([id, meta]) => ({ id, label: meta.label }))];
    options.forEach((option, index) => {
      const button = el("button", "evidence-filter", option.label);
      button.type = "button";
      button.dataset.filter = option.id;
      button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
      button.addEventListener("click", () => {
        filters.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        ledger.querySelectorAll("[data-agent]").forEach((item) => { item.hidden = option.id !== "all" && item.dataset.agent !== option.id; });
      });
      filters.append(button);
    });
    evidence.claims.forEach((claim) => ledger.append(factRecord(claim)));
  }

  function reveal() {
    status.hidden = true;
    document.querySelectorAll("[data-dossier-nav], .mechanism-page > header, .mechanism-page > section").forEach((item) => { item.hidden = false; });
    root.setAttribute("aria-busy", "false");
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
    focusHashTarget();
  }

  function focusHashTarget() {
    if (!location.hash) return;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function enableSectionTracking() {
    const links = [...document.querySelectorAll("[data-dossier-nav] a")];
    const targets = links.map((link) => document.querySelector(link.hash)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      links.forEach((link) => link.toggleAttribute("aria-current", link.hash === `#${visible.target.id}`));
    }, { rootMargin: "-22% 0px -68%", threshold: 0 });
    targets.forEach((target) => observer.observe(target));
  }

  Promise.all([
    fetch("/dossiers/subagent-orchestration.json").then((response) => response.ok ? response.json() : Promise.reject(new Error("摘要数据读取失败"))),
    fetch("/dossiers/subagent-evidence.json").then((response) => response.ok ? response.json() : Promise.reject(new Error("证据数据读取失败"))),
  ]).then(([summary, evidence]) => {
    validate(summary, evidence);
    claimById = new Map(evidence.claims.map((claim) => [claim.id, claim]));
    renderHero(summary);
    renderModels(summary);
    renderMatrix(summary);
    renderAnatomies(summary);
    renderTimeline(summary);
    renderObservations(summary);
    renderUnknowns(summary);
    renderEvidence(evidence);
    reveal();
    enableSectionTracking();
  }).catch((error) => {
    status.textContent = `机制档案载入失败：${error.message}`;
    status.dataset.state = "error";
    root.setAttribute("aria-busy", "false");
  });

  window.addEventListener("hashchange", focusHashTarget);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}());
