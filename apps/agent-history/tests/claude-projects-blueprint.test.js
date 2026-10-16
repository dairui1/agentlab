const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("Projects blueprint is generated from the single Markdown source", async () => {
  const { renderBlueprint } = await import("../scripts/build_claude_projects_blueprint.mjs");
  const root = path.join(__dirname, "../public/capabilities");
  const source = fs.readFileSync(path.join(root, "claude-projects-blueprint.md"), "utf8");
  const html = renderBlueprint(source);
  assert.equal(fs.readFileSync(path.join(root, "claude-projects-blueprint.html"), "utf8"), html);
  assert.equal([...html.matchAll(/<section id=/g)].length, 13);
  assert.equal([...html.matchAll(/class="projects-source-ref"/g)].length, 35);
  assert.equal([...source.matchAll(/^\| T\d{2} \|/gm)].length, 34);
  assert.match(html, /outcome_unknown/);
  assert.match(html, /language-typescript|language-ts/);
  assert.doesNotMatch(html, /\[T-spawn\]/);
  assert.equal([...html.matchAll(/<h1>/g)].length, 1);
});

test("Blueprint renderer escapes code and rejects executable markup or unsafe links", async () => {
  const { renderBlueprint } = await import("../scripts/build_claude_projects_blueprint.mjs");
  const code = renderBlueprint("# Title\n\n## Model\n\n```html\n<script>alert(1)</script>\n```\n");
  assert.match(code, /&lt;script&gt;/);
  assert.throws(() => renderBlueprint("## Model\n\n<script>alert(1)</script>"), /Raw HTML/);
  assert.throws(() => renderBlueprint("## Model\n\n[bad](javascript:alert)"), /Only HTTPS/);
  assert.throws(() => renderBlueprint("## Model\n\n[bad][ref]\n\n[ref]: data:text/html,bad"), /Only HTTPS/);
  assert.throws(() => renderBlueprint("# no sections"), /requires sections/);
});
