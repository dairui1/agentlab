# OpenCode Architecture

## Snapshot

- Agent: OpenCode
- Owner: open source community
- Category: coding agent
- Last updated: 2026-06-17
- Evidence level: todo

## Product Surface

OpenCode is tracked as an open-source coding agent. Its implementation can be inspected directly once the target repository and version are pinned.

## Agent Loop

Research target:

- where the agent loop is implemented
- how it plans, edits, executes commands, and observes results
- how model adapters and tools are composed

## Prompt Contract

Track public repository prompt files or user-owned snapshots under `research/prompts/opencode/versions`.

Priority fields to extract:

- prompt template files
- tool schemas
- model provider instructions
- safety and command execution rules

## Context Strategy

Open questions:

- how files are selected
- how diffs and command results are summarized
- whether memory or project instructions are supported

## Tool Model

Open questions:

- shell execution model
- file edit API
- language server or search integration
- plugin or extension system

## Permission Model

Open questions:

- confirmation flow for commands
- sandboxing strategy
- provider-specific constraints

## Next Research Tasks

- Pin the repository URL and version.
- Locate prompt templates and tool schema definitions.
- Compare implementation choices with Codex and Claude Code.
