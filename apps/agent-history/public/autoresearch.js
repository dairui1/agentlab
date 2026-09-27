(() => {
  const chapter = document.getElementById("aar-chapter");
  const notes = document.getElementById("aar-notes");
  const sections = Array.from(document.querySelectorAll("[data-article-section]"));
  if (!chapter || !notes) return;

  const aliases = { task: "environment", loop: "harness", memory: "harness", evaluation: "environment", integrity: "harness", limits: "discussion" };
  const oldHash = location.hash.slice(1);
  if (aliases[oldHash]) location.replace("#" + aliases[oldHash]);
  notes.closest("label").hidden = false;
  notes.addEventListener("change", () => {
    document.body.classList.toggle("aar-translation-only", !notes.checked);
  });
  chapter.addEventListener("change", () => {
    const section = document.getElementById(chapter.value);
    if (!section) return;
    location.hash = chapter.value;
    section.tabIndex = -1;
    section.focus({ preventScroll: true });
  });

  const chapterIds = new Set(Array.from(chapter.options, (option) => option.value));
  const updateChapter = () => {
    let current = "abstract";
    for (const section of sections) {
      if (section.getBoundingClientRect().top > 140) break;
      if (chapterIds.has(section.id)) current = section.id;
    }
    chapter.value = current;
  };
  let pending = false;
  window.addEventListener("scroll", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; updateChapter(); });
  }, { passive: true });
  window.addEventListener("hashchange", updateChapter);
  updateChapter();
  window.lucide?.createIcons();
})();
