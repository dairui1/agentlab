#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import json
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_MARKERS = ("pyproject.toml", "data/agents.json")


class SyncError(RuntimeError):
    pass


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if all((candidate / marker).exists() for marker in ROOT_MARKERS):
            return candidate
    raise SyncError("Could not find AgentLab repository root.")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SyncError(f"Missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SyncError(f"Invalid JSON in {path}: {exc}") from exc


def run(command: list[str], cwd: Path | None = None, timeout: int = 600) -> str:
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise SyncError(f"Missing executable: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip()
        stdout = exc.stdout.strip()
        detail = stderr or stdout or f"exit code {exc.returncode}"
        raise SyncError(f"Command failed: {' '.join(command)}\n{detail}") from exc
    except subprocess.TimeoutExpired as exc:
        raise SyncError(f"Command timed out after {timeout}s: {' '.join(command)}") from exc
    return result.stdout.strip()


def ensure_relative_path(root: Path, value: str, field: str) -> Path:
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        raise SyncError(f"{field} must be a relative path inside the repository: {value}")
    return root / path


def repo_relative(root: Path, path: Path) -> str:
    return str(path.resolve().relative_to(root.resolve()))


def safe_extract(tar_path: Path, destination: Path, exclude_patterns: list[str]) -> int:
    extracted = 0
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "r:gz") as archive:
        for member in archive.getmembers():
            name = member.name
            relative_name = name.removeprefix("package/")
            if not relative_name:
                continue
            if any(fnmatch.fnmatch(relative_name, pattern) or fnmatch.fnmatch(name, pattern) for pattern in exclude_patterns):
                continue
            target = (destination / relative_name).resolve()
            if not str(target).startswith(str(destination.resolve()) + "/") and target != destination.resolve():
                raise SyncError(f"Refusing to extract path outside destination: {name}")
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                continue
            with source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
            extracted += 1
    return extracted


def sync_git(root: Path, target: dict[str, Any], cache_dir: Path, dry_run: bool, metadata_only: bool) -> dict[str, Any]:
    branch = target.get("default_branch")
    if not isinstance(branch, str) or not branch:
        raise SyncError(f"{target.get('agent')}: git target requires default_branch.")
    url = target.get("url")
    if not isinstance(url, str) or not url:
        raise SyncError(f"{target.get('agent')}: git target requires url.")

    local_path = cache_dir / "git" / str(target["agent"])
    depth = target.get("depth")
    fetch_tags = bool(target.get("fetch_tags", False))
    sparse_paths = target.get("sparse_paths") or []
    if not isinstance(sparse_paths, list):
        raise SyncError(f"{target.get('agent')}: sparse_paths must be a list when present.")
    clone_command = ["git", "clone", "--branch", branch]
    if not fetch_tags:
        clone_command.append("--no-tags")
    if isinstance(depth, int) and depth > 0:
        clone_command.extend(["--depth", str(depth)])
    if sparse_paths:
        clone_command.extend(["--filter=blob:none", "--sparse"])
    clone_command.extend([url, str(local_path)])
    remote_head = run(["git", "ls-remote", url, f"refs/heads/{branch}"]).split("\t")[0]

    if not dry_run and not metadata_only:
        if not local_path.exists():
            local_path.parent.mkdir(parents=True, exist_ok=True)
            run(clone_command)
            if sparse_paths:
                run(["git", "-C", str(local_path), "sparse-checkout", "set", "--cone", *map(str, sparse_paths)])
        else:
            run(["git", "-C", str(local_path), "remote", "set-url", "origin", url])
            if sparse_paths:
                run(["git", "-C", str(local_path), "config", "core.sparseCheckout", "true"])
                run(["git", "-C", str(local_path), "sparse-checkout", "set", "--cone", *map(str, sparse_paths)])
            fetch_command = ["git", "-C", str(local_path), "fetch", "--prune"]
            fetch_command.append("--tags" if fetch_tags else "--no-tags")
            fetch_command.append("origin")
            if isinstance(depth, int) and depth > 0:
                fetch_command.extend(["--depth", str(depth)])
            run(fetch_command)
            run(["git", "-C", str(local_path), "checkout", branch])
            pull_command = ["git", "-C", str(local_path), "pull", "--ff-only"]
            if not fetch_tags:
                pull_command.append("--no-tags")
            if isinstance(depth, int) and depth > 0:
                pull_command.extend(["--depth", str(depth)])
            pull_command.extend(["origin", branch])
            run(pull_command)

    commit = run(["git", "-C", str(local_path), "rev-parse", "HEAD"]) if local_path.exists() and not metadata_only else None
    return {
        "status": "metadata-only" if metadata_only else ("synced" if commit else "planned"),
        "kind": "git",
        "agent": target["agent"],
        "name": target.get("name"),
        "url": url,
        "branch": branch,
        "depth": depth,
        "fetch_tags": fetch_tags,
        "sparse_paths": sparse_paths,
        "commit": commit,
        "remote_head": remote_head,
        "license": target.get("license"),
        "local_path": repo_relative(root, local_path),
    }


def npm_view(package: str) -> dict[str, Any]:
    output = run(["npm", "view", package, "name", "version", "dist.tarball", "license", "--json"])
    data = json.loads(output)
    if isinstance(data, list):
        data = data[-1]
    if not isinstance(data, dict):
        raise SyncError(f"Unexpected npm metadata for {package}.")
    return data


def sync_npm(root: Path, target: dict[str, Any], cache_dir: Path, dry_run: bool, metadata_only: bool) -> dict[str, Any]:
    package = target.get("package")
    if not isinstance(package, str) or not package:
        raise SyncError(f"{target.get('agent')}: npm target requires package.")

    metadata = npm_view(package)
    version = str(metadata.get("version"))
    package_root = cache_dir / "npm" / str(target["agent"])
    tarball_dir = package_root / "tarballs"
    extract_dir = package_root / "package"
    tarball_path: Path | None = None
    extracted_files = 0

    if not dry_run and not metadata_only:
        tarball_dir.mkdir(parents=True, exist_ok=True)
        pack_output = run(["npm", "pack", f"{package}@{version}", "--pack-destination", str(tarball_dir), "--json"])
        packed = json.loads(pack_output)
        if not packed or not isinstance(packed, list):
            raise SyncError(f"Unexpected npm pack output for {package}.")
        tarball_path = tarball_dir / packed[0]["filename"]
        if extract_dir.exists():
            shutil.rmtree(extract_dir)
        exclude_patterns = list(target.get("exclude_patterns") or [])
        extracted_files = safe_extract(tarball_path, extract_dir, exclude_patterns)

    return {
        "status": "metadata-only" if metadata_only else ("synced" if not dry_run else "planned"),
        "kind": "npm",
        "agent": target["agent"],
        "name": target.get("name"),
        "package": package,
        "version": version,
        "tarball": metadata.get("dist.tarball"),
        "license": metadata.get("license") or target.get("license"),
        "excluded_patterns": target.get("exclude_patterns", []),
        "local_path": repo_relative(root, extract_dir),
        "cached_tarball": repo_relative(root, tarball_path) if tarball_path else None,
        "extracted_files": extracted_files,
    }


def sync_unavailable(target: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "unavailable",
        "kind": "unavailable",
        "agent": target["agent"],
        "name": target.get("name"),
        "reason": target.get("reason", "No public source target configured."),
        "notes": target.get("notes"),
    }


def build_manifest(root: Path, config: dict[str, Any], only_agents: set[str], dry_run: bool, metadata_only: bool) -> dict[str, Any]:
    cache_dir = ensure_relative_path(root, config.get("cache_dir", "research/sources/cache"), "cache_dir")
    targets = config.get("targets")
    if not isinstance(targets, list):
        raise SyncError("data/source_targets.json must contain targets list.")

    entries: list[dict[str, Any]] = []
    for target in targets:
        if not isinstance(target, dict):
            raise SyncError("Each source target must be an object.")
        agent = target.get("agent")
        if not isinstance(agent, str) or not agent:
            raise SyncError("Each source target requires agent.")
        if only_agents and agent not in only_agents:
            continue

        kind = target.get("kind")
        if kind == "git":
            entry = sync_git(root, target, cache_dir, dry_run, metadata_only)
        elif kind == "npm":
            entry = sync_npm(root, target, cache_dir, dry_run, metadata_only)
        elif kind == "unavailable":
            entry = sync_unavailable(target)
        else:
            raise SyncError(f"{agent}: unsupported source target kind: {kind}")
        entries.append(entry)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return {
        "generated_at": now,
        "cache_dir": repo_relative(root, cache_dir),
        "metadata_only": metadata_only,
        "targets": entries,
    }


def comparable_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    comparable = dict(manifest)
    comparable.pop("generated_at", None)
    return comparable


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync public agent source targets into a local cache.")
    parser.add_argument("--root", help="Repository root. Defaults to auto-detection.")
    parser.add_argument("--agent", action="append", default=[], help="Only sync one agent slug. Can be repeated.")
    parser.add_argument("--dry-run", action="store_true", help="Resolve metadata without changing local caches.")
    parser.add_argument("--metadata-only", action="store_true", help="Write manifest metadata without downloading source caches.")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else find_repo_root()
    config_path = root / "data" / "source_targets.json"
    config = load_json(config_path)
    if not isinstance(config, dict):
        raise SyncError("data/source_targets.json must contain an object.")

    manifest = build_manifest(root, config, set(args.agent), args.dry_run, args.metadata_only)
    manifest_path = ensure_relative_path(root, config.get("manifest_path", "generated/source-sync-manifest.json"), "manifest_path")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    previous = load_json(manifest_path) if manifest_path.exists() else None
    if isinstance(previous, dict) and comparable_manifest(previous) == comparable_manifest(manifest):
        print(f"No manifest metadata changes in {manifest_path.relative_to(root)}")
    else:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {manifest_path.relative_to(root)}")

    for entry in manifest["targets"]:
        label = entry.get("name") or entry["agent"]
        detail = entry.get("commit") or entry.get("version") or entry.get("reason")
        print(f"- {entry['agent']}: {entry['status']} {label} {detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
