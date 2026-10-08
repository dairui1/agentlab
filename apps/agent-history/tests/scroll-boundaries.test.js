const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.resolve(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(publicRoot, name), "utf8");
const codeMode = read("code-mode.css");
const article = read("capability-article.css");
const mechanisms = read("mechanisms.css");

test("desktop reading panels keep stable text width without trapping short content", () => {
  for (const [css, selector] of [
    [codeMode, "\\.cm-tree"],
    [mechanisms, "\\.operation-rail"],
    [mechanisms, "\\.evidence-inspector"],
  ]) {
    assert.match(css, new RegExp(`${selector}\\s*\\{[^}]*overflow-y: auto;[^}]*overscroll-behavior-y: auto;[^}]*scrollbar-gutter: stable;`), selector);
  }
});

test("desktop scroll boundaries activate progressively only with vertical overflow", () => {
  assert.match(codeMode, /@supports \(animation-timeline: scroll\(self block\)\)\s*\{\s*\.cm-tree\s*\{[^}]*animation: agentlab-reader-boundary linear both;[^}]*animation-timeline: scroll\(self block\);/);
  assert.match(mechanisms, /@supports \(animation-timeline: scroll\(self block\)\)\s*\{\s*\.operation-rail,\s*\.evidence-inspector\s*\{[^}]*animation: agentlab-reader-boundary linear both;[^}]*animation-timeline: scroll\(self block\);/);
});

test("the enhanced mobile directory preserves its independent scroll boundary", () => {
  assert.match(codeMode, /\.cm-enhanced \.cm-tree\s*\{[^}]*position: fixed;[^}]*height: 100dvh;[^}]*animation: none;[^}]*overscroll-behavior-y: contain;[^}]*scrollbar-gutter: stable;/);
});

test("fixed evidence overlays remain isolated without scroll-timeline support", () => {
  assert.match(article, /\.article-evidence\s*\{[^}]*overflow-y: auto;[^}]*overscroll-behavior-y: contain;[^}]*scrollbar-gutter: stable;/);
  assert.match(mechanisms, /\.evidence-inspector\s*\{[^}]*position: fixed;[^}]*overflow-y: auto;[^}]*animation: none;[^}]*overscroll-behavior-y: contain;/);
});

test("normal-flow mobile directories and horizontal rails do not trap document scrolling", () => {
  assert.match(codeMode, /\.cm-tree\s*\{[^}]*position: static;[^}]*height: auto;[^}]*animation: none;[^}]*overscroll-behavior-y: auto;[^}]*scrollbar-gutter: auto;/);
  assert.match(mechanisms, /\.operation-rail\s*\{[^}]*overflow-x: auto;[^}]*animation: none;[^}]*overscroll-behavior-y: auto;[^}]*scrollbar-gutter: auto;/);
});

test("scroll containment leaves horizontal gestures and printable content alone", () => {
  for (const css of [codeMode, article, mechanisms]) {
    for (const [, declarations] of css.matchAll(/(?:\.cm-tree|\.article-evidence|\.operation-rail|\.evidence-inspector)\s*\{([^}]*)\}/g)) {
      assert.doesNotMatch(declarations, /overscroll-behavior(?:-x)?:\s*(?:contain|none)/);
    }
  }
  assert.match(codeMode, /@media print\s*\{[\s\S]*\.cm-tree[^}]*display: none !important;/);
  assert.match(codeMode, /@media print\s*\{[\s\S]*\.cm-page\.cm-enhanced \.cm-nodes \[data-node\]\[hidden\]\s*\{[^}]*display: block !important;/);
});
