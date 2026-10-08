# Filter Usability Review

2026-10-09. Scope: feed filtering, research/evidence search, mechanism collection
search, and touch version selection. Keep the four existing themes, research
content, source evidence, desktop density, and URL-backed filter state.

## Why This Change

[good-css](https://good-css.com/) recommends readable input text, real focus
outlines, appropriately sized touch targets, and a constrained panel whose middle
scrolls. These fix existing high-frequency actions without a visual redesign or
a new dependency. Its viewport-scaled typography and wholesale reset do not fit
this workbench's existing design rules.

The baseline browser probe found 11px feed search text and no visible outline
on the research search wrapper. At 320x300, the feed panel began at y=212 and its
list at y=305: none of the options appeared in the viewport. The parent and list
also had independent height budgets, so the list extended beyond its clipped
parent. This was reproduced in Chromium, not on a physical iPhone.

## Implementation

- Touch search/select text is at least 16px; editable fields, filter rows, reset,
  close, swap, and collection facet controls have 44px targets. Header icon hit
  areas extend into the existing 8px gaps without changing their layout.
- Research, collection, and feed search wrappers have a real focus outline,
  including forced-colors mode. Zoom remains enabled.
- The feed panel is a flex column with a nonshrinking header/search and one
  scrollable option list. Native popovers use CSS anchors and flip when needed;
  short viewports use a centered bounded panel. Browsers without the API retain
  the existing menu behavior and a short-screen fixed-panel fallback.
- Explicit anchor names avoid depending on the newer `showPopover({source})`
  option. Clear and close are separate controls; both keep existing filter state
  and focus restoration behavior. No animation was added.

## Acceptance

- `npm test`: 163 Python and 311 Node tests passed.
- `npm run build`: passed, with 1,850 releases and 24 Agents.
- `python3 scripts/verify_deploy.py`: passed for all 24 Agents.
- Recent analysis dry-run: 72 inspected, zero model-stale, no-signal, or selected.
- Route matrix: 424/424 passed across 53 routes, 1440/1024/390/320px, Ink light/dark.
  It covers every HTML entry, study query, mechanism entry, and comparison.
  1,208 screenshots, 2,416 image checks, and 1,272 geometry checks; runtime,
  resource, image, readiness, and overflow checks passed. Source hashes were stable.
- Control matrix: 36/36 passed. It tests native, API-disabled, and source-ignored
  popovers; 300px/360px short screens; keyboard selection/dismissal; focus return;
  list-end background scroll containment; URL state; no results; and forced colors.
  Catalog/evidence search, all three collection searches, and comparison run in
  both modes at desktop/tablet/phone sizes.
- Existing theme controls: 36/36 passed, including storage synchronization,
  blocked storage, and six no-JavaScript fallbacks.

Local receipts are in `/private/tmp/agentlab-filter-routes-polished/`,
`/private/tmp/agentlab-filter-controls-polished/`, and
`/private/tmp/agentlab-filter-theme-regression/`. Earlier diagnostic runs are
retained separately. Their failures were test setup errors: scheduled focus had
not settled, hidden duplicate fields were selected, an archive was not opened,
or a collection view was not selected. They are not accepted runs.

Run from `apps/agent-history` with Playwright available through `NODE_PATH`:

```sh
node ops/filter-ux/verify_routes.cjs http://127.0.0.1:8771 /private/tmp/filter-routes
node ops/filter-ux/verify_controls.cjs http://127.0.0.1:8771 /private/tmp/filter-controls
node ops/filter-ux/verify_live.cjs /private/tmp/filter-production-bytes.json
```

These are Chromium-emulated checks. The 1024px case has desktop layout and coarse
touch input, not simultaneous physical mouse/touch hardware. No physical iOS
keyboard, Safari, or old WebView execution is claimed. Source synchronization
and historical model reanalysis are outside this UI change.

Two independent screenshot reviews found no Agent-picker label collisions,
including the 320x300 state. The redundant colored focus border/shadow was
removed, retaining the accessible outline. The existing catalog feature remains
ahead of its filters; moving search/results higher is a separate layout decision.
The collection tabs keep their existing native horizontal scroll. A follow-up
390/320px probe checked all five modes, Home/End, both arrow keys, and last-tab
clicking: selected labels remain fully visible. Initial clipped-tab geometry is
identical to the previous CSS; an additional overflow cue remains optional.
