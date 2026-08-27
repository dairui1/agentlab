#!/usr/bin/env python3
"""Single registry for AgentLab official release intelligence sources."""

from __future__ import annotations


SPECIAL_OFFICIAL_REPOSITORIES = {
    "claude-code": "anthropics/claude-code",
    "codex": "openai/codex",
}

GITHUB_RELEASE_SOURCES = {
    "antigravity": {"repository": "google-antigravity/antigravity-cli", "label": "Antigravity CLI", "tagPattern": r"^(\d+\.\d+\.\d+)$"},
    "cline": {"repository": "cline/cline", "label": "Cline", "tagPattern": r"^cli-v(\d+\.\d+\.\d+)$"},
    "crush": {"repository": "charmbracelet/crush", "label": "Crush", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "goose": {"repository": "aaif-goose/goose", "label": "Goose", "tagPattern": r"^(v\d+\.\d+\.\d+)$"},
    "hermes": {"repository": "NousResearch/hermes-agent", "label": "Hermes Agent", "tagPattern": r"^(v\d+\.\d+\.\d+(?:\.\d+)?)$"},
    "kimi-code": {"repository": "MoonshotAI/kimi-code", "label": "Kimi Code", "tagPattern": r"^@moonshot-ai/kimi-code@(\d+\.\d+\.\d+)$"},
    "maka": {"repository": "apache/maka", "label": "Apache Maka", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "mimo": {"repository": "XiaomiMiMo/MiMo-Code", "label": "MiMo Code", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "omp": {"repository": "can1357/oh-my-pi", "label": "Oh My Pi", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "openclaw": {"repository": "openclaw/openclaw", "label": "OpenClaw", "tagPattern": r"^v(\d+\.\d+\.\d+(?:-\d+)?)$"},
    "opencode": {"repository": "anomalyco/opencode", "label": "opencode", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "pi": {"repository": "badlogic/pi-mono", "label": "Pi", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "prime-agent": {"repository": "PrimeIntellect-ai/prime-agent", "label": "Prime Agent", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "qwen-code": {"repository": "QwenLM/qwen-code", "label": "Qwen Code", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "reasonix": {"repository": "esengine/DeepSeek-Reasonix", "label": "Reasonix", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
}

NPM_RELEASE_SOURCES = {
    "grok": {
        "repository": "xai-org/grok-build",
        "label": "Grok Build",
        "package": "@xai-official/grok",
        # The package does not declare repository metadata. The official source
        # mirror is instead linked by xAI and synced from its monorepo.
        "requireRepositoryMetadata": False,
        "sourceSnapshotAfterPublish": True,
    },
    "deepseek-harness": {
        "repository": "deepseek-ai/deepseek-harness",
        "label": "DeepSeek Harness",
        "package": "@deepseek-ai/dsh",
        "packageDirectory": "apps/cli",
        "tagPattern": r"^dsh-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$",
        "githubReleaseNotes": True,
        "includePrereleases": True,
    },
}

# Every catalog agent must either have official source intelligence above or
# be explicitly classified here. This prevents a newly-added open-source agent
# from silently falling back to Phistory-only evidence.
NO_PUBLIC_SOURCE_AGENTS = {
    "minimax-code": {
        "reason": "official-repository-is-issue-tracker-only",
        "sourceUrl": "https://github.com/MiniMax-AI/minimax-code",
    },
}

# Retired catalog entries remain explicit so an upstream capture directory cannot
# silently add them back during an "all" build.
RETIRED_AGENTS = {
    "kimi": {
        "reason": "upstream-project-is-being-wound-down",
        "repository": "MoonshotAI/kimi-cli",
        "replacement": "kimi-code",
        "sourceUrl": "https://github.com/MoonshotAI/kimi-cli",
    },
}

# Phistory still publishes DeepSeek Harness runtime captures under the CLI
# package name. Keep that upstream spelling at the boundary and expose one
# canonical AgentLab identity everywhere else.
PHISTORY_AGENT_IDS = {
    "deepseek-harness": ("dsh",),
}
PHISTORY_AGENT_ALIASES = {
    source: canonical
    for canonical, sources in PHISTORY_AGENT_IDS.items()
    for source in sources
}


def canonical_agent_id(agent: str) -> str:
    return PHISTORY_AGENT_ALIASES.get(agent, agent)


def phistory_agent_ids(agent: str) -> tuple[str, ...]:
    return PHISTORY_AGENT_IDS.get(agent, (agent,))

# Source-only captures start at the official-source rollout boundary.  Older
# releases remain available as evidence for matching Phistory captures, without
# turning an initial sync into an unbounded historical model-analysis backlog.
SOURCE_CAPTURE_SINCE = "2026-06-09T00:00:00Z"

OFFICIAL_REPOSITORIES = {
    **SPECIAL_OFFICIAL_REPOSITORIES,
    **{agent: str(config["repository"]) for agent, config in GITHUB_RELEASE_SOURCES.items()},
    **{agent: str(config["repository"]) for agent, config in NPM_RELEASE_SOURCES.items()},
}

SOURCE_CAPTURE_SOURCES = {
    **{
        agent: {
            "repository": str(config["repository"]),
            "label": str(config["label"]),
            "package": str(config["repository"]),
        }
        for agent, config in GITHUB_RELEASE_SOURCES.items()
    },
    **{
        agent: {
            "repository": str(config["repository"]),
            "label": str(config["label"]),
            "package": str(config["package"]),
            **(
                {"packageDirectory": str(config["packageDirectory"])}
                if config.get("packageDirectory") is not None
                else {}
            ),
        }
        for agent, config in NPM_RELEASE_SOURCES.items()
    },
}

OFFICIAL_ONLY_AGENTS = frozenset(
    agent
    for agent, config in NPM_RELEASE_SOURCES.items()
    if config.get("officialOnly") is True
)

# Bootstrap one adjacent comparison per repository. Each future release keeps
# its eligible comparison, so coverage grows without creating a one-time model
# backlog across the entire historical corpus.
SOURCE_CODE_COMPARISON_WINDOW = 1
