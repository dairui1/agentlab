import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = "earendil-works/pi";
const revision = "1cedd32724abfcb0915f76cc61b6827e2c16dbad";
const maxBytes = 6 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safePath = (value) => typeof value === "string" && /^[\w./-]+$/.test(value)
  && !value.startsWith("/") && value.split("/").every((part) => part && part !== "." && part !== "..");
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export async function verifyPiDurableSources(study, html, loadSource) {
  assert.equal(study.source.repository, repository, "Repository mismatch");
  assert.equal(study.source.revision, revision, "Revision mismatch");
  assert.ok(Array.isArray(study.evidence) && study.evidence.length, "Missing evidence");
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
  const ids = new Set();
  for (const evidence of study.evidence) {
    assert.match(evidence.id, /^PD-\d{2,}$/, "Invalid evidence ID");
    assert.ok(!ids.has(evidence.id), `Duplicate evidence: ${evidence.id}`);
    ids.add(evidence.id);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/, `Invalid hash: ${evidence.id}`);
    const file = await source(evidence.artifact);
    assert.equal(hash(file.bytes), evidence.sha256, `Source hash mismatch: ${evidence.id}`);
    const { lineStart: start, lineEnd: end } = evidence;
    assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 1
      && start <= end && end <= file.lines.length, `Invalid range: ${evidence.id}`);
    assert.equal(evidence.locator, `L${start}-L${end}`, `Locator mismatch: ${evidence.id}`);
    assert.equal(evidence.source.url, `https://github.com/${repository}/blob/${revision}/${evidence.artifact}#L${start}-L${end}`,
      `Pinned URL mismatch: ${evidence.id}`);
  }
  const cited = new Set();
  for (const [, , references] of html.matchAll(/\bdata-evidence\s*=\s*(["'])(.*?)\1/g)) {
    const referencesInAttribute = references.trim().split(/\s+/);
    assert.ok(references.trim(), "Empty evidence citation");
    for (const id of referencesInAttribute) {
      assert.ok(ids.has(id), `Unknown citation: ${id}`);
      cited.add(id);
    }
  }
  assert.deepEqual(cited, ids, "Unused evidence");
  for (const snippet of study.snippets || []) {
    const file = await source(snippet.artifact);
    assert.ok(Number.isInteger(snippet.lineStart) && Number.isInteger(snippet.lineEnd)
      && snippet.lineStart >= 1 && snippet.lineStart <= snippet.lineEnd
      && snippet.lineEnd <= file.lines.length, `Invalid snippet range: ${snippet.id}`);
    const exact = file.lines.slice(snippet.lineStart - 1, snippet.lineEnd).join("\n");
    assert.equal(snippet.text, exact, `Snippet mismatch: ${snippet.id}`);
    assert.ok(html.includes(`<code data-source-snippet="${snippet.id}">${escape(exact)}</code>`), `HTML excerpt mismatch: ${snippet.id}`);
  }
  return { revision, evidence: ids.size, citations: cited.size, files: files.size,
    snippets: (study.snippets || []).length, verificationKind: "pinned-source" };
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
  const local = args.length === 2 && args[0] === "--source-root";
  assert.ok(remote || local, "Usage: node scripts/verify_pi_durable_sources.mjs --source-root <pi> | --fetch");
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const study = JSON.parse(await readFile(path.join(publicRoot, "capabilities/pi-durable.json"), "utf8"));
  const html = await readFile(path.join(publicRoot, "capabilities/pi-durable.html"), "utf8");
  const sourceRoot = local ? path.resolve(args[1]) : null;
  if (local) {
    const checkout = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(checkout, revision, "Checkout revision mismatch");
  }
  const result = await verifyPiDurableSources(study, html, (artifact) => remote
    ? fetchBytes(`https://raw.githubusercontent.com/${repository}/${revision}/${artifact}`)
    : readFile(path.join(sourceRoot, artifact)));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
