#!/usr/bin/env python3
"""Single registry for AgentLab GitHub release intelligence sources."""

from __future__ import annotations


SPECIAL_OFFICIAL_REPOSITORIES = {
    "claude-code": "anthropics/claude-code",
    "codex": "openai/codex",
}

GITHUB_RELEASE_SOURCES = {
    "antigravity": {"repository": "google-antigravity/antigravity-cli", "label": "Antigravity CLI", "tagPattern": r"^(\d+\.\d+\.\d+)$"},
    "cline": {"repository": "cline/cline", "label": "Cline", "tagPattern": r"^cli-v(\d+\.\d+\.\d+)$"},
    "goose": {"repository": "aaif-goose/goose", "label": "Goose", "tagPattern": r"^(v\d+\.\d+\.\d+)$"},
    "hermes": {"repository": "NousResearch/hermes-agent", "label": "Hermes Agent", "tagPattern": r"^(v\d+\.\d+\.\d+(?:\.\d+)?)$"},
    "kimi": {"repository": "MoonshotAI/kimi-cli", "label": "Kimi CLI", "tagPattern": r"^(\d+\.\d+\.\d+)$"},
    "kimi-code": {"repository": "MoonshotAI/kimi-code", "label": "Kimi Code", "tagPattern": r"^@moonshot-ai/kimi-code@(\d+\.\d+\.\d+)$"},
    "mimo": {"repository": "XiaomiMiMo/MiMo-Code", "label": "MiMo Code", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "omp": {"repository": "can1357/oh-my-pi", "label": "Oh My Pi", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "openclaw": {"repository": "openclaw/openclaw", "label": "OpenClaw", "tagPattern": r"^v(\d+\.\d+\.\d+(?:-\d+)?)$"},
    "opencode": {"repository": "anomalyco/opencode", "label": "opencode", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "pi": {"repository": "badlogic/pi-mono", "label": "Pi", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "qwen-code": {"repository": "QwenLM/qwen-code", "label": "Qwen Code", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
    "reasonix": {"repository": "esengine/DeepSeek-Reasonix", "label": "Reasonix", "tagPattern": r"^v(\d+\.\d+\.\d+)$"},
}

# Source-only captures start at the official-source rollout boundary.  Older
# releases remain available as evidence for matching Phistory captures, without
# turning an initial sync into an unbounded historical model-analysis backlog.
SOURCE_CAPTURE_SINCE = "2026-06-09T00:00:00Z"

OFFICIAL_REPOSITORIES = {
    **SPECIAL_OFFICIAL_REPOSITORIES,
    **{agent: str(config["repository"]) for agent, config in GITHUB_RELEASE_SOURCES.items()},
}
