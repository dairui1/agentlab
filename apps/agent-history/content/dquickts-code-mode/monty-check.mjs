import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const here = dirname(self);
const root = resolve(process.argv[2] || '/private/tmp/dquickts-monty-baseline-20261023');
const mode = process.argv[3];
const home = mkdtempSync(join(tmpdir(), 'monty-home-'));
process.env = { PATH: process.env.PATH, HOME: home, TMPDIR: home, LANG: 'C', TZ: 'UTC' };
const { Monty, FunctionSnapshot, NameLookupSnapshot, MontyComplete } = await import(pathToFileURL(join(root, 'node_modules/@pydantic/monty/dist/node.js')));
const { findMontyBinary } = await import(pathToFileURL(join(root, 'node_modules/@pydantic/monty/dist/binary.js')));
const binary = findMontyBinary();
async function pool() { return Monty.create({ binaryPath: binary, maxProcesses: 1, requestTimeout: 5 }); }
if (mode === 'write' || mode === 'resume') {
  const p = await pool();
  const s = await p.checkout({ limits: { maxMemory: 8 * 1024 * 1024, maxFeedDurationSecs: 1 } });
  try {
    if (mode === 'write') {
      const code = 'shared = {"n": 41}\nalias = shared\ndef make_counter():\n    n = 0\n    def next():\n        nonlocal n\n        n += 1\n        return n\n    return next\nnext = make_counter()\nnext()\nanswer = tool()\n[shared is alias, alias["n"] + 1, next(), answer]';
      let snap = await s.feedStart(code, { externalLookup: { tool: () => 41 } });
      while (snap instanceof NameLookupSnapshot) snap = await snap.resumeAuto();
      assert.ok(snap instanceof FunctionSnapshot);
      assert.equal(snap.functionName, 'tool');
      const data = await snap.dump();
      writeFileSync(process.argv[4], data);
      console.log(JSON.stringify({ bytes: data.length, function: snap.functionName, position: snap.position }));
    } else {
      const snap = await s.loadSnapshot(readFileSync(process.argv[4]));
      assert.ok(snap instanceof FunctionSnapshot);
      const done = await snap.resume(41);
      assert.ok(done instanceof MontyComplete);
      assert.deepEqual(done.output, [true, 42, 2, 41]);
      console.log(JSON.stringify(done.output));
    }
  } finally { await s.close(); await p.close(); }
} else {
  const work = mkdtempSync(join(tmpdir(), 'monty-eval-'));
  const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work, LANG: 'C', TZ: 'UTC' };
  const snap = join(work, 'session.snap');
  const checks = [];
  for (const operation of ['write', 'resume', 'resume']) {
    const r = spawnSync(process.execPath, [self, root, operation, snap], { env, cwd: work, encoding: 'utf8', timeout: 30000 });
    if (r.error) throw r.error;
    assert.equal(r.status, 0, r.stderr);
    checks.push({ name: operation === 'write' ? 'pause-and-dump' : checks.length === 1 ? 'cross-process-closure-and-alias-resume' : 'same-dump-can-be-loaded-again', passed: true, output: JSON.parse(r.stdout) });
  }
  const p = await pool();
  try {
    const s = await p.checkout({ typeCheck: true, limits: { maxFeedDurationSecs: 1, maxMemory: 8 * 1024 * 1024 } });
    try {
      await assert.rejects(s.feedRun('x: int = "wrong"\nx'), e => { assert.equal(e.constructor.name, 'MontyTypingError'); return true; });
      checks.push({ name: 'optional-type-check-rejects-mismatch', passed: true });
      assert.equal(await s.feedRun('41 + 1'), 42);
      checks.push({ name: 'session-survives-type-error', passed: true });
      await assert.rejects(s.feedRun('open("/not-a-real-study-file").read()', { skipTypeCheck: true }), e => { assert.match(String(e), /PermissionError/); return true; });
      checks.push({ name: 'file-open-without-mount-is-denied', passed: true });
    } finally { await s.close(); }
  } finally { await p.close(); }
  const version = JSON.parse(readFileSync(join(root, 'node_modules/@pydantic/monty/package.json'))).version;
  assert.equal(version, '1.3.0');
  const report = { generatedAt: new Date().toISOString(), package: '@pydantic/monty', version, binarySha256: createHash('sha256').update(readFileSync(binary)).digest('hex'), lockfile: JSON.parse(readFileSync(join(root, 'package-lock.json'))), checks, boundary: 'Mock tool only. No Python package compatibility benchmark, malicious snapshots, production fault injection, or throughput comparison.' };
  writeFileSync(join(here, 'monty-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ version: report.version, checks }, null, 2));
}
