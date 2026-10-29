import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const revision = "5532d7b2a01f26c553def1f4acb4470c94f0ed36";
assert.ok(process.argv[2], "Pass the pinned, built OAR checkout");
const source = path.resolve(process.argv[2]);
assert.equal(execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), revision);
assert.equal(execFileSync("git", ["-C", source, "diff", "HEAD", "--", "packages/oar/src"], { encoding: "utf8" }), "");
const imported = (file) => import(pathToFileURL(path.join(source, "packages/oar/dist", file)));
const { createSessionKernel, sealSession } = await imported("kernel.js");
const { scriptedRuntime } = await imported("testing/index.js");
const { createSubagents, formatReport, reportOrigin } = await imported("agents/index.js");
const { promptAndWait, turnEndAfter } = await imported("observe/turns.js");
const { eventsOf } = await imported("observe/events.js");
const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const installed = { kind: "available", via: "bundled" };
const runtime = scriptedRuntime({ id: "synthetic", turn: (turn) => turn.say("synthetic answer") });
const registry = { get: (id) => id === runtime.id ? runtime : undefined };

function silentFixture(id) {
  const kernel = createSessionKernel(id);
  const accepted = () => ({ kind: "accepted" });
  const session = sealSession({
    id, capabilities: { queue: { durable: false }, attribution: "nested", images: false },
    prompt: (input, options) => kernel.control({ kind: "prompt", input, ...options }, accepted),
    queue: (input, options) => kernel.control({ kind: "queue", input, ...options }, accepted),
    abort: () => kernel.control({ kind: "abort" }, accepted),
    rawEvents: kernel.rawEvents, records: kernel.records, graph: kernel.graph,
    dispose: async () => {
      const request = kernel.request("toRuntime", { kind: "dispose" });
      kernel.respond(request.id, { kind: "exited", code: 0 });
    },
  });
  return { kernel, session };
}

const silent = silentFixture("synthetic-timeout");
let settled = false;
const pending = promptAndWait(silent.session, "no native end", { timeoutMs: 10 }).then((result) => {
  settled = true;
  return result;
});
await sleep(100);
assert.equal(settled, false);
assert.ok(silent.session.records().some((record) => record.kind === "request" && record.body.kind === "abort"));
await silent.session.dispose();
const ended = await pending;
assert.equal(ended.kind, "interrupted");
assert.equal(ended.outcome.kind, "aborted");
results.push({ id: "timeout-is-not-a-hard-deadline", passed: true, timeoutMs: 10, pendingAtObservationAfterMs: 100, syntheticExitOutcome: ended.outcome.kind });

const parent = await runtime.session(installed, { cwd: source });
await parent.dispose();
const crew = createSubagents({ runtimes: registry, maxRunning: 1 });
try {
  const delivery = Promise.withResolvers();
  crew.onReport((report) => {
    void parent.deliver(formatReport(report), { origin: reportOrigin(report) }).then(delivery.resolve, delivery.reject);
  });
  assert.equal((await crew.spawn({ runtime: runtime.id, task: "synthetic report" })).kind, "spawned");
  const refused = await delivery.promise;
  assert.equal(refused.landed, "rejected");
  assert.equal(refused.code, "runtime_exited");
  assert.equal(crew.unread().length, 0);
  results.push({ id: "report-hook-is-not-delivery-ack", passed: true, parentDelivery: refused.landed, parentCode: refused.code, unreadReports: crew.unread().length });
} finally {
  await crew.close();
}

const pool = createSubagents({ runtimes: registry, maxRunning: 1 });
try {
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await pool.spawn({ runtime: runtime.id, task: `synthetic task ${i}` })).kind, "spawned");
    assert.equal((await pool.wait({ timeoutMs: 1000 })).length, 1);
  }
  assert.equal(pool.list().length, 3);
  assert.ok(pool.list().every((agent) => agent.state === "idle"));
  results.push({ id: "running-limit-does-not-bound-idle-sessions", passed: true, maxRunning: 1, retainedIdleSessions: pool.list().length });
} finally {
  await pool.close();
}

let opens = 0;
const refusingRuntime = {
  ...runtime,
  refusedSessionOptions: { env: "synthetic fixture refuses env" },
  session: async (...args) => { opens += 1; return runtime.session(...args); },
};
const refusedCrew = createSubagents({ runtimes: { get: () => refusingRuntime } });
try {
  const refused = await refusedCrew.spawn({ runtime: runtime.id, task: "synthetic task" });
  assert.equal(refused.kind, "refused");
  assert.equal(refused.code, "open_failed");
  assert.equal(opens, 0);
  results.push({ id: "env-refusal-prevents-subagent-open", passed: true, code: refused.code, opens });
} finally {
  await refusedCrew.close();
}

const frame = createSessionKernel("synthetic-frame");
const record = frame.frame({ type: "synthetic/two-events", native: {}, events: [{ kind: "text_delta", text: "a" }, { kind: "text_delta", text: "b" }] });
assert.deepEqual(eventsOf(record).map((event) => event.seq), [0, 0]);
results.push({ id: "flat-event-seq-is-not-a-unique-id", passed: true, eventCount: 2, distinctSeqCount: 1 });

const child = createSessionKernel("synthetic-parent");
child.frame({ type: "synthetic/child-end", native: {}, events: [{ kind: "turn_ended", outcome: { kind: "completed" } }] }, { sessionId: "synthetic-child" });
assert.equal(turnEndAfter(child.records(), -1, "synthetic-parent"), null);
results.push({ id: "child-end-does-not-end-parent", passed: true, parentOutcome: null });

const receipt = {
  revision, checkedAt: new Date().toISOString(), node: process.version,
  evidenceClass: "local-synthetic-contract-probes", realModelCalls: 0, realVendorCliRuns: 0,
  boundary: "In-process synthetic sessions only. These observations do not validate vendor processes, OS isolation, model quality, crash recovery or production task delivery.",
  results,
};
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
