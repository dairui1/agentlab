# Research Map

## Phase 1: Knowledge Base

| Area | Output | Status |
| --- | --- | --- |
| Agent catalog | `data/agents.json` | started |
| Prompt source policy | `data/prompt_sources.json` | started |
| Architecture notes | `research/agents/*/architecture.md` | started |
| Prompt changelogs | `research/prompts/*/CHANGELOG.md` | started |
| Local CLI | `src/agentlab` | started |

## Phase 2: Comparison Framework

| Topic | Questions |
| --- | --- |
| Context ingestion | How does each agent read files, diffs, search results, browser state, and memory? |
| Tool protocol | What tools exist, how are they described, and what constraints are attached? |
| Planning loop | Is planning explicit, hidden, configurable, or delegated to sub-agents? |
| Permissions | Which operations require user confirmation or sandboxing? |
| Prompt evolution | Which instructions are stable, removed, or newly introduced across versions? |
| UX contract | What does the product promise to the user, and how does the agent enforce it? |

## Phase 3: Website

The future website should treat this repository as the source of truth:

- `data/agents.json` for navigation and comparison cards.
- `research/agents/*/architecture.md` for long-form pages.
- `research/prompts/*/CHANGELOG.md` for prompt history.
- Generated diff pages for prompt snapshots.

Avoid coupling the research model to a frontend framework until the content shape is stable.
