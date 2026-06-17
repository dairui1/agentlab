# Codex Architecture

## Snapshot

- Agent: Codex
- Owner: OpenAI
- Category: coding agent
- Last updated: 2026-06-17
- Evidence level: todo

## Product Surface

Codex is tracked as a coding agent with local development workflows, repository inspection, command execution, file editing, and GitHub-oriented handoff as primary research areas.

## Agent Loop

Research target:

- how task context is gathered from files, terminal output, tools, and user messages
- how plan, edit, verify, and final response phases are separated
- how resumes or context compaction affect continuity

## Prompt Contract

Track public or user-owned snapshots under `research/prompts/codex/versions`.

Priority fields to extract:

- coding-agent persona and communication rules
- patch editing constraints
- tool and browsing policy
- frontend verification expectations
- GitHub and PR workflow constraints

## Context Strategy

Open questions:

- how workspace roots are identified
- how tool outputs are summarized or truncated
- how persistent skills, plugins, and connector state enter the prompt

## Tool Model

Open questions:

- shell/file editing APIs
- browser and Chrome automation boundaries
- GitHub connector capabilities
- MCP and skill discovery behavior

## Permission Model

Open questions:

- sandbox and approval policy representation
- destructive command restrictions
- network and filesystem permissions

## Next Research Tasks

- Add official source links.
- Capture one prompt snapshot with source metadata.
- Compare tool-use instructions with Claude Code and OpenCode.
