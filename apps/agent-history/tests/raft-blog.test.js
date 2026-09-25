const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("capabilities/raft-multi-agent.html");
const study = JSON.parse(read("capabilities/raft-multi-agent.json"));

test("Raft blog remains separate from architecture research and is discoverable", () => {
  const entry = JSON.parse(read("research-index.json")).studies.find((s) => s.id === study.id);
  const nav = require("../public/site-navigation.js");
  assert.equal(nav.researchItems.find((s) => s.id === "raft-blog").href, entry.legacyHref);
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.match(read("capabilities/raft-collaboration.html"), /href="\/capabilities\/raft-multi-agent.html"/);
  assert.match(html, /href="\/capabilities\/raft-collaboration.html"/);
  assert.match(html, /<agentlab-navigation current="raft-blog"/);
  assert.match(html, /\/raft-blog.css/);
  assert.doesNotMatch(html, /capability-article.css/);
  for (const id of entry.headlineEvidence) assert.ok(study.evidence.some((e) => e.id === id));
});

test("Raft blog preserves source dates, evidence classes and untested boundaries", () => {
  assert.equal(study.blog.publishedAt, "2026-05-21");
  assert.equal(study.source.commitDate, "2026-09-24");
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.source.license, "FSL-1.1-ALv2");
  assert.equal(study.source.evidenceClass, "official-source-static");
  for (const term of ["未运行 Raft 或上游测试", "人工设定", "非 Raft 运行记录", "read-through", "withheld", "retryable: false", "legacy", "不是本文已经得到的结果"]) assert.ok(html.includes(term), term);
  assert.match(html, /这条消息，不会自动撤回已经执行的 shell 命令/);
  assert.match(html, /实际绕过分支并没有把/);
  assert.match(html, /后来的实现快照/);
});

test("all blog citations, section anchors and pinned locators resolve without JavaScript", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), id);
  const cited = new Set([...html.matchAll(/class="cite" href="#([^"]+)"/g)].map((m) => m[1]));
  assert.equal(study.evidence.length, 15);
  for (const e of study.evidence) {
    assert.ok(cited.has(e.id), e.id);
    assert.ok(html.includes(`id="${e.id}"`), e.id);
    assert.ok(html.includes(e.source.url), e.id);
    assert.ok(html.includes(e.sha256), e.id);
    assert.match(e.sha256, /^[a-f0-9]{64}$/);
    assert.equal(e.source.url, `https://github.com/${study.source.repository}/blob/${study.source.revision}/${e.artifact}#L${e.lineStart}-L${e.lineEnd}`);
    assert.ok(e.lineStart > 0 && e.lineEnd >= e.lineStart);
  }
  assert.equal(cited.size, study.evidence.length);
  assert.equal([...html.matchAll(/data-blog-section/g)].length, 7);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /counting-game-typical-room.html/);
  assert.match(read("raft-blog.css"), /prefers-reduced-motion/);
});

test("illustration steps are bounded, reversible and have no automatic playback", () => {
  const selectors = ["[data-previous]", "[data-next]", "[data-new-message]", "[data-draft-status]", "[data-draft-text]", "[data-sequence-note]", "output"];
  const nodes = Object.fromEntries(selectors.map((s) => [s, { addEventListener(event, fn) { this[event] = fn; } }]));
  const sequence = { querySelector: (s) => nodes[s] };
  vm.runInNewContext(read("raft-blog.js"), {
    document: { querySelector: (s) => s === "[data-sequence]" ? sequence : null, querySelectorAll: () => [] },
    window: { addEventListener() {} },
  });
  assert.equal(nodes.output.textContent, "1/3");
  assert.equal(nodes["[data-new-message]"].hidden, true);
  nodes["[data-next]"].click();
  assert.equal(nodes.output.textContent, "2/3");
  assert.equal(nodes["[data-new-message]"].hidden, false);
  nodes["[data-next]"].click();
  nodes["[data-next]"].click();
  assert.equal(nodes.output.textContent, "3/3");
  assert.equal(nodes["[data-next]"].disabled, true);
  assert.equal(nodes["[data-draft-status]"].textContent, "HELD · NOT SENT");
  nodes["[data-previous]"].click();
  nodes["[data-previous]"].click();
  nodes["[data-previous]"].click();
  assert.equal(nodes.output.textContent, "1/3");
  assert.equal(nodes["[data-previous]"].disabled, true);
});
