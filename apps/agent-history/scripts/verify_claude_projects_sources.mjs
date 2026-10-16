import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const maxBytes = 2 * 1024 * 1024;
export const SOURCE_PINS = Object.freeze([
  Object.freeze({ id: "S1", repository: "janrizmlibres/claude-pstack",
    commit: "466ef2829b09739a2996b40256e13ccf23492180", path: "spikes/project-coordinator/findings.md",
    sha256: "4d461cefa92bec64f89e6fd0774728c8a658d0d6e7c61d53a71a07468e008cd9", lineCount: 207,
    cacheFile: "pstack-findings.md" }),
  Object.freeze({ id: "S2", repository: "trevorprater/dot-tool-reference",
    commit: "a7237d6a902a8bd59132883882e5dc5ca3f9e569", path: "claude-projects.md",
    sha256: "e5df37dadfd6835d9abe93ee75e761034b95073616f3537df376193a2c8ef0dc", lineCount: 1719,
    cacheFile: "tool-reference.md" }),
]);

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const baseUrl = (source) => `https://github.com/${source.repository}/blob/${source.commit}/${source.path}`;
const sourceLines = (bytes) => {
  const lines = bytes.toString("utf8").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

function checkRange(start, end, count, label) {
  assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 1
    && end >= start && end <= count, `Invalid range: ${label}`);
}

export function verifySourceBytes(source, input) {
  const bytes = Buffer.from(input);
  assert.ok(bytes.length <= maxBytes, `Source too large: ${source.id}`);
  assert.equal(hash(bytes), source.sha256, `Source hash mismatch: ${source.id}`);
  const lines = sourceLines(bytes);
  assert.equal(lines.length, source.lineCount, `Line count mismatch: ${source.id}`);
  return lines;
}

export function coordinatorHeadings(lines) {
  const groups = { 1: "builtin", 2: "claude-code-remote", 3: "hearthbot" };
  const headings = [];
  let group;
  for (let index = 0; index < lines.length; index += 1) {
    const section = lines[index].match(/^## (\d+)\./);
    if (section) group = groups[section[1]];
    const heading = lines[index].match(/^### ([A-Za-z][A-Za-z0-9_]*)\s*$/);
    if (heading && group) headings.push({ name: heading[1], group, lineStart: index + 1 });
  }
  return headings;
}

export function verifyStudyMetadata(study) {
  assert.equal(study.id, "claude-projects");
  assert.equal(study.sources.length, SOURCE_PINS.length, "Source set mismatch");
  const sources = new Map();
  for (const pin of SOURCE_PINS) {
    const source = study.sources.find((item) => item.id === pin.id);
    assert.ok(source, `Missing source: ${pin.id}`);
    for (const key of ["repository", "commit", "path", "sha256", "lineCount"]) {
      assert.equal(source[key], pin[key], `Pinned source mismatch: ${pin.id}.${key}`);
    }
    assert.equal(source.url, baseUrl(source), `Source URL mismatch: ${pin.id}`);
    assert.ok(source.provenance && source.license?.status, `Missing provenance: ${pin.id}`);
    sources.set(source.id, source);
  }
  const ids = new Set();
  const classes = new Map([
    ["author-report", "作者实测报告"], ["tool-contract", "工具契约"], ["role-self-description", "角色自述"],
  ]);
  for (const evidence of study.evidence) {
    assert.ok(!ids.has(evidence.id), `Duplicate evidence: ${evidence.id}`);
    ids.add(evidence.id);
    const source = sources.get(evidence.sourceId);
    assert.ok(source, `Unknown source: ${evidence.id}`);
    assert.ok(classes.has(evidence.evidenceClass), `Unknown evidence class: ${evidence.id}`);
    assert.equal(evidence.kind, "observation", `Evidence kind mismatch: ${evidence.id}`);
    assert.equal(evidence.evidenceLabel, classes.get(evidence.evidenceClass), `Evidence class mismatch: ${evidence.id}`);
    assert.ok(evidence.statement && evidence.boundary && evidence.title, `Incomplete evidence: ${evidence.id}`);
    assert.equal(evidence.sha256, source.sha256, `Evidence hash mismatch: ${evidence.id}`);
    assert.equal(evidence.artifact, source.path, `Evidence artifact mismatch: ${evidence.id}`);
    checkRange(evidence.lineStart, evidence.lineEnd, source.lineCount, evidence.id);
    assert.equal(evidence.locator, `L${evidence.lineStart}-L${evidence.lineEnd}`, `Locator mismatch: ${evidence.id}`);
    assert.equal(evidence.source.url, `${source.url}#${evidence.locator}`, `Evidence URL mismatch: ${evidence.id}`);
    for (const location of evidence.supportingLocations || []) {
      checkRange(location.lineStart, location.lineEnd, source.lineCount, evidence.id);
      assert.equal(location.url, `${source.url}#L${location.lineStart}-L${location.lineEnd}`);
    }
  }
  assert.equal(ids.size, 40, "Evidence set mismatch");
  assert.ok(study.unknowns.length >= 5 && study.unknowns.length <= 8, "Unknowns set mismatch");
  const unknownIds = new Set();
  for (const unknown of study.unknowns) {
    assert.ok(unknown.id && !unknownIds.has(unknown.id), "Duplicate unknown");
    unknownIds.add(unknown.id);
    assert.ok(unknown.title && unknown.text && unknown.needed, `Incomplete unknown: ${unknown.id}`);
    for (const id of unknown.evidenceIds) assert.ok(ids.has(id), `Unknown evidence: ${id}`);
  }
  return { sources, evidenceIds: ids };
}

export function verifyArticleReferences(study, html, blueprint) {
  const { sources, evidenceIds } = verifyStudyMetadata(study);
  const used = new Set();
  for (const [, refs] of html.matchAll(/data-evidence="([^"]+)"/g)) {
    for (const id of refs.trim().split(/\s+/)) {
      assert.ok(evidenceIds.has(id), `Unknown article evidence: ${id}`);
      used.add(id);
    }
  }
  assert.deepEqual(used, evidenceIds, "Unused article evidence");
  let markdownCitations = 0;
  const definitions = new Set();
  for (const [, id, url] of blueprint.matchAll(/^\[([^\]]+)\]:\s*(https:\/\/\S+)\s*$/gm)) {
    assert.ok(!definitions.has(id), `Duplicate Markdown definition: ${id}`);
    definitions.add(id);
    const parsed = new URL(url);
    const source = [...sources.values()].find((item) => url.startsWith(`${item.url}#`));
    assert.ok(source, `Unpinned Markdown source: ${id}`);
    const range = parsed.hash.match(/^#L(\d+)(?:-L(\d+))?$/);
    assert.ok(range, `Missing Markdown line range: ${id}`);
    checkRange(Number(range[1]), Number(range[2] || range[1]), source.lineCount, `Markdown ${id}`);
    markdownCitations += 1;
  }
  assert.ok(markdownCitations >= 25, "Missing Markdown source index");
  for (const [, id] of blueprint.matchAll(/\[([PT]-[a-z][a-z-]+)\](?!:)/g)) {
    assert.ok(definitions.has(id), `Undefined Markdown reference: ${id}`);
  }
  for (const [, url] of `${html}\n${blueprint}`.matchAll(/(https:\/\/github\.com\/[^\s"<>\])]+\/blob\/[^\s"<>\])]+)/g)) {
    const source = [...sources.values()].find((item) => url === item.url || url.startsWith(`${item.url}#`));
    assert.ok(source, `Unpinned article source: ${url}`);
    if (url.includes("#")) {
      const range = new URL(url).hash.match(/^#L(\d+)(?:-L(\d+))?$/);
      assert.ok(range, `Invalid article source fragment: ${url}`);
      checkRange(Number(range[1]), Number(range[2] || range[1]), source.lineCount, url);
    }
  }
  assert.doesNotMatch(`${html}\n${blueprint}`, /\b(?:session|cse|chan|cmsg|env)_[A-Za-z0-9]{12,}\b/, "Published instance identifier");
  return { evidence: used.size, markdownCitations };
}

export function verifyToolMetadata(toolIndex, source) {
  assert.equal(toolIndex.id, "claude-projects-tools");
  for (const key of ["repository", "path", "url", "sha256"]) {
    assert.equal(toolIndex.source[key], source[key], `Tool source mismatch: ${key}`);
  }
  assert.equal(toolIndex.source.revision, source.commit, "Tool revision mismatch");
  const counts = { builtin: 11, "claude-code-remote": 13, hearthbot: 39 };
  assert.deepEqual(Object.fromEntries(toolIndex.groups.map((group) => [group.id, group.count])), counts);
  const names = new Set();
  const ids = new Set();
  for (const tool of toolIndex.tools) {
    assert.ok(!names.has(tool.fullName), `Duplicate tool: ${tool.fullName}`);
    assert.ok(tool.id && !ids.has(tool.id), `Duplicate tool ID: ${tool.id}`);
    names.add(tool.fullName);
    ids.add(tool.id);
    assert.ok(Object.hasOwn(counts, tool.group), `Unknown tool group: ${tool.id}`);
    assert.equal(tool.role, "coordinator", `Worker mixed into coordinator index: ${tool.id}`);
    assert.equal(tool.fullName, tool.group === "builtin" ? tool.name : `mcp__${tool.group}__${tool.name}`);
    assert.ok(["P0", "P1", "P2"].includes(tool.stage), `Unknown tool stage: ${tool.id}`);
    assert.ok(["observed", "description", "mixed"].includes(tool.outputEvidence), `Missing output boundary: ${tool.id}`);
    assert.ok(tool.summary && tool.module && Array.isArray(tool.inputFields)
      && Array.isArray(tool.constraints) && Array.isArray(tool.outputFields), `Incomplete tool: ${tool.id}`);
  }
  assert.equal(toolIndex.tools.length, 63, "Tool index count mismatch");
  for (const [group, count] of Object.entries(counts)) {
    assert.equal(toolIndex.tools.filter((tool) => tool.group === group).length, count, `Tool group count mismatch: ${group}`);
  }
  function checkLocations(value) {
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "lineStart")) {
      checkRange(value.lineStart, value.lineEnd, source.lineCount, value.id || value.name || "tool supplement");
      assert.equal(value.source, `${source.url}#L${value.lineStart}-L${value.lineEnd}`, `Tool URL mismatch: ${value.id || value.name}`);
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") checkLocations(child);
    }
  }
  checkLocations(toolIndex);
  assert.doesNotMatch(JSON.stringify(toolIndex), /\b(?:session|cse|chan|cmsg|env)_[A-Za-z0-9]{12,}\b/, "Published instance identifier");
  return { coordinatorTools: names.size, groups: counts };
}

export function verifyToolCoverage(toolIndex, lines, source) {
  verifyToolMetadata(toolIndex, source);
  const headings = coordinatorHeadings(lines);
  assert.equal(headings.length, 63, "Upstream coordinator heading count mismatch");
  assert.equal(toolIndex.tools.length, 63, "Tool index count mismatch");
  const headingKeys = headings.map((entry) => `${entry.group}:${entry.name}:${entry.lineStart}`);
  const indexedKeys = toolIndex.tools.map((entry) => `${entry.group}:${entry.name}:${entry.lineStart}`);
  assert.deepEqual(indexedKeys, headingKeys, "Coordinator heading coverage mismatch");
  for (const tool of toolIndex.tools) {
    checkRange(tool.lineStart, tool.lineEnd, source.lineCount, tool.name);
    assert.equal(tool.source, `${source.url}#L${tool.lineStart}-L${tool.lineEnd}`, `Tool URL mismatch: ${tool.name}`);
    const next = headings.find((item) => item.lineStart > tool.lineStart)?.lineStart || 879;
    assert.ok(tool.lineEnd < next, `Tool range crosses next heading: ${tool.name}`);
    assert.ok(lines.slice(tool.lineStart, tool.lineEnd).some((line) => line.startsWith("**Output:")), `Tool range omits output: ${tool.name}`);
  }
  return headings.length;
}

export async function verifyClaudeProjectsSources(study, toolIndex, html, blueprint, loadSource) {
  const publication = verifyArticleReferences(study, html, blueprint);
  const loaded = new Map();
  for (const source of study.sources) {
    const bytes = Buffer.from(await loadSource(source));
    loaded.set(source.id, verifySourceBytes(source, bytes));
    const raw = bytes.toString("utf8").trim();
    function strings(value) {
      if (typeof value === "string") return [value];
      return value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
    }
    for (const content of [html, blueprint, ...strings(study), ...strings(toolIndex)]) {
      assert.ok(!content.includes(raw), `Full upstream source mirrored: ${source.id}`);
    }
  }
  const source = study.sources.find((item) => item.id === "S2");
  const tools = verifyToolCoverage(toolIndex, loaded.get("S2"), source);
  return { sources: study.sources.length, ...publication, coordinatorTools: tools,
    revisions: study.sources.map((item) => item.commit), runtimeExperiment: "not-run" };
}

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  assert.ok(response.ok, `HTTP ${response.status}: ${url}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= maxBytes, `Response too large: ${url}`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function main(args) {
  const remote = args.length === 1 && args[0] === "--fetch";
  const local = args.length === 2 && args[0] === "--source-dir";
  assert.ok(remote || local, "Usage: node scripts/verify_claude_projects_sources.mjs --fetch | --source-dir <cache-dir>");
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const read = (name) => readFile(path.join(publicRoot, name), "utf8");
  const study = JSON.parse(await read("capabilities/claude-projects-sources.json"));
  const toolIndex = JSON.parse(await read("capabilities/claude-projects-tools.json"));
  const html = await read("capabilities/claude-projects.html");
  const blueprint = await read("capabilities/claude-projects-blueprint.md");
  const result = await verifyClaudeProjectsSources(study, toolIndex, html, blueprint, (source) => remote
    ? fetchBytes(`https://raw.githubusercontent.com/${source.repository}/${source.commit}/${source.path}`)
    : readFile(path.join(path.resolve(args[1]), SOURCE_PINS.find((pin) => pin.id === source.id).cacheFile)));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
