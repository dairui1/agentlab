# Viewport-Safe Menus And Reading Scroll Boundaries

Scope: shared research/theme menus, Code Mode directory, and evidence reading
panels. Preserve all four palettes, article text, pinned evidence, assets, and
the current full production dataset. This is a UI-only release, not a new
upstream synchronization or model-analysis run.

## Decision

The useful lesson from [good-css](https://good-css.com/) is to let the browser
own positioning and scrolling, rather than to replace a working visual system.
The existing feed filters already use native popovers and isolated scrolling.
Extend that pattern to the shared menus and bounded reading panels.

The initial browser probe found the research menu ending at 766px in a 740px
viewport, and at 737px in a 390px-high landscape viewport. A wheel gesture at
the Code Mode directory's end also moved the document from 500px to 525px.

- Native manual popovers enter the top layer, use CSS anchors when available,
  and retain existing keyboard, outside-click, and focus-return behavior.
- Menus have viewport-relative height limits and internal scrolling. Short
  viewports and browsers without anchor positioning use a centered fallback;
  browsers without the Popover API keep the inline/fixed CSS fallback.
- Root and reading-panel gutters stabilize width when scrollbars appear.
- Fixed drawers always isolate vertical scrolling. Desktop sticky rails only
  isolate while overflowing, using a state-only scroll timeline. Unsupported
  browsers retain their original desktop scroll chaining. Nonoverflowing rails,
  ordinary mobile directories, and horizontal rails do not trap page scrolling.

References: [bounded scroll areas](https://good-css.com/#scroll-area-between-a-fixed-header-and-footer),
[overflow-only styles](https://good-css.com/#styles-that-apply-only-when-a-scroller-overflows),
[popover positioning](https://good-css.com/#popover-anchored-to-its-trigger).

## Verification

From `apps/agent-history`, with Playwright available on `NODE_PATH`:

```sh
node ops/good-css/verify_ui.cjs http://127.0.0.1:8772 /private/tmp/agentlab-good-css-accepted
node ops/site-theme/verify_ui.cjs http://127.0.0.1:8772 /private/tmp/agentlab-good-css-theme-regression
node ops/code-mode/verify_ui.cjs http://127.0.0.1:8772 /private/tmp/agentlab-good-css-code-mode
SITE_THEME_PRESETS=ink SITE_THEME_EDITORS=0 node ops/site-theme/verify_site.cjs http://127.0.0.1:8772 /private/tmp/agentlab-good-css-site-accepted
```

The new suite covers four presets, two explicit modes, five viewport sizes,
native and no-Popover paths, all 17 menu destinations, exact-end wheel gestures,
evidence geometry, and nonoverflowing/no-JavaScript directories. Anchor-free
native positioning is simulated by removing only the CSS anchor enhancement
rules, not by claiming a modern browser is an old one.

Earlier failed receipts remain separate. One probe used an ineffective Chromium
feature flag to disable anchors; another clicked a heading covered by the open
theme panel. The full-page verifier initially mistook the continuously active,
state-only boundary timeline for a moving transition. Its settling check now
excludes only that named animation; runtime, resource, contrast, and geometry
checks remain unchanged.

Screenshot review found no menu-containment defect. Topic grouping, metadata
hierarchy, and dark-mode logo treatment were suggestions outside this change;
the existing content and original assets remain untouched. Automated browser
coverage is Chromium, not physical Android/iOS or a full Safari/Firefox matrix.

## Accepted Checks

- `npm test`: 163 Python and 319 Node tests passed.
- Full local-data build and deployment-data validation passed for 1,850 releases
  and 24 Agents; the manifest stayed byte-identical to the pre-task baseline.
- The exact recent-release AI dry-run inspected 72 entries with no stale,
  deterministic no-signal, or selected work. No model analysis was rerun.
- The existing theme suite passed 36 cases plus storage and six no-JS checks.
- The new suite passed 80 menu cases, exact-end and nonoverflowing rail gestures,
  stable evidence geometry, no-JS reading, and ten simulated anchor-free bounds.
- The existing Code Mode suite passed all 23 nodes and its desktop/mobile
  directory, diagrams, evidence, deep-link, and no-JS workflows.
- The full-page Ink light/dark matrix passed 112/112 cases, 12,896 text samples,
  and 722 image decodes with no runtime, resource, contrast, or geometry errors.
  Native Monaco editor palette switching was outside this layout-only matrix.

## Production

Published runtime commit: `11fcd1aaaaf7fca91a8d6a340d5dece0daf1f9b1`.
Cloudflare version: `82e2c981-614a-4899-a743-63ebc11373c9`.

Both production domains passed 97/97 exact-byte comparisons, including all
entry HTML, root styles/scripts, manifest, local icons, fonts, and source media.
Receipt: `/private/tmp/agentlab-good-css-live-bytes.json`.

The accepted production browser run passed eight Ink/Terminal light/dark menu
cases at 320px portrait and 844px landscape, plus desktop/mobile reading
gestures, evidence geometry, no-JS reading, and anchor-free positioning.
Receipt: `/private/tmp/agentlab-good-css-production-accepted/results.json`.
Native in-app browser opening and Escape dismissal were also verified.

An earlier production attempt failed the expected native-popover-state assertion.
A normal-URL script read and a focused same-size browser probe then confirmed
the current script and open native popover; the unchanged suite passed on retry.
The earlier receipt remains in `/private/tmp/agentlab-good-css-production/`.
The cause of that first observation was not established; do not infer a cache
diagnosis or report zero failures across all attempts.
