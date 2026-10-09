const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const publicRoot = path.join(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(publicRoot, file), "utf8");

test("all entry pages apply saved themes before paint and load compatibility overrides last", () => {
  const pages = fs.readdirSync(publicRoot).filter((file) => file.endsWith(".html"));
  pages.push(...fs.readdirSync(path.join(publicRoot, "capabilities"))
    .filter((file) => file.endsWith(".html")).map((file) => `capabilities/${file}`));
  const guides = fs.readdirSync(path.join(publicRoot, "guides")).filter((file) => file.endsWith(".html"));
  assert.equal(guides.length, 22);
  assert.equal(guides.filter((file) => read(`guides/${file}`).includes('class="rg-page"')).length, 10);
  assert.equal(guides.filter((file) => read(`guides/${file}`).includes('http-equiv="refresh"')).length, 12);
  pages.push(...guides.map((file) => `guides/${file}`));
  assert.equal(pages.length, 46);
  for (const file of pages) {
    const head = read(file).split("</head>")[0];
    const themeScript = head.indexOf('src="/site-theme.js"');
    const baseStyle = head.indexOf('href="/styles.css"');
    const themeStyle = head.indexOf('href="/site-theme.css"');
    const compatibility = head.indexOf('href="/site-theme-compat.css"');
    assert.ok(themeScript >= 0 && themeScript < baseStyle, `${file}: early settings`);
    assert.ok(baseStyle < themeStyle && themeStyle < compatibility, `${file}: cascade`);
  }
});

test("OINK font subsets retain source identity, licenses and pinned bytes", () => {
  const sources = JSON.parse(read("vendor/oink/SOURCES.json"));
  assert.equal(sources.tag, "v1.2.0");
  assert.match(sources.commit, /^[a-f0-9]{40}$/);
  assert.equal(sources.fonts.length, 4);
  for (const font of sources.fonts) {
    const bytes = fs.readFileSync(path.join(publicRoot, "vendor/oink", font.file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), font.sha256);
    assert.ok(read("site-theme.css").includes(`/vendor/oink/${font.file}`));
  }
  assert.match(read("vendor/oink/LICENSE"), /Apache License/);
  assert.match(read("vendor/oink/NOTICE"), /Copyright 2026 PGSTY/);
  for (const name of ["inter", "ibm-plex-sans", "ibm-plex-mono"]) {
    assert.match(read(`vendor/oink/fonts/LICENSE-${name}`), /SIL OPEN FONT LICENSE/i);
  }
});

test("both Monaco consumers use the effective site mode and react to preference changes", () => {
  for (const file of ["app.js", "gpt-prompt-evolution.js"]) {
    assert.match(read(file), /AgentLabTheme\?\.getColorScheme\(\)/);
    assert.match(read(file), /addEventListener\("agentlab:themechange", updateEditorTheme\)/);
  }
  assert.match(read("code-mode.js"), /fonts\?\.addEventListener\("loadingdone"/);
});

test("legacy tracker surfaces follow the selected mode even when the OS disagrees", () => {
  const compat = read("site-theme-compat.css");
  for (const selector of [".dsh-domain", ".dsh-plugin-capability", ".dsh-official-group", ".dsh-evidence-item", '.dsh-release-button[aria-current="true"]']) {
    assert.ok(compat.includes(`:root[data-theme] ${selector}`), selector);
  }
  assert.match(compat, /\.dsh-release-button\[aria-current="true"\] \{ background: var\(--surface\); \}/);
  assert.match(compat, /\.grok-mechanism-button\[aria-selected="true"\] \{ background: color-mix\(in srgb, var\(--text\) 5%, var\(--surface\)\); \}/);
  // The simulated desktop and source-image plates are not site chrome.
  assert.doesNotMatch(compat, /\.(?:cua-file-area|cua-sidebar|cua-window|aar-original figure)[^{]*\{/);
});

test("status badges and selected feed controls retain semantic contrast in both modes", () => {
  const theme = read("site-theme.css");
  const compat = read("site-theme-compat.css");
  assert.match(theme, /:root\[data-color-scheme="light"\] \{[^}]*--theme-on-accent: #ffffff;/);
  assert.match(theme, /:root\[data-color-scheme="dark"\] \{[^}]*--theme-on-accent: var\(--theme-page\);/);
  assert.match(compat, /\.feed-filter-option input:checked \+ \.feed-filter-check \{ color: var\(--on-accent\); \}/);
  assert.match(compat, /\.feed-filter-toggle\[aria-pressed="true"\] \.feed-toggle-switch::after \{ background: var\(--on-accent\); \}/);
  for (const [selector, role] of [
    ['.change-provenance[data-type="current-docs"]', "add"],
    ['.inspector-type[data-type="exact-history"]', "right"],
    ['.inspector-type[data-type="protocol"]', "left"],
  ]) {
    const start = compat.indexOf(`:root[data-theme] ${selector} {`);
    assert.ok(start >= 0, selector);
    const block = compat.slice(start, compat.indexOf("}", start));
    assert.ok(block.includes(`color: var(--${role});`));
    assert.ok(block.includes(`background: var(--${role}-soft);`));
  }
});

test("printing a dark screen preset restores a light reading palette without rewriting preference", () => {
  const theme = read("site-theme.css");
  const print = theme.slice(theme.lastIndexOf("@media print"));
  assert.match(print, /:root\[data-theme\]\[data-color-scheme\]/);
  assert.match(print, /color-scheme: light !important;/);
  assert.match(print, /--theme-page: #ffffff;/);
  assert.match(print, /--theme-text: #141414;/);
  assert.match(print, /--theme-shadow: none;/);
  assert.match(print, /\.site-theme \{ display: none !important; \}/);
  assert.match(read("site-theme-compat.css"), /@media print \{[^}]*--theme-coral: #ad433d;/);
  assert.doesNotMatch(read("site-theme.js"), /beforeprint|afterprint/);
});

test("MiMo keeps the theme anchor at the right edge above its mobile navigation row", () => {
  const compat = read("site-theme-compat.css");
  const mobile = compat.slice(compat.indexOf("@media (max-width: 540px)"), compat.indexOf("@media print"));
  assert.match(mobile, /\.mimo-nav agentlab-navigation \{ order: 3; \}/);
  assert.match(mobile, /\.mimo-nav \.header-links \{ margin-left: auto; \}/);
});

test("missing and unchanged source statuses stay readable rather than appearing disabled", () => {
  const compat = read("site-theme-compat.css");
  assert.match(compat, /:root\[data-theme\] \.source-layer\[data-state="missing"\],\s*:root\[data-theme\] \.source-layer\[data-state="unchanged"\] \{\s*opacity: 1;\s*color: var\(--muted\);\s*\}/);
});

test("mechanisms legend keeps status colors and accent-wash labels use reading ink", () => {
  const compat = read("site-theme-compat.css");
  for (const [state, role] of [["exposed", "add"], ["partial", "pending"], ["not-exposed", "delete"], ["unknown", "muted"]]) {
    assert.ok(compat.includes(`:root[data-theme] .contract-state-legend > span[data-state="${state}"] { color: var(--${role}); }`));
  }
  assert.match(compat, /:root\[data-theme\] \.inspector-type\[data-type="pinned-evidence"\],\s*:root\[data-theme\] \.inspector-related button\[aria-pressed="true"\] \{ color: var\(--text\); \}/);
  const mechanisms = read("mechanisms.css");
  for (const selector of ['.inspector-type[data-type="pinned-evidence"]', '.inspector-related button[aria-pressed="true"]']) {
    const start = mechanisms.indexOf(`${selector} {`);
    const block = mechanisms.slice(start, mechanisms.indexOf("}", start));
    assert.ok(block.includes("background: var(--accent-soft);"), selector);
  }
});

test("semantic small-text foregrounds meet AA on soft and actual OINK muted grounds", () => {
  const theme = read("site-theme.css");
  const luminance = (hex) => hex.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  for (const mode of ["light", "dark"]) {
    const start = theme.indexOf(`:root[data-color-scheme="${mode}"] {`);
    const block = theme.slice(start, theme.indexOf("}", start));
    for (const role of ["add", "delete", "left", "right", "pending"]) {
      const foreground = block.match(new RegExp(`--theme-${role}: (#[0-9a-f]{6});`))[1];
      const backgrounds = [["semantic soft", block.match(new RegExp(`--theme-${role}-soft: (#[0-9a-f]{6});`))[1]]];
      for (const preset of ["paper", "slate", "ink", "terminal"]) {
        const paletteStart = theme.indexOf(`:root[data-theme="${preset}"][data-color-scheme="${mode}"] {`);
        const palette = theme.slice(paletteStart, theme.indexOf("}", paletteStart));
        backgrounds.push([`${preset} muted`, palette.match(/--theme-surface-muted: (#[0-9a-f]{6});/)[1]]);
      }
      for (const [label, background] of backgrounds) {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
        const ratio = (values[1] + 0.05) / (values[0] + 0.05);
        assert.ok(ratio >= 4.5, `${mode} ${role} on ${label}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
  const pending = theme.match(/--theme-pending: (#[0-9a-f]{6});/)[1];
  assert.ok(read("site-theme-compat.css").includes(`--theme-gold: ${pending};`));
});
