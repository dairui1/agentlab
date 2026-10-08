const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initialize, normalizeSettings, STORAGE_KEY, PRESETS, MODES } = require("../public/site-theme.js");

function fixture({ saved = null, dark = false, loading = false, storageFails = false, headerLinks = true, legacyMedia = false } = {}) {
  const documentListeners = new Map();
  const rootListeners = new Map();
  const mediaListeners = new Set();
  const events = [];
  const writes = [];
  const document = {
    activeElement: null,
    readyState: loading ? "loading" : "complete",
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => document.documentElement.querySelector(selector),
    addEventListener: (type, handler) => {
      const handlers = documentListeners.get(type) || [];
      documentListeners.set(type, [...handlers, handler]);
    },
    fire: (type, event = {}) => documentListeners.get(type)?.forEach((handler) => handler(event)),
  };
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = new Map();
      this.dataset = {};
      this.style = {};
      this.listeners = new Map();
      this.className = "";
    }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key); }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    matches(selector) {
      if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
      if (selector.startsWith("#")) return this.id === selector.slice(1);
      return this.tag === selector;
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    contains(target) { return this === target || this.children.some((child) => child.contains(target)); }
    focus() { document.activeElement = this; }
    dispatch(type, values = {}) {
      const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...values };
      this.listeners.get(type)?.(event);
      return event;
    }
  }
  document.documentElement = new Element("html");
  const topbar = new Element("header");
  topbar.className = "topbar";
  if (headerLinks) {
    const links = new Element("div");
    links.className = "header-links";
    topbar.append(links);
  }
  document.documentElement.append(topbar);
  const media = {
    matches: dark,
    emit(matches) {
      media.matches = matches;
      [...mediaListeners].forEach((handler) => handler({ matches }));
    },
  };
  if (legacyMedia) {
    media.addListener = (handler) => mediaListeners.add(handler);
    media.removeListener = (handler) => mediaListeners.delete(handler);
  } else {
    media.addEventListener = (_, handler) => mediaListeners.add(handler);
    media.removeEventListener = (_, handler) => mediaListeners.delete(handler);
  }
  let icons = 0;
  const root = {
    document,
    matchMedia: () => media,
    localStorage: {
      getItem: () => {
        if (storageFails) throw new Error("Storage disabled");
        return saved;
      },
      setItem: (key, value) => {
        if (storageFails) throw new Error("Storage disabled");
        writes.push([key, value]);
      },
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent: (event) => events.push(event),
    addEventListener: (type, handler) => rootListeners.set(type, handler),
    lucide: { createIcons() { icons += 1; } },
  };
  const api = initialize(root);
  return {
    api, root, document, topbar, events, writes, media, mediaListeners,
    icons: () => icons,
    storage: (values) => rootListeners.get("storage")(values),
    holder: () => topbar.querySelector(".site-theme"),
    trigger: () => topbar.querySelector(".site-theme-trigger"),
    panel: () => topbar.querySelector(".site-theme-panel"),
    radios: () => topbar.querySelectorAll("input"),
  };
}

test("theme settings accept only independent preset and mode values", () => {
  assert.deepEqual(PRESETS, ["paper", "slate", "ink", "terminal"]);
  assert.deepEqual(MODES, ["system", "light", "dark"]);
  for (const value of [null, undefined, false, "dark", [], { preset: "__proto__", mode: "auto" }]) {
    assert.deepEqual(normalizeSettings(value), { preset: "ink", mode: "system" });
  }
  assert.deepEqual(normalizeSettings({ preset: "paper", mode: "dark", unsafe: "ignored" }), { preset: "paper", mode: "dark" });
});

test("Monaco uses resolved preset colors, diff semantics, and the local code font", () => {
  const f = fixture({ dark: true });
  const palette = {
    "pre-bg": "#111111", text: "#ededed", "text-soft": "#b5b5b5", muted: "#8f8f8f",
    surface: "#161616", accent: "#ff5c4d", "left-soft": "#1c344a", add: "#5fc59f",
    "add-soft": "#173a2f", delete: "#ee8b84", "delete-soft": "#472725", pending: "#e0b661",
    "code-font": '"IBM Plex Mono", monospace',
  };
  f.root.getComputedStyle = () => ({ getPropertyValue: (key) => palette[key.replace("--theme-", "")] || "" });
  let definition, selected;
  const monaco = { editor: {
    defineTheme: (name, data) => { definition = { name, data }; },
    setTheme: (name) => { selected = name; },
  } };
  assert.deepEqual(f.api.applyEditorTheme(monaco), { name: "agentlab-ink-dark", fontFamily: '"IBM Plex Mono", monospace' });
  assert.equal(selected, definition.name);
  assert.equal(definition.data.base, "vs-dark");
  assert.equal(definition.data.colors["editor.background"], palette["pre-bg"]);
  assert.equal(definition.data.colors["diffEditor.insertedTextBackground"], `${palette.add}35`);
  assert.equal(definition.data.colors["diffEditor.removedTextBackground"], `${palette.delete}35`);
  assert.equal(definition.data.colors["diffEditor.insertedLineBackground"], palette["add-soft"]);
  assert.notEqual(definition.data.colors["diffEditor.insertedTextBackground"], definition.data.colors["diffEditor.insertedLineBackground"]);
  assert.equal(definition.data.rules.find((rule) => rule.token === "keyword").foreground, "ff5c4d");
  for (let level = 1; level <= 6; level += 1) {
    assert.equal(definition.data.colors[`editorBracketHighlight.foreground${level}`], palette.text);
  }
  f.api.setSettings({ preset: "paper", mode: "light" });
  assert.equal(f.api.applyEditorTheme(monaco).name, "agentlab-paper-light");
  assert.equal(definition.data.base, "vs");
});

test("Monaco theme falls back before CSS is ready or when the editor is unavailable", () => {
  const f = fixture();
  assert.equal(f.api.applyEditorTheme(), null);
  const monaco = { editor: { defineTheme: () => { throw new Error("not ready"); } } };
  assert.equal(f.api.applyEditorTheme(monaco), null);
  f.root.getComputedStyle = () => ({ getPropertyValue: () => "" });
  assert.equal(f.api.applyEditorTheme(monaco), null);
});

test("saved theme applies synchronously before DOM ready and mounts once", () => {
  const f = fixture({ saved: JSON.stringify({ preset: "terminal", mode: "light" }), dark: true, loading: true });
  assert.deepEqual(f.api.getSettings(), { preset: "terminal", mode: "light" });
  assert.equal(f.api.getColorScheme(), "light");
  assert.deepEqual(f.document.documentElement.dataset, { theme: "terminal", colorScheme: "light", themeMode: "light" });
  assert.equal(f.document.documentElement.style.colorScheme, "light");
  assert.equal(f.holder(), undefined);
  assert.equal(f.writes.length, 0);
  f.document.fire("DOMContentLoaded");
  f.document.fire("DOMContentLoaded");
  assert.equal(f.topbar.querySelectorAll(".site-theme").length, 1);
  assert.equal(f.icons(), 1);
});

test("system mode alone subscribes to OS changes, including legacy media APIs", () => {
  for (const legacyMedia of [false, true]) {
    const f = fixture({ dark: false, legacyMedia });
    assert.equal(f.mediaListeners.size, 1);
    f.media.emit(true);
    assert.equal(f.api.getColorScheme(), "dark");
    f.api.setSettings({ mode: "light" });
    assert.equal(f.mediaListeners.size, 0);
    const count = f.events.length;
    f.media.emit(true);
    assert.equal(f.api.getColorScheme(), "light");
    assert.equal(f.events.length, count);
    f.api.setSettings({ preset: "paper", mode: "system" });
    assert.equal(f.mediaListeners.size, 1);
    assert.equal(f.api.getColorScheme(), "dark");
    assert.deepEqual(f.api.getSettings(), { preset: "paper", mode: "system" });
  }
});

test("updates persist one validated JSON and dispatch effective scheme without leaking mutable settings", () => {
  const f = fixture();
  const saved = f.api.setSettings({ preset: "slate", mode: "dark" });
  saved.mode = "light";
  f.api.getSettings().preset = "paper";
  assert.deepEqual(f.api.getSettings(), { preset: "slate", mode: "dark" });
  assert.deepEqual(f.writes, [[STORAGE_KEY, '{"preset":"slate","mode":"dark"}']]);
  assert.equal(f.events.at(-1).type, "agentlab:themechange");
  assert.deepEqual(f.events.at(-1).detail, { preset: "slate", mode: "dark", colorScheme: "dark" });
  const count = f.events.length;
  f.api.setSettings({ preset: "invalid", mode: "invalid" });
  assert.equal(f.events.length, count);
  assert.equal(f.writes.length, 1);
});

test("malformed or blocked browser storage does not prevent theme switching", () => {
  for (const saved of ["invalid json", "[]", '{"preset":"unknown","mode":"invalid"}']) {
    assert.deepEqual(fixture({ saved }).api.getSettings(), { preset: "ink", mode: "system" });
  }
  const f = fixture({ storageFails: true });
  assert.doesNotThrow(() => f.api.setSettings({ preset: "terminal", mode: "dark" }));
  assert.deepEqual(f.api.getSettings(), { preset: "terminal", mode: "dark" });
  assert.equal(f.document.documentElement.dataset.colorScheme, "dark");
});

test("storage events synchronize tabs and controls without writing back", () => {
  const f = fixture({ dark: true });
  f.storage({ key: "unrelated", newValue: '{"preset":"paper","mode":"light"}' });
  assert.deepEqual(f.api.getSettings(), { preset: "ink", mode: "system" });
  f.storage({ key: STORAGE_KEY, newValue: '{"preset":"paper","mode":"light"}' });
  assert.deepEqual(f.api.getSettings(), { preset: "paper", mode: "light" });
  assert.equal(f.api.getColorScheme(), "light");
  assert.equal(f.radios().find((input) => input.value === "paper").checked, true);
  assert.equal(f.radios().find((input) => input.value === "ink").checked, false);
  assert.equal(f.writes.length, 0);
  f.storage({ key: STORAGE_KEY, newValue: null });
  assert.deepEqual(f.api.getSettings(), { preset: "ink", mode: "system" });
  assert.equal(f.api.getColorScheme(), "dark");
  f.storage({ key: null, newValue: null });
  assert.equal(f.mediaListeners.size, 1);
});

test("theme control creates header links when missing and uses accessible native radio groups", () => {
  const f = fixture({ headerLinks: false });
  assert.equal(f.topbar.querySelectorAll(".header-links").length, 1);
  assert.equal(f.trigger().title, "主题");
  assert.equal(f.trigger().getAttribute("aria-label"), "主题");
  assert.equal(f.trigger().getAttribute("aria-controls"), "siteThemePanel");
  assert.equal(f.trigger().querySelector("i").dataset.lucide, "palette");
  assert.equal(f.panel().getAttribute("role"), "group");
  assert.equal(f.panel().hidden, true);
  assert.equal(f.radios().length, 7);
  assert.equal(f.radios().every((input) => input.type === "radio"), true);
  assert.deepEqual(f.radios().filter((input) => input.checked).map((input) => input.value), ["ink", "system"]);
  const terminal = f.radios().find((input) => input.value === "terminal");
  terminal.checked = true;
  terminal.dispatch("change");
  assert.equal(f.api.getSettings().preset, "terminal");
  assert.equal(f.radios().find((input) => input.value === "ink").checked, false);
});

test("keyboard opens at selected preset and Escape closes with trigger focus", () => {
  const f = fixture();
  assert.equal(f.trigger().dispatch("keydown", { key: "ArrowDown" }).defaultPrevented, true);
  assert.equal(f.panel().hidden, false);
  assert.equal(f.trigger().getAttribute("aria-expanded"), "true");
  assert.equal(f.document.activeElement.value, "ink");
  assert.equal(f.holder().dispatch("keydown", { key: "Escape" }).defaultPrevented, true);
  assert.equal(f.panel().hidden, true);
  assert.equal(f.trigger().getAttribute("aria-expanded"), "false");
  assert.equal(f.document.activeElement, f.trigger());
});

test("outside clicks and focus leaving dismiss the panel without stealing focus", () => {
  const f = fixture();
  const trigger = f.trigger();
  trigger.dispatch("click");
  f.holder().dispatch("focusout", { relatedTarget: f.radios()[0] });
  assert.equal(f.panel().hidden, false);
  f.document.fire("click", { target: f.radios()[0] });
  assert.equal(f.panel().hidden, false);
  const outside = f.document.createElement("a");
  outside.focus();
  f.document.fire("click", { target: outside });
  assert.equal(f.panel().hidden, true);
  assert.equal(f.document.activeElement, outside);
  trigger.dispatch("click");
  f.holder().dispatch("focusout", { relatedTarget: null });
  assert.equal(f.panel().hidden, true);
});

test("every preset defines a complete OINK light and dark palette without changing diff semantics", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/site-theme.css"), "utf8");
  const expectedPages = {
    paper: ["#f7f6f3", "#161513"], slate: ["#f1f4f8", "#0b1119"],
    ink: ["#ffffff", "#0b0b0b"], terminal: ["#f4f5f2", "#0c0f0e"],
  };
  const required = ["page", "surface", "surface-raised", "surface-muted", "text", "text-soft", "muted", "border", "border-strong", "accent", "accent-soft", "focus", "link", "link-hover", "shadow"];
  for (const preset of PRESETS) {
    for (const [index, mode] of ["light", "dark"].entries()) {
      const selector = `:root[data-theme="${preset}"][data-color-scheme="${mode}"]`;
      const start = css.indexOf(`${selector} {`);
      assert.notEqual(start, -1);
      const block = css.slice(start, css.indexOf("}", start));
      for (const token of required) assert.match(block, new RegExp(`--theme-${token}:`), `${selector} ${token}`);
      assert.ok(block.includes(`--theme-page: ${expectedPages[preset][index]};`));
      assert.doesNotMatch(block, /--theme-(add|delete|left|right|pending):/);
      if (["ink", "terminal"].includes(preset)) assert.match(block, /--theme-shadow: none;/);
    }
  }
  assert.match(css, /:root\[data-theme\] body \{\s*--page: var\(--theme-page\)/);
  assert.match(css, /--add: var\(--theme-add\)/);
  assert.match(css, /--delete: var\(--theme-delete\)/);
  assert.match(css, /\.site-theme-choice input \{[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%;/);
  for (const font of ["inter-latin-wght-normal.woff2", "ibm-plex-sans-latin-wght-normal.woff2", "ibm-plex-mono-latin-400-normal.woff2", "ibm-plex-mono-latin-600-normal.woff2"]) {
    assert.ok(fs.existsSync(path.join(__dirname, "../public/vendor/oink/fonts", font)));
    assert.ok(css.includes(font));
  }
});
