# dquickts Publication Checks

Checked on 2026-10-24. Research evidence remains dated 2026-10-23 and pinned to the versions named in the article.

## Build And Tests

- Python: 170 tests passed.
- Node: 372 tests passed, including the new article, attachment hashes, receipt boundaries and safe catalog return.
- Full build: 2,039 releases for 28 agents; deployment data verification passed.
- Recent analysis gate: 82 releases inspected, zero model-stale, zero deterministic no-signal, zero selected. No model analysis or failure fallback was run for this publication.
- Research data remains a fixed experiment record. Site tests do not rerun the upstream interpreters, benchmarks or model tasks.

## Browser Coverage

Use an existing Playwright installation on the Node module search path:

```sh
NODE_PATH=/path/to/node_modules DQUICKTS_ROUTE_SMOKE=1 node ops/dquickts/verify_ui.cjs local /private/tmp/agentlab-dquickts-ui-final
node ops/dquickts/verify_live.mjs /path/to/local/live-receipt.json
```

The local audit creates a temporary HTTP server, closes it on completion, and uses a clean headless browser profile. It does not use a signed-in browser.

- Article: 1440/light, 1024/dark, 390/light, 320/light and 390/dark, with reduced motion. All 11 sections checked for page overflow; top, performance, reproduction and footer screenshots retained per case.
- Catalog search opens the independent article; returning preserves filters and rejects foreign return targets.
- Evidence deep link, all article attachments, compatibility alias and the complete no-JavaScript article were checked.
- Route inventory: 96 routes, each smoke-tested at 1440 and 390, for 192 navigations. All main responses were HTTP 200 with no JavaScript page errors. This is render/navigation coverage, not a replay of every pre-existing interactive workflow.
- Screenshots and machine-readable results: `/private/tmp/agentlab-dquickts-ui-final/`. The desktop/mobile article, performance comparison and narrow reproduction section were visually inspected.

One unrelated existing detail route, `/capabilities?study=token-budget-context`, reports a 391px document width in a 390px viewport. A pre-publication check against production reproduced that same 1px overflow. It was left unchanged; the new article has no page-level horizontal overflow. Long tables and code use local scroll containers.

The first browser probe overlapped asset regeneration and failed image decoding. It was rerun only after the complete build, and the final article/route audit passed the stated checks. Chromium required approved execution outside the filesystem sandbox for its macOS process bootstrap.

## Publication Boundary

Only the new article, original experiment code, curated public receipts, catalog/navigation integration and related tests are published. Raw terminal transcripts, compiler diagnostics, private archives, downloaded upstream repositories and document caches are excluded. Unrelated local `artifacts/` work is not staged.

The live verifier compares the manifest, article, evidence, attachments and integration assets byte-for-byte with local `dist` on both production domains. Its generated receipt is local operational output, not a claim that interpreter experiments have been repeated in production.

## Deployment Receipt

- Content commit: `310ee02d50b16436f0c5437ee62818c804aef964`, pushed to `main`.
- Cloudflare Version ID: `25138741-1447-4ff7-a0ec-b241ff2f4544`.
- Verified 2026-10-24: all 21 checked assets match local `dist` on both production domains, including the canonical manifest. Manifest SHA-256: `c1ea264a93ebe7355579bbb1979a365c7336e012b55eacec538cc6adea9e8a4f`.
- Live byte receipt: `.codex-research/dquickts-publication-live.json` at repository root, excluded from commits.
- Live browser: the same five responsive/theme cases, filtered catalog return, evidence deep link, attachments, alias and no-JavaScript reading passed against the custom production domain. Screenshots and the receipt are in `/private/tmp/agentlab-dquickts-ui-live-final/`.
- The live catalog check must wait for `researchApp` to finish asynchronous initialization after returning from the article. Reading its input immediately after navigation produced a false failure; the audit now waits for the explicit ready state.
- GitHub reported 13 dependency security alerts during push: 4 high, 6 moderate, 3 low. They were not investigated or remediated in this article publication, and no dependency versions changed.
