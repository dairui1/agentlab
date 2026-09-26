const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
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
  for (const term of ["未运行 Raft 或上游测试", "作者报告的演示结果", "不是 AgentLab 的复现记录", "withheld", "retryable: false", "legacy", "没有把三次设成硬门槛"]) assert.ok(html.includes(term), term);
  assert.match(html, /暂缓一条消息，也不会自动撤回已经执行的 shell 命令/);
  assert.match(html, /2026-09-24 的实现快照，晚于五月博客/);
  assert.equal(study.blog.presentation, "complete-chinese-translation-with-paired-source-research");
  assert.equal(study.blog.translationPermission, "author-permission-reported-by-requester-chinese-translation-only");
  assert.match(study.blog.translationSourceSha256, /^[a-f0-9]{64}$/);
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
  assert.equal([...html.matchAll(/data-blog-section/g)].length, 10);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /counting-game-typical-room-markdown.png/);
  assert.match(read("raft-blog.css"), /prefers-reduced-motion/);
});

test("translated blocks preserve official Markdown order, emphasis, lists and figures", () => {
  const tags = [...html.matchAll(/<(\w+) data-original="[^"]+"/g)].map((m) => m[1]);
  // Source: official post.md, SHA-256 stored in study.blog; no English full text is republished.
  assert.deepEqual(tags, [
    "h1", "p", "p", "figure", "p", "p",
    "h2", "p", "p", "figure", "figcaption", "p",
    "h2", "p", "p",
    "h2", "p", "p", "figure", "figcaption", "p",
    "h2", "p", "p", "ul", "figure", "figcaption", "p", "ul", "p",
    "h2", "p", "figure", "p", "h3", "p", "h3", "p",
    "h2", "p", "p", "hr", "h2", "ul", "p",
  ]);
  const blocks = [...html.matchAll(/<(p|ul) data-original="[^"]+">([\s\S]*?)<\/\1>/g)];
  assert.deepEqual(blocks.map((m) => [...m[2].matchAll(/<strong>/g)].length),
    [0, 0, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 0, 4, 1, 0, 0, 0, 1, 0, 0, 0, 0]);
  const lists = blocks.filter((m) => m[1] === "ul");
  assert.deepEqual(lists.map((m) => [...m[2].matchAll(/<li>/g)].length), [2, 4, 2]);
  assert.equal([...html.matchAll(/<figcaption data-original="caption"><em>/g)].length, 3);
  const images = [...html.matchAll(/<figure data-original="image">[\s\S]*?<img src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(images.map((url) => url.split("/").pop()), [
    "counting-game-typical-room-markdown.png", "shared-room-gap-animation-markdown.png",
    "agent-inbox-animation-markdown.png", "held-draft-animation-markdown.png",
    "counting-game-raft-room-markdown.png",
  ]);
  assert.ok(images.every((url) => url.startsWith("https://raft.build/resources/blog/")));
  assert.equal([...html.matchAll(/class="research-note" data-annotation/g)].length, 9);
  assert.doesNotMatch(html, /Let's play a game|Ask a room full of agents|不是原文翻译/);
});

test("annotation toggle leaves translated content intact and restores source deep links", () => {
  const notes = [{ hidden: false }, { hidden: false }];
  const label = { hidden: true };
  const handlers = {};
  const target = { scrollIntoView() { this.scrolled = true; } };
  const sourceLink = { hash: "#sources", addEventListener(event, fn) { this[event] = fn; } };
  const toggle = { checked: true, closest: () => label, addEventListener(event, fn) { this[event] = fn; } };
  const window = { location: { hash: "" }, addEventListener(event, fn) { handlers[event] = fn; } };
  vm.runInNewContext(read("raft-blog.js"), {
    document: {
      querySelector: (selector) => selector === "#show-annotations" ? toggle : null,
      body: { classList: { toggle() {} } },
      querySelectorAll: (selector) => selector === "[data-annotation]" ? notes : selector.startsWith("a[") ? [sourceLink] : [],
      getElementById: () => target,
    }, window,
  });
  assert.equal(label.hidden, false);
  toggle.checked = false;
  toggle.change();
  assert.ok(notes.every((note) => note.hidden));
  window.location.hash = "#RM-09";
  handlers.hashchange();
  assert.equal(toggle.checked, true);
  assert.ok(notes.every((note) => !note.hidden));
  assert.equal(target.scrolled, true);
  toggle.checked = false;
  toggle.change();
  window.location.hash = "#inbox";
  handlers.hashchange();
  assert.ok(notes.every((note) => note.hidden));
  window.location.hash = "#sources";
  sourceLink.click();
  assert.equal(toggle.checked, true);
  assert.ok(notes.every((note) => !note.hidden));
});

test("no JavaScript still exposes translation, annotations and every source", () => {
  assert.match(html, /class="annotation-toggle" hidden/);
  assert.doesNotMatch(html, /data-annotation[^>]*\bhidden\b/);
  assert.doesNotMatch(html, /data-original="[^"]+"[^>]*\bhidden\b/);
});

test("paired layout preserves every byte of the previously approved translated blocks", () => {
  const originals = html.match(/<(h[1-3]|p|ul|figure) data-original="[^"]+">[\s\S]*?<\/\1>|<hr data-original="separator">/g);
  assert.equal(originals.length, 42);
  assert.equal(createHash("sha256").update(originals.join("\n")).digest("hex"),
    "dd30b712ae1688a9cf42fc4dcdd6e7ad0df38e2b1b8b142a7bf0369965d50966");
  assert.equal(study.research.layout, "paired-columns");
  assert.equal(study.research.panels.length, 9);
  const pairs = [...html.matchAll(/<section class="reading-pair" id="([^"]+)"[\s\S]*?<\/section>/g)];
  assert.equal(pairs.length, 9);
  for (const [index, pair] of pairs.entries()) {
    assert.equal(pair[1], study.research.panels[index].anchor);
    assert.ok(pair[0].indexOf('class="original-column"') < pair[0].indexOf('class="research-note"'));
    assert.match(pair[0], /data-original=/);
    assert.match(pair[0], /对应原文：/);
  }
  const css = read("raft-blog.css");
  assert.match(css, /grid-template-columns:minmax\(0,\.9fr\) minmax\(0,1\.3fr\)/);
  assert.match(css, /\.original-column.can-pin \.original-copy.*position:sticky/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(read("raft-blog.js"), /copy.getBoundingClientRect\(\).height < window.innerHeight - 110/);
});

test("research expands arguments with diagrams and exact fixed-source excerpts", () => {
  const notes = html.match(/<aside class="research-note"[\s\S]*?<\/aside>/g);
  const plain = (text) => text.replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<[^>]*>/g, "");
  const han = (text) => (plain(text).match(/[\u4e00-\u9fff]/g) || []).length;
  const originalText = [...html.matchAll(/<(p|ul) data-original="[^"]+">([\s\S]*?)<\/\1>/g)].map((m) => m[2]).join("");
  assert.ok(han(notes.join("")) > han(originalText) * 2.5);
  for (const note of notes) assert.ok(han(note) > 450);
  assert.equal([...html.matchAll(/class="research-diagram"/g)].length, study.research.diagramCount);
  assert.equal(study.research.diagramCount, 9);
  assert.equal(study.snippets.length, 19);
  assert.equal([...html.matchAll(/data-snippet="/g)].length, 19);
  const decode = (s) => s.replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
  for (const snippet of study.snippets) {
    const block = [...html.matchAll(/<code data-snippet="([^"]+)">([\s\S]*?)<\/code>/g)].find((m) => m[1] === snippet.id);
    assert.ok(block, snippet.id);
    const lines = snippet.text.split("\n");
    const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
    assert.equal(decode(block[2]), lines.map((line) => line.slice(indent)).join("\n"), snippet.id);
    assert.ok(html.includes(snippet.sourceUrl));
    assert.ok(study.evidence.some((e) => e.artifact === snippet.artifact));
  }
});

test("freshness illustration distinguishes held, ordinary continuation and explicit bypass", () => {
  const { evaluateScenario } = require("../public/raft-blog.js");
  assert.equal(evaluateScenario("stale").held, true);
  assert.equal(evaluateScenario("fresh").held, false);
  assert.equal(evaluateScenario("fresh").anyway, false);
  assert.equal(evaluateScenario("override").held, false);
  assert.equal(evaluateScenario("override").anyway, true);
  assert.equal(evaluateScenario("unknown").held, true);
  assert.match(html, /非 Raft 运行记录/);
  assert.match(html, /拟议实验，不是已运行测试/);
});

test("source verifier rejects edited snippets even when source hashes are valid", async () => {
  const { verifyEvidenceFiles } = await import("../scripts/verify_raft_sources.mjs");
  const bytes = Buffer.from("first\nsecond\n");
  const e = structuredClone(study.evidence[0]);
  e.lineStart = 1; e.lineEnd = 2;
  e.sha256 = createHash("sha256").update(bytes).digest("hex");
  e.source.url = `https://github.com/${study.source.repository}/blob/${study.source.revision}/${e.artifact}#L1-L2`;
  const fixture = { source: study.source, evidence: [e], snippets: [
    { id: "sample", artifact: e.artifact, lineStart: 1, lineEnd: 2, text: "first\nsecond", sourceUrl: e.source.url },
  ] };
  assert.equal((await verifyEvidenceFiles(fixture, async () => bytes)).snippets, 1);
  fixture.snippets[0].text = "first\nchanged";
  await assert.rejects(() => verifyEvidenceFiles(fixture, async () => bytes), /Snippet text mismatch/);
  fixture.snippets[0].text = "first\nsecond";
  fixture.snippets[0].sourceUrl = fixture.snippets[0].sourceUrl.replace(study.source.revision, "main");
  await assert.rejects(() => verifyEvidenceFiles(fixture, async () => bytes), /Unpinned snippet locator/);
});
