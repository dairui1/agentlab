const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "../public");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const study = JSON.parse(read("capabilities/claude-projects-sources.json"));
const tools = JSON.parse(read("capabilities/claude-projects-tools.json"));
const html = read("capabilities/claude-projects.html");
const blueprint = read("capabilities/claude-projects-blueprint.md");
const verifier = import("../scripts/verify_claude_projects_sources.mjs");

test("Projects keeps pinned source reports, contracts and self-description distinct", async () => {
  const { verifyStudyMetadata, SOURCE_PINS } = await verifier;
  const result = verifyStudyMetadata(study);
  assert.equal(result.sources.size, 2);
  assert.equal(result.evidenceIds.size, 40);
  assert.deepEqual(study.sources.map((source) => source.commit), SOURCE_PINS.map((source) => source.commit));
  assert.deepEqual(new Set(study.evidence.map((item) => item.evidenceClass)),
    new Set(["author-report", "tool-contract", "role-self-description"]));
  assert.equal(study.evidence.filter((item) => item.evidenceClass === "author-report").length, 16);
  assert.equal(study.evidence.filter((item) => item.evidenceClass === "role-self-description").length, 4);
  assert.ok(study.evidence.every((item) => item.kind === "observation" && item.evidenceLabel));
  assert.ok(study.verification.method && study.verification.confidenceMeaning && study.verification.publicationPolicy);
  for (const source of study.sources) assert.equal(source.license.status, "not-found-at-pinned-commit");
  assert.equal(study.unknowns.length, 7);
  for (const item of study.unknowns) {
    assert.ok(item.evidenceIds.length > 0 && item.text && item.needed, item.id);
  }
});

test("Projects article uses every evidence item and its Markdown retains legal pinned ranges", async () => {
  const { verifyArticleReferences } = await verifier;
  const result = verifyArticleReferences(study, html, blueprint);
  assert.equal(result.evidence, study.evidence.length);
  assert.ok(result.markdownCitations >= 25);
  assert.match(html, /data-evidence-source="\/capabilities\/claude-projects-sources\.json"/);
  assert.match(html, /role="dialog"[^>]+inert/);
  assert.match(html, /src="\/capability-article\.js"/);
  assert.match(html, /href="\/capabilities\/claude-projects-blueprint\.md"/);
  assert.match(html, /href="\/capabilities\/claude-projects-tools\.json"/);
  const sections = [...html.matchAll(/<section id="([^"]+)" data-article-section/g)].map((match) => match[1]);
  const anchors = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  assert.ok(sections.length >= 8);
  assert.equal(new Set(sections).size, sections.length);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(anchors.has(id), `Missing anchor: ${id}`);
  assert.doesNotMatch(read("claude-projects.css"), /font-size:[^;]*(?:vw|cqw)|letter-spacing:\s*-/);
});

test("Projects is consistently indexed by the research library and shared navigation", () => {
  const catalog = JSON.parse(read("research-index.json")).studies;
  const entries = catalog.filter((entry) => entry.id === study.id);
  assert.equal(entries.length, 1, "Research catalog entry missing or duplicated");
  const entry = entries[0];
  assert.equal(entry.data, "/capabilities/claude-projects-sources.json");
  assert.equal(entry.legacyHref, "/capabilities/claude-projects.html");
  assert.equal(entry.evidenceCount, study.evidence.length);
  assert.equal(entry.unknownCount, study.unknowns.length);
  assert.equal(entry.verifiedAt, study.verifiedAt);
  for (const id of entry.headlineEvidence) assert.ok(study.evidence.some((item) => item.id === id), id);
  const nav = require("../public/site-navigation.js").researchItems.filter((item) => item.id === study.id);
  assert.equal(nav.length, 1);
  assert.equal(nav[0].href, entry.legacyHref);
});

test("Projects tool metadata preserves the coordinator boundary and source hashes", async () => {
  const { verifyToolMetadata } = await verifier;
  const source = study.sources.find((item) => item.id === "S2");
  const result = verifyToolMetadata(tools, source);
  assert.equal(result.coordinatorTools, 63);
  assert.deepEqual(result.groups, { builtin: 11, "claude-code-remote": 13, hearthbot: 39 });
  assert.ok(tools.workerScope && tools.knownGaps.length > 0);
  const names = new Set(tools.tools.map((item) => item.fullName));
  assert.ok(!names.has("Bash"));
  assert.ok(tools.workerScope.extraBuiltinTools.some((item) => item.name === "Bash"));
  assert.ok(!names.has("mcp__claude-code-remote__create_session"));
  assert.ok(tools.tools.every((item) => item.role === "coordinator"));
});

test("Projects evidence labels survive both readers without changing shared filter types", () => {
  function loadFunction(file, name, globals = {}) {
    const source = read(file).match(new RegExp(`function ${name}\\([^]*?\\n  \\}`))?.[0];
    assert.ok(source, `Missing function: ${name}`);
    return vm.runInNewContext(`(${source})`, globals);
  }
  const articleLabel = loadFunction("capability-article.js", "evidenceLabel");
  for (const item of study.evidence) assert.equal(articleLabel(item), item.evidenceLabel);
  assert.equal(articleLabel({ kind: "observation" }), "文件里直接看到");
  assert.equal(articleLabel({ kind: "inference" }), "根据线索推断");
  assert.equal(articleLabel({ kind: "observation", evidenceLabel: "" }), "文件里直接看到");

  const normalizeClaim = loadFunction("research.js", "normalizeClaim", {
    capabilityAgent: (item) => item.products.length === 1 ? item.products[0].id : "cross-product",
  });
  const catalogStudy = { products: [{ id: "claude-code", version: "fixed snapshot" }] };
  const normalized = normalizeClaim(study.evidence.find((item) => item.id === "T20"), catalogStudy, "capability");
  assert.equal(normalized.type, "observation");
  assert.equal(normalized.evidenceLabel, "角色自述");
  assert.ok(normalized.search.includes("角色自述"));
  assert.equal(normalizeClaim({ kind: "inference", evidenceLabel: "推演" }, catalogStudy, "capability").type, "inference");
  assert.equal(normalizeClaim({ type: "fact" }, catalogStudy, "comparison").type, "fact");

  const nodes = [];
  function el(tag, className, textContent) {
    const node = { tag, className, textContent, dataset: {}, children: [],
      append(...children) { this.children.push(...children); }, setAttribute() {}, addEventListener() {},
      get childElementCount() { return this.children.length; } };
    nodes.push(node);
    return node;
  }
  const makeRecord = loadFunction("research.js", "makeEvidenceRecord", {
    el, icon: () => el("i"), productLabels: {}, confidenceLabel: (value) => value,
    typeLabel: loadFunction("research.js", "typeLabel"),
    makeMetaRow: () => el("div"), makeRecordLinks: () => el("div"),
  });
  const record = makeRecord(normalized);
  assert.equal(record.dataset.recordType, "observation");
  assert.equal(nodes.find((item) => item.className === "research-evidence-kind").textContent, "角色自述");
  nodes.length = 0;
  makeRecord({ ...normalized, evidenceLabel: undefined });
  assert.equal(nodes.find((item) => item.className === "research-evidence-kind").textContent, "观察");
});

test("Projects verifier rejects metadata, ranges, citation and instance-ID drift", async () => {
  const { verifyStudyMetadata, verifyArticleReferences, verifyToolMetadata } = await verifier;
  const changed = () => structuredClone(study);
  const hash = changed(); hash.sources[0].sha256 = "0".repeat(64);
  assert.throws(() => verifyStudyMetadata(hash), /Pinned source mismatch/);
  const commit = changed(); commit.sources[0].commit = "main";
  assert.throws(() => verifyStudyMetadata(commit), /Pinned source mismatch/);
  const range = changed(); range.evidence[0].lineEnd = 9999;
  assert.throws(() => verifyStudyMetadata(range), /Invalid range/);
  const locator = changed(); locator.evidence[0].locator = "L1-L2";
  assert.throws(() => verifyStudyMetadata(locator), /Locator mismatch/);
  const source = changed(); source.evidence[0].source.url = source.sources[0].url.replace(source.sources[0].commit, "main");
  assert.throws(() => verifyStudyMetadata(source), /Evidence URL mismatch/);
  const boundary = changed(); boundary.evidence[0].boundary = "";
  assert.throws(() => verifyStudyMetadata(boundary), /Incomplete evidence/);
  const kind = changed(); kind.evidence[0].kind = "作者实测报告";
  assert.throws(() => verifyStudyMetadata(kind), /Evidence kind mismatch/);
  const label = changed(); label.evidence[0].evidenceLabel = "未分级";
  assert.throws(() => verifyStudyMetadata(label), /Evidence class mismatch/);
  const unknown = changed(); unknown.unknowns[0].evidenceIds.push("missing");
  assert.throws(() => verifyStudyMetadata(unknown), /Unknown evidence/);
  assert.throws(() => verifyArticleReferences(study, html.replaceAll("P01", "missing"), blueprint), /Unknown article evidence/);
  assert.throws(() => verifyArticleReferences(study, html.replaceAll("P01", "P02"), blueprint), /Unused article evidence/);
  assert.throws(() => verifyArticleReferences(study, html, blueprint.replaceAll(study.sources[0].commit, "main")), /Unpinned Markdown source/);
  assert.throws(() => verifyArticleReferences(study, html, `${blueprint}\n[bad]: ${study.sources[0].url}#L1-L9999\n`), /Invalid range/);
  assert.throws(() => verifyArticleReferences(study, html, `${blueprint}\n[P-missing]\n`), /Undefined Markdown reference/);
  assert.throws(() => verifyArticleReferences(study, `${html} session_01234567890123456789`, blueprint), /Published instance identifier/);
  const toolHash = structuredClone(tools); toolHash.source.sha256 = "0".repeat(64);
  assert.throws(() => verifyToolMetadata(toolHash, study.sources[1]), /Tool source mismatch/);
  const toolUrl = structuredClone(tools); toolUrl.tools[0].source = "https://example.com/tool";
  assert.throws(() => verifyToolMetadata(toolUrl, study.sources[1]), /Tool URL mismatch/);
});

test("Projects raw source verification detects byte and newline drift without a private cache", async () => {
  const { verifySourceBytes } = await verifier;
  const bytes = Buffer.from("first\nsecond\n");
  const source = { id: "fixture", lineCount: 2, sha256: createHash("sha256").update(bytes).digest("hex") };
  assert.deepEqual(verifySourceBytes(source, bytes), ["first", "second"]);
  assert.throws(() => verifySourceBytes(source, Buffer.from("first\nchanged\n")), /Source hash mismatch/);
  assert.throws(() => verifySourceBytes(source, Buffer.from("first\r\nsecond\r\n")), /Source hash mismatch/);
  assert.throws(() => verifySourceBytes({ ...source, lineCount: 3 }, bytes), /Line count mismatch/);
  assert.throws(() => verifySourceBytes(source, Buffer.alloc(2 * 1024 * 1024 + 1)), /Source too large/);
});

test("Projects coordinator heading coverage excludes worker tools and catches missing entries", async () => {
  const { coordinatorHeadings, verifyToolCoverage } = await verifier;
  const sample = ["## 1. Built-in", "### Agent", "## 2. Remote", "### add_repo",
    "## 3. hearthbot", "### post_message", "## 4. Worker", "### Bash", "## 5. Overview", "### Roles"];
  assert.deepEqual(coordinatorHeadings(sample), [
    { name: "Agent", group: "builtin", lineStart: 2 },
    { name: "add_repo", group: "claude-code-remote", lineStart: 4 },
    { name: "post_message", group: "hearthbot", lineStart: 6 },
  ]);
  // Synthetic headings test the validator; the CLI separately checks the pinned upstream bytes.
  const source = study.sources[1];
  const lines = Array(source.lineCount).fill("");
  for (const [line, text] of [[21, "## 1. Built-in"], [260, "## 2. Remote"], [429, "## 3. hearthbot"], [879, "## 4. Worker"]]) {
    lines[line - 1] = text;
  }
  for (const tool of tools.tools) {
    lines[tool.lineStart - 1] = `### ${tool.name}`;
    lines[tool.lineEnd - 1] = "**Output:** per description.";
  }
  lines[895] = "### Artifact";
  assert.equal(verifyToolCoverage(tools, lines, source), 63);
  const missing = structuredClone(tools); missing.tools.pop();
  assert.throws(() => verifyToolCoverage(missing, lines, source), /Tool index count mismatch/);
  const wrongHeading = [...lines]; wrongHeading[22] = "### UnexpectedTool";
  assert.throws(() => verifyToolCoverage(tools, wrongHeading, source), /Coordinator heading coverage mismatch/);
  const noOutput = [...lines]; noOutput[tools.tools[0].lineEnd - 1] = "";
  assert.throws(() => verifyToolCoverage(tools, noOutput, source), /Tool range omits output/);
  const crossed = structuredClone(tools); crossed.tools[0].lineEnd = crossed.tools[1].lineStart;
  crossed.tools[0].source = `${source.url}#L${crossed.tools[0].lineStart}-L${crossed.tools[0].lineEnd}`;
  assert.throws(() => verifyToolCoverage(crossed, lines, source), /Tool range crosses next heading/);
});
