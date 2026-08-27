#!/usr/bin/env python3
"""Materialize source-only release history when runtime captures are unavailable."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from official_release_sources import (
    SOURCE_CAPTURE_SINCE,
    SOURCE_CAPTURE_SOURCES,
    phistory_agent_ids,
)


APP_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OFFICIAL_ROOT = APP_ROOT / ".cache" / "official-sources" / "normalized"
DEFAULT_PHISTORY_ROOT = APP_ROOT / ".cache" / "phistory" / "upstream"
DEFAULT_OVERLAY_ROOT = APP_ROOT / ".cache" / "agentlab-captures"

SOURCE_AGENTS = SOURCE_CAPTURE_SOURCES


class SourceCaptureError(RuntimeError):
    pass


def read_json_object(path: Path) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise SourceCaptureError(f"expected a regular file in {path}")
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


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def official_index_path(official_root: Path, agent: str) -> Path:
    manifest = read_json_object(official_root / "manifest.json")
    descriptors = manifest.get("agents")
    descriptor = descriptors.get(agent) if isinstance(descriptors, dict) else None
    if not isinstance(descriptor, dict):
        raise SourceCaptureError(f"official manifest has no source for {agent}")
    digest = descriptor.get("sourceDigest")
    url = descriptor.get("url")
    expected_url = f"agents/{digest}.json"
    if (
        not isinstance(digest, str)
        or not re.fullmatch(r"[0-9a-f]{64}", digest)
        or url != expected_url
    ):
        raise SourceCaptureError(f"official manifest descriptor is invalid for {agent}")
    path = official_root / expected_url
    try:
        resolved = path.resolve(strict=True)
        resolved.relative_to(official_root.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise SourceCaptureError(f"official source path is invalid for {agent}") from error
    index = read_json_object(resolved)
    recorded = index.get("sourceDigest")
    projection = dict(index)
    projection.pop("sourceDigest", None)
    actual = hashlib.sha256(canonical_json(projection)).hexdigest()
    if recorded != digest or actual != digest:
        raise SourceCaptureError(f"official source digest mismatch for {agent}")
    return resolved


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
    upstream_versions = set().union(
        *(
            existing_versions(phistory_root, source)
            for source in dict.fromkeys((agent, *phistory_agent_ids(agent)))
        )
    )
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
        agent_directory = capture.parent
        if not any(agent_directory.iterdir()):
            agent_directory.rmdir()
        pruned += 1
    agent_directory = overlay_root / "captures" / agent
    if agent_directory.is_dir() and not agent_directory.is_symlink() and not any(
        agent_directory.iterdir()
    ):
        agent_directory.rmdir()
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


def earliest_capture_timestamp(
    roots: Sequence[Path], agent: str, *, ignore_invalid: bool = False
) -> datetime | None:
    timestamps: list[datetime] = []
    for root in roots:
        directory = root / "captures" / agent
        if not directory.is_dir() or directory.is_symlink():
            continue
        for capture in directory.iterdir():
            metadata_path = capture / "meta.json"
            if not capture.is_dir() or capture.is_symlink() or not metadata_path.is_file():
                continue
            try:
                metadata = read_json_object(metadata_path)
            except SourceCaptureError:
                if ignore_invalid:
                    continue
                raise
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


def capture_payload(
    *,
    agent: str,
    config: Mapping[str, str],
    repository: str,
    release: Mapping[str, Any],
) -> dict[str, bytes]:
    version = str(release["version"])
    source_ref = release.get("sourceRef", release.get("tag"))
    source_url = release.get("sourceUrl")
    if not isinstance(source_ref, str) or not source_ref:
        raise SourceCaptureError(f"official release {agent} {version} has no source ref")
    if not isinstance(source_url, str):
        raise SourceCaptureError(f"official release {agent} {version} has no source URL")
    parsed_source_url = urlsplit(source_url)
    if parsed_source_url.scheme != "https" or not parsed_source_url.netloc:
        raise SourceCaptureError(
            f"official release {agent} {version} has no public HTTPS URL"
        )
    timestamp = release_timestamp(release)
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
        "source_ref": source_ref,
        "source_url": source_url,
    }
    expected_package_directory = config.get("packageDirectory")
    package_directory = release.get("packageDirectory")
    if expected_package_directory is not None:
        if release.get("packageName") != config["package"]:
            raise SourceCaptureError(
                f"official release {agent} {version} has mismatched package identity"
            )
        if package_directory != expected_package_directory:
            raise SourceCaptureError(
                f"official release {agent} {version} has mismatched package directory"
            )
        metadata["package_directory"] = expected_package_directory
    artifact = release.get("artifact")
    if isinstance(artifact, Mapping):
        if artifact.get("scope") != "published-package-only":
            raise SourceCaptureError(
                f"official release {agent} {version} has invalid artifact scope"
            )
        for source_key, metadata_key in (
            ("url", "tarball_url"),
            ("integrity", "tarball_integrity"),
            ("shasum", "tarball_shasum"),
        ):
            value = artifact.get(source_key)
            if not isinstance(value, str) or not value:
                raise SourceCaptureError(
                    f"official release {agent} {version} has incomplete artifact metadata"
                )
            metadata[metadata_key] = value
        parsed_tarball_url = urlsplit(metadata["tarball_url"])
        if parsed_tarball_url.scheme != "https" or not parsed_tarball_url.netloc:
            raise SourceCaptureError(
                f"official release {agent} {version} has invalid artifact URL"
            )
        if not re.fullmatch(
            r"sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}",
            metadata["tarball_integrity"],
        ) or not re.fullmatch(r"[0-9a-f]{40}", metadata["tarball_shasum"]):
            raise SourceCaptureError(
                f"official release {agent} {version} has invalid artifact digest"
            )
    elif expected_package_directory is not None:
        raise SourceCaptureError(
            f"official release {agent} {version} has no package artifact metadata"
        )
    return {
        "prompt.md": render_placeholder(agent, config["label"]),
        "meta.json": pretty_json(metadata),
    }


def path_exists(path: Path) -> bool:
    return os.path.lexists(path)


def read_capture_file(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise SourceCaptureError(f"expected a regular capture file in {path}")
    try:
        return path.read_bytes()
    except OSError as error:
        raise SourceCaptureError(f"cannot read capture file {path}: {error}") from error


def capture_needs_reconciliation(
    destination: Path,
    expected: Mapping[str, bytes],
    *,
    agent: str,
    version: str,
) -> bool:
    if not path_exists(destination):
        return True
    if destination.is_symlink() or not destination.is_dir():
        raise SourceCaptureError(
            f"refusing to replace non-directory source capture: {destination}"
        )
    try:
        children = {child.name: child for child in destination.iterdir()}
    except OSError as error:
        raise SourceCaptureError(f"cannot inspect source capture {destination}: {error}") from error
    unexpected = sorted(set(children) - set(expected))
    if not children:
        return True

    variants_path = children.get("variants")
    if variants_path is not None:
        if (
            set(children) != {"variants"}
            or variants_path.is_symlink()
            or not variants_path.is_dir()
        ):
            raise SourceCaptureError(
                f"refusing to preserve invalid variant runtime capture: {destination}"
            )
        variants = list(variants_path.iterdir())
        if not variants:
            raise SourceCaptureError(
                f"refusing to preserve empty variant runtime capture: {destination}"
            )
        for variant in variants:
            metadata_path = variant / "meta.json"
            prompt_path = variant / "prompt.md"
            if (
                variant.is_symlink()
                or not variant.is_dir()
                or metadata_path.is_symlink()
                or not metadata_path.is_file()
                or prompt_path.is_symlink()
                or not prompt_path.is_file()
                or any(path.is_symlink() for path in variant.rglob("*"))
            ):
                raise SourceCaptureError(
                    f"refusing to preserve invalid variant runtime capture: {destination}"
                )
            metadata = read_json_object(metadata_path)
            timestamp = metadata.get("captured_at", metadata.get("published_at"))
            if (
                metadata.get("agent_id", agent) != agent
                or metadata.get("version", version) != version
                or not isinstance(timestamp, str)
            ):
                raise SourceCaptureError(
                    f"refusing to preserve invalid variant runtime capture: {destination}"
                )
            parse_timestamp(timestamp, context=f"{agent} {version} variant capture")
        return False

    metadata_path = children.get("meta.json")
    metadata: dict[str, Any] | None = None
    if metadata_path is not None and not metadata_path.is_symlink() and metadata_path.is_file():
        try:
            metadata = read_json_object(metadata_path)
        except SourceCaptureError:
            metadata = None
    if metadata is not None and metadata.get("capture_kind") != "official-source-history":
        # Overlay runtime captures are authoritative, just like upstream
        # Phistory captures, and source-only materialization never rewrites them.
        prompt_path = children.get("prompt.md")
        timestamp = metadata.get("captured_at", metadata.get("published_at"))
        valid_identity = (
            metadata.get("agent_id", agent) == agent
            and metadata.get("version", version) == version
        )
        valid_status = all(
            field not in metadata or metadata[field] == "unavailable"
            for field in ("runtime_prompt_status", "tool_schema_status")
        )
        if (
            prompt_path is None
            or prompt_path.is_symlink()
            or not prompt_path.is_file()
            or not isinstance(timestamp, str)
            or not valid_identity
            or not valid_status
        ):
            raise SourceCaptureError(
                f"refusing to preserve invalid non-owned source capture: {destination}"
            )
        parse_timestamp(timestamp, context=f"{agent} {version} capture")
        return False

    if unexpected or any(
        child.is_symlink() or not child.is_file() for child in children.values()
    ):
        raise SourceCaptureError(
            f"refusing to replace modified source-only capture: {destination}"
        )

    prompt_owned = False
    prompt_path = children.get("prompt.md")
    if prompt_path is not None:
        prompt_owned = read_capture_file(prompt_path) == expected["prompt.md"]

    metadata_owned = False
    if metadata_path is not None:
        if metadata is None:
            if not prompt_owned:
                raise SourceCaptureError(
                    f"refusing to replace unrecognized source capture: {destination}"
                )
        else:
            if metadata.get("capture_kind") != "official-source-history":
                raise SourceCaptureError(
                    f"refusing to preserve invalid non-owned source capture: {destination}"
                )
            metadata_owned = True
    if not metadata_owned and not prompt_owned:
        raise SourceCaptureError(
            f"refusing to replace unrecognized source capture: {destination}"
        )

    return any(
        name not in children or read_capture_file(children[name]) != contents
        for name, contents in expected.items()
    )


def remove_capture_directory(path: Path) -> None:
    for child in path.iterdir():
        if (
            child.name not in {"meta.json", "prompt.md"}
            or child.is_symlink()
            or not child.is_file()
        ):
            raise SourceCaptureError(
                f"refusing to remove modified source-only capture: {path}"
            )
        child.unlink()
    path.rmdir()


def replace_capture_directory(
    destination: Path,
    temporary: Path,
    expected: Mapping[str, bytes],
) -> bool:
    backup = temporary.with_name(f"{temporary.name}.previous")
    try:
        os.replace(destination, backup)
    except OSError as error:
        raise SourceCaptureError(
            f"cannot preserve source capture before replacement: {destination}: {error}"
        ) from error

    try:
        capture_needs_reconciliation(
            backup,
            expected,
            agent=destination.parent.name,
            version=destination.name,
        )
        os.replace(temporary, destination)
    except (OSError, SourceCaptureError) as error:
        if not path_exists(destination):
            try:
                os.replace(backup, destination)
            except OSError as restore_error:
                raise SourceCaptureError(
                    "cannot restore source capture after failed replacement; "
                    f"preserved copy remains at {backup}: {restore_error}"
                ) from error
        raise SourceCaptureError(
            f"cannot replace source capture {destination}: {error}"
        ) from error

    try:
        remove_capture_directory(backup)
    except (OSError, SourceCaptureError) as error:
        raise SourceCaptureError(
            f"source capture was replaced but backup cleanup failed at {backup}: {error}"
        ) from error
    return True


def write_capture(
    *,
    overlay_root: Path,
    agent: str,
    config: Mapping[str, str],
    repository: str,
    release: Mapping[str, Any],
) -> bool:
    version = str(release["version"])
    expected = capture_payload(
        agent=agent,
        config=config,
        repository=repository,
        release=release,
    )
    destination = overlay_root / "captures" / agent / version
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not capture_needs_reconciliation(
        destination,
        expected,
        agent=agent,
        version=version,
    ):
        return False

    temporary: Path | None = None
    try:
        temporary = Path(tempfile.mkdtemp(prefix=f".{version}.", dir=destination.parent))
        for name, contents in expected.items():
            (temporary / name).write_bytes(contents)
        if path_exists(destination):
            changed = replace_capture_directory(destination, temporary, expected)
        else:
            try:
                os.replace(temporary, destination)
            except OSError as error:
                raise SourceCaptureError(
                    f"cannot install source capture {destination}: {error}"
                ) from error
            changed = True
        temporary = None
    finally:
        if temporary is not None and temporary.is_dir():
            remove_capture_directory(temporary)
    return changed


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
        index_path = official_index_path(official_root, agent)
        index = read_json_object(index_path)
        repository = index.get("repository")
        releases = index.get("releases")
        if not isinstance(repository, str) or repository != config["repository"]:
            raise SourceCaptureError(f"official repository mismatch for {agent}")
        if not isinstance(releases, dict):
            raise SourceCaptureError(f"official releases are invalid for {agent}")
        upstream_versions = set().union(
            *(
                existing_versions(phistory_root, source)
                for source in dict.fromkeys((agent, *phistory_agent_ids(agent)))
            )
        )
        overlay_versions = existing_versions(overlay_root, agent)
        threshold = parse_timestamp(
            SOURCE_CAPTURE_SINCE, context="source capture rollout"
        )
        coverage_starts = (
            *(
                earliest_capture_timestamp((phistory_root,), source)
                for source in dict.fromkeys((agent, *phistory_agent_ids(agent)))
            ),
            earliest_capture_timestamp((overlay_root,), agent, ignore_invalid=True),
        )
        for coverage_start in coverage_starts:
            if coverage_start is not None:
                threshold = min(threshold, coverage_start)
        written = 0
        for version, release in releases.items():
            if version in upstream_versions:
                continue
            if not isinstance(release, dict) or release.get("version") != version:
                raise SourceCaptureError(f"official release identity mismatch: {agent} {version}")
            # Tag-only records enrich code evidence, but without an authoritative
            # release timestamp they must not invent a source-only history entry.
            if not isinstance(release.get("publishedAt"), str):
                continue
            if version not in overlay_versions and parse_timestamp(
                release_timestamp(release), context=f"{agent} {version} release"
            ) < threshold:
                continue
            changed = write_capture(
                overlay_root=overlay_root,
                agent=agent,
                config=config,
                repository=repository,
                release=release,
            )
            if changed:
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
