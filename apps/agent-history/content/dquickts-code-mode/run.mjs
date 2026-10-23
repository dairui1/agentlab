import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir, platform, arch, cpus, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const here = dirname(fileURLToPath(import.meta.url));
const fork = resolve(process.argv[2] || '/private/tmp/dquickts-study-20261023');
const upstream = resolve(process.argv[3] || '/private/tmp/quickjs-2026-06-04');
const work = mkdtempSync(join(tmpdir(), 'dquickts-eval-'));
// Do not pass the user's credentials or home directory into upstream programs.
const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work, LANG: 'C', TZ: 'UTC', DENO_NO_UPDATE_CHECK: '1', DENO_NO_PROMPT: '1' };
const hash = (data) => createHash('sha256').update(data).digest('hex');
const report = { generatedAt: new Date().toISOString(), environment: { platform: platform(), arch: arch(), osRelease: release(), cpu: cpus()[0]?.model, node: process.version }, sources: {}, checks: [], timings: [] };
function run(bin, args = [], options = {}) {
  const t = performance.now();
  const r = spawnSync(bin, args, { cwd: work, env, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim(), elapsedMs: performance.now() - t };
}
function checked(name, bin, args, verify) {
  const r = run(bin, args);
  verify(r);
  report.checks.push({ name, passed: true, ...r });
  return r;
}
const forkCommit = run('git', ['-C', fork, 'rev-parse', 'HEAD']).stdout;
assert.equal(forkCommit, 'f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406');
report.sources.dquickts = { commit: forkCommit, files: {} };
for (const file of ['README.md', 'quickjs.h', 'quickjs.c', 'quickjs-snapshot.c', 'quickjs-snapshot-control.c', 'quickjs-snapshot-data.c', '.github/workflows/ci.yml', 'Makefile', 'tests/snapshot/Makefile']) {
  report.sources.dquickts.files[file] = hash(readFileSync(join(fork, file)));
}
report.sources.quickjs = { version: readFileSync(join(upstream, 'VERSION'), 'utf8').trim(), quickjsC: hash(readFileSync(join(upstream, 'quickjs.c'))) };
assert.equal(report.sources.quickjs.version, '2026-06-04');
report.environment.deno = run('deno', ['--version']).stdout;
const host = join(work, 'study-host');
checked('compile-original-host', 'cc', ['-O2', '-I', fork, join(here, 'host.c'), join(fork, 'libquickjs.a'), '-lm', '-lpthread', '-o', host], r => assert.equal(r.status, 0, r.stderr));
const snap = join(work, 'session.snap');
checked('suspend-and-write', host, ['write', snap], r => assert.equal(JSON.parse(r.stdout).suspended, true));
const expected = '[true,42,2,"TOOL_RESULT","ALPHA","BETA"]';
checked('cross-process-resume-closure-and-alias', host, ['resume', snap], r => { assert.equal(r.stdout, expected); assert.match(r.stderr, /restored_malloc_limit=-1/); });
checked('same-snapshot-can-be-resumed-again', host, ['resume', snap], r => assert.equal(r.stdout, expected));
checked('swapped-native-order-is-not-rejected', host, ['resume', snap, 'swap'], r => assert.equal(r.stdout, '[true,42,2,"TOOL_RESULT","BETA","ALPHA"]'));
checked('native-count-change-is-rejected', host, ['resume', snap, 'count'], r => assert.equal(r.status, 2));
const truncated = join(work, 'truncated.snap');
writeFileSync(truncated, readFileSync(snap).subarray(0, 100));
checked('truncated-snapshot-is-rejected', host, ['resume', truncated], r => assert.equal(r.status, 2));
checked('durable-call-inside-native-map-is-rejected', host, ['callback', snap], r => { assert.equal(r.status, 1); assert.match(r.stderr, /TypeError/); });
checked('suspension-request-in-map-needs-hard-interrupt', host, ['defer', snap], r => { assert.equal(r.status, 1); assert.match(r.stderr, /interrupts=5 suspended=0/); });
checked('typescript-does-not-typecheck', join(fork, 'qjs'), ['--typescript', '-e', 'const n: number = "not a number"; print(typeof n);'], r => { assert.equal(r.status, 0); assert.equal(r.stdout, 'string'); });
checked('plain-qjs-cli-exposes-os-module', join(fork, 'qjs'), ['--module', '-e', 'import * as os from "os"; print(typeof os.exec);'], r => assert.equal(r.stdout, 'function'));
checked('node-vm-json-does-not-save-closures', process.execPath, ['--input-type=module', '-e', 'import vm from "node:vm"; const c=vm.createContext({}); vm.runInContext("globalThis.counter=(()=>{let n=41;return ()=>++n})()",c); const saved=JSON.stringify(c); console.log(JSON.stringify([vm.runInContext("counter()",c), saved]));'], r => assert.equal(r.stdout, '[42,"{}"]'));
const denoProbe = join(work, 'deno-permissions.ts');
writeFileSync(denoProbe, 'try { Deno.env.get("DQUICKTS_STUDY_CANARY"); console.log("allowed"); } catch(e) { console.log(e.name); }');
checked('deno-default-env-access-denied', 'deno', ['run', '--no-prompt', denoProbe], r => assert.equal(r.stdout, 'NotCapable'));

const samples = 15, warmups = 3;
const workloads = {
  startup: 'console.log("42");',
  json50000: 'const rows=Array.from({length:50000},(_,i)=>({id:i,team:i%17,score:i%101}));const copy=JSON.parse(JSON.stringify(rows));let total=0;for(const r of copy)if(r.team===3)total+=r.score;console.log(total);',
  loop1m: 'let n=7;for(let i=0;i<1000000;i++)n=(n*17+i)%1000003;console.log(n);',
  loop10m: 'let n=7;for(let i=0;i<10000000;i++)n=(n*17+i)%1000003;console.log(n);'
};
report.workloads = Object.fromEntries(Object.entries(workloads).map(([name, code]) => [name, { code, sha256: hash(code) }]));
const engines = [
  { name: 'dquickts', bin: join(fork, 'qjs'), args: [] },
  { name: 'QuickJS-2026-06-04', bin: join(upstream, 'qjs'), args: [] },
  { name: 'Node-24.14.0', bin: process.execPath, args: [] },
  { name: 'Deno-2.7.5', bin: 'deno', args: ['run', '--no-prompt'] }
];
for (const engine of engines) if (engine.bin !== 'deno') report.sources[engine.name + 'Binary'] = { bytes: statSync(engine.bin).size, sha256: hash(readFileSync(engine.bin)) };
for (const [name, code] of Object.entries(workloads)) {
  const file = join(work, name + '.js');
  writeFileSync(file, code);
  const timings = new Map(engines.map(e => [e.name, []]));
  let expectedOutput;
  // Round-robin reduces systematic ordering bias. Each sample is a fresh process.
  for (let round = -warmups; round < samples; round++) {
    for (let offset = 0; offset < engines.length; offset++) {
      const e = engines[(offset + round + warmups) % engines.length];
      const result = run(e.bin, [...e.args, file]);
      assert.equal(result.status, 0, result.stderr);
      expectedOutput ??= result.stdout;
      assert.equal(result.stdout, expectedOutput);
      if (round >= 0) timings.get(e.name).push(result.elapsedMs);
    }
  }
  for (const [engine, rawMs] of timings) {
    const sorted = [...rawMs].sort((a, b) => a - b);
    report.timings.push({ workload: name, engine, samples, warmups, output: expectedOutput, medianMs: sorted[7], p95Ms: sorted[14], minMs: sorted[0], maxMs: sorted[14], rawMs });
  }
}
for (const [name, args] of [['upstream-builtins', ['test']], ['upstream-snapshots', ['test-snapshot']]]) {
  const result = run('make', args, { cwd: fork, timeout: 300000 });
  writeFileSync(join(here, name + '.log'), result.stdout + '\n' + result.stderr + '\n');
  assert.equal(result.status, 0, result.stderr);
  report.checks.push({ name, passed: true, status: result.status, elapsedMs: result.elapsedMs, log: name + '.log', sha256: hash(readFileSync(join(here, name + '.log'))) });
}
report.notes = ['Trusted snapshots produced locally only; no malicious snapshot fuzzing or security certification.', 'Timing is process end-to-end with warm OS caches, not embedded runtime creation latency or model-task performance.', 'No Cloudflare, isolated-vm, Temporal or remote model performance test was run.', 'The C host uses mocked tool results, not a real external service.'];
writeFileSync(join(here, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks: report.checks.map(({ name, status }) => ({ name, status })), timings: report.timings.map(({ workload, engine, medianMs }) => ({ workload, engine, medianMs })), resultFile: join(here, 'results.json') }, null, 2));
