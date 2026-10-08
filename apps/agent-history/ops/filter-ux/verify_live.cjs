const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const dist = path.resolve(__dirname, "../../dist");
const output = process.argv[2] || "/private/tmp/agentlab-filter-production-bytes.json";
const origins = ["https://agentlab.dairui1.com", "https://claude-code-history.lyclyc17.workers.dev"];
const files = ["index.html", "app.js", "styles.css", "research.css", "mechanisms.css", "data/manifest.json", "data/feed.json", "data/syndication.json"];
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

(async () => {
  const report = { checkedAt: new Date().toISOString(), origins: [] };
  for (const origin of origins) {
    const result = { origin, files: [] };
    for (const file of files) {
      const local = await fs.readFile(path.join(dist, file));
      const url = new URL(file === "index.html" ? "/" : `/${file}`, origin);
      url.searchParams.set("cb", `${Date.now()}`);
      const response = await fetch(url, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(20000) });
      assert.equal(response.status, 200, `${url.pathname}: HTTP status`);
      const remote = Buffer.from(await response.arrayBuffer());
      assert.equal(hash(remote), hash(local), `${origin}/${file}: published bytes differ from accepted dist`);
      result.files.push({ file, sha256: hash(local), bytes: remote.length });
      if (file === "data/manifest.json") {
        const manifest = JSON.parse(remote);
        result.manifest = { generatedAt: manifest.generatedAt, agents: manifest.agents.length, officialSources: manifest.officialSources };
      }
    }
    report.origins.push(result);
  }
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ origins: report.origins.map(({ origin, files, manifest }) => ({ origin, matchedFiles: files.length, generatedAt: manifest.generatedAt, agents: manifest.agents })), output }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
