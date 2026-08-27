#!/usr/bin/env python3
"""Reject deployment when canonical Agent history data is incomplete."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Sequence


sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_from_phistory import PREFERRED_AGENT_ORDER
from official_release_sources import OFFICIAL_REPOSITORIES, RETIRED_AGENTS, canonical_agent_id


APP_ROOT = Path(__file__).resolve().parents[1]
AGENT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
REQUIRED_AGENT_IDS = frozenset(PREFERRED_AGENT_ORDER)


class DeployDataError(RuntimeError):
    pass


def capture_catalog(phistory_root: Path, overlay_root: Path) -> set[str]:
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                str(phistory_root),
                "ls-tree",
                "-d",
                "--name-only",
                "HEAD:captures",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise DeployDataError(
            "cannot read the complete Phistory capture catalog; run the full sync first"
        ) from error
    agents = set(REQUIRED_AGENT_IDS)
    agents.update(
        canonical_agent_id(line.strip())
        for line in result.stdout.splitlines()
        if line.strip() and canonical_agent_id(line.strip()) not in RETIRED_AGENTS
    )
    overlay_captures = overlay_root / "captures"
    if overlay_captures.exists():
        if overlay_captures.is_symlink() or not overlay_captures.is_dir():
            raise DeployDataError(
                f"capture overlay is not a regular directory: {overlay_captures}"
            )
        agents.update(
            canonical_agent_id(child.name)
            for child in overlay_captures.iterdir()
            if child.is_dir()
            and not child.is_symlink()
            and canonical_agent_id(child.name) not in RETIRED_AGENTS
        )
    invalid = sorted(agent for agent in agents if not AGENT_ID_RE.fullmatch(agent))
    if invalid:
        raise DeployDataError(
            "capture catalog contains invalid agent ids: " + ", ".join(invalid)
        )
    if not agents:
        raise DeployDataError("capture catalog is empty")
    return agents


def read_manifest(path: Path) -> dict[str, object]:
    if path.is_symlink() or not path.is_file():
        raise DeployDataError(f"deployment manifest is missing: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise DeployDataError(f"deployment manifest is invalid: {path}") from error
    if not isinstance(value, dict):
        raise DeployDataError(f"deployment manifest must be an object: {path}")
    return value


def verify(
    *,
    phistory_root: Path,
    overlay_root: Path,
    public_root: Path,
    dist_root: Path,
) -> int:
    selection = os.environ.get("PHISTORY_AGENTS", "all").strip().lower()
    if selection != "all":
        raise DeployDataError("PHISTORY_AGENTS must be unset or 'all' for deployment")
    expected = capture_catalog(phistory_root, overlay_root)
    public_manifest = read_manifest(public_root / "data" / "manifest.json")
    dist_manifest = read_manifest(dist_root / "data" / "manifest.json")
    if public_manifest != dist_manifest:
        raise DeployDataError("public and dist manifests do not describe the same build")
    raw_agents = public_manifest.get("agents")
    if not isinstance(raw_agents, list):
        raise DeployDataError("deployment manifest agents must be an array")
    ids: list[str] = []
    for agent in raw_agents:
        if not isinstance(agent, dict) or not isinstance(agent.get("id"), str):
            raise DeployDataError("deployment manifest contains an invalid agent entry")
        agent_id = agent["id"]
        release_count = agent.get("releaseCount")
        if (
            not isinstance(release_count, int)
            or isinstance(release_count, bool)
            or release_count < 1
        ):
            raise DeployDataError(f"deployment manifest has no releases for {agent_id}")
        ids.append(agent_id)
    if len(ids) != len(set(ids)):
        raise DeployDataError("deployment manifest contains duplicate agent ids")
    actual = set(ids)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        details = []
        if missing:
            details.append("missing=" + ",".join(missing))
        if extra:
            details.append("extra=" + ",".join(extra))
        raise DeployDataError("deployment agent catalog is incomplete: " + " ".join(details))
    official = public_manifest.get("officialSources")
    status = official.get("status") if isinstance(official, dict) else None
    sync_status = official.get("syncStatus") if isinstance(official, dict) else None
    warning_count = official.get("warningCount") if isinstance(official, dict) else None
    if status != "fresh" or sync_status != "current" or warning_count != 0:
        raise DeployDataError(
            "official source generation is not deployable: "
            f"status={status!r} syncStatus={sync_status!r} warningCount={warning_count!r}"
        )
    selected = official.get("selectedAgents") if isinstance(official, dict) else None
    retained = official.get("retainedAgents") if isinstance(official, dict) else None
    if (
        not isinstance(selected, list)
        or any(not isinstance(agent, str) for agent in selected)
        or set(selected) != set(OFFICIAL_REPOSITORIES)
        or retained != []
    ):
        raise DeployDataError("official source generation is not a full refresh")
    return len(actual)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--phistory-root",
        type=Path,
        default=APP_ROOT / ".cache/phistory/upstream",
    )
    parser.add_argument(
        "--overlay-root",
        type=Path,
        default=Path(
            os.environ.get(
                "AGENT_HISTORY_CAPTURE_OVERLAY_ROOT",
                APP_ROOT / ".cache/agentlab-captures",
            )
        ),
    )
    parser.add_argument("--public-root", type=Path, default=APP_ROOT / "public")
    parser.add_argument("--dist-root", type=Path, default=APP_ROOT / "dist")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    count = verify(
        phistory_root=args.phistory_root.expanduser().resolve(),
        overlay_root=args.overlay_root.expanduser().resolve(),
        public_root=args.public_root.expanduser().resolve(),
        dist_root=args.dist_root.expanduser().resolve(),
    )
    print(f"Deployment data verified for {count} agents.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DeployDataError as error:
        raise SystemExit(f"deploy verification failed: {error}") from error
