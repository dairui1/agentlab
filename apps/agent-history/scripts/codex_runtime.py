"""Shared model and executable defaults for local analysis."""

from __future__ import annotations

import os
import sys
from pathlib import Path


DEFAULT_CODEX_MODEL = "gpt-6-luna"
MACOS_CODEX_BINARIES = (
    Path("/Applications/Codex.app/Contents/Resources/codex"),
    Path("/Applications/ChatGPT.app/Contents/Resources/codex"),
)


def default_codex_bin() -> str:
    override = os.environ.get("CODEX_BIN")
    if override:
        return override
    # A separately installed CLI can lag behind the desktop model rollout.
    if sys.platform == "darwin":
        for binary in MACOS_CODEX_BINARIES:
            if binary.is_file() and os.access(binary, os.X_OK):
                return str(binary)
    return "codex"
