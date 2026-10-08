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
  assert.equal(pages.length, 22);
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
