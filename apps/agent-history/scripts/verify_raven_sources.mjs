import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const reportUrl = "https://github.com/EverMind-AI/Raven/releases/download/tech-report-v1/technical-report.pdf";
const maxBytes = 6 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safePath = (name) => typeof name === "string" && /^[\w./-]+$/.test(name)
  && !name.startsWith("/") && !name.split("/").includes("..");
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export async function verifyRavenSources(study, html, loadSource, loadReport, loadAsset) {
  const { repository, revision } = study.source;
  assert.equal(repository, "EverMind-AI/Raven");
  assert.match(revision, /^[a-f0-9]{40}$/);
  const files = new Map();
  async function source(artifact) {
    assert.ok(safePath(artifact), `Unsafe artifact: ${artifact}`);
    if (!files.has(artifact)) {
      const bytes = Buffer.from(await loadSource(artifact));
      assert.ok(bytes.length <= maxBytes, `Source too large: ${artifact}`);
      const lines = bytes.toString("utf8").split("\n");
      if (lines.at(-1) === "") lines.pop();
      files.set(artifact, { bytes, lines });
    }
    return files.get(artifact);
  }
  const report = Buffer.from(await loadReport());
  assert.ok(report.length <= maxBytes, "Report too large");
  assert.equal(hash(report), study.verification.reportSha256, "Report hash mismatch");
  for (const evidence of study.evidence) {
    if (evidence.evidenceClass === "author-report") {
      assert.equal(evidence.source.url, reportUrl);
      assert.equal(evidence.sha256, hash(report), evidence.id);
      continue;
    }
    const file = await source(evidence.artifact);
    assert.equal(hash(file.bytes), evidence.sha256, `Source hash mismatch: ${evidence.id}`);
    const { lineStart: start, lineEnd: end } = evidence;
    assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 1
      && start <= end && end <= file.lines.length, `Invalid range: ${evidence.id}`);
    assert.equal(evidence.locator, `L${start}-L${end}`);
    assert.equal(evidence.source.url, `https://github.com/${repository}/blob/${revision}/${evidence.artifact}#L${start}-L${end}`);
  }
  for (const snippet of study.snippets) {
    const file = await source(snippet.artifact);
    assert.ok(Number.isInteger(snippet.lineStart) && Number.isInteger(snippet.lineEnd)
      && snippet.lineStart >= 1 && snippet.lineEnd >= snippet.lineStart
      && snippet.lineEnd <= file.lines.length, `Invalid snippet range: ${snippet.id}`);
    const exact = file.lines.slice(snippet.lineStart - 1, snippet.lineEnd).join("\n");
    assert.equal(snippet.text, exact, `Snippet mismatch: ${snippet.id}`);
    assert.ok(html.includes(`<code data-source-snippet="${snippet.id}">${escape(exact)}</code>`), `HTML excerpt mismatch: ${snippet.id}`);
  }
  for (const asset of study.assets) {
    assert.ok(asset.path.startsWith("/") && safePath(asset.path.slice(1)), "Unsafe published asset path");
    const upstream = await source(asset.artifact);
    assert.equal(hash(upstream.bytes), asset.sha256, "Upstream asset hash mismatch");
    assert.equal(hash(await loadAsset(asset.path)), asset.sha256, "Published asset hash mismatch");
    assert.equal(asset.sourceUrl, `https://github.com/${repository}/blob/${revision}/${asset.artifact}`);
  }
  return { revision, evidence: study.evidence.length, files: files.size, snippets: study.snippets.length,
    reportSha256: hash(report), runtimeExperiment: "not-run" };
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
  const local = args.length === 4 && args[0] === "--source-tree" && args[2] === "--report";
  assert.ok(remote || local, "Usage: node scripts/verify_raven_sources.mjs --fetch | --source-tree <Raven> --report <technical-report.pdf>");
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const study = JSON.parse(await readFile(path.join(publicRoot, "capabilities/raven.json"), "utf8"));
  const html = await readFile(path.join(publicRoot, "capabilities/raven.html"), "utf8");
  const result = await verifyRavenSources(study, html,
    (artifact) => remote ? fetchBytes(`https://raw.githubusercontent.com/${study.source.repository}/${study.source.revision}/${artifact}`)
      : readFile(path.join(path.resolve(args[1]), artifact)),
    () => remote ? fetchBytes(reportUrl) : readFile(path.resolve(args[3])),
    (asset) => readFile(path.join(publicRoot, asset.slice(1))));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
