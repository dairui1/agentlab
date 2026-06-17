# Claude Code Architecture

## Snapshot

- Agent: Claude Code
- Owner: Anthropic
- Category: coding agent
- Last updated: 2026-06-17
- Evidence level: todo

## Product Surface

Claude Code is tracked here as `cc`. The current working assumption is that `cc` means Anthropic Claude Code. If this repository later needs to track another `cc`, rename the slug and aliases in `data/agents.json`.

## Agent Loop

Research target:

- how the agent plans repository work
- how it inspects files and command output
- how it decides when to edit, test, and summarize
- how it handles long-running tasks and user interruptions

## Prompt Contract

Track public or user-owned snapshots under `research/prompts/claude-code/versions`.

Priority fields to extract:

- system identity and role framing
- file editing rules
- tool use rules
- user communication style
- safety and permission constraints

## Context Strategy

Open questions:

- how repository files are selected for context
- whether memory is local, session-scoped, or account-scoped
- how command output and tool results are summarized

## Tool Model

Open questions:

- shell and file editing boundaries
- browser or web search integration
- MCP/tool extension points
- test and verification expectations

## Permission Model

Open questions:

- which commands require approval
- how sandbox modes are represented to the model
- how destructive operations are constrained

## Next Research Tasks

- Add official source links.
- Create first prompt snapshot entry.
- Compare prompt wording against Codex and OpenCode.
