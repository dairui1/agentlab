(function initAgentLabNavigation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.define(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function createNavigationApi() {
  "use strict";

  const items = [
    { id: "intelligence", label: "更新情报", icon: "newspaper", href: "/" },
    { id: "compare", label: "版本比较", icon: "file-diff", href: "/?mode=compare" },
    { id: "research", label: "专题研究", icon: "library", href: "/capabilities.html" },
    { id: "dsh", label: "DSH 雷达", icon: "radar", href: "/deepseek-harness.html" },
    { id: "grok", label: "Grok Bot", icon: "bot", href: "/grok-bot.html" },
  ];

  function define(root) {
    if (!root.customElements || root.customElements.get("agentlab-navigation")) return;

    class AgentLabNavigation extends root.HTMLElement {
      connectedCallback() {
        const current = this.getAttribute("current") || "intelligence";
        const interactive = this.hasAttribute("interactive");
        const compareAgent = this.getAttribute("compare-agent");
        const nav = root.document.createElement("nav");
        nav.className = "segmented mode-switch radar-switch";
        nav.setAttribute("aria-label", "页面视图");

        for (const item of items) {
          const useButton = interactive && (item.id === "intelligence" || item.id === "compare");
          const control = root.document.createElement(useButton ? "button" : "a");

          if (useButton) {
            control.type = "button";
            control.id = item.id === "intelligence" ? "intelligenceModeButton" : "compareModeButton";
            control.setAttribute("aria-pressed", String(current === item.id));
          } else {
            control.href = item.id === "compare" && compareAgent
              ? `${item.href}&agent=${encodeURIComponent(compareAgent)}`
              : item.href;
            if (current === item.id) control.setAttribute("aria-current", "page");
          }

          const icon = root.document.createElement("i");
          icon.dataset.lucide = item.icon;
          icon.setAttribute("aria-hidden", "true");
          const label = root.document.createElement("span");
          label.textContent = item.label;
          control.append(icon, label);
          nav.append(control);
        }

        this.replaceChildren(nav);
      }
    }

    root.customElements.define("agentlab-navigation", AgentLabNavigation);
  }

  return { define, items };
});
