# AgentLab Agent-Native App

This app uses Builder.io's `@agent-native/core` directly. Keep it as a control
plane for AgentLab actions; do not duplicate public documentation content here.

## Boundaries

- Durable content lives in `research/`, `data/`, `generated/`, and `site/`.
- This app exposes actions that operate on those files.
- Do not store credentials, private prompts, leaked source, source maps, or local
  source caches in Git.
- Run `npm run typecheck` from this directory after editing actions.

