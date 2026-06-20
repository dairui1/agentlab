# Agent traces

This directory documents the trace format for future automated runs. Generated
trace files may live here or under `research/runs/{slug}/trace.md` depending on
the workflow.

## Minimal trace

```yaml
run_id: 2026-06-20-example
actor: codex
job: research-to-publish
topic_slug: example-topic
started_at: 2026-06-20T00:00:00+08:00
ended_at: null
actions:
  - id: create-research-topic
    status: completed
    outputs:
      - research/runs/example-topic/state.md
  - id: collect-research-sources
    status: in_progress
sources:
  official: []
  primary_observation: []
  secondary: []
validation:
  generated: not_run
  validate: not_run
  tests: not_run
  site_check: not_run
  site_build: not_run
publish:
  commit: null
  pushed: false
```

