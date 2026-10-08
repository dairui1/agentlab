# Theme And Code Mode Review

Scope: shared appearance preferences on all 22 HTML entry pages; structural
and editorial changes only on the Code Mode article. Research data, pinned
evidence, and the 23-node reading tree remain intact.

Direction: a restrained technical publication. Remove duplicate navigation
numbering and promotional-looking containers; retain the real reading and
evidence controls. Adapt OINK v1.2.0 palettes and local fonts without importing
its Hugo/Bootstrap runtime. Default to Ink, with independent system/light/dark.

## Visual Review

Two independent screenshot reviews used the same brief and desktop/mobile
entry, Codex diagram, and mobile-tree states.

- Removed the example box, repeated overview numbering, and redundant mobile
  breadcrumb. Shortened the overview and restored paragraph hierarchy.
- Evidence buttons now have readable foreground text and a file icon.
- Diagram lanes are unfilled; Codex stages name the handoff separately from
  the longer explanation. Arrows follow the existing state-specific edges,
  rather than inventing traffic while tools are waiting.
- Added small order markers to the four-step comparison and tightened the
  Codex paragraph that left a two-character final line on desktop.
- More elaborate diagram connectors remain a possible editorial refinement;
  no mechanism or runtime claim was changed to satisfy a visual preference.

## Checks

- `npm test`: 163 Python tests and 273 Node tests passed.
- Static distribution build: `node scripts/build_dist.mjs` passed. No source
  synchronization or analysis rebuild was needed for this UI change.
- Existing Code Mode browser suite: all 23 nodes, four diagrams, stable tab
  heights, evidence dialog, mobile focus trapping, history/deep links, and
  no-JavaScript reading passed at 1440/390/320px and light/dark.
- New theme browser suite: 36 preset/mode/viewport cases passed, including
  opposite-OS explicit modes, reload/prepaint, main/catalog routes, native
  radio labels, keyboard dismissal, blocked storage, cross-tab updates, and
  no-JavaScript fallbacks. No runtime or resource errors.
- A separate 320px check visited all 22 entry pages in Ink and Terminal with
  explicit light mode on a dark OS: no overflow or missing theme controls.
- Native in-app browser switching to Terminal/dark and back to Ink/system
  was also verified. Automated browser coverage is Chromium-only.

Browser test artifacts are in `/private/tmp/agentlab-code-mode-final/` and
`/private/tmp/agentlab-theme-ui/`. No production deployment was performed.

Run the theme suite with Playwright available to Node:

```sh
node ops/site-theme/verify_ui.cjs http://127.0.0.1:8766 /private/tmp/agentlab-theme-ui
```

## Full-Site Verification

The 2026-10-08 follow-up expands coverage beyond the earlier Code Mode review.
The initial narrow dark-mode probe caught a left-anchored MiMo mobile popover;
native-switch editor checks caught low-contrast missing-source text. A separate
Lucide CDN failure produced visibly blank icon-only controls. These failures are
retained in the probe artifacts rather than treated as a successful full run.

After the scoped fixes and restored original cover backing, the frozen local
browser matrix passed all 432 page cases and 32 live native-switch editor cases.
It checked 46,621 rendered-text
contrast samples and 2,856 image decodes with no runtime, resource, icon, palette,
layout, contrast, or editor errors. Shared theme/editor/entry source hashes were
unchanged during the run. The accepted automated receipt and 1,064 screenshots
are in `/private/tmp/agentlab-site-theme-release/`. The earlier 308-case stopped
probe, complete 428/432 failed matrix, and pre-cover-fix passing matrix remain in
their original directories.

The follow-up full regression run passed 449 tests: 163 Python and 286 Node.
`npm run build` passed with 1,850 releases and 24 agents; deployment validation
covered all 24 agents and 93/93 local distribution byte checks. These are build
checks, not a claim that the follow-up release has been published.

Independent visual inspection covered all four presets, desktop/mobile critical
routes, actual original cover/Raft image pixels, mechanism evidence drawers, and
computed comparison editors. It found no text/control collisions; generic GPT
entry captures can precede lazy tokenization, while the native editor captures
explicitly wait for computed diffs. Six bracket-color levels are checked through
actual editor color variables, not inferred from screenshots with fewer levels.
The original cover backing was restored without changing SVG bytes. All 16 cover
captures across four presets, light/dark, and desktop/mobile show the black curve
and white steps clearly, with no cropping or collision and readable source credit.
Bitmap/illustration text remains outside the DOM contrast scan; visual sampling
does not establish every image pixel's contrast or physical-device behavior.

From `apps/agent-history`, with Playwright on `NODE_PATH`, run:

```sh
node ops/site-theme/verify_site.cjs http://127.0.0.1:8766 /private/tmp/agentlab-site-theme-ui
```

The suite discovers all public HTML pages and checks four presets plus both
explicit modes against the opposite OS preference at 1440px and 320px. Ten
representative routes also run at 390px. It checks actual palette colors, primary
content, images, visible canvas pixels, keyboard/theme dialogs, and overflow.
Rendered text contrast is sampled at the top, middle, bottom, and representative
evidence/filter dialogs. Screenshots cover every entry plus legacy deep content.
Main comparison and GPT Prompt editors additionally switch all eight palette/mode
combinations through native controls at desktop/mobile sizes, validating actual
Monaco code backgrounds, semantic diff/selection colors, and IBM Plex Mono fonts.

Text contrast uses AA thresholds of 4.5:1, or 3:1 for large text, against
composited ancestor background colors. Disabled controls are counted separately.
Explicitly accessibility-hidden decorative separators are logged as exempt; this
does not exempt ordinary text inside an accessibility-hidden simulation.
Text over images or gradients is retained in `samples[].uncertain` for visual
review: a solid-color DOM estimate does not establish its actual contrast.
External resource failures are reported rather than hidden, and any reported
issue fails the run. `results.json` preserves each case and its diagnostics.

Focused reruns accept comma-separated `SITE_THEME_ROUTES`,
`SITE_THEME_PRESETS`, `SITE_THEME_MODES`, and `SITE_THEME_WIDTHS`. Automated
editor checks can be omitted during a layout-only probe with `SITE_THEME_EDITORS=0`.
Explicit route filters also enable the requested routes at 390px. Automated
coverage remains Chromium-only and does not establish research-claim correctness.
