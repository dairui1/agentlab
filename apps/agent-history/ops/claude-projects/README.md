# Claude Projects Study

This is research publication, not an implementation or independent execution of Claude Projects.

## Authored Sources

- `public/capabilities/claude-projects.html`: Chinese mechanism study and tool explorer.
- `public/capabilities/claude-projects-blueprint.md`: canonical original implementation design, with 34 acceptance requirements. They are not results of executed Projects tests.
- `public/capabilities/claude-projects-sources.json`: two immutable upstream revisions, file hashes, 40 evidence records and 7 open questions.
- `public/capabilities/claude-projects-tools.json`: all 63 coordinator entries plus separately scoped worker references. Tool stages and modules are original editorial classifications.

`build_claude_projects_blueprint.mjs` uses the pinned build-only `marked` parser to render the canonical Markdown to an ignored static HTML file. Raw HTML and non-HTTPS link schemes are rejected. `stage:guides`, `pretest`, and `build` stage this file; do not edit or commit the generated blueprint HTML. The standard research-guide builder generates the tracked compatibility alias.

The two upstream trees have no identified LICENSE/COPYING at the pinned revisions. Publication contains original summaries, factual interface identifiers and original proposals, not a full redistribution of their Markdown or prompts. Personal instance identifiers are excluded. Do not commit the upstream cache.

## Verify

From `apps/agent-history`:

```sh
node scripts/verify_claude_projects_sources.mjs --fetch
# Or, after acquiring the exact upstream files:
node scripts/verify_claude_projects_sources.mjs --source-dir .cache/research/claude-projects
npm test
npm run build
python3 scripts/verify_deploy.py
```

The local source directory contains `pstack-findings.md` and `tool-reference.md`. The verifier checks immutable pins, hashes, line counts, all evidence links, Markdown reference definitions, and full coordinator heading coverage. It cannot establish that an upstream runtime follows its descriptions.

The UI audit uses Playwright provided by the host tooling, not a production dependency. Set `NODE_PATH` to that runtime's `node_modules` when necessary.

```sh
python3 -m http.server 4399 --bind 127.0.0.1 --directory public
node ops/claude-projects/verify_ui.cjs http://127.0.0.1:4399 /private/tmp/agentlab-claude-projects-ui
```

Coverage: 1440/1024/390/320 widths, light/dark, article and blueprint, image decode, page overflow, evidence labels/links/focus/Escape, search/group/stage, filter reload, tool/evidence deep links, catalog route, disabled error state, and no-JS reading. Screenshots and results stay outside Git.

After an authorized production deployment:

```sh
node ops/claude-projects/verify_live.mjs /private/tmp/agentlab-claude-projects-live.json
node ops/claude-projects/verify_ui.cjs https://agentlab.dairui1.com /private/tmp/agentlab-claude-projects-live-ui
```

The live script checks exact built bytes for 13 paths on both production domains, including the canonical feed manifest. A successful page audit does not validate actual model, cloud runner, device, permission, or crash-recovery behavior.

## Dependency Scope

The added parser is `marked@18.1.1` (MIT), used only during builds; the browser receives static HTML. Installation audit reported four high-severity entries in the existing Wrangler/Miniflare/sharp/undici development chain and none for marked. No unrelated dependency upgrade or forced audit fix was performed. This is a point-in-time audit observation, not a standing security guarantee.
