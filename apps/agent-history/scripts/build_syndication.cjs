const { createHash } = require("node:crypto");
const { readFile, writeFile, rename } = require("node:fs/promises");
const path = require("node:path");
const core = require("../public/app-core.js");

const BASE_URL = "https://agentlab.dairui1.com";
const FRESHNESS = new Set(["fresh", "stale", "degraded", "not-synced", "not-collected", "unknown"]);
const ID_PATTERN = /^agentlab:release:[a-z0-9][a-z0-9-]{0,63}:[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function releaseId(agent, version) {
  const id = `agentlab:release:${agent}:${version}`;
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid syndication release identity: ${id}`);
  return id;
}

function timestamp(value, label) {
  const match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid syndication ${label}`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const offset = match[7];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
      || hour > 23 || minute > 59 || second > 59
      || (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))
      || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid syndication ${label}`);
  }
  return new Date(value).toISOString();
}

function sourceList(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("Syndicated analysis requires sources");
  const sources = value.map((source) => {
    if (!source || typeof source !== "object") throw new Error("Invalid syndication source");
    if (source.url !== undefined) {
      const url = new URL(source.url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("Invalid syndication source URL");
      }
    }
    return source;
  });
  if (!sources.some((source) => source.url)) throw new Error("Syndicated analysis requires a public source URL");
  return sources;
}

function createSyndication({ manifest, datasets, withdrawals = [], exportedAt }) {
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported manifest schema");
  const generatedAt = timestamp(manifest.generatedAt, "snapshot evidence timestamp");
  const withdrawn = withdrawals.map((record) => {
    if (!ID_PATTERN.test(record?.id || "") || typeof record.reason !== "string" || !record.reason.trim()) {
      throw new Error("Invalid syndication withdrawal");
    }
    const value = { id: record.id, reason: record.reason.trim() };
    return { ...value, revision: digest(value) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const withdrawnIds = new Set(withdrawn.map((item) => item.id));
  if (withdrawnIds.size !== withdrawn.length) throw new Error("Duplicate syndication withdrawal");
  const candidates = new Map(core.buildIntelligenceItems(datasets, { limit: Number.MAX_SAFE_INTEGER })
    .map((item) => [releaseId(item.agent.id, item.entry.version), item]));
  const items = [];
  const suppressed = [];
  const seen = new Set();
  for (const dataset of datasets) {
    const releases = new Map(dataset.history.versions.map((release) => [release.version, release]));
    if (releases.size !== dataset.history.versions.length) throw new Error("Duplicate syndicated history version");
    const entries = [...dataset.changelog.entries];
    const entryVersions = new Set(entries.map((entry) => entry.version));
    for (const release of dataset.history.versions) {
      if (!entryVersions.has(release.version)) entries.push({ version: release.version, analysisStatus: "pending" });
    }
    for (const entry of entries) {
      const id = releaseId(dataset.agent.id, entry.version);
      if (seen.has(id)) throw new Error(`Duplicate syndication release: ${id}`);
      if (!releases.has(entry.version)) throw new Error(`Missing syndicated release metadata: ${id}`);
      seen.add(id);
      if (withdrawnIds.has(id)) continue;
      const candidate = candidates.get(id);
      const complete = ["complete", "reviewed"].includes(entry.analysisStatus);
      if (!complete || !candidate) {
        const value = { id, reason: complete ? "no-signal" : "analysis-incomplete" };
        suppressed.push({ ...value, revision: digest(value) });
        continue;
      }
      const release = releases.get(entry.version);
      const dateKind = release.publishedAt ? "published" : "captured";
      const publishedAt = timestamp(release.publishedAt || entry.capturedAt || release.capturedAt, "release date");
      const sources = sourceList(entry.sources);
      const sourceFreshness = entry.layers?.official?.freshness || "unknown";
      if (!FRESHNESS.has(sourceFreshness)) throw new Error(`Unknown source freshness: ${sourceFreshness}`);
      if (!/^[a-f0-9]{64}$/.test(entry.evidenceDigest || "")) throw new Error(`Missing evidence digest: ${id}`);
      if (![entry.title, entry.summary].every((value) => typeof value === "string" && value.trim())) {
        throw new Error(`Missing syndicated analysis text: ${id}`);
      }
      const url = new URL(BASE_URL);
      url.searchParams.set("mode", "compare");
      url.searchParams.set("agent", dataset.agent.id);
      url.searchParams.set("version", entry.version);
      const title = `${dataset.agent.label || dataset.agent.id} ${entry.version}: ${entry.title}`;
      const contentText = [
        title, "", "以下摘要与工程启示由 AgentLab 基于公开证据分析，不是厂商官方声明，也不代表独立运行验证。",
        `日期：${publishedAt}（${dateKind === "published" ? "上游发布日期" : "采集日期，非上游发布日期"}）`,
        `分析状态：${entry.analysisStatus}；官方来源新鲜度：${sourceFreshness}`, "", entry.summary,
        "", "工程启示", ...(entry.implications || []).map((item) => `- ${item}`),
        "", `AgentLab 证据与版本比较：${url.href}`, `证据摘要：${entry.evidenceDigest}`,
        "", "原始来源", ...sources.filter((source) => source.url).map((source) => `- ${source.sourceType || "公开证据"}：${source.url}`),
      ].join("\n");
      const value = {
        id, url: url.href, kind: "release", title, summary: entry.summary, contentText,
        publishedAt, dateKind, analysisStatus: entry.analysisStatus, evidenceDigest: entry.evidenceDigest,
        sources, sourceFreshness, agentId: dataset.agent.id, version: entry.version,
        importance: candidate.importance, signals: candidate.signals,
      };
      items.push({ ...value, revision: digest(value) });
    }
  }
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  suppressed.sort((a, b) => a.id.localeCompare(b.id));
  const snapshot = {
    schemaVersion: 1, generatedAt, exportedAt: timestamp(exportedAt, "export timestamp"),
    coverage: { scope: "all-known-releases", absenceMeansWithdrawal: false, researchIncluded: false },
    items, suppressed, withdrawn,
  };
  return { ...snapshot, snapshotDigest: digest(snapshot) };
}

async function readSyndication(publicRoot, exportedAt) {
  const readJson = async (relative) => JSON.parse(await readFile(path.join(publicRoot, relative), "utf8"));
  const manifest = await readJson("data/manifest.json");
  const datasets = [];
  for (const agent of manifest.agents) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(agent.id)) throw new Error("Invalid syndication agent");
    datasets.push({
      agent,
      history: await readJson(`data/agents/${agent.id}/history.json`),
      changelog: await readJson(`data/agents/${agent.id}/changelog.json`),
    });
  }
  const withdrawals = await readJson("syndication-withdrawals.json");
  if (withdrawals.schemaVersion !== 1 || !Array.isArray(withdrawals.withdrawn)) {
    throw new Error("Invalid syndication withdrawal configuration");
  }
  return createSyndication({ manifest, datasets, withdrawals: withdrawals.withdrawn, exportedAt });
}

function semanticSnapshot(feed) {
  const { exportedAt, snapshotDigest, ...semantic } = feed;
  return semantic;
}

function finalizeSnapshot(candidate, previous, now) {
  let exportedAt = timestamp(now, "export timestamp");
  if (previous?.exportedAt) {
    const { snapshotDigest, ...snapshot } = previous;
    if (snapshotDigest !== digest(snapshot)) throw new Error("Previous syndication digest is invalid");
    const previousAt = timestamp(previous.exportedAt, "previous export timestamp");
    exportedAt = digest(semanticSnapshot(previous)) === digest(semanticSnapshot(candidate))
      ? previousAt
      : new Date(Math.max(Date.parse(exportedAt), Date.parse(previousAt) + 1)).toISOString();
  }
  const snapshot = { ...semanticSnapshot(candidate), exportedAt };
  return { ...snapshot, snapshotDigest: digest(snapshot) };
}

async function buildSyndication(publicRoot) {
  const target = path.join(publicRoot, "data/syndication.json");
  let previous;
  try {
    previous = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const now = new Date().toISOString();
  const candidate = await readSyndication(publicRoot, now);
  const feed = finalizeSnapshot(candidate, previous, now);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(feed)}\n`);
  await rename(temporary, target);
  return feed;
}

module.exports = { buildSyndication, createSyndication, digest, finalizeSnapshot, readSyndication, releaseId };
