(function () {
  "use strict";
  const scenarios = {
    stale: { count: 2, anyway: false, result: "暂缓发送", note: "新消息数为 2，未明确绕过，进入 held 分支。" },
    fresh: { count: 0, anyway: false, result: "继续提交路径", note: "没有边界之后的新消息，不因 freshness 暂缓；仍可能遇到其他发送错误。" },
    override: { count: 2, anyway: true, result: "明确绕过 freshness", note: "即使有两条新消息，这个条件也不再阻止发送；不是通过了新鲜度检查。" },
  };
  function evaluateScenario(name) {
    const state = scenarios[name] || scenarios.stale;
    return { ...state, held: !state.anyway && state.count > 0, expression: `!${state.anyway} && ${state.count} > 0` };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { evaluateScenario };
  if (typeof document === "undefined") return;

  const toggle = document.querySelector("#show-annotations");
  const picker = document.querySelector("#chapter-select");
  const annotations = [...document.querySelectorAll("[data-annotation]")];
  const sections = [...document.querySelectorAll("[data-blog-section]")];
  const originals = [...document.querySelectorAll(".original-column")];
  function updateChapter() {
    const visible = sections.filter((section) => !section.hidden);
    const active = [...visible].reverse().find((section) => section.getBoundingClientRect().top <= 150) || visible[0];
    if (picker && active) picker.value = active.id;
  }
  function pinOriginals() {
    for (const column of originals) {
      const copy = column.querySelector(".original-copy");
      // Tall source passages stay in normal flow, never in a nested scroll trap.
      column.classList.toggle("can-pin", copy.getBoundingClientRect().height < window.innerHeight - 110);
    }
  }
  function updateAnnotations() {
    for (const note of annotations) note.hidden = !toggle.checked;
    document.body.classList.toggle("translation-only", !toggle.checked);
    pinOriginals();
    updateChapter();
  }
  function revealSource(hash) {
    if (toggle && /^#(?:RM-\d+|sources|note-\d+)$/.test(hash)) {
      toggle.checked = true;
      updateAnnotations();
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }
  if (toggle) {
    toggle.closest("label").hidden = false;
    toggle.addEventListener("change", updateAnnotations);
    window.addEventListener("hashchange", () => revealSource(window.location.hash));
    for (const link of document.querySelectorAll('a[href="#sources"], a[href^="#RM-"], a[href^="#note-"]')) {
      link.addEventListener("click", () => revealSource(link.hash));
    }
    updateAnnotations();
  }
  picker?.addEventListener("change", () => {
    const target = document.getElementById(picker.value);
    if (!target) return;
    revealSource(`#${picker.value}`);
    window.location.hash = target.id;
    target.scrollIntoView();
  });
  const lab = document.querySelector("[data-freshness-lab]");
  if (lab) {
    for (const radio of lab.querySelectorAll('input[name="freshness-case"]')) {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        const state = evaluateScenario(radio.value);
        lab.querySelector("[data-lab-expression]").textContent = state.expression;
        lab.querySelector("[data-lab-result]").textContent = state.result;
        lab.querySelector("[data-lab-note]").textContent = state.note;
      });
    }
  }
  let queued = false;
  window.addEventListener("scroll", () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => { updateChapter(); queued = false; });
    }
  }, { passive: true });
  window.addEventListener("resize", pinOriginals, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(pinOriginals);
    for (const column of originals) observer.observe(column.querySelector(".original-copy"));
  }
  pinOriginals();
  updateChapter();
})();
