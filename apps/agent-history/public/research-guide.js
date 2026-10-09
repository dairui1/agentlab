(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.ResearchGuide = api; api.start(root); }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const statuses = new Set(["idle", "active", "done", "blocked", "unknown"]);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function defaults(model) { return Object.fromEntries(model.controls.map((control) => [control.id, control.default])); }
  function matches(when, values) {
    return Object.entries(when).every(([key, expected]) => {
      const actual = values[key];
      if (expected === null || typeof expected !== "object") return actual === expected;
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === "eq") return actual === value;
        if (operator === "gte") return typeof actual === "number" && actual >= value;
        if (operator === "gt") return typeof actual === "number" && actual > value;
        if (operator === "lte") return typeof actual === "number" && actual <= value;
        if (operator === "lt") return typeof actual === "number" && actual < value;
        return false;
      });
    });
  }
  function resolve(model, values) {
    const scenario = model.cases.find((item) => matches(item.when, values));
    if (!scenario) throw new Error(`No teaching case for ${model.id}`);
    return scenario;
  }
  function format(text, values) {
    return String(text ?? "").replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_, id) => {
      const value = values[id];
      return typeof value === "number" ? value.toLocaleString("zh-CN") : String(value ?? "");
    });
  }
  function caseCopy(model, scenario, position, values) {
    if (model.kind === "timeline" && position < scenario.frames.length - 1) {
      const frame = scenario.frames[position];
      return { label: `当前：${format(frame.caption, values)}`, explanation: format(frame.log?.at(-1) || "场景尚未结束。", values) };
    }
    return { label: scenario.label, explanation: format(scenario.explanation, values) };
  }
  function frameMarkup(frame, values) {
    const text = (value) => escape(format(value, values));
    const state = (value) => statuses.has(value) ? value : "idle";
    const diagram = (frame.diagram || []).map((node, index) =>
      `${index ? '<span class="rg-arrow" aria-hidden="true">→</span>' : ""}<div class="rg-node" data-state="${state(node.status)}"><span class="rg-node-dot" aria-hidden="true"></span>${text(node.label)}</div>`).join("");
    const panels = frame.panels.map((panel) => `<section class="rg-pane"><h4>${text(panel.title)}</h4><dl>${panel.items.map((item) => `<div data-state="${state(item.state)}"><dt>${text(item.label)}</dt><dd>${text(item.value)}</dd></div>`).join("")}</dl></section>`).join("");
    const log = frame.log?.length ? `<ol class="rg-log" aria-label="场景事件">${frame.log.map((line) => `<li>${text(line)}</li>`).join("")}</ol>` : "";
    return `<p class="rg-frame-caption">${text(frame.caption)}</p><div class="rg-diagram" aria-label="场景中的状态">${diagram}</div><div class="rg-panes">${panels}</div>${log}`;
  }
  function controlMarkup(control, modelId, values) {
    const id = `rg-${modelId}-${control.id}`;
    const label = escape(control.label);
    if (control.type === "toggle") return `<label class="rg-toggle" for="${id}"><input id="${id}" data-control="${escape(control.id)}" type="checkbox"${values[control.id] ? " checked" : ""}><span>${label}</span></label>`;
    if (control.type === "range") return `<label class="rg-range" for="${id}"><span>${label} <output data-output="${escape(control.id)}">${escape(format(`{{${control.id}}}`, values))}${escape(control.unit || "")}</output></span><input id="${id}" data-control="${escape(control.id)}" type="range" min="${control.min}" max="${control.max}" step="${control.step || 1}" value="${values[control.id]}"></label>`;
    return `<label class="rg-select" for="${id}"><span>${label}</span><select id="${id}" data-control="${escape(control.id)}">${control.options.map((option) => `<option value="${escape(option.value)}"${option.value === values[control.id] ? " selected" : ""}>${escape(option.label)}</option>`).join("")}</select></label>`;
  }
  function modelMarkup(model) {
    const values = defaults(model);
    const scenario = resolve(model, values);
    const initial = model.kind === "timeline" ? 0 : scenario.frames.length - 1;
    const copy = caseCopy(model, scenario, initial, values);
    const iconButton = (action, icon, title) => `<button type="button" class="rg-icon-button" data-action="${action}" aria-label="${title}" title="${title}"><i data-lucide="${icon}" aria-hidden="true"></i></button>`;
    const transport = model.kind === "timeline" ? `<div class="rg-transport" hidden>${iconButton("back", "skip-back", "上一步")}${iconButton("play", "play", "播放场景")}${iconButton("next", "step-forward", "下一步")}${iconButton("reset", "rotate-ccw", "重置场景")}<output data-progress>1 / ${scenario.frames.length}</output></div>` : `<div class="rg-transport" hidden>${iconButton("reset", "rotate-ccw", "重置条件")}</div>`;
    return `<div class="rg-model" data-model="${escape(model.id)}" data-kind="${escape(model.kind)}"><header class="rg-model-header"><h3>${escape(model.title)}</h3>${transport}</header><fieldset class="rg-controls" disabled><legend class="rg-sr-only">${escape(model.title)}的场景条件</legend>${model.controls.map((control) => controlMarkup(control, model.id, values)).join("")}</fieldset><div class="rg-observation" aria-live="polite" aria-atomic="true">${frameMarkup(scenario.frames[initial], values)}</div><div class="rg-reading"><strong data-case-label>${escape(copy.label)}</strong><p data-case-explanation>${escape(copy.explanation)}</p></div><footer class="rg-model-footer"><a href="#rg-source-${escape(model.evidence[0])}" data-source-link>查看依据 <i data-lucide="arrow-down-right" aria-hidden="true"></i></a></footer></div>`;
  }
  function mountModel(element, model, root) {
    let values = defaults(model);
    let scenario = resolve(model, values);
    let position = model.kind === "timeline" ? 0 : scenario.frames.length - 1;
    let timer = null;
    const observation = element.querySelector(".rg-observation");
    const stop = () => { if (timer !== null) root.clearInterval(timer); timer = null; };
    const render = () => {
      observation.innerHTML = frameMarkup(scenario.frames[position], values);
      const copy = caseCopy(model, scenario, position, values);
      element.querySelector("[data-case-label]").textContent = copy.label;
      element.querySelector("[data-case-explanation]").textContent = copy.explanation;
      const progress = element.querySelector("[data-progress]");
      if (progress) progress.textContent = `${position + 1} / ${scenario.frames.length}`;
      const back = element.querySelector('[data-action="back"]');
      const next = element.querySelector('[data-action="next"]');
      if (back) back.disabled = position === 0;
      if (next) next.disabled = position === scenario.frames.length - 1;
      const play = element.querySelector('[data-action="play"]');
      if (play) {
        const label = timer === null ? "播放场景" : "暂停场景";
        play.setAttribute("aria-label", label);
        play.title = label;
        play.innerHTML = `<i data-lucide="${timer === null ? "play" : "pause"}" aria-hidden="true"></i>`;
      }
      root.lucide?.createIcons({ root: element });
    };
    element.querySelectorAll("[data-control]").forEach((input) => {
      const control = model.controls.find((item) => item.id === input.dataset.control);
      input.addEventListener(control.type === "range" ? "input" : "change", () => {
        stop();
        values[control.id] = control.type === "toggle" ? input.checked : control.type === "range" ? Number(input.value) : input.value;
        scenario = resolve(model, values);
        position = model.kind === "timeline" ? 0 : scenario.frames.length - 1;
        const output = element.querySelector(`[data-output="${control.id}"]`);
        if (output) output.textContent = `${format(`{{${control.id}}}`, values)}${control.unit || ""}`;
        render();
      });
    });
    element.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "play") {
        if (timer !== null) stop();
        else {
          if (position === scenario.frames.length - 1) position = 0;
          timer = root.setInterval(() => {
            position = Math.min(position + 1, scenario.frames.length - 1);
            if (position === scenario.frames.length - 1) stop();
            render();
          }, 900);
        }
      } else {
        stop();
        if (action === "next") position = Math.min(position + 1, scenario.frames.length - 1);
        if (action === "back") position = Math.max(position - 1, 0);
        if (action === "reset") {
          values = defaults(model);
          scenario = resolve(model, values);
          position = model.kind === "timeline" ? 0 : scenario.frames.length - 1;
          element.querySelectorAll("[data-control]").forEach((input) => {
            if (input.type === "checkbox") input.checked = values[input.dataset.control];
            else input.value = values[input.dataset.control];
          });
          element.querySelectorAll("[data-output]").forEach((output) => {
            const control = model.controls.find((item) => item.id === output.dataset.output);
            output.textContent = `${format(`{{${control.id}}}`, values)}${control.unit || ""}`;
          });
        }
      }
      render();
    }));
    element.querySelector("fieldset").disabled = false;
    element.querySelector(".rg-transport").hidden = false;
    render();
    const probe = root.document.createElement("div");
    probe.className = "rg-observation";
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", top: "0", left: "0" });
    element.append(probe);
    let measuredWidth = 0;
    const reserveSpace = () => {
      const width = observation.clientWidth;
      if (!width || width === measuredWidth) return;
      measuredWidth = width;
      probe.style.width = `${width}px`;
      let height = 0;
      for (const candidate of model.cases) for (const frame of candidate.frames) {
        probe.innerHTML = frameMarkup(frame, defaults(model));
        height = Math.max(height, probe.getBoundingClientRect().height);
      }
      observation.style.minHeight = `${Math.ceil(height)}px`;
      probe.replaceChildren();
    };
    reserveSpace();
    const observer = root.ResizeObserver ? new root.ResizeObserver(reserveSpace) : null;
    observer?.observe(element);
    return () => { stop(); observer?.disconnect(); probe.remove(); };
  }
  async function start(root) {
    const document = root.document;
    const page = document.querySelector("[data-guide]");
    if (!page) return;
    const toc = document.querySelector(".rg-toc-disclosure");
    if (toc && root.matchMedia("(max-width: 760px)").matches) toc.open = false;
    const showSource = (hash) => {
      let target;
      try { target = document.getElementById(decodeURIComponent(hash.replace(/^#/, ""))); } catch { return; }
      if (!target) return;
      if (target.tagName === "DETAILS") target.open = true;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true;
    };
    document.querySelectorAll("[data-source-link]").forEach((link) => link.addEventListener("click", () => showSource(link.hash)));
    root.addEventListener("hashchange", () => showSource(root.location.hash));
    showSource(root.location.hash);
    const tocLinks = [...document.querySelectorAll('.rg-toc a[href^="#rg-"]')];
    const markChapter = (id) => tocLinks.forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    const chapters = [...document.querySelectorAll(".rg-chapter")];
    if (chapters.length) markChapter(chapters[0].id);
    if (root.IntersectionObserver) {
      const spy = new root.IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible.length) markChapter(visible[0].target.id);
      }, { rootMargin: "-10% 0px -55% 0px" });
      chapters.forEach((chapter) => spy.observe(chapter));
      root.addEventListener("pagehide", () => spy.disconnect(), { once: true });
    }
    const back = document.querySelector("[data-catalog-back]");
    const from = new URL(root.location.href).searchParams.get("from");
    if (from && back) try {
      const url = new URL(from, root.location.origin);
      if (url.origin === root.location.origin && url.pathname === "/capabilities.html") {
        for (const key of ["study", "evidence", "type", "q", "agent"]) url.searchParams.delete(key);
        back.href = `${url.pathname}${url.search}`;
      }
    } catch { /* An invalid return link must not prevent the teaching models from loading. */ }
    try {
      const response = await root.fetch(`/research-guides/${page.dataset.guide}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const guide = await response.json();
      if (guide.id !== page.dataset.guide) throw new Error("Guide mismatch");
      const stops = guide.chapters.filter((chapter) => chapter.model).map((chapter) => {
        const element = document.querySelector(`[data-model="${chapter.model.id}"]`);
        if (!element) throw new Error("Missing model");
        return mountModel(element, chapter.model, root);
      });
      root.addEventListener("pagehide", () => stops.forEach((stop) => stop()), { once: true });
      document.querySelector("[data-guide-status]").hidden = true;
      page.dataset.ready = "true";
    } catch {
      const status = document.querySelector("[data-guide-status]");
      status.hidden = false;
      status.textContent = "交互暂时未能加载，正文与默认场景仍可阅读。";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重新加载";
      retry.addEventListener("click", () => root.location.reload());
      status.append(retry);
    }
  }
  return { defaults, matches, resolve, format, caseCopy, frameMarkup, controlMarkup, modelMarkup, mountModel, start };
});
