import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = path.resolve(process.argv[2]);
const revision = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(revision, "ef893acc0d341b4fa7a1ce41d2be7cafed3c63a2");
const imported = (file) => import(pathToFileURL(path.join(source, "packages/oar/dist", file)));
const { createSessionKernel, sealSession } = await imported("kernel.js");
const { conversationOf, reduceConversation } = await imported("observe/conversation.js");
const { eventsOf } = await imported("observe/events.js");
const { turnEndAfter, promptAndWait } = await imported("observe/turns.js");

function fixture(id) {
  const kernel = createSessionKernel(id);
  const accepted = () => ({ kind: "accepted" });
  const session = sealSession({
    id, capabilities: { steer: false, queue: { durable: false }, attribution: "nested", images: false },
    prompt: (input, options) => kernel.control({ kind: "prompt", input, ...options }, accepted),
    steer: (input, options) => kernel.control({ kind: "steer", input, ...options }, () => ({ kind: "rejected", code: "unsupported", reason: "fixture" })),
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

const results = [];
const fallback = fixture("fallback");
const delivery = await fallback.session.steerOrQueue("same input");
const inputs = [...conversationOf(fallback.session.records()).inputs.values()];
assert.equal(delivery.landed, "queued");
assert.equal(inputs.length, 1);
assert.deepEqual(inputs[0].attempts.map((a) => a.state), ["rejected", "accepted"]);
assert.notEqual(inputs[0].attempts[0].request.id, inputs[0].attempts[1].request.id);
results.push({ id: "fallback-identity", passed: true, inputs: inputs.length, attempts: ["rejected", "accepted"], landed: delivery.landed });

const child = fixture("parent");
child.kernel.frame({ type: "synthetic-child-end", native: { fixture: true }, events: [{ kind: "turn_ended", outcome: { kind: "completed" } }] }, { sessionId: "child" });
assert.equal(turnEndAfter(child.session.records(), -1, "parent"), null);
results.push({ id: "child-end-isolation", passed: true, rootOutcome: null });

const frame = child.kernel.frame({ type: "synthetic-two-readings", native: { fixture: true }, events: [{ kind: "text_delta", text: "a" }, { kind: "text_delta", text: "b" }] });
assert.deepEqual(eventsOf(frame).map((event) => event.seq), [frame.seq, frame.seq]);
results.push({ id: "flat-seq-is-not-event-id", passed: true, events: 2, distinctSeq: 1 });

const replayed = [];
const off = child.session.rawEvents((r) => replayed.push(r.seq), { sessionId: "parent", afterSeq: 0 });
child.kernel.frame({ type: "live", native: {}, events: [] });
off();
assert.deepEqual(replayed, [1, 2]);
results.push({ id: "cursor-replay-and-live", passed: true, seq: replayed });

let conversation = conversationOf(fallback.session.records());
const resumed = { ...fallback.session.records()[0], seq: 0, id: "resumed-op", body: { kind: "prompt", input: "new", inputId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } };
assert.equal(reduceConversation(conversation, resumed).inputs.size, 1);
conversation = reduceConversation(conversation, resumed, "new-stream");
assert.equal(conversation.inputs.size, 2);
results.push({ id: "resume-needs-new-stream-id", passed: true, withoutNewStream: 1, withNewStream: 2 });

const silent = fixture("silent");
let settled = false;
const pending = promptAndWait(silent.session, "fixture", { timeoutMs: 10 }).then((result) => { settled = true; return result; });
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(settled, false);
assert.ok(silent.session.records().some((r) => r.kind === "request" && r.body.kind === "abort"));
await silent.session.dispose();
const ended = await pending;
assert.equal(ended.kind, "interrupted");
assert.equal(ended.outcome.kind, "failed");
results.push({ id: "timeout-is-not-hard-deadline", passed: true, timeoutMs: 10, pendingAfterMs: 100, settledOnlyAfterSyntheticExit: true });

const receipt = {
  revision, checkedAt: new Date().toISOString(), node: process.version,
  evidenceClass: "local-synthetic-contract-probe", realModelCalls: 0, realCliRuns: 0,
  boundary: "Synthetic frames and an in-process adapter exercise OAR helpers, not vendor runtimes, accounts, task quality or process-kill behavior.", results,
};
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
