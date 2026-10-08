const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.resolve(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(publicRoot, name), "utf8");
const research = read("research.css");
const mechanisms = read("mechanisms.css");
const media = (css, query) => {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`@media \\(${escaped}\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `missing media query: ${query}`);
  return match[1];
};

test("filter search wrappers expose a real focus outline", () => {
  for (const [css, prefix] of [[research, "research"], [mechanisms, "collection"]]) {
    assert.match(css, new RegExp(`\\.${prefix}-search:focus-within\\s*\\{[^}]*outline: 2px solid var\\(--focus\\);[^}]*outline-offset: 2px;`));
    assert.match(css, new RegExp(`\\.${prefix}-search input:focus-visible\\s*\\{[^}]*outline: 2px solid transparent;`));
    assert.doesNotMatch(css, new RegExp(`\\.${prefix}-search input\\s*\\{[^}]*outline: (?:0|none)\\b`));
  }
});

test("filter search focus remains visible when forced colors remove shadows", () => {
  for (const [css, prefix] of [[research, "research"], [mechanisms, "collection"]]) {
    assert.match(media(css, "forced-colors: active"), new RegExp(`\\.${prefix}-search:focus-within\\s*\\{[^}]*outline-color: Highlight;`));
  }
});

test("touch research filtering uses readable fields and real 44px controls", () => {
  const coarse = media(research, "any-pointer: coarse");
  assert.match(coarse, /\.research-search,\s*\.research-select-field select\s*\{[^}]*min-height: 44px;[^}]*height: 44px;/);
  assert.match(coarse, /\.research-search input,\s*\.research-select-field select\s*\{[^}]*font-size: max\(16px, 1rem\);/);
  assert.match(coarse, /\.research-controls > \.icon-button,\s*\.research-detail-controls > \.icon-button\s*\{[^}]*width: 44px;[^}]*height: 44px;[^}]*flex-basis: 44px;/);
  assert.doesNotMatch(coarse, /::(?:before|after)|position: absolute/);
});

test("touch collection filtering grows controls without overlapping hit areas", () => {
  const coarse = media(mechanisms, "any-pointer: coarse");
  assert.match(coarse, /\.collection-search\s*\{[^}]*min-height: 44px;/);
  assert.match(coarse, /\.collection-search input\s*\{[^}]*height: 42px;[^}]*font-size: max\(16px, 1rem\);/);
  assert.match(coarse, /\.collection-facet button\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.doesNotMatch(coarse, /::(?:before|after)|position: absolute/);
});

test("filtering retains compact desktop field typography", () => {
  assert.match(research, /\.research-search input\s*\{[^}]*font-size: 12px;/);
  assert.match(research, /\.research-select-field select\s*\{[^}]*height: 40px;[^}]*font-size: 12px;/);
  assert.match(mechanisms, /\.collection-search\s*\{[^}]*min-height: 32px;/);
  assert.match(mechanisms, /\.collection-search input\s*\{[^}]*font: 12px\/1\.3 var\(--sans\);/);
});
