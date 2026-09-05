const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { researchItems } = require("../public/site-navigation.js");
const { pairs, sourceLines, extract, selectGroups } = require("../public/gpt-prompt-evolution.js");

const root = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const study = JSON.parse(read("capabilities/gpt-prompt-evolution.json"));
const receipt = JSON.parse(read("capabilities/gpt-prompt-evolution-sources.json"));
const corpus = JSON.parse(read("capabilities/gpt-prompt-evolution-diff.json"));
const html = read("capabilities/gpt-prompt-evolution.html");
const script = read("gpt-prompt-evolution.js");
const index = JSON.parse(read("research-index.json")).studies.find((entry) => entry.id === study.id);

test("the prompt diff is reachable through the catalog and shared navigation", () => {
  assert.equal(index.title, study.title);
  assert.equal(index.data, `/capabilities/${study.id}.json`);
  assert.equal(index.legacyHref, `/capabilities/${study.id}.html`);
  assert.ok(researchItems.some((entry) => entry.href === index.legacyHref));
  assert.equal(index.evidenceCount, study.evidence.length);
  assert.equal(index.unknownCount, study.unknowns.length);
  for (const id of index.headlineEvidence) assert.ok(study.evidence.some((entry) => entry.id === id));
});

test("published diff inputs retain exact bytes, and each nonempty source line appears once", () => {
  assert.equal(corpus.revision, receipt.collectionRevision);
  assert.deepEqual(corpus.versions.map((version) => version.id), receipt.sources.map((source) => source.id));
  for (const version of corpus.versions) {
    const source = receipt.sources.find((item) => item.id === version.id);
    assert.equal(crypto.createHash("sha256").update(version.text).digest("hex"), source.sha256);
    assert.equal(version.url, source.url);
    const lines = sourceLines(version.text);
    assert.equal(lines.length, source.lines);
    const seen = new Set();
    for (const group of study.comparisons) {
      const excerpt = extract(version.text, group.ranges[version.id]);
      excerpt.numbers.forEach((number, i) => {
        if (number === null) return;
        assert.ok(!seen.has(number), `${version.id} duplicates line ${number}`);
        seen.add(number);
        assert.equal(excerpt.text.split("\n")[i], lines[number - 1]);
      });
    }
    lines.forEach((line, i) => {
      if (line.trim()) assert.ok(seen.has(i + 1), `${version.id} omitted line ${i + 1}`);
    });
  }
  assert.throws(() => extract("one\ntwo", [[0, 1]]), /行号/);
  assert.throws(() => extract("one\ntwo", [[1, 3]]), /行号/);
});

test("each pair has its own concise explanations and excludes empty-on-both-sides groups", () => {
  assert.equal(study.comparisons.length, 11);
  assert.equal(new Set(study.comparisons.map((group) => group.id)).size, 11);
  for (const [pair, ids] of Object.entries(pairs)) {
    const groups = selectGroups(study, corpus, pair);
    assert.equal(groups.length, 10);
    for (const group of groups) {
      assert.deepEqual(Object.keys(group.explanations), Object.keys(pairs));
      assert.deepEqual(group.sides.map((side) => side.source.id), ids);
      assert.equal(group.explanation, group.explanations[pair]);
      assert.ok(group.explanation.length > 10 && group.explanation.length <= 120);
      assert.ok(group.sides.some((side) => side.text.trim()));
    }
  }
  assert.equal(selectGroups(study, corpus, "5.6-6").some((group) => group.id === "frontend"), false);
  const absent = selectGroups(study, corpus, "5.6-6").find((group) => group.id === "absence");
  assert.equal(absent.sides[1].text, "");
  assert.match(absent.explanation, /尚未核验/);
});

test("only adjacent versions are compared, with old or invalid links falling back to the first step", () => {
  assert.deepEqual(pairs, {
    "5.5-5.6": ["gpt-5.5", "gpt-5.6"],
    "5.6-6": ["gpt-5.6", "gpt-6-astra"],
  });
  assert.deepEqual(receipt.pairs.map(({ before, after }) => [before, after]), Object.values(pairs));
  const firstStep = selectGroups(study, corpus, "5.5-5.6");
  for (const pair of [undefined, null, "5.5-6", "invalid", "__proto__", "constructor"]) {
    assert.deepEqual(selectGroups(study, corpus, pair), firstStep);
  }
  assert.doesNotMatch(html, /value="5\.5-6"/);
  assert.doesNotMatch(script, /"5\.5-6"/);
  assert.match(html, /GPT-5\.5 → 5\.6 → 6/);
});

test("every claim resolves to fixed sources and remains reachable from a diff or source note", () => {
  const sources = new Map(receipt.sources.map((source) => [source.id, source]));
  sources.set("official", { ...receipt.official, lines: 1365 });
  const ids = new Set();
  for (const claim of study.evidence) {
    assert.ok(!ids.has(claim.id));
    ids.add(claim.id);
    const source = sources.get(claim.sourceId);
    assert.ok(source);
    assert.equal(claim.sha256, source.sha256);
    assert.equal(claim.artifact, source.path);
    const [start, end] = claim.lines;
    assert.ok(Number.isInteger(start) && start >= 1 && end >= start && end <= source.lines);
    assert.equal(claim.source.url, `${source.url}#L${start}-L${end}`);
    assert.ok(claim.statement && claim.boundary && claim.confidence);
  }
  const referenced = new Set([
    ...study.comparisons.flatMap((group) => group.evidence),
    ...[...html.matchAll(/data-evidence="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)),
  ]);
  assert.deepEqual(referenced, ids);
});

test("the official Astra difference remains explicit rather than claiming total equality", () => {
  const checks = receipt.official.checks;
  assert.equal(checks.find((check) => check.modelSlug === "gpt-5.5").byteEqual, true);
  for (const slug of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    assert.equal(checks.find((entry) => entry.modelSlug === slug).layoutNormalizedEqual, true);
  }
  const astra = checks.find((check) => check.modelSlug === "gpt-6-astra");
  assert.equal(astra.layoutNormalizedEqual, false);
  assert.equal(astra.normalizedLineChanges.length, 1);
  assert.match(html, /30 秒/);
  assert.match(html, /60 秒/);
  assert.match(study.boundary, /完整请求/);
});

test("the page uses actual side-by-side Monaco diffs with local assets and source line numbers", () => {
  assert.match(html, /data-prompt-diff/);
  assert.match(html, /id="promptPair"/);
  assert.deepEqual([...html.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]), Object.keys(pairs));
  assert.match(script, /createDiffEditor/);
  assert.match(script, /renderSideBySide: true/);
  assert.match(script, /useInlineViewWhenSpaceIsLimited: false/);
  assert.match(script, /numbers\[line - 1\]/);
  assert.match(script, /statsFromLineChanges/);
  assert.match(script, /\.dispose\(\)/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(html, /<agentlab-navigation current="gpt-prompt"/);
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]+)(?:[?#][^"]*)?"/g)) {
    if (url !== "/") assert.ok(fs.existsSync(path.join(root, url)), url);
  }
});
