(function initAgentLabTheme(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AgentLabTheme = api.initialize(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function createThemeApi() {
  "use strict";

  const STORAGE_KEY = "agentlab.theme.v1";
  const PRESETS = ["paper", "slate", "ink", "terminal"];
  const MODES = ["system", "light", "dark"];
  const DEFAULT_SETTINGS = { preset: "ink", mode: "system" };

  function normalizeSettings(value, fallback = DEFAULT_SETTINGS) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      preset: PRESETS.includes(input.preset) ? input.preset : fallback.preset,
      mode: MODES.includes(input.mode) ? input.mode : fallback.mode,
    };
  }

  function parseSettings(value) {
    try { return normalizeSettings(JSON.parse(value)); }
    catch { return { ...DEFAULT_SETTINGS }; }
  }

  function initialize(root) {
    const document = root.document;
    const media = typeof root.matchMedia === "function" ? root.matchMedia("(prefers-color-scheme: dark)") : null;
    let settings;
    try { settings = parseSettings(root.localStorage.getItem(STORAGE_KEY)); }
    catch { settings = { ...DEFAULT_SETTINGS }; }
    let colorScheme;
    let mediaListening = false;
    let controls = [];

    function getSettings() { return { ...settings }; }
    function getColorScheme() { return colorScheme; }

    function syncControls() {
      for (const { input, label, setting, value } of controls) {
        const selected = settings[setting] === value;
        input.checked = selected;
        label.dataset.selected = String(selected);
      }
    }

    function onMediaChange() {
      if (settings.mode === "system") apply();
    }

    function syncMediaListener() {
      if (!media) return;
      const shouldListen = settings.mode === "system";
      if (shouldListen === mediaListening) return;
      if (typeof media.addEventListener === "function") {
        media[shouldListen ? "addEventListener" : "removeEventListener"]("change", onMediaChange);
      } else if (typeof media.addListener === "function") {
        media[shouldListen ? "addListener" : "removeListener"](onMediaChange);
      }
      mediaListening = shouldListen;
    }

    function apply() {
      colorScheme = settings.mode === "system" ? (media?.matches ? "dark" : "light") : settings.mode;
      if (document?.documentElement) {
        document.documentElement.dataset.theme = settings.preset;
        document.documentElement.dataset.colorScheme = colorScheme;
        document.documentElement.dataset.themeMode = settings.mode;
        document.documentElement.style.colorScheme = colorScheme;
      }
      syncMediaListener();
      syncControls();
      if (typeof root.CustomEvent === "function" && typeof root.dispatchEvent === "function") {
        root.dispatchEvent(new root.CustomEvent("agentlab:themechange", {
          detail: { ...settings, colorScheme },
        }));
      }
    }

    function setSettings(value) {
      const next = normalizeSettings(value, settings);
      if (next.preset === settings.preset && next.mode === settings.mode) return getSettings();
      settings = next;
      try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
      catch { /* The active theme still works when browser storage is unavailable. */ }
      apply();
      return getSettings();
    }

    function mount() {
      const topbar = document.querySelector(".topbar");
      if (!topbar || topbar.querySelector(".site-theme")) return;
      let headerLinks = topbar.querySelector(".header-links");
      if (!headerLinks) {
        headerLinks = document.createElement("div");
        headerLinks.className = "header-links";
        topbar.append(headerLinks);
      }

      const holder = document.createElement("div");
      holder.className = "site-theme";
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "icon-button site-theme-trigger";
      trigger.title = "主题";
      trigger.setAttribute("aria-label", "主题");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-controls", "siteThemePanel");
      const icon = document.createElement("i");
      icon.dataset.lucide = "palette";
      icon.setAttribute("aria-hidden", "true");
      trigger.append(icon);

      const panel = document.createElement("div");
      panel.id = "siteThemePanel";
      panel.className = "site-theme-panel";
      panel.hidden = true;
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "主题设置");

      function appendGroup(setting, legendText, items) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = `site-theme-${setting}`;
        const legend = document.createElement("legend");
        legend.textContent = legendText;
        fieldset.append(legend);
        const choices = document.createElement("div");
        choices.className = "site-theme-choices";
        for (const { value, text, icon: iconName } of items) {
          const label = document.createElement("label");
          label.className = "site-theme-choice";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = `agentlab-theme-${setting}`;
          input.value = value;
          input.addEventListener("change", () => {
            if (input.checked) setSettings({ [setting]: value });
          });
          label.append(input);
          const symbol = document.createElement(iconName ? "i" : "span");
          if (iconName) symbol.dataset.lucide = iconName;
          else {
            symbol.className = "site-theme-swatch";
            symbol.dataset.preset = value;
          }
          symbol.setAttribute("aria-hidden", "true");
          const title = document.createElement("span");
          title.textContent = text;
          label.append(symbol, title);
          controls.push({ input, label, setting, value });
          choices.append(label);
        }
        fieldset.append(choices);
        panel.append(fieldset);
      }

      appendGroup("preset", "配色", PRESETS.map((value) => ({
        value, text: value[0].toUpperCase() + value.slice(1),
      })));
      appendGroup("mode", "明暗", [
        { value: "system", text: "系统", icon: "monitor" },
        { value: "light", text: "浅色", icon: "sun" },
        { value: "dark", text: "深色", icon: "moon" },
      ]);

      function close() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
      function open() {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
      }
      trigger.addEventListener("click", () => panel.hidden ? open() : close());
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        open();
        controls.find(({ setting, input }) => setting === "preset" && input.checked)?.input.focus();
      });
      holder.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || panel.hidden) return;
        event.preventDefault();
        close();
        trigger.focus();
      });
      holder.addEventListener("focusout", (event) => {
        if (!holder.contains(event.relatedTarget)) close();
      });
      document.addEventListener("click", (event) => {
        if (!holder.contains(event.target)) close();
      });

      holder.append(trigger, panel);
      headerLinks.append(holder);
      syncControls();
      root.lucide?.createIcons();
    }

    // This script runs in the document head so saved settings precede first paint.
    apply();
    root.addEventListener?.("storage", (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      settings = parseSettings(event.newValue);
      apply();
    });
    if (document) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
      else mount();
    }
    return { getSettings, setSettings, getColorScheme };
  }

  return { initialize, normalizeSettings, STORAGE_KEY, PRESETS, MODES };
});
