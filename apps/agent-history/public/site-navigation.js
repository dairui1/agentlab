(function initAgentLabNavigation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.define(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function createNavigationApi() {
  "use strict";

  const primaryItems = [
    { id: "intelligence", label: "更新情报", icon: "newspaper", href: "/" },
    { id: "compare", label: "版本比较", icon: "file-diff", href: "/?mode=compare" },
  ];

  const researchItems = [
    { id: "goal", label: "Goal 模式", icon: "target", href: "/capabilities.html?study=goal-mode" },
    { id: "dsh", label: "DSH 雷达", icon: "radar", href: "/deepseek-harness.html" },
    { id: "grok", label: "Grok Bot", icon: "bot", href: "/grok-bot.html" },
  ];

  function appendIcon(root, control, name) {
    const icon = root.document.createElement("i");
    icon.dataset.lucide = name;
    icon.setAttribute("aria-hidden", "true");
    control.append(icon);
  }

  function appendLabel(root, control, text) {
    const label = root.document.createElement("span");
    label.textContent = text;
    control.append(label);
  }

  function define(root) {
    if (!root.customElements || root.customElements.get("agentlab-navigation")) return;

    class AgentLabNavigation extends root.HTMLElement {
      connectedCallback() {
        const interactive = this.hasAttribute("interactive");
        const requestedCurrent = this.getAttribute("current");
        const current = requestedCurrent === "auto"
          ? (new URL(root.location.href).searchParams.get("study") === "goal-mode" ? "goal" : "")
          : (requestedCurrent || (interactive ? "intelligence" : ""));
        const compareAgent = this.getAttribute("compare-agent");
        const nav = root.document.createElement("nav");
        nav.className = "segmented mode-switch";
        nav.setAttribute("aria-label", "页面视图");

        for (const item of primaryItems) {
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

          appendIcon(root, control, item.icon);
          appendLabel(root, control, item.label);
          nav.append(control);
        }

        const researchMenu = root.document.createElement("div");
        researchMenu.className = "mode-switch-menu";
        const menuButton = root.document.createElement("button");
        menuButton.type = "button";
        menuButton.className = "mode-switch-menu-trigger";
        menuButton.setAttribute("aria-haspopup", "menu");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-controls", "researchMenu");
        const currentResearch = researchItems.find((item) => item.id === current);
        if (currentResearch) {
          menuButton.dataset.current = "true";
          menuButton.setAttribute("aria-label", `专题研究，当前：${currentResearch.label}`);
        }
        appendIcon(root, menuButton, "library");
        appendLabel(root, menuButton, "专题研究");
        const chevron = root.document.createElement("i");
        chevron.className = "mode-switch-menu-chevron";
        chevron.dataset.lucide = "chevron-down";
        chevron.setAttribute("aria-hidden", "true");
        menuButton.append(chevron);

        const menu = root.document.createElement("div");
        menu.id = "researchMenu";
        menu.className = "mode-switch-menu-panel";
        menu.setAttribute("role", "menu");
        menu.hidden = true;
        for (const item of researchItems) {
          const link = root.document.createElement("a");
          link.href = item.href;
          link.setAttribute("role", "menuitem");
          if (current === item.id) link.setAttribute("aria-current", "page");
          appendIcon(root, link, item.icon);
          appendLabel(root, link, item.label);
          menu.append(link);
        }

        const closeMenu = () => {
          menu.hidden = true;
          menuButton.setAttribute("aria-expanded", "false");
        };
        const openMenu = () => {
          menu.hidden = false;
          menuButton.setAttribute("aria-expanded", "true");
        };
        menuButton.addEventListener("click", () => menu.hidden ? openMenu() : closeMenu());
        menuButton.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          openMenu();
          menu.querySelector("a")?.focus();
        });
        menu.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return;
          closeMenu();
          menuButton.focus();
        });
        this._closeResearchMenu = (event) => {
          if (!this.contains(event.target)) closeMenu();
        };
        root.document.addEventListener("click", this._closeResearchMenu);
        researchMenu.append(menuButton, menu);
        nav.append(researchMenu);

        this.replaceChildren(nav);
      }

      disconnectedCallback() {
        if (this._closeResearchMenu) root.document.removeEventListener("click", this._closeResearchMenu);
      }
    }

    root.customElements.define("agentlab-navigation", AgentLabNavigation);
  }

  return { define, items: [...primaryItems, ...researchItems], primaryItems, researchItems };
});
