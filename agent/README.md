# Agent-native protocol

AgentLab treats repository operations as stable actions instead of one-off shell
commands. The goal is to let humans, CLI scripts, scheduled jobs, MCP tools, and
future UI controls share the same research workflow.

This layer is inspired by Builder.io's agent-native architecture, but it keeps
AgentLab repo-native: Markdown, JSON, scripts, generated reports, and Git remain
the source of truth.

## Directories

```text
agent/
  actions/    # Action contracts agents can execute or wrap.
  jobs/       # Scheduled or event-driven compositions of actions.
  policies/   # Guardrails that actions must respect.
  traces/     # Runtime trace format and generated trace location.
```

## Design rules

1. Define the action before adding a new automation entry point.
2. Keep hand-written research in `research/` and public pages in `site/`.
3. Keep generated outputs in `generated/` unless they are local-only caches.
4. Record sources, commands, validation, and publish status for every research run.
5. Treat leaked, private, credential-like, or account-bound material as out of scope.

