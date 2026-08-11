#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://agentlab.dairui1.com";
const SIGNALS = new Set(["prompt", "tools", "ecosystem"]);
const PRIORITIES = new Set(["high", "medium", "low"]);

function usage() {
  return `Usage:
  node <skill-directory>/scripts/query-feed.mjs [options]

Options:
  --filter, -f <query>  Query string containing feed filters
  --base-url <url>      AgentLab origin (default: ${DEFAULT_BASE_URL})
  --help, -h            Show this help

Example:
  --filter 'feedAgent=codex&signal=prompt&priority=high&limit=10&format=markdown'`;
}

function parseArgs(argv) {
  const options = { baseUrl: DEFAULT_BASE_URL, filter: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") return { help: true };
    if (value === "--filter" || value === "-f") {
      options.filter = argv[++index] ?? "";
      continue;
    }
    if (value === "--base-url") {
      options.baseUrl = argv[++index] ?? "";
      continue;
    }
    if (!value.startsWith("-") && !options.filter) {
      options.filter = value;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function filterParams(raw) {
  const value = String(raw || "").trim();
  if (!value) return new URLSearchParams();
  if (/^https?:\/\//i.test(value)) return new URL(value).searchParams;
  return new URLSearchParams(value.replace(/^\?/, ""));
}

function listValues(params, key) {
  return [...new Set(params.getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean))];
}

function positiveLimit(params) {
  const raw = params.get("limit") || "20";
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error("limit must be a positive integer");
  return Math.min(Number(raw), 200);
}

function validDay(value, name) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
  return value;
}

function absoluteUrl(baseUrl, path) {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).href;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "AgentLab-update-feed-skill/1.0" },
  });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  return response.json();
}

function oneLine(value, fallback = "") {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || fallback;
}

function uniqueStrings(values) {
  return [...new Set((values || []).flat().filter((value) => typeof value === "string" && value))];
}

function changeCount(value, keys) {
  return keys.reduce((sum, key) => sum + (Number(value?.[key]) || 0), 0);
}

function hasToolChanges(stats) {
  return [stats?.toolsAdded, stats?.toolsRemoved, stats?.toolsModified]
    .some((values) => Array.isArray(values) && values.length > 0);
}

function hasRuntimePromptChanges(stats) {
  return (stats?.changedSections || []).some((section) => (
    !/(?:^|\s)tools?(?:$|\s)/i.test(String(section))
    && !/(?:metadata|version|billing|trace)/i.test(String(section))
  ));
}

function changedLayerIds(entry) {
  const layers = entry?.layers || {};
  const changed = [];
  const prompt = layers.prompt || {};
  if (changeCount(prompt, ["additions", "deletions"]) > 0
    || (Array.isArray(prompt.changedSections) && prompt.changedSections.length)) changed.push("runtime-prompt");

  const tools = layers.tools || {};
  if ([tools.added, tools.removed, tools.modified]
    .some((items) => Array.isArray(items) && items.length)) changed.push("tools");

  const staticPrompt = layers.staticPrompt || {};
  if (changeCount(staticPrompt.changes, ["addedCount", "removedCount", "modifiedCount"]) > 0) {
    changed.push("static-prompt");
  }

  const official = layers.official || {};
  if (official.release?.title || official.release?.hasNotes || official.hasNotes) changed.push("official");
  const code = official.codeChange || layers.code || {};
  if (changeCount(code, ["filesObserved", "additionsObserved", "deletionsObserved"]) > 0
    || (Array.isArray(code.keyFiles) && code.keyFiles.length)) changed.push("code");
  return uniqueStrings(changed);
}

function entrySignals(entry) {
  const stats = entry?.stats || {};
  const layers = changedLayerIds(entry);
  const signals = [];
  if (hasRuntimePromptChanges(stats) || layers.includes("runtime-prompt")) signals.push("prompt");
  if (hasToolChanges(stats) || layers.includes("tools")) signals.push("tools");
  if (layers.some((layer) => ["official", "code", "static-prompt"].includes(layer))) {
    signals.push("ecosystem");
  }
  return uniqueStrings(signals);
}

function isNoChangeEntry(entry) {
  const stats = entry?.stats || {};
  const linesChanged = (Number(stats.additions) || 0) + (Number(stats.deletions) || 0) > 0;
  return !linesChanged && !hasToolChanges(stats) && !hasRuntimePromptChanges(stats)
    && changedLayerIds(entry).length === 0;
}

function importanceScore(entry, signals) {
  const stats = entry?.stats || {};
  const toolChanges = (stats.toolsAdded?.length || 0) + (stats.toolsRemoved?.length || 0);
  const toolModifications = stats.toolsModified?.length || 0;
  const lineChanges = (Number(stats.additions) || 0) + (Number(stats.deletions) || 0);
  let score = Math.min(60, toolChanges * 16 + toolModifications * 8);
  if (signals.includes("prompt")) score += 22;
  if (signals.includes("ecosystem")) score += 28;
  score += Math.min(18, Math.log2(lineChanges + 1) * 2.6);
  if (Array.isArray(entry?.implications) && entry.implications.length) score += 12;
  if (["complete", "generated", "reviewed"].includes(String(entry?.analysisStatus).toLowerCase())) score += 4;
  return Math.round(score);
}

function resolvedImportance(entry, score) {
  const explicit = String(entry?.importance || "").toLowerCase();
  if (PRIORITIES.has(explicit)) return explicit;
  if (score >= 80) return "high";
  if (score >= 34) return "medium";
  return "low";
}

function buildIntelligenceItems(datasets, options) {
  const items = [];
  for (const dataset of datasets || []) {
    if (options.agents.length && !options.agents.includes(dataset.agent?.id)) continue;
    const versions = dataset.history?.versions || [];
    const releases = new Map(versions.map((release) => [release.version, release]));
    const versionIndex = new Map(versions.map((release, index) => [release.version, index]));
    for (const entry of dataset.changelog?.entries || []) {
      if (!entry?.previousVersion || String(entry.importance).toLowerCase() === "none") continue;
      const release = releases.get(entry.version);
      const index = versionIndex.get(entry.version);
      const previousRelease = releases.get(entry.previousVersion) || (index > 0 ? versions[index - 1] : null);
      const signals = entrySignals(entry);
      if (isNoChangeEntry(entry) || (!signals.length && !(entry.implications || []).length)) continue;
      if (options.signals.length && !options.signals.some((signal) => signals.includes(signal))) continue;
      const score = importanceScore(entry, signals);
      const importance = resolvedImportance(entry, score);
      if (options.priority && importance !== options.priority) continue;
      items.push({
        agent: dataset.agent,
        entry,
        release,
        previousRelease,
        signals,
        score,
        importance,
        capturedAt: release?.publishedAt || entry.capturedAt || release?.capturedAt || "",
      });
    }
  }
  return items.sort((left, right) => {
    const leftDay = String(left.capturedAt).slice(0, 10);
    const rightDay = String(right.capturedAt).slice(0, 10);
    if (leftDay !== rightDay) return rightDay.localeCompare(leftDay);
    return right.score - left.score || Date.parse(right.capturedAt || 0) - Date.parse(left.capturedAt || 0);
  });
}

function compareUrl(baseUrl, item) {
  const url = new URL(baseUrl);
  url.searchParams.set("mode", "compare");
  url.searchParams.set("agent", item.agent.id);
  url.searchParams.set("left", item.entry.previousVersion || item.entry.version);
  url.searchParams.set("right", item.entry.version);
  url.searchParams.set("view", "request");
  return url.href;
}

function evidenceLine(item) {
  const stats = item.entry.stats || {};
  const facts = [];
  const additions = Number(stats.additions) || 0;
  const deletions = Number(stats.deletions) || 0;
  if (additions || deletions) facts.push(`Prompt +${additions} / -${deletions}`);
  const added = stats.toolsAdded?.length || 0;
  const removed = stats.toolsRemoved?.length || 0;
  const modified = stats.toolsModified?.length || 0;
  if (added || removed || modified) facts.push(`Tools +${added} / -${removed} / ~${modified}`);
  return facts.length ? facts.join("; ") : "See source layers in the comparison view";
}

function renderMarkdown({ baseUrl, feed, manifest, items, params }) {
  const lines = [
    "# AgentLab update feed",
    "",
    `- Generated: ${feed.generatedAt || manifest.generatedAt || "unknown"}`,
    `- Upstream: ${manifest.upstream?.commit || "unknown"}`,
    `- Filter: \`${params.toString() || "all"}\``,
    `- Results: ${items.length}`,
    "",
  ];

  if (!items.length) {
    lines.push("No updates matched this filter.", "");
    return `${lines.join("\n")}\n`;
  }

  for (const item of items) {
    const entry = item.entry;
    const label = item.agent.label || item.agent.id;
    lines.push(
      `## ${label} ${entry.version}: ${oneLine(entry.title, "Update")}`,
      "",
      `- Date: ${oneLine(item.capturedAt, "unknown")}`,
      `- Importance: ${item.importance}`,
      `- Signals: ${item.signals.join(", ") || "none"}`,
      `- Analysis: ${oneLine(entry.analysisStatus, "unknown")}`,
      `- Evidence: ${evidenceLine(item)}`,
      `- Compare: ${compareUrl(baseUrl, item)}`,
      "",
      oneLine(entry.summary, "No summary available."),
      "",
    );
    const implications = Array.isArray(entry.implications) ? entry.implications : [];
    if (implications.length) {
      lines.push("### Engineering implications", "");
      for (const implication of implications) {
        const text = oneLine(typeof implication === "string" ? implication : implication?.text);
        if (text) lines.push(`- ${text}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!options.baseUrl) throw new Error("base-url cannot be empty");
  const baseUrl = new URL(options.baseUrl).origin;
  const params = filterParams(options.filter);
  const format = (params.get("format") || "markdown").toLowerCase();
  if (!["markdown", "md"].includes(format)) throw new Error("format must be markdown or md");

  const agents = listValues(params, "feedAgent");
  const signals = listValues(params, "signal");
  const priorities = listValues(params, "priority");
  const versions = new Set(listValues(params, "version"));
  const statuses = new Set(listValues(params, "analysisStatus"));
  const since = validDay(params.get("since"), "since");
  const until = validDay(params.get("until"), "until");
  const limit = positiveLimit(params);

  const unknownSignals = signals.filter((value) => !SIGNALS.has(value));
  if (unknownSignals.length) throw new Error(`unknown signal: ${unknownSignals.join(", ")}`);
  const unknownPriorities = priorities.filter((value) => !PRIORITIES.has(value));
  if (unknownPriorities.length) throw new Error(`unknown priority: ${unknownPriorities.join(", ")}`);
  if (priorities.length > 1) throw new Error("priority accepts one value");

  const [manifest, feed] = await Promise.all([
    fetchJson(absoluteUrl(baseUrl, "/data/manifest.json")),
    fetchJson(absoluteUrl(baseUrl, "/data/feed.json")),
  ]);
  if (manifest.schemaVersion !== 1 || feed.schemaVersion !== 1) {
    throw new Error(`unsupported public schema: manifest=${manifest.schemaVersion}, feed=${feed.schemaVersion}`);
  }
  const knownAgents = new Set((manifest.agents || []).map((agent) => agent.id));
  const unknownAgents = agents.filter((value) => !knownAgents.has(value));
  if (unknownAgents.length) throw new Error(`unknown feedAgent: ${unknownAgents.join(", ")}`);

  const agentsById = new Map((manifest.agents || []).map((agent) => [agent.id, agent]));
  const datasets = (feed.datasets || []).map((dataset) => ({
    ...dataset,
    agent: agentsById.get(dataset.agent) || dataset.agent,
  }));

  let items = buildIntelligenceItems(datasets, {
    agents,
    signals,
    priority: priorities[0] || "",
  });
  items = items.filter((item) => {
    const day = String(item.capturedAt || "").slice(0, 10);
    if (since && day < since) return false;
    if (until && day > until) return false;
    if (versions.size && !versions.has(String(item.entry.version))) return false;
    if (statuses.size && !statuses.has(String(item.entry.analysisStatus))) return false;
    return true;
  }).slice(0, limit);

  process.stdout.write(renderMarkdown({ baseUrl, feed, manifest, items, params }));
}

main().catch((error) => {
  process.stderr.write(`query-feed: ${error.message}\n`);
  process.exitCode = 1;
});
