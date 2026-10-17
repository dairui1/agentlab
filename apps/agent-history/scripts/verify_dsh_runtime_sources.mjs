import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = "deepseek-ai/deepseek-harness";
const studyPath = fileURLToPath(new URL("../public/capabilities/dsh-runtime-evolution.json", import.meta.url));
const validArtifact = (name) => typeof name === "string" && /^[a-zA-Z0-9_./-]+$/.test(name)
  && !name.startsWith("/") && !name.split("/").includes("..");

export async function verifyEvidence(study, loadSource, { capture = false } = {}) {
  if (study.source.repository !== repository) throw new Error("Unexpected source repository");
  const revisions = new Set(study.source.versions.map((item) => item.revision));
  if (![...revisions].every((revision) => /^[a-f0-9]{40}$/.test(revision))) throw new Error("Unpinned revision");
  const files = new Map();
  const ids = new Set();
  for (const item of study.evidence) {
    if (!item.id || ids.has(item.id)) throw new Error("Duplicate evidence id");
    ids.add(item.id);
    const revision = item.revision || study.source.revision;
    if (!revisions.has(revision)) throw new Error(`Unpinned revision: ${item.id}`);
    if (!validArtifact(item.artifact)) throw new Error(`Unsafe artifact: ${item.id}`);
    const key = `${revision}:${item.artifact}`;
    if (!files.has(key)) {
      const bytes = Buffer.from(await loadSource(item.artifact, revision));
      if (bytes.length > 4 * 1024 * 1024) throw new Error(`Oversized source: ${item.id}`);
      const lines = bytes.toString("utf8").split("\n");
      if (lines.at(-1) === "") lines.pop();
      files.set(key, { sha256: createHash("sha256").update(bytes).digest("hex"), lines });
    }
    const file = files.get(key);
    if (!Number.isInteger(item.lineStart) || !Number.isInteger(item.lineEnd)
      || item.lineStart < 1 || item.lineEnd < item.lineStart || item.lineEnd > file.lines.length) {
      throw new Error(`Invalid line range: ${item.id}`);
    }
    const url = `https://github.com/${repository}/blob/${revision}/${item.artifact}#L${item.lineStart}-L${item.lineEnd}`;
    if (capture) {
      item.sha256 = file.sha256;
      item.locator = `L${item.lineStart}-L${item.lineEnd} · ${revision.slice(0, 8)}`;
      item.source = { label: item.source?.label || "固定官方源码", url };
    } else {
      if (item.sha256 !== file.sha256) throw new Error(`Hash mismatch: ${item.id}`);
      if (item.source?.url !== url) throw new Error(`Unpinned source locator: ${item.id}`);
    }
  }
  return { files: files.size, evidence: ids.size, runtimeExperiment: "not-run", upstreamTests: "inspected-not-run" };
}

export function verifyVersionOnlyDiff(entries) {
  if (!entries.length) throw new Error("Empty version comparison");
  for (const { artifact, before, after } of entries) {
    if (path.posix.basename(artifact) !== "package.json") throw new Error(`Runtime change: ${artifact}`);
    const left = JSON.parse(before);
    const right = JSON.parse(after);
    if (typeof left.version !== "string" || !left.version || typeof right.version !== "string" || !right.version || left.version === right.version) {
      throw new Error(`Unexpected version: ${artifact}`);
    }
    delete left.version;
    delete right.version;
    if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`Non-version change: ${artifact}`);
  }
  return entries.length;
}

async function main(args) {
  const capture = args.includes("--capture");
  const options = args.filter((arg) => arg !== "--capture");
  if (options.length !== 2 || options[0] !== "--git-dir") throw new Error("Usage: node scripts/verify_dsh_runtime_sources.mjs --git-dir <official-bare-repository> [--capture]");
  const gitDir = path.resolve(options[1]);
  const git = (...argv) => execFileSync("git", ["--git-dir", gitDir, ...argv], { maxBuffer: 16 * 1024 * 1024 });
  const study = JSON.parse(await readFile(studyPath, "utf8"));
  for (const version of study.source.versions) {
    const actual = git("rev-parse", `${version.tag}^{commit}`).toString().trim();
    if (actual !== version.revision) throw new Error(`Tag mismatch: ${version.tag}`);
  }
  const result = await verifyEvidence(study, (artifact, revision) => git("show", `${revision}:${artifact}`), { capture });
  const before = study.source.versions.find((item) => item.tag === "dsh-v0.2.1-alpha.5").revision;
  const after = study.source.versions.find((item) => item.tag === "dsh-v0.2.1-rc.1").revision;
  const artifacts = git("diff", "--name-only", before, after).toString().trim().split("\n");
  const versionOnlyFiles = verifyVersionOnlyDiff(artifacts.map((artifact) => ({
    artifact, before: git("show", `${before}:${artifact}`).toString(), after: git("show", `${after}:${artifact}`).toString(),
  })));
  if (capture) await writeFile(studyPath, JSON.stringify(study, null, 2) + "\n");
  console.log(JSON.stringify({ ...result, versionOnlyFiles, mode: capture ? "capture" : "verify" }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
