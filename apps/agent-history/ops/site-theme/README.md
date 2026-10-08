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
