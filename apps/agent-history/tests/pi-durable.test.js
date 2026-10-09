const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const root = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const revision = "1cedd32724abfcb0915f76cc61b6827e2c16dbad";
const repository = "earendil-works/pi";
const loadStudy = () => JSON.parse(read("capabilities/pi-durable.json"));

test("Pi Durable keeps its research pinned and runtime evidence explicit", () => {
  const study = loadStudy();
  assert.equal(study.id, "pi-durable");
  assert.equal(study.source.repository, repository);
  assert.equal(study.source.revision, revision);
  assert.equal(study.source.runtimeExperiment, "not-run");
  assert.equal(study.verification.upstreamTestsRunLocally, true);
  assert.equal(study.verification.realModelCalls, 0);
  assert.equal(study.verification.benchmarksReproduced, false);
  assert.ok(study.unknowns.length > 0);
  assert.ok(study.unknowns.every((item) => item.text && item.needed));
});

test("all Pi Durable citations are complete, pinned and used", () => {
  const study = loadStudy();
  const html = read("capabilities/pi-durable-guide.html");
  const ids = new Set(study.evidence.map((item) => item.id));
  assert.equal(ids.size, 25);
  assert.equal(ids.size, study.evidence.length);
  const cited = new Set();
  for (const [, references] of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of references.trim().split(/\s+/)) { assert.ok(ids.has(id), id); cited.add(id); }
  }
  assert.deepEqual(cited, ids);
  for (const item of study.evidence) {
    assert.match(item.id, /^PD-\d{2,}$/);
    assert.ok(item.statement && item.boundary && item.locator && item.evidenceClass, item.id);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(item.lineStart) && Number.isInteger(item.lineEnd)
      && item.lineStart >= 1 && item.lineEnd >= item.lineStart, item.id);
    assert.equal(item.locator, `L${item.lineStart}-L${item.lineEnd}`);
    assert.equal(item.source.url, `https://github.com/${repository}/blob/${revision}/${item.artifact}#L${item.lineStart}-L${item.lineEnd}`);
  }
});

test("Pi Durable has one reading entry and the retired article redirects to it", () => {
  const legacy = read("capabilities/pi-durable.html");
  const guide = JSON.parse(read("capabilities/pi-durable-guide.json"));
  const piIds = new Set(["pi-durable", "pi-durable-guide"]);
  const entries = JSON.parse(read("research-index.json")).studies.filter((item) => piIds.has(item.id));
  const navigation = require("../public/site-navigation.js").researchItems.filter((item) => piIds.has(item.id));
  assert.equal(entries.length, 1);
  assert.equal(navigation.length, 1);
  const entry = entries[0];
  assert.equal(entry.id, "pi-durable-guide");
  assert.equal(entry.legacyHref, "/capabilities/pi-durable-guide.html");
  assert.equal(entry.data, "/capabilities/pi-durable-guide.json");
  assert.equal(navigation[0].id, entry.id);
  assert.equal(navigation[0].href, entry.legacyHref);
  assert.equal(entry.evidenceCount, guide.evidence.length);
  assert.equal(entry.unknownCount, guide.unknowns.length);
  for (const id of entry.headlineEvidence) assert.ok(guide.evidence.some((item) => item.id === id), id);
  assert.match(legacy, /<meta\b[^>]*http-equiv="refresh"[^>]*content="0;url=\/capabilities\/pi-durable-guide\.html"/);
  assert.match(legacy, /<link\b[^>]*rel="canonical"[^>]*href="https:\/\/agentlab\.dairui1\.com\/capabilities\/pi-durable-guide"/);
  assert.match(legacy, /<a\b[^>]*href="\/capabilities\/pi-durable-guide\.html"/);
  assert.doesNotMatch(legacy, /data-article-section|data-evidence=|src="\/pi-durable\.js"/);
  assert.equal(guide.relatedImplementation.data, "/capabilities/pi-durable.json");
  assert.equal(guide.relatedImplementation.revision, revision);
  assert.equal(guide.relatedImplementation.packageVersion, "1.1.0");
});

test("Pi Durable keeps all 25 implementation sources in closed, reachable guide notes", () => {
  const html = read("capabilities/pi-durable-guide.html");
  const study = loadStudy();
  const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const note = html.match(/(<details\b[^>]*\bid="implementation-source"[^>]*>)([\s\S]*?)<\/details>/);
  assert.ok(note, "implementation sources remain in native details");
  assert.doesNotMatch(note[1], /\bopen(?:\s|=|>)/);
  assert.equal([...html.matchAll(/\bid="implementation-source"/g)].length, 1);
  assert.match(note[2], /^<summary>AgentLab 源码记录 · Pi Durable 1\.1\.0<\/summary>/);
  assert.equal([...note[2].matchAll(/<summary\b/g)].length, 1);
  assert.match(html.slice(0, note.index), /href="#implementation-source"/);
  assert.doesNotMatch(html.slice(0, note.index), /data-evidence="PD-/);
  assert.match(note[2], /href="\/capabilities\/pi-durable\.json"/);
  const records = [...note[2].matchAll(/<div\b[^>]*\bid="implementation-(PD-\d+)"[^>]*>([\s\S]*?)<\/div>/g)];
  assert.equal(records.length, 25);
  assert.equal(new Set(records.map(([, id]) => id)).size, records.length);
  assert.deepEqual(new Set(records.map(([, id]) => id)), new Set(study.evidence.map((item) => item.id)));
  const decode = (value) => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]);
  for (const [, id, markup] of records) {
    const item = study.evidence.find((entry) => entry.id === id);
    const links = [...markup.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
    assert.equal(links.length, 1, id);
    assert.equal(attribute(links[0], "data-evidence"), id);
    assert.equal(decode(attribute(links[0], "href")), item.source.url);
    assert.equal(attribute(links[0], "target"), "_blank");
    assert.match(attribute(links[0], "rel"), /\bnoopener\b/);
    const text = decode(markup.replace(/<[^>]*>/g, ""));
    assert.ok(text.includes(item.statement), `${id} statement remains unchanged`);
    assert.ok(text.includes(item.boundary), `${id} boundary remains unchanged`);
    assert.ok(text.includes(item.artifact), `${id} artifact`);
    assert.ok(text.includes(item.locator), `${id} locator`);
    assert.ok(text.includes(item.sha256), `${id} complete artifact hash`);
  }
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
  for (const [, id] of records) assert.ok(ids.has(`implementation-${id}`), `${id} deep-link target`);
  assert.match(html, /src="\/pi-durable.js"/);
  assert.ok(html.indexOf('src="/pi-durable-guide.js"') < html.indexOf('src="/pi-durable.js"'));
});

function hashNavigation(hash = "") {
  class Element {
    constructor(id, parentElement = null) {
      this.id = id;
      this.parentElement = parentElement;
      this.scrolls = [];
    }
    scrollIntoView(options) { this.scrolls.push(options.block); }
  }
  class DetailsElement extends Element {
    constructor(id, parentElement = null) { super(id, parentElement); this.open = false; }
  }
  const verification = new Element("verification");
  const notes = new Element("notes", verification);
  const generation = new DetailsElement("generation", notes);
  const deployment = new DetailsElement("deployment", notes);
  const inbox = new DetailsElement("inbox", notes);
  const ownership = new Element("ownership", new Element("paragraph", inbox));
  const fit = new Element("fit");
  const targets = new Map([generation, deployment, inbox, ownership, fit].map((node) => [node.id, node]));
  const listeners = new Map();
  const frames = [];
  const lookups = [];
  const location = { hash };
  const context = vm.createContext({
    location,
    HTMLDetailsElement: DetailsElement,
    document: { getElementById: (id) => { lookups.push(id); return targets.get(id); } },
    window: { addEventListener: (event, handler) => { assert.ok(!listeners.has(event)); listeners.set(event, handler); } },
    requestAnimationFrame: (callback) => frames.push(callback),
  });
  vm.runInContext(read("pi-durable.js"), context);
  return { generation, deployment, inbox, ownership, fit, targets, frames, lookups,
    flush: () => { while (frames.length) frames.shift()(); },
    change: (next) => { location.hash = next; listeners.get("hashchange")(); } };
}

test("Pi Durable opens and scrolls the initial decoded technical hash", () => {
  const page = hashNavigation("#%67eneration");
  assert.equal(page.generation.open, true);
  assert.equal(page.deployment.open, false);
  assert.equal(page.inbox.open, false);
  assert.deepEqual(page.lookups, ["generation"]);
  assert.equal(page.frames.length, 1);
  assert.deepEqual(page.generation.scrolls, []);
  page.flush();
  assert.deepEqual(page.generation.scrolls, ["start"]);
});

test("Pi Durable hashchange reaches details and the nested ownership paragraph", () => {
  const page = hashNavigation();
  page.change("#deployment");
  assert.equal(page.deployment.open, true);
  assert.equal(page.inbox.open, false);
  page.flush();
  assert.deepEqual(page.deployment.scrolls, ["start"]);
  page.change("#ownership");
  assert.equal(page.inbox.open, true);
  assert.equal(page.generation.open, false);
  page.flush();
  assert.deepEqual(page.ownership.scrolls, ["start"]);
});

test("Pi Durable hash navigation opens every enclosing details element", () => {
  const page = hashNavigation();
  page.inbox.parentElement = page.generation;
  page.change("#ownership");
  assert.equal(page.inbox.open, true);
  assert.equal(page.generation.open, true);
  assert.equal(page.deployment.open, false);
  page.flush();
  assert.deepEqual(page.ownership.scrolls, ["start"]);
});

test("Pi Durable ignores malformed, absent and nontechnical hash targets", () => {
  const page = hashNavigation("#%E0%A4%A");
  assert.deepEqual(page.lookups, []);
  assert.doesNotThrow(() => page.change("#%"));
  assert.deepEqual(page.lookups, []);
  assert.doesNotThrow(() => page.change("#missing"));
  assert.deepEqual(page.lookups, ["missing"]);
  page.change("#fit");
  page.change("");
  assert.equal(page.frames.length, 0);
  assert.deepEqual(page.fit.scrolls, []);
  assert.ok([page.generation, page.deployment, page.inbox].every((node) => node.open === false));
});

test("Pi Durable verifier caches artifacts and rejects source, locator and citation drift", async () => {
  const { verifyPiDurableSources } = await import("../scripts/verify_pi_durable_sources.mjs");
  const bytes = Buffer.from("first\nsecond\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sample = {
    source: { repository, revision },
    evidence: [{ id: "PD-01", artifact: "test.ts", lineStart: 1, lineEnd: 2, locator: "L1-L2", sha256,
      source: { url: `https://github.com/${repository}/blob/${revision}/test.ts#L1-L2` } }],
  };
  const markup = '<p data-evidence="PD-01">Research claim</p>';
  const verify = (value = sample, html = markup, source = bytes) => verifyPiDurableSources(value, html, async () => source);
  assert.equal((await verify()).verificationKind, "pinned-source");
  const duplicateArtifact = structuredClone(sample);
  duplicateArtifact.evidence.push({ ...duplicateArtifact.evidence[0], id: "PD-02" });
  let loads = 0;
  const result = await verifyPiDurableSources(duplicateArtifact, '<p data-evidence="PD-01 PD-02">Claim</p>', async () => { loads += 1; return bytes; });
  assert.equal(loads, 1);
  assert.equal(result.files, 1);
  assert.equal(result.evidence, 2);
  await assert.rejects(verify(sample, markup, Buffer.from("changed")), /Source hash mismatch/);
  await assert.rejects(verify(sample, '<p data-evidence="PD-99">Claim</p>'), /Unknown citation/);
  await assert.rejects(verify(sample, "No citations"), /Unused evidence/);
  await assert.rejects(verify(sample, '<p data-evidence=" ">Claim</p>'), /Empty evidence citation/);
  assert.equal((await verify(sample, "<p data-evidence='PD-01'>Claim</p>")).citations, 1);
  const range = structuredClone(sample); range.evidence[0].lineEnd = 3;
  await assert.rejects(verify(range), /Invalid range/);
  const fractional = structuredClone(sample); fractional.evidence[0].lineStart = 1.5;
  await assert.rejects(verify(fractional), /Invalid range/);
  const locator = structuredClone(sample); locator.evidence[0].locator = "L1-L1";
  await assert.rejects(verify(locator), /Locator mismatch/);
  const unpinned = structuredClone(sample); unpinned.evidence[0].source.url = `https://github.com/${repository}/blob/main/test.ts`;
  await assert.rejects(verify(unpinned), /Pinned URL mismatch/);
  const moved = structuredClone(sample); moved.source.revision = "a".repeat(40);
  await assert.rejects(verify(moved), /Revision mismatch/);
  const otherRepository = structuredClone(sample); otherRepository.source.repository = "bad/pi";
  await assert.rejects(verify(otherRepository), /Repository mismatch/);
  const unsafe = structuredClone(sample); unsafe.evidence[0].artifact = "../secret";
  await assert.rejects(verify(unsafe), /Unsafe artifact/);
  const duplicate = structuredClone(sample); duplicate.evidence.push(structuredClone(duplicate.evidence[0]));
  await assert.rejects(verify(duplicate), /Duplicate evidence/);
  await assert.rejects(verify({ ...sample, evidence: [] }), /Missing evidence/);
  await assert.rejects(verify(sample, markup, Buffer.alloc(6 * 1024 * 1024 + 1)), /Source too large/);
});

test("Pi Durable verifier rejects optional excerpt drift", async () => {
  const { verifyPiDurableSources } = await import("../scripts/verify_pi_durable_sources.mjs");
  const bytes = Buffer.from("<first>\nsecond\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sample = {
    source: { repository, revision },
    evidence: [{ id: "PD-01", artifact: "test.ts", lineStart: 1, lineEnd: 2, locator: "L1-L2", sha256,
      source: { url: `https://github.com/${repository}/blob/${revision}/test.ts#L1-L2` } }],
    snippets: [{ id: "PD-01", artifact: "test.ts", lineStart: 1, lineEnd: 1, text: "<first>" }],
  };
  const markup = '<p data-evidence="PD-01">Claim</p><code data-source-snippet="PD-01">&lt;first&gt;</code>';
  const verify = (value = sample, html = markup) => verifyPiDurableSources(value, html, async () => bytes);
  assert.equal((await verify()).snippets, 1);
  await assert.rejects(verify(sample, '<p data-evidence="PD-01">Claim</p>'), /HTML excerpt mismatch/);
  const drift = structuredClone(sample); drift.snippets[0].text = "changed";
  await assert.rejects(verify(drift), /Snippet mismatch/);
  const range = structuredClone(sample); range.snippets[0].lineEnd = 3;
  await assert.rejects(verify(range), /Invalid snippet range/);
});
