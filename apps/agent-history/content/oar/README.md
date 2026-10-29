# OAR Research, 2026-10-29

This is a new Chinese research manuscript, not a replacement of the historical
v0.10.2 public article. Publication is checked separately from research evidence.

- `research-2026-10-29.md`: manuscript with immutable upstream source links.
- `probe-2026-10-29.mjs` and `.json`: six local synthetic contract probes.
- `evidence-2026-10-29.json`: source hashes, version boundaries and compact results.
- `capture-evidence.mjs`: validates source pins and captures the completed run's results.

## Source Boundary

The published v0.75.0 tag is `51b83c96811735b3a9f045ab20bab7cd20e61cdf`.
The inspected and tested main snapshot is
`5532d7b2a01f26c553def1f4acb4470c94f0ed36`.
The latter still declares package version 0.75.0 but includes unreleased changes.
The manuscript explicitly separates these, especially Claude permission modes.

## Verification

Use a disposable checkout at the exact main snapshot, Node 24.22.1 and the
requested pnpm 11.22.0. Dependencies were installed with frozen lockfile and
install scripts disabled. Do not select real-login `OAR_TEST` backends.

```sh
npm exec --yes --package=pnpm@11.22.0 -- pnpm install --frozen-lockfile --ignore-scripts
node_modules/.bin/tsrs -p packages/oar/tsconfig.build.json
mkdir -p /tmp/oar-research-home-20261029 /tmp/oar-research-evidence-20261029
env -i PATH="$PATH" HOME=/tmp/oar-research-home-20261029 TMPDIR=/tmp CI=1 node_modules/.bin/vitest run tests --maxWorkers=4 --reporter=json --outputFile=/tmp/oar-research-evidence-20261029/upstream-tests.json
env -i PATH="$PATH" HOME=/tmp/oar-research-home-20261029 TMPDIR=/tmp CI=1 node_modules/.bin/vitest run tests/login/claude-login.test.ts tests/login/claude-logout.test.ts tests/login/codex-login.test.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/oar-research-evidence-20261029/login-rerun.json
env -i PATH="$PATH" HOME=/tmp/oar-research-home-20261029 TMPDIR=/tmp CI=1 OAR_TEST=mock OAR_TRIAL_RUN_DIR=/tmp/oar-research-evidence-20261029/sea-trial node_modules/.bin/tsx sea-trial/main.ts
```

First full test run: 2,287 passed, 5 failed, 102 skipped, across 282 files.
The three affected fake-login/logout files passed all 37 tests on an unchanged
serial rerun. This is not a second full-suite pass. The mock behavior suite
had 18 passed and one skipped account-usage case; its `19/19 clean` summary
includes the skip. Upstream source, lockfile and snapshots remained unchanged.

Run from this manuscript directory after building the pinned source:

```sh
env -i PATH="$PATH" HOME=/tmp/oar-research-home-20261029 TMPDIR=/tmp node probe-2026-10-29.mjs /tmp/oar-research-20261029 probe-2026-10-29.json
node capture-evidence.mjs /tmp/oar-research-20261029 /tmp/oar-research-evidence-20261029
```

The capture script intentionally checks the original run's counts rather than
silently rewriting the evidence claim after a different rerun. A future result
belongs in a separately dated receipt. Raw test reports and traces are temporary
local evidence and are not copied into public site assets.

No real vendor CLI, account login, external model call, real crash-recovery
experiment or production deployment was independently exercised. Upstream CI,
real-runtime scripted-provider experiments and historical live-model reports
are explicitly separate evidence.
