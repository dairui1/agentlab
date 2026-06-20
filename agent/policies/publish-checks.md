# Publish checks

Before a research update is committed and pushed, the agent should run the
smallest verification set that matches the change.

## Research or documentation changes

```bash
make generated
make validate
make test
cd site && npm run check
cd site && npm run build
```

Run docs stats when the update changes site body content meaningfully:

```bash
python3 scripts/docs_stats.py --min-cjk 50000 --min-agent-pages 5
```

## Source sync changes

```bash
make sync-sources
git diff -- generated/source-sync-manifest.json
```

Only commit generated manifests or reviewable reports. Do not commit
`research/sources/cache/`.

## Commit rules

- Commit related research changes together.
- Include generated indexes when they changed.
- Push only after validation passes or clearly document the failed check.

