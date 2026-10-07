(function initCodeMode(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.mount(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function createCodeMode() {
  "use strict";
  function resolveNode(hash, ids, evidenceNode) {
    let id;
    try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { id = ""; }
    return ids.includes(id) ? id : (ids.includes(evidenceNode) ? evidenceNode : "overview");
  }
  function mount(root) {
    const doc = root.document;
    const nodes = [...doc.querySelectorAll("[data-node]")];
    if (!nodes.length) return;
    const ids = nodes.map((node) => node.id);
    const tree = doc.querySelector(".cm-tree");
    const mobile = root.matchMedia("(max-width: 680px)");
    tree.open = !mobile.matches;
    mobile.addEventListener("change", () => { tree.open = !mobile.matches; });
    const treeLinks = [...tree.querySelectorAll("a[href^='#']")];
    const parentLink = doc.getElementById("cmParentLink");
    const evidence = new URL(root.location.href).searchParams.get("evidence");
    const evidenceNode = nodes.find((node) => [...node.querySelectorAll("[data-evidence]")].some((trigger) => trigger.dataset.evidence.split(" ").includes(evidence)))?.id;
    let current;
    function show(focus = false) {
      const id = resolveNode(root.location.hash, ids, evidenceNode);
      const node = nodes.find((item) => item.id === id);
      nodes.forEach((item) => { item.hidden = item !== node; });
      treeLinks.forEach((link) => {
        if (link.hash === `#${id}`) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      const parent = nodes.find((item) => item.id === node.dataset.parent);
      parentLink.href = `#${parent?.id || "overview"}`;
      parentLink.querySelector("span").textContent = parent ? parent.querySelector("h1, h2").textContent : "Code Mode 全貌";
      parentLink.parentElement.hidden = id === "overview";
      doc.title = id === "overview" ? "Code Mode · AgentLab" : `${node.querySelector("h1, h2").textContent} · Code Mode · AgentLab`;
      if (current !== id && focus) {
        if (mobile.matches) tree.open = false;
        node.querySelector("h1, h2").focus({ preventScroll: true });
        doc.getElementById("cmContent").scrollIntoView({ block: "start" });
      }
      current = id;
    }
    doc.body.classList.add("cm-enhanced");
    show();
    root.addEventListener("hashchange", () => show(true));
    const tabs = [...doc.querySelectorAll(".cm-example-tabs [role='tab']")];
    function selectTab(tab, focus = false) {
      tabs.forEach((item) => {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
        doc.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
      });
      if (focus) tab.focus();
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTab(tab));
      tab.addEventListener("keydown", (event) => {
        const next = event.key === "ArrowRight" || event.key === "ArrowLeft" ? (index + 1) % tabs.length
          : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        selectTab(tabs[next], true);
      });
    });
    selectTab(tabs[0]);
    root.lucide?.createIcons?.();
  }
  return { resolveNode, mount };
});
