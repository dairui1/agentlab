# Agent History daily automation

The pipeline uses our own Python code, Git CLI operations, and normalized
official-source fetches. It does not copy Phistory's application source into
this repository. The upstream checkout is a shallow, blob-filtered sparse cache
at `.cache/phistory/upstream`; the complete `captures` tree is materialized so
new Phistory agents join the pipeline without another allowlist change. Official release notes and bounded code-change overviews are
cached separately under `.cache/official-sources`.

## Manual verification

From `apps/agent-history`, inspect the full command sequence without changing
anything:

```sh
python3 scripts/daily_update.py --dry-run
```

Run a deterministic, offline analyzer smoke test before spending model calls:

```sh
fake_output="$(mktemp -d)"
AGENT_HISTORY_FAKE_ANALYZER=1 python3 scripts/analyze_changelogs.py \
  --evidence-root analysis/evidence --output-root "$fake_output" \
  --newest-first --max-releases 4 --batch-size 1
rm -rf "$fake_output"
python3 -m unittest discover -s tests -v
```

The production sequence is:

1. sparse-sync the exact Phistory `main` SHA;
2. refresh normalized official sources, reusing validated cache on fetch errors;
3. build deterministic evidence and static data;
4. send only missing or stale evidence digests to local `codex exec`;
5. rebuild so validated AI changelogs, or deterministic fallbacks, are merged;
6. run `npm test` and `npm run build`;
7. optionally run Wrangler deploy.

For the initial history backfill, cap and pace the work instead of sending the
entire archive at once. This example starts with the newest 20 releases, one
release per Codex call, with ten seconds between calls:

```sh
python3 scripts/analyze_changelogs.py --analysis-root analysis \
  --agents all --newest-first --fair-agents --max-releases 20 \
  --batch-size 1 --batch-delay 10 --reasoning-effort medium
```

Repeat the command until its stale count reaches zero. Normal daily runs only
send newly added or evidence-digest-changed releases. Use `--dry-run` to inspect
that queue without invoking Codex.

With a capped queue, agent fairness is enabled by default: each Agent receives
one newest-stale slot per round before the remaining budget is filled. This
prevents high-frequency release streams from starving slower projects.

Each real batch is passed on stdin to `codex -a never exec` with `--ephemeral`,
`--sandbox read-only`, `--ignore-user-config`, `--ignore-rules`, and a strict
JSON output schema. Shell and unified-exec features are disabled and any shell
environment is configured to inherit nothing. Codex runs from an empty
temporary directory and receives
only the same semantic evidence projection covered by `evidenceDigest`; source
URLs, timestamps, upstream HEAD changes, and trace bookkeeping are excluded.
The default timeout is 180 seconds per attempt with two retries. Batch size 1 is
the production default. If a larger configured batch fails, it is split
recursively until each release is analyzed independently, so completed releases
are preserved instead of replaying the whole batch.

Non-baseline releases with no runtime prompt/tool signal, no static-prompt
change, and no available official evidence are completed locally with
`importance: none`. They never invoke Codex and do not consume the daily
`--max-releases` allowance.

Cached analyses are reused only when the evidence digest, prompt version, model
selection, and reasoning effort all match. These values are recorded in each
output's `generator` metadata. The analyzer treats runtime prompt/tool diffs,
static prompt assets, and official release/code evidence as three distinct
untrusted layers before synthesizing them. Each result records an importance
level and up to four evidence-backed implications for coding-agent development;
no-signal results cannot contain invented implications. `SIGTERM` and `SIGINT`
are propagated through the pipeline, analyzer, and Codex process groups; the
updater waits for cooperative cleanup and then force-stops any descendants that
remain.

Treat upstream captures as untrusted model input. The controls above reduce
prompt-injection reach, but a read-only model process is not a complete host
security boundary. Run the launch agent from a dedicated macOS account without
access to unrelated repositories or secrets when operating it unattended.

Capture ingestion is resource-bounded per agent and per artifact. An unsafe,
oversized, or malformed release is quarantined without blocking publication of
the remaining valid history; the public manifest reports accepted/rejected
counts, bounded warnings, and the active limits. Evidence left by a release that
later becomes invalid is removed before changelog analysis.

## launchd

The template runs daily at **08:37 in the Mac's local timezone**. The installer
requires that timezone to be `Asia/Shanghai` by default because launchd cannot
attach an IANA timezone to `StartCalendarInterval`. Standard output and error go
to `~/Library/Logs/agentlab-agent-history.log` and
`~/Library/Logs/agentlab-agent-history.error.log`.
The installer also snapshots the current `HTTP_PROXY`, `HTTPS_PROXY`, and
`NO_PROXY` variables (including lowercase variants) into the launch agent so
background Codex and source fetches use the same network route as the terminal.
The generated plist is mode `0600` because proxy URLs can contain credentials.

Preview the rendered plist without installing or loading it:

```sh
python3 ops/install_launchd.py --dry-run
```

Install the build-and-test schedule without deployment:

```sh
python3 ops/install_launchd.py
```

Add `--deploy` only after Wrangler authentication, the custom domain, and a
manual production run have all been verified:

```sh
python3 ops/install_launchd.py --deploy
```

To unload it later:

```sh
launchctl bootout "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.dairui.agentlab.agent-history.plist"
```

The updater takes an advisory file lock, so a manual run and launchd run cannot
publish concurrently. Sync, deterministic build, test, site build, and deploy
failures stop the pipeline before publication. Changelog analysis is explicitly
best-effort: failed single releases are reported, later releases continue, and
the merge uses deterministic pending summaries instead of blocking publication.
