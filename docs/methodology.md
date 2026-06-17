# Methodology

## Evidence Levels

Use these labels in research notes:

- `source`: directly supported by an official doc, public repo, release note, or captured artifact.
- `observed`: based on repeated product behavior visible to the researcher.
- `inferred`: likely true based on public behavior or implementation details, but not directly confirmed.
- `todo`: needs verification.

## Prompt Snapshot Rules

Each prompt snapshot should include:

- agent name
- version or date
- source URL or capture method
- access date
- scope of captured content
- raw prompt text if allowed
- notes about omitted private or sensitive content

Use:

```bash
python -m agentlab new-snapshot claude-code 2026-06-17 --source-url https://example.com/source
```

Then update the matching `CHANGELOG.md` with a short summary of the change.

## Architecture Note Rules

Every architecture page should separate:

- user-facing product surface
- agent loop
- model and prompt contract
- tool and permission model
- context strategy
- persistence and memory
- open questions

When uncertain, write the claim under `Open Questions` instead of presenting it as fact.
