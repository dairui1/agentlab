"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.join(__dirname, "..", "public");
const read = (relativePath) => fs.readFileSync(path.join(publicRoot, relativePath), "utf8");

const html = read("capabilities/goal-mode-real-run.html");
const data = JSON.parse(read("capabilities/goal-mode-real-run.json"));
const script = read("goal-mode-real-run.js");
const styles = read("goal-mode-real-run.css");
const mechanismPage = read("capabilities/goal-mode.html");

test("real Goal Mode run uses one clean condition and one fixed fixture", () => {
  assert.equal(data.experiment.fixtureCommit, "cd586354c53e2b82c6e133ce0fdfedb54dd5ffa9");
  assert.equal(data.experiment.promptSha256.length, 64);
  assert.match(data.experiment.prompt, /^完成这个仓库的鉴权迁移/);
  assert.doesNotMatch(data.experiment.prompt, /使用本产品的原生 Goal 功能/);
  assert.equal(data.products.length, 2);
  assert.deepEqual(data.products.map((product) => product.id), ["codex", "claude"]);
});

test("both products expose the same four keyframes and verified real outcome", () => {
  assert.equal(data.stageLabels.length, 4);
  for (const product of data.products) {
    assert.equal(product.goalRounds, 3);
    assert.equal(product.stages.length, data.stageLabels.length);
    assert.equal(product.rawEventSha256.length, 64);
    assert.match(product.result, /隐藏验证通过/);
    assert.ok(product.trace.length >= 3);
    assert.ok(product.trace.flatMap((group) => group.events).length >= 20);
  }
});

test("page hides the detailed trajectory until the reader asks for it", () => {
  assert.match(html, /data-stage-tabs/);
  assert.match(html, /data-run-lanes/);
  assert.match(html, /id="full-trajectory"/);
  assert.match(html, /data-trace-tabs/);
  assert.match(html, /data-trace-groups/);
  assert.match(script, /<details class="run-trace-group"/);
  assert.match(script, /groupIndex === 0 \? " open"/);
  assert.match(html, /<details class="run-prompt"/);
});

test("explorer is keyboard operable and has mobile layout constraints", () => {
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
    assert.match(script, new RegExp(key));
  }
  assert.match(script, /role", "tabpanel"/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.run-compare\s*\{[\s\S]*grid-template-columns:/);
  assert.match(styles, /overflow-wrap: anywhere/);
});

test("the mechanism page links to the real matched run", () => {
  assert.match(mechanismPage, /href="\/capabilities\/goal-mode-real-run\.html"/);
  assert.match(html, /href="\/capabilities\/goal-mode\.html"/);
});
