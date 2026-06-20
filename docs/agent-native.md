# Agent-native AgentLab

AgentLab should be maintained by agents as a first-class workflow, not just read
by agents as a document site. The project therefore defines repository actions
that can later be exposed through CLI, MCP, scheduled jobs, and UI controls.

The initial protocol lives in `agent/`:

- `agent/actions/`: stable action contracts.
- `agent/jobs/`: multi-step workflows.
- `agent/policies/`: source and publishing guardrails.
- `agent/traces/`: trace format for long-running work.

The near-term goal is to wrap existing scripts instead of replacing them:

- `scripts/new_research_topic.py` becomes `create-research-topic`.
- `scripts/sync_sources.py` becomes `sync-agent-sources`.
- `make generated`, `make validate`, `make test`, and site build become
  `publish-research-page`.

This keeps Git and Markdown as the durable source of truth while giving agents a
typed operating surface.

