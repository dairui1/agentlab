(function () {
  "use strict";
  const toggle = document.querySelector("#show-annotations");
  const annotations = [...document.querySelectorAll("[data-annotation]")];
  const outlineLinks = [...document.querySelectorAll(".blog-outline ol a")];
  const sections = [...document.querySelectorAll("[data-blog-section]")];
  function updateOutline() {
    const visible = sections.filter((section) => !section.hidden);
    const active = [...visible].reverse().find((s) => s.getBoundingClientRect().top <= 140) || visible[0];
    for (const link of outlineLinks) {
      if (link.hash === `#${active?.id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  function updateAnnotations() {
    for (const note of annotations) note.hidden = !toggle.checked;
    updateOutline();
  }
  function revealSource(hash) {
    if (/^#(?:RM-\d+|sources|note-\d+)$/.test(hash)) {
      toggle.checked = true;
      updateAnnotations();
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }
  if (toggle) {
    toggle.closest("label").hidden = false;
    toggle.addEventListener("change", updateAnnotations);
    // Source deep links remain readable in translation-only mode.
    window.addEventListener("hashchange", () => revealSource(window.location.hash));
    for (const link of document.querySelectorAll('a[href="#sources"], a[href^="#RM-"], a[href^="#note-"]')) {
      link.addEventListener("click", () => revealSource(link.hash));
    }
    updateAnnotations();
  }
  let queued = false;
  window.addEventListener("scroll", () => {
    if (!queued) { queued = true; requestAnimationFrame(() => { updateOutline(); queued = false; }); }
  }, { passive: true });
  updateOutline();
})();
