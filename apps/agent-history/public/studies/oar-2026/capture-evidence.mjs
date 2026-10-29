import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

assert.ok(process.argv[2] && process.argv[3], "Pass the source checkout and the raw test-report directory");
const source = path.resolve(process.argv[2]);
const reports = path.resolve(process.argv[3]);
const here = path.dirname(fileURLToPath(import.meta.url));
const revision = "5532d7b2a01f26c553def1f4acb4470c94f0ed36";
const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
assert.equal(git("rev-parse", "HEAD"), revision);
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
const article = await readFile(path.join(here, "research-2026-10-29.md"), "utf8");
const matches = [...article.matchAll(/https:\/\/github\.com\/botiverse\/oar\/blob\/([a-f0-9]{40})\/([^\s)]+)/gu)];
const sourceFiles = [];
for (const relative of [...new Set(matches.map((match) => match[2]))].sort()) {
  assert.ok(!relative.includes(".."));
  const bytes = await readFile(path.join(source, relative));
  sourceFiles.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), url: `https://github.com/botiverse/oar/blob/${revision}/${relative}` });
}
assert.ok(matches.length > 0 && matches.every((match) => match[1] === revision));
const summarize = async (name) => {
  const bytes = await readFile(path.join(reports, name));
  const report = JSON.parse(bytes);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    success: report.success, files: report.testResults.length,
    total: report.numTotalTests, passed: report.numPassedTests,
    failed: report.numFailedTests, skipped: report.numPendingTests,
    failures: report.testResults.flatMap((file) => file.assertionResults.filter((test) => test.status === "failed").map((test) => ({
      file: file.name.slice(file.name.indexOf("/tests/") + 1), name: test.fullName,
      error: test.failureMessages[0]?.split("\n")[0],
    }))),
  };
};
const first = await summarize("upstream-tests.json");
const rerun = await summarize("login-rerun.json");
assert.deepEqual([first.total, first.passed, first.failed, first.skipped], [2394, 2287, 5, 102]);
assert.deepEqual([rerun.total, rerun.passed, rerun.failed], [37, 37, 0]);
const probe = JSON.parse(await readFile(path.join(here, "probe-2026-10-29.json"), "utf8"));
assert.equal(probe.revision, revision);
assert.equal(probe.results.length, 6);
assert.ok(probe.results.every((result) => result.passed));
const evidence = {
  capturedAt: new Date().toISOString(), repository: "botiverse/oar", revision,
  release: { version: "0.75.0", revision: git("rev-parse", "v0.75.0^{commit}"), publishedAt: "2026-10-27T12:19:55Z", url: "https://github.com/botiverse/oar/releases/tag/v0.75.0" },
  articleSha256: createHash("sha256").update(article).digest("hex"),
  sourceFiles,
  independentVerification: {
    node: process.version, pnpm: "11.22.0", dependencyScripts: false, temporaryHome: true, scrubbedEnvironment: true,
    libraryBuild: "passed: tsrs -p packages/oar/tsconfig.build.json",
    upstreamTests: { workers: 4, ...first }, unchangedSerialRerun: { workers: 1, ...rerun },
    mockBehaviorSuite: { passed: 18, skipped: 1, failed: 0, skippedCase: "account-usage.snapshot", note: "Counts transcribed from the completed command output, not the misleading 19/19 clean summary." },
    syntheticProbe: { file: "probe-2026-10-29.json", passed: 6, failed: 0 },
    realModelCalls: 0, realVendorCliRuns: 0,
  },
  upstreamCiObservations: [
    { revision: "51b83c96811735b3a9f045ab20bab7cd20e61cdf", status: "completed", conclusion: "success", successfulJobs: 26, url: "https://github.com/botiverse/oar/actions/runs/40495932395" },
    { revision, status: "in_progress", conclusion: null, url: "https://github.com/botiverse/oar/actions/runs/40806718709", note: "Last observed status during research; not a claim about its later outcome." },
  ],
  externalReferences: [
    "https://agentclientprotocol.com/get-started/introduction",
    "https://ai-sdk.dev/docs/ai-sdk-harnesses/overview",
    "https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters",
    "https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent",
    "https://github.com/botiverse/oar/issues/402",
    "https://github.com/botiverse/oar/issues/343",
  ],
  boundary: "Source analysis, local synthetic tests, and separately attributed upstream reports. No real-model quality, real login, crash-recovery, isolation, or production acceptance claim. Existing published research was not changed or deployed.",
};
await writeFile(path.join(here, "evidence-2026-10-29.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ sourceFiles: sourceFiles.length, firstRun: first.success, serialRerun: rerun.success, syntheticProbes: 6 }));
