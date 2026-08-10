(function () {
  "use strict";

  const progress = document.querySelector("[data-reading-progress] span");
  const article = document.querySelector(".capability-article");
  const toc = document.querySelector("[data-article-toc]");
  const evidencePanel = document.getElementById("articleEvidence");
  const evidenceBackdrop = document.getElementById("articleEvidenceBackdrop");
  const evidenceContent = document.getElementById("articleEvidenceContent");
  const closeEvidenceButton = document.getElementById("closeArticleEvidence");
  const evidenceSource = document.body.dataset.evidenceSource;
  const state = { evidence: new Map(), ids: [], index: 0, returnFocus: null };

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

  function createIcons() {
    window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
  }

  function updateProgress() {
    if (!progress || !article) return;
    const rect = article.getBoundingClientRect();
    const start = window.scrollY + rect.top - window.innerHeight * .25;
    const distance = Math.max(1, article.offsetHeight - window.innerHeight * .5);
    const value = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
    progress.style.transform = `scaleX(${value})`;
  }

  function initToc() {
    if (!toc) return;
    const links = [...toc.querySelectorAll("a[href^='#']")];
    const byId = new Map(links.map((link) => [link.hash.slice(1), link]));
    const sections = [...document.querySelectorAll("[data-article-section][id]")];
    if (!sections.length) return;
    let active = null;
    const setActive = (id) => {
      if (active === id) return;
      active = id;
      links.forEach((link) => {
        if (link === byId.get(id)) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: "-12% 0px -72%", threshold: [0, .2, .8] });
    sections.forEach((section) => observer.observe(section));
    setActive(sections[0].id);
  }

  function initTabs(group) {
    const tabs = [...group.querySelectorAll("[role='tab']")];
    const panels = [...group.querySelectorAll("[role='tabpanel']")];
    const select = (tab, focus = false) => {
      tabs.forEach((candidate) => {
        const selected = candidate === tab;
        candidate.setAttribute("aria-selected", String(selected));
        candidate.tabIndex = selected ? 0 : -1;
      });
      panels.forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute("aria-controls"); });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
            : event.key === "Home" ? 0
              : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        select(tabs[next], true);
      });
    });
    select(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0]);
  }

  function evidenceLabel(kind) {
    return { observation: "文件里直接看到", inference: "根据线索推断" }[kind] || kind;
  }

  function confidenceLabel(confidence) {
    return { high: "把握高", medium: "把握中等", low: "把握有限" }[confidence] || confidence;
  }

  function updateEvidenceUrl(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("evidence", id);
    else url.searchParams.delete("evidence");
    history.replaceState(history.state, "", url);
  }

  function renderEvidence(focusDirection = null) {
    const claim = state.evidence.get(state.ids[state.index]);
    if (!claim) return;
    evidenceContent.replaceChildren();
    document.getElementById("articleEvidenceKicker").textContent = `${claim.id} · ${evidenceLabel(claim.kind)}`;
    document.getElementById("articleEvidenceTitle").textContent = claim.title;

    const kind = el("span", "article-evidence-kind", `${evidenceLabel(claim.kind)} · ${confidenceLabel(claim.confidence)}`);
    const statement = el("p", "", claim.statement);
    const meta = el("dl", "article-evidence-meta");
    for (const [label, value] of [["文件", claim.artifact], ["具体位置", claim.locator], ["SHA-256", claim.sha256]]) {
      const row = el("div");
      row.append(el("dt", "", label), el("dd", "", String(value)));
      meta.append(row);
    }
    const boundary = el("div", "article-callout");
    boundary.append(el("strong", "", "这份证据还说不了什么"), el("p", "", claim.boundary));
    const copy = el("button", "article-evidence-copy");
    copy.type = "button";
    copy.dataset.evidenceCopy = claim.artifact;
    copy.append(icon("copy"), el("span", "", "复制文件位置"));
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(claim.artifact);
        copy.querySelector("span").textContent = "已复制";
      } catch {
        copy.querySelector("span").textContent = "没复制上，请手动选取";
      }
    });
    evidenceContent.append(kind, statement, meta, boundary, copy);

    const pager = document.getElementById("articleEvidencePager");
    if (pager) {
      pager.hidden = state.ids.length < 2;
      pager.replaceChildren();
      if (state.ids.length > 1) {
        const previous = el("button", "", "");
        const next = el("button", "", "");
        previous.type = next.type = "button";
        previous.append(icon("chevron-left"));
        next.append(icon("chevron-right"));
        previous.setAttribute("aria-label", "上一条证据");
        next.setAttribute("aria-label", "下一条证据");
        previous.disabled = state.index === 0;
        next.disabled = state.index === state.ids.length - 1;
        previous.addEventListener("click", () => { state.index -= 1; renderEvidence("previous"); updateEvidenceUrl(state.ids[state.index]); });
        next.addEventListener("click", () => { state.index += 1; renderEvidence("next"); updateEvidenceUrl(state.ids[state.index]); });
        pager.append(previous, el("span", "", `${state.index + 1} / ${state.ids.length}`), next);
        if (focusDirection) {
          const preferred = focusDirection === "previous" ? previous : next;
          const fallback = focusDirection === "previous" ? next : previous;
          requestAnimationFrame(() => (preferred.disabled ? fallback : preferred).focus());
        }
      }
    }
    createIcons();
  }

  function openEvidence(ids, returnFocus = null) {
    const valid = ids.filter((id) => state.evidence.has(id));
    if (!valid.length || !evidencePanel) return;
    state.ids = valid;
    state.index = 0;
    state.returnFocus = returnFocus || document.activeElement;
    renderEvidence();
    evidencePanel.inert = false;
    evidencePanel.classList.add("is-open");
    evidencePanel.removeAttribute("aria-hidden");
    evidencePanel.setAttribute("aria-modal", "true");
    evidenceBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
    updateEvidenceUrl(valid[0]);
    requestAnimationFrame(() => closeEvidenceButton.focus());
  }

  function closeEvidence() {
    if (!evidencePanel) return;
    evidencePanel.classList.remove("is-open");
    evidencePanel.setAttribute("aria-hidden", "true");
    evidencePanel.removeAttribute("aria-modal");
    evidencePanel.inert = true;
    evidenceBackdrop.hidden = true;
    document.body.style.overflow = "";
    updateEvidenceUrl(null);
    if (state.returnFocus instanceof HTMLElement && state.returnFocus.isConnected) state.returnFocus.focus();
  }

  function bindEvidenceTriggers() {
    document.querySelectorAll("[data-evidence]").forEach((trigger) => {
      trigger.setAttribute("aria-controls", "articleEvidence");
    });
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-evidence]");
      if (!trigger || trigger.disabled) return;
      openEvidence(trigger.dataset.evidence.split(/[\s,]+/).filter(Boolean), trigger);
    });
  }

  function trapEvidenceFocus(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEvidence();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...evidencePanel.querySelectorAll("button:not([disabled]), a[href]")];
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
  }

  function readableEvidenceError(error) {
    const message = String(error?.message || "未知错误");
    if (message === "evidence-shape") return "证据资料的结构不对";
    if (error?.name === "SyntaxError") return "证据资料不是有效的 JSON";
    if (/failed to fetch/i.test(message)) return "没连上证据文件";
    if (/^HTTP \d+$/.test(message)) return `证据文件返回 ${message}`;
    return `载入时遇到 ${message}`;
  }

  function showEvidenceLoadError(message) {
    if (!article) return;
    const notice = el("div", "article-callout article-evidence-load-error");
    notice.dataset.evidenceLoadError = "";
    notice.setAttribute("role", "alert");
    notice.append(
      el("strong", "", "证据抽屉暂时打不开"),
      el("p", "", `正文还能读，但原文件现在调不出来。${message}。刷新页面后再试。`),
    );
    article.querySelector("[data-evidence-load-error]")?.remove();
    article.prepend(notice);
  }

  async function loadEvidence() {
    if (!evidenceSource || !evidencePanel) return;
    try {
      const response = await fetch(evidenceSource, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.evidence)) throw new Error("evidence-shape");
      state.evidence = new Map(data.evidence.map((claim) => [claim.id, claim]));
      bindEvidenceTriggers();
      document.dispatchEvent(new CustomEvent("agentlab:study-loaded", { detail: { study: data } }));
      const requested = new URL(location.href).searchParams.get("evidence");
      if (requested && state.evidence.has(requested)) openEvidence([requested]);
    } catch (error) {
      const message = readableEvidenceError(error);
      showEvidenceLoadError(message);
      document.querySelectorAll("[data-evidence]").forEach((trigger) => {
        trigger.disabled = true;
        trigger.title = `证据暂时打不开：${message}。刷新页面后再试。`;
      });
      document.dispatchEvent(new CustomEvent("agentlab:study-error", { detail: { message } }));
    }
  }

  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  document.querySelectorAll("[data-article-tabs]").forEach(initTabs);
  closeEvidenceButton?.addEventListener("click", closeEvidence);
  evidenceBackdrop?.addEventListener("click", closeEvidence);
  evidencePanel?.addEventListener("keydown", trapEvidenceFocus);
  if (evidencePanel) {
    evidencePanel.inert = true;
    evidencePanel.setAttribute("aria-hidden", "true");
  }
  initToc();
  updateProgress();
  loadEvidence();
  createIcons();
})();
