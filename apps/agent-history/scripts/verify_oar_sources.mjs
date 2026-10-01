import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safePath = (value) => typeof value === "string" && /^[\w./-]+$/.test(value)
  && !value.startsWith("/") && !value.split("/").includes("..");

export async function verifyOarSources(study, loadSource, loadAsset) {
  assert.equal(study.source.repository, "botiverse/oar");
  assert.match(study.source.revision, /^[a-f0-9]{40}$/);
  const base = `https://github.com/botiverse/oar/blob/${study.source.revision}/`;
  const files = new Map();
  async function source(artifact) {
    assert.ok(safePath(artifact), `Unsafe artifact: ${artifact}`);
    if (!files.has(artifact)) {
      const bytes = Buffer.from(await loadSource(artifact));
      assert.ok(bytes.length <= 4 * 1024 * 1024, `Oversized artifact: ${artifact}`);
      files.set(artifact, bytes);
    }
    return files.get(artifact);
  }
  for (const evidence of study.evidence) {
    const bytes = await source(evidence.artifact);
    assert.equal(hash(bytes), evidence.sha256, `Source hash mismatch: ${evidence.id}`);
    const lines = bytes.toString("utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    const { lineStart: start, lineEnd: end } = evidence;
    assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start && end <= lines.length, `Invalid range: ${evidence.id}`);
    assert.equal(evidence.locator, `L${start}-L${end}`);
    assert.equal(evidence.source.url, `${base}${evidence.artifact}#L${start}-L${end}`);
  }
  for (const asset of study.assets) {
    assert.ok(asset.path.startsWith("/") && safePath(asset.path.slice(1)), "Unsafe asset path");
    assert.equal(hash(await source(asset.artifact)), asset.sha256, "Upstream asset mismatch");
    assert.equal(hash(await loadAsset(asset.path)), asset.sha256, "Published asset mismatch");
    assert.equal(asset.sourceUrl, `${base}${asset.artifact}`);
  }
  return { revision: study.source.revision, evidence: study.evidence.length, files: files.size, assets: study.assets.length };
}

async function main() {
  assert.equal(process.argv[2], "--source-tree", "Usage: node scripts/verify_oar_sources.mjs --source-tree PATH");
  const tree = path.resolve(process.argv[3]);
  const publicRoot = new URL("../public/", import.meta.url);
  const study = JSON.parse(await readFile(new URL("capabilities/oar.json", publicRoot), "utf8"));
  const revision = execFileSync("git", ["-C", tree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(revision, study.source.revision, "Checkout revision mismatch");
  const result = await verifyOarSources(study, (name) => readFile(path.join(tree, name)), (name) => readFile(new URL(name.slice(1), publicRoot)));
  console.log(JSON.stringify(result));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
