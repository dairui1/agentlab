import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const maxSourceBytes = 4 * 1024 * 1024;

export async function verifyEvidenceFiles(study, loadSource) {
  const { repository, revision } = study.source;
  if (repository !== "botiverse/raft-source" || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("Expected a pinned official Raft revision");
  }
  const files = new Map();
  for (const evidence of study.evidence) {
    const artifact = evidence.artifact;
    if (!/^[a-zA-Z0-9_./-]+$/.test(artifact) || artifact.startsWith("/") || artifact.split("/").includes("..")) {
      throw new Error(`Unsafe artifact path: ${artifact}`);
    }
    if (!files.has(artifact)) {
      const bytes = Buffer.from(await loadSource(artifact, revision));
      if (bytes.length > maxSourceBytes) throw new Error(`Source too large: ${artifact}`);
      const content = bytes.toString("utf8");
      const lines = content.split("\n");
      if (lines.at(-1) === "") lines.pop();
      files.set(artifact, { sha256: createHash("sha256").update(bytes).digest("hex"), lines: lines.length });
    }
    const file = files.get(artifact);
    if (file.sha256 !== evidence.sha256) throw new Error(`Hash mismatch: ${evidence.id} ${artifact}`);
    if (!Number.isInteger(evidence.lineStart) || !Number.isInteger(evidence.lineEnd)
      || evidence.lineStart < 1 || evidence.lineEnd < evidence.lineStart || evidence.lineEnd > file.lines) {
      throw new Error(`Invalid line range: ${evidence.id}`);
    }
    const expectedUrl = `https://github.com/${repository}/blob/${revision}/${artifact}#L${evidence.lineStart}-L${evidence.lineEnd}`;
    if (evidence.source.url !== expectedUrl) throw new Error(`Unpinned source locator: ${evidence.id}`);
  }
  return { revision, files: files.size, evidence: study.evidence.length, runtimeExperiment: "not-run" };
}

async function main(args) {
  const studyOption = args.find((arg) => arg.startsWith("--study="));
  const studyId = studyOption ? studyOption.slice("--study=".length) : "raft-collaboration";
  if (!["raft-collaboration", "raft-multi-agent"].includes(studyId)) throw new Error("Unknown Raft study");
  args = args.filter((arg) => arg !== studyOption);
  const studyPath = fileURLToPath(new URL(`../public/capabilities/${studyId}.json`, import.meta.url));
  const fetchRemote = args.length === 1 && args[0] === "--fetch";
  const sourceDir = args.length === 2 && args[0] === "--source-dir" ? path.resolve(args[1]) : null;
  const sourceTree = args.length === 2 && args[0] === "--source-tree" ? path.resolve(args[1]) : null;
  if (!fetchRemote && !sourceDir && !sourceTree) throw new Error("Usage: node scripts/verify_raft_sources.mjs [--study=raft-multi-agent] --fetch | --source-dir <flattened-source-cache> | --source-tree <source-tree>");
  const study = JSON.parse(await readFile(studyPath, "utf8"));
  const result = await verifyEvidenceFiles(study, async (artifact, revision) => {
    if (sourceDir) return readFile(path.join(sourceDir, artifact.replaceAll("/", "__")));
    if (sourceTree) return readFile(path.join(sourceTree, artifact));
    const response = await fetch(`https://raw.githubusercontent.com/botiverse/raft-source/${revision}/${artifact}`, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${artifact}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxSourceBytes) throw new Error(`Source too large: ${artifact}`);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
