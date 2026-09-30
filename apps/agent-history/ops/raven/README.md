# Raven Publication Checks

The research article pins `EverMind-AI/Raven` at
`e6c0344cb7ce00db25d554e4bb671ec1909a8f9f`. The source-only feed tracks software
releases independently; `tech-report-v1` is not a software version. No command
below installs Raven, invokes its models, or reproduces its benchmarks.

Run from `apps/agent-history`:

```sh
node scripts/verify_raven_sources.mjs --source-tree /path/to/Raven --report /path/to/technical-report.pdf
node --test tests/raven.test.js
npm test
npm run build
python3 scripts/verify_deploy.py
```

`verify_raven_sources.mjs --fetch` can instead verify the fixed public sources.
It checks file hashes, line ranges, literal HTML code excerpts, report bytes,
and the published product mark. A source failure is fatal, not a verified cache.

The browser checks require an existing Playwright runtime. Set `NODE_PATH` to
its package directory if Playwright is not on the normal Node resolution path.
Screenshots and JSON receipts go outside the repository by default.

```sh
node ops/raven/verify_ui.cjs http://127.0.0.1:4397 /tmp/raven-ui
node ops/raven/verify_catalog.cjs http://127.0.0.1:4397 /tmp/raven-catalog
node ops/raven/verify_live.mjs /tmp/raven-live-hashes.json
```

- UI: 1440, 1024, 390 and 320 px; light and dark; top, middle and bottom;
  evidence drawer, Escape, focus restoration, index entry and evidence deep link.
- Catalog: desktop and mobile feed filters, ten static source files, immutable
  source links, software version switching and unavailable runtime evidence.
- Live: compare local `dist` against both production hosts with cache-busting
  requests; require fresh/current official sources and zero warnings.

After deployment, run both browser scripts again with
`https://agentlab.dairui1.com`. Test passes describe AgentLab publication only,
not Raven runtime effectiveness or safety.
