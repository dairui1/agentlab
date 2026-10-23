import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] || '/private/tmp/dquickts-study-20261023');
const work = mkdtempSync(join(tmpdir(), 'drepl-eval-'));
const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work, LANG: 'C', TZ: 'UTC' };
const checks = [];
for (const [name, input] of [
  ['create-session', 'class Counter { constructor(private n: number = 40) {} inc(): number { return ++this.n; } }\nconst c = new Counter();\nc.inc()\n\\q\n'],
  ['restore-session-in-new-process', 'console.log("DREPL_RESULT", c.inc())\nconsole.log("DREPL_OS", typeof os)\n\\q\n']
]) {
  const r = spawnSync(join(source, 'qjs'), ['--drepl', join(work, 'session.snap')], { env, cwd: work, input, encoding: 'utf8', timeout: 10000 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr);
  if (name.startsWith('restore')) { assert.match(r.stdout, /DREPL_RESULT 42/); assert.match(r.stdout, /DREPL_OS undefined/); }
  checks.push({ name, passed: true, stdout: r.stdout, stderr: r.stderr });
}
writeFileSync(join(here, 'repl-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), checks, boundary: 'Explicit REPL quit/restart with piped input, not abrupt kill or power-loss recovery.', initialProbe: 'EOF-only piped input did not terminate within 10 seconds; retest uses the documented explicit quit command.' }, null, 2) + '\n');
console.log(JSON.stringify(checks.map(({ name, passed }) => ({ name, passed })), null, 2));
