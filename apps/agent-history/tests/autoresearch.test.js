const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "..", "public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const study = JSON.parse(read("capabilities/autoresearch.json"));
const html = read("capabilities/autoresearch.html");

test("Autoresearch separates reported experiments from later static implementation", () => {
  assert.equal(study.source.paper, "arXiv:2608.28945v3");
  assert.equal(study.source.revision, "02dbe9d2cadc553720d17cdf6259c0b8727e6cde");
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.ok(study.source.commitDate > study.source.paperDate);
  assert.match(html, /后者晚于论文/);
  assert.match(html, /未独立复现论文收益/);
  assert.match(html, /不是全文翻译/);
  assert.match(html, /不是每个格子都获胜/);
  assert.match(html, /只能改数据，不能提出新的训练方法/);
  assert.match(html, /保留集扮演验证集/);
  assert.match(html, /每种条件只跑了一次/);
  assert.match(html, /没有根据实验反馈继续迭代的机会/);
});

test("every source locator is pinned and has explicit provenance", () => {
  assert.equal(study.evidence.length, 16);
  assert.equal(new Set(study.evidence.map((e) => e.id)).size, 16);
  assert.equal(study.unknowns.length, 4);
  for (const e of study.evidence) {
    assert.ok(e.title && e.statement && e.boundary && e.locator);
    assert.match(e.sha256, /^[a-f0-9]{64}$/);
    if (e.evidenceClass === "paper-reported") {
      assert.equal(e.sha256, study.source.paperSha256);
      assert.ok(e.source.url.startsWith("https://arxiv.org/html/2608.28945v3#"));
      assert.equal(e.artifactUrl, "https://arxiv.org/pdf/2608.28945v3");
    } else {
      assert.equal(e.evidenceClass, "official-source-static");
      assert.ok(Number.isInteger(e.lineStart) && e.lineStart > 0 && e.lineEnd >= e.lineStart);
      assert.equal(e.source.url, `https://github.com/${study.source.repository}/blob/${study.source.revision}/${e.artifact}#L${e.lineStart}-L${e.lineEnd}`);
    }
  }
});

test("paper figures are local, unmodified, attributed and free of active content", () => {
  assert.equal(study.assets.length, 3);
  for (const asset of study.assets) {
    const bytes = fs.readFileSync(path.join(root, asset.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    assert.equal(asset.license, "CC-BY-4.0");
    assert.ok(asset.credit.includes("Jiaxin Wen"));
    assert.ok(html.includes(`src="${asset.path}"`));
    assert.doesNotMatch(bytes.toString("utf8"), /<script|<foreignObject|\son\w+=|(?:href|src)=["']https?:/i);
  }
  assert.match(html, /CC BY 4.0/);
  assert.match(html, /保留原图，增加中文图注/);
});

test("essay anchors, shared navigation and research index resolve", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), id);
  const entry = JSON.parse(read("research-index.json")).studies.find((s) => s.id === study.id);
  assert.equal(entry.kind, "paper-study");
  assert.equal(entry.topic, "自动研究");
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  const nav = require("../public/site-navigation.js").researchItems.find((s) => s.id === study.id);
  assert.equal(nav.href, entry.legacyHref);
  assert.match(html, /<agentlab-navigation current="autoresearch"/);
  assert.equal([...html.matchAll(/data-article-section/g)].length, 9);
  assert.match(read("autoresearch.css"), /prefers-color-scheme: dark/);
  assert.match(read("autoresearch.css"), /max-width: 760px/);
  assert.doesNotMatch(html, /线程|智能体|提示词/);
});
