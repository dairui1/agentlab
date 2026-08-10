#!/usr/bin/env python3
"""Materialize source-only release history when runtime captures are unavailable."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from official_release_sources import GITHUB_RELEASE_SOURCES, SOURCE_CAPTURE_SINCE


APP_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OFFICIAL_ROOT = APP_ROOT / ".cache" / "official-sources" / "normalized"
DEFAULT_PHISTORY_ROOT = APP_ROOT / ".cache" / "phistory" / "upstream"
DEFAULT_OVERLAY_ROOT = APP_ROOT / ".cache" / "agentlab-captures"

SOURCE_AGENTS = {
    agent: {
        "label": str(config["label"]),
        "package": str(config["repository"]),
    }
    for agent, config in GITHUB_RELEASE_SOURCES.items()
}


class SourceCaptureError(RuntimeError):
    pass


def read_json_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SourceCaptureError(f"cannot read {path}: {error}") from error
    if not isinstance(value, dict):
        raise SourceCaptureError(f"expected an object in {path}")
    return value


def pretty_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(
        "utf-8"
    )


def existing_versions(root: Path, agent: str) -> set[str]:
    directory = root / "captures" / agent
    if not directory.is_dir() or directory.is_symlink():
        return set()
    return {
        path.name
        for path in directory.iterdir()
        if path.is_dir() and not path.is_symlink()
    }


def prune_superseded_placeholders(
    *, phistory_root: Path, overlay_root: Path, agent: str
) -> int:
    upstream_versions = existing_versions(phistory_root, agent)
    overlay_versions = existing_versions(overlay_root, agent)
    pruned = 0
    for version in sorted(upstream_versions & overlay_versions):
        capture = overlay_root / "captures" / agent / version
        metadata_path = capture / "meta.json"
        if metadata_path.is_symlink() or not metadata_path.is_file():
            continue
        metadata = read_json_object(metadata_path)
        if metadata.get("capture_kind") != "official-source-history":
            continue
        children = list(capture.iterdir())
        if any(
            child.name not in {"meta.json", "prompt.md"}
            or child.is_symlink()
            or not child.is_file()
            for child in children
        ):
            raise SourceCaptureError(
                f"refusing to prune modified source-only capture: {capture}"
            )
        for child in children:
            child.unlink()
        capture.rmdir()
        pruned += 1
    return pruned


def release_timestamp(release: Mapping[str, Any]) -> str:
    published = release.get("publishedAt")
    if isinstance(published, str) and published:
        return published
    raise SourceCaptureError(
        f"official release {release.get('version')} has no publishedAt timestamp"
    )


def parse_timestamp(value: str, *, context: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise SourceCaptureError(f"invalid timestamp for {context}: {value}") from error
    if parsed.tzinfo is None:
        raise SourceCaptureError(f"timestamp for {context} must include a timezone")
    return parsed


def earliest_capture_timestamp(roots: Sequence[Path], agent: str) -> datetime | None:
    timestamps: list[datetime] = []
    for root in roots:
        directory = root / "captures" / agent
        if not directory.is_dir() or directory.is_symlink():
            continue
        for capture in directory.iterdir():
            metadata_path = capture / "meta.json"
            if not capture.is_dir() or capture.is_symlink() or not metadata_path.is_file():
                continue
            metadata = read_json_object(metadata_path)
            value = metadata.get("published_at", metadata.get("captured_at"))
            if isinstance(value, str) and value:
                timestamps.append(
                    parse_timestamp(value, context=f"{agent} {capture.name} capture")
                )
    return min(timestamps) if timestamps else None


def render_placeholder(agent: str, label: str) -> bytes:
    return (
        "# Runtime Evidence\n\n"
        f"{label} runtime prompt and tool schema were not publicly captured for "
        "these source-only releases. Use the official release evidence attached "
        "to each version.\n"
    ).encode("utf-8")


def write_capture(
    *,
    overlay_root: Path,
    agent: str,
    config: Mapping[str, str],
    repository: str,
    release: Mapping[str, Any],
) -> Path:
    version = str(release["version"])
    tag = release.get("tag")
    source_url = release.get("sourceUrl")
    if not isinstance(tag, str) or not tag:
        raise SourceCaptureError(f"official release {agent} {version} has no tag")
    if not isinstance(source_url, str) or not source_url.startswith("https://github.com/"):
        raise SourceCaptureError(f"official release {agent} {version} has no GitHub URL")
    timestamp = release_timestamp(release)
    destination = overlay_root / "captures" / agent / version
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return destination
    metadata = {
        "agent_id": agent,
        "agent": config["label"],
        "package": config["package"],
        "version": version,
        "published_at": timestamp,
        "captured_at": timestamp,
        "capture_kind": "official-source-history",
        "runtime_prompt_status": "unavailable",
        "tool_schema_status": "unavailable",
        "source_repository": repository,
        "source_ref": tag,
        "source_url": source_url,
    }
    temporary: Path | None = None
    try:
        temporary = Path(tempfile.mkdtemp(prefix=f".{version}.", dir=destination.parent))
        (temporary / "prompt.md").write_bytes(render_placeholder(agent, config["label"]))
        (temporary / "meta.json").write_bytes(pretty_json(metadata))
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None and temporary.exists():
            for child in temporary.iterdir():
                child.unlink()
            temporary.rmdir()
    return destination


def sync(
    *,
    official_root: Path,
    phistory_root: Path,
    overlay_root: Path,
    agents: Sequence[str],
) -> dict[str, int]:
    counts: dict[str, int] = {}
    for agent in agents:
        config = SOURCE_AGENTS[agent]
        prune_superseded_placeholders(
            phistory_root=phistory_root,
            overlay_root=overlay_root,
            agent=agent,
        )
        index_path = official_root / f"{agent}.json"
        index = read_json_object(index_path)
        repository = index.get("repository")
        releases = index.get("releases")
        if not isinstance(repository, str) or repository != config["package"]:
            raise SourceCaptureError(f"official repository mismatch for {agent}")
        if not isinstance(releases, dict):
            raise SourceCaptureError(f"official releases are invalid for {agent}")
        present = existing_versions(phistory_root, agent) | existing_versions(
            overlay_root, agent
        )
        threshold = parse_timestamp(
            SOURCE_CAPTURE_SINCE, context="source capture rollout"
        )
        coverage_start = earliest_capture_timestamp(
            (phistory_root, overlay_root), agent
        )
        if coverage_start is not None:
            threshold = min(threshold, coverage_start)
        written = 0
        for version, release in releases.items():
            if version in present:
                continue
            if not isinstance(release, dict) or release.get("version") != version:
                raise SourceCaptureError(f"official release identity mismatch: {agent} {version}")
            # Tag-only records enrich code evidence, but without an authoritative
            # release timestamp they must not invent a source-only history entry.
            if not isinstance(release.get("publishedAt"), str):
                continue
            if parse_timestamp(
                release_timestamp(release), context=f"{agent} {version} release"
            ) < threshold:
                continue
            write_capture(
                overlay_root=overlay_root,
                agent=agent,
                config=config,
                repository=repository,
                release=release,
            )
            present.add(version)
            written += 1
        counts[agent] = written
    return counts


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--official-root", type=Path, default=DEFAULT_OFFICIAL_ROOT)
    parser.add_argument("--phistory-root", type=Path, default=DEFAULT_PHISTORY_ROOT)
    parser.add_argument("--overlay-root", type=Path, default=DEFAULT_OVERLAY_ROOT)
    parser.add_argument(
        "--agents",
        default=",".join(SOURCE_AGENTS),
        help="comma-separated source-history agents",
    )
    args = parser.parse_args(argv)
    requested = tuple(dict.fromkeys(part.strip() for part in args.agents.split(",") if part.strip()))
    unknown = sorted(set(requested) - set(SOURCE_AGENTS))
    if not requested or unknown:
        parser.error("unknown or empty --agents: " + ", ".join(unknown))
    args.agents = requested
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    counts = sync(
        official_root=args.official_root.expanduser().resolve(),
        phistory_root=args.phistory_root.expanduser().resolve(),
        overlay_root=args.overlay_root.expanduser().resolve(),
        agents=args.agents,
    )
    print(
        "Synced source-only captures: "
        + ", ".join(f"{agent}={count}" for agent, count in counts.items())
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
