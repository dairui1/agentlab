(function () {
  "use strict";
  function openHashTarget() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let opened = false;
    for (let node = target; node; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) { node.open = true; opened = true; }
    }
    if (opened) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }
  window.addEventListener("hashchange", openHashTarget);
  openHashTarget();
})();
