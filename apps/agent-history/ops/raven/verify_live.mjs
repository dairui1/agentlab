import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const dist = new URL("../../dist/", import.meta.url);
const hosts = ["https://claude-code-history.lyclyc17.workers.dev", "https://agentlab.dairui1.com"];
const paths = [
  "data/manifest.json", "data/agents/raven/history.json", "data/agents/raven/changelog.json", "data/harness/raven.json",
  "capabilities/raven.html", "capabilities/raven.json", "raven.css", "research-index.json", "site-navigation.js",
  "capabilities.html", "research.js", "app.js", "styles.css", "capability-article.css", "capability-article.js",
  "agent-icons/raven.png", "assets/agentlab-mark.png",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile(new URL(paths[0], dist), "utf8"));
assert.equal(manifest.officialSources.status, "fresh");
assert.equal(manifest.officialSources.syncStatus, "current");
assert.equal(manifest.officialSources.warningCount, 0);
assert.deepEqual(manifest.officialSources.retainedAgents, []);
assert.ok(manifest.agents.some((agent) => agent.id === "raven"));
const snapshot = JSON.parse(await readFile(new URL("data/harness/raven.json", dist), "utf8"));
assert.equal(snapshot.kind, "static-source-baseline");
assert.match(snapshot.commit, /^[a-f0-9]{40}$/);
assert.equal(snapshot.files.length, 10);
const results = [];
for (const asset of paths) {
  const local = hash(await readFile(new URL(asset, dist)));
  const remote = [];
  for (const host of hosts) {
    const bytes = execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "3", "--retry-all-errors", "--connect-timeout", "15", "--max-time", "45", `${host}/${asset}?cb=${Date.now()}`], { maxBuffer: 16 * 1024 * 1024 });
    const sha256 = hash(bytes);
    assert.equal(sha256, local, `Published bytes differ: ${host}/${asset}`);
    remote.push({ host, sha256 });
  }
  results.push({ asset, local, remote });
  console.log(`matched both domains: ${asset}`);
}
const result = { verifiedAt: new Date().toISOString(), generatedAt: manifest.generatedAt, officialSources: manifest.officialSources, results };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n");
console.log(`${paths.length}/${paths.length} assets match local dist across both production domains`);
