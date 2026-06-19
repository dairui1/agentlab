# Pi Architecture

## Snapshot

- Agent: Pi
- Owner: Earendil Works / Mario Zechner
- Category: coding agent
- Last updated: 2026-06-19
- Evidence level: official repository and public package metadata

## Product Surface

Pi is tracked as an open-source terminal coding agent and agent toolkit. The current official repository is `earendil-works/pi`; earlier public locations included Mario Zechner's `badlogic/pi-mono` and the deprecated `@mariozechner/pi-coding-agent` package.

The public surface includes:

- `@earendil-works/pi-coding-agent`: interactive terminal coding agent.
- `@earendil-works/pi-agent-core`: agent loop, tool calling, state management.
- `@earendil-works/pi-ai`: multi-provider LLM API.
- `pi.dev`: product documentation and install surface.

## Agent Loop

Research target:

- how Pi keeps the core loop small and observable
- how tools, state, sessions, and TUI rendering are layered
- how provider abstraction is separated from coding-agent behavior
- how extensions hook into the harness without forking internals

## Prompt Contract

Track public or user-owned snapshots under `research/prompts/pi/versions`.

Priority fields to extract:

- default system prompt and `SYSTEM.md` override/append behavior
- `AGENTS.md` project instruction loading
- skill and prompt-template resolution
- extension-provided context and tool descriptions
- migration changes from the old Mario package to Earendil Works

## Context Strategy

Open questions:

- how Pi builds context from project files, instructions, skills, and session state
- which files are loaded automatically versus requested by the model
- how context visibility differs from Claude Code sub-agents and Codex tasks
- how users can inspect or replace the default prompt surface

## Tool Model

Open questions:

- how built-in tools are represented in TypeScript
- how extension tools are registered and permissioned
- how shell, file edits, provider calls, and session operations are separated
- how Pi's tool surface compares with OpenCode's config-first model

## Permission Model

Open questions:

- which operations require confirmation
- how Pi scopes file-system and shell access
- how project instructions influence permission defaults
- whether extensions can introduce higher-risk tools and how they should be audited

## Next Research Tasks

- Review `packages/coding-agent` and `packages/agent-core` in the synced source cache.
- Build a map of Pi extension points: extensions, skills, prompt templates, themes.
- Capture the current npm package metadata and old-to-new rename history.
- Compare Pi's minimal harness philosophy with Codex's sandbox/approval model and OpenCode's provider/config architecture.
