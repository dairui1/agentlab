import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const dist = new URL("../../dist/", import.meta.url);
const hosts = ["https://claude-code-history.lyclyc17.workers.dev", "https://agentlab.dairui1.com"];
const paths = [
  "data/manifest.json", "capabilities/mimoagent.html", "capabilities/mimoagent.json",
  "capabilities/mimoagent-probe.json", "mimoagent.css", "research-index.json",
  "site-navigation.js", "capabilities.html", "research.js", "styles.css",
  "capability-article.css", "capability-article.js", "agent-icons/mimo.png", "assets/agentlab-mark.png",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile(new URL(paths[0], dist), "utf8"));
assert.equal(manifest.officialSources.status, "fresh");
assert.equal(manifest.officialSources.syncStatus, "current");
assert.equal(manifest.officialSources.warningCount, 0);
assert.deepEqual(manifest.officialSources.retainedAgents, []);

const results = [];
for (const asset of paths) {
  const local = hash(await readFile(new URL(asset, dist)));
  const remote = [];
  for (const host of hosts) {
    const url = `${host}/${asset}?cb=${Date.now()}`;
    const bytes = execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "3", "--retry-all-errors", "--connect-timeout", "15", "--max-time", "45", url], { maxBuffer: 16 * 1024 * 1024 });
    const sha256 = hash(bytes);
    assert.equal(sha256, local, `Published bytes differ: ${host}/${asset}`);
    remote.push({ host, sha256 });
  }
  results.push({ asset, local, remote });
  console.log(`matched both domains: ${asset}`);
}
const result = { verifiedAt: new Date().toISOString(), generatedAt: manifest.generatedAt, upstream: manifest.upstream, officialSources: manifest.officialSources, results };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n");
console.log(`${paths.length}/${paths.length} assets match local dist across both production domains`);
