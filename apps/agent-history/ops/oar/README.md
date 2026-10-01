# OAR Study Checks

The article pins `botiverse/oar` at
`ef893acc0d341b4fa7a1ce41d2be7cafed3c63a2` (`v0.10.2`). It adds a fixed
research topic, not a new daily-tracked agent. No real model, account login,
or installed vendor CLI was exercised locally.

## Upstream Contracts

Run in a disposable checkout at the pinned revision, with Node 24.14.0:

```sh
npm exec --yes --package=pnpm@11.22.0 -- pnpm install --frozen-lockfile --ignore-scripts
node_modules/.bin/tsc -p packages/oar/tsconfig.build.json
env -u OAR_TEST CI=1 node_modules/.bin/vitest run tests
```

The completed run passed 398 tests in 66 files. The first attempt overlapped
the library build and was constrained by local loopback permissions; it failed
three tests and one suite. After building and allowing the local test servers,
the complete rerun passed without source, lockfile or snapshot changes. The
tests use fake processes, local services and SDK contracts, not real model
completion. `OAR_TEST` must remain unset; do not select real-login backends.

The installed pnpm 10 switcher could not find its requested pnpm 11 executable.
An attempt with pnpm 10 then refused the frozen lockfile's configuration. The
command above uses the exact requested pnpm 11.22.0 instead, without rewriting
the upstream lockfile or enabling dependency scripts.

## Local Probe

From `apps/agent-history`, after building the upstream library:

```sh
node ops/oar/probe.mjs /path/to/oar public/capabilities/oar-probe.json
node scripts/verify_oar_sources.mjs --source-tree /path/to/oar
```

The probe imports the pinned library, creates only in-process synthetic
sessions, and asserts six contracts: fallback identity, child end isolation,
shared flat-event seq, cursor replay plus live delivery, a new stream ID after
resume, and timeout followed by an indefinitely pending abort outcome. The
last test records a synthetic exit to settle its own fixture. It does not test
real process killing or crash recovery.

The source verifier checks 24 evidence records across 24 source files and the
unaltered upstream PNG. Hash, locator, pinned URL, path and revision mismatch
are fatal. Negative cases are covered by `tests/oar.test.js`.

## Publication

```sh
node --test tests/oar.test.js tests/capabilities-ui.test.js
npm test
npm run build
python3 scripts/verify_deploy.py
python3 scripts/analyze_changelogs.py --analysis-root analysis --agents all --newest-first --fair-agents --max-releases 20 --batch-size 1 --dry-run
node ops/oar/verify_ui.cjs http://127.0.0.1:4403 /tmp/oar-ui
node ops/oar/verify_live.mjs /tmp/oar-live-hashes.json
```

The browser check requires Playwright, optionally resolved through `NODE_PATH`.
It checks 1440, 1024, 390 and 320 px, light and dark, decoded product media,
horizontal overflow, section navigation, evidence drawer, Escape and focus
return, evidence deep link, research index entry, and JavaScript-disabled
reading. Screenshots and operational logs stay outside the repository.

Local publication acceptance on 2026-10-01: 157 Python and 244 Node tests passed;
the full build contains 1779 releases and 24 agents; deployment data verification
passed. The read-only analysis gate selected zero work, with zero model-stale
and zero deterministic no-signal releases. This is a topic-only publication,
using the existing daily data snapshot; it does not claim a new upstream scan.

Before the attempted deployment, both production hosts and local dist had the
same manifest SHA-256:
`986313a327c4ee0a63437fab7a47b123722f39320fda3f8c78311ec81433323f`.
The initial production command was rejected before execution because deployment
had not yet been explicitly authorized. The user subsequently requested
deployment, and the release below completed. Existing unrelated `artifacts/`
remain untouched.

### Authorized Production Release

On 2026-10-01, `npm run deploy` rebuilt all 1779 releases / 24 agents, passed
deployment data verification, and uploaded the seven changed topic assets.
Wrangler Version ID: `347b3bfe-2f11-4ee0-ae92-6024863b5fea`.
The deployed research commit is `c8588b5b`.

- Article: https://agentlab.dairui1.com/capabilities/oar
- Full tests were rerun: 157 Python and 244 Node tests passed.
- At 11:56:15 UTC, all 15 assets checked by `verify_live.mjs` matched local
  dist on both workers.dev and the custom domain, including the manifest,
  article, evidence, probe receipt, styles, navigation and product image.
- The manifest hash remains the value above: the topic publication did not
  replace or roll back the existing daily snapshot. Source metadata remains
  fresh/current, with zero warnings and no retained agents.
- The production Playwright run passed all five viewport/theme combinations,
  evidence drawer and focus return, deep link, index entry and no-JS reading.
  Desktop and mobile screenshots were visually reviewed.
- The post-deploy analyzer dry run inspected 1779 releases with zero
  model-stale, zero deterministic no-signal and zero selected work. No analyzer
  calls, analyzer-failure fallback, or new upstream scan occurred in this run.
- The scheduled daily pipeline had already completed successfully at 08:47:24
  Asia/Shanghai; launchd reported last exit code 0 and no active run. No daily
  recovery was needed for this topic-only deployment.

Remote CI is separate evidence: the pinned commit's CI run
`36749798809` has 12 successful jobs (three OS checks and nine behavior jobs).
The latter use Claude/Codex/Pi harnesses with scripted model providers. Those
jobs and their possible backend skips are not local seven-runtime or real-model
reproduction.
