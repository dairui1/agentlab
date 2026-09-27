#!/usr/bin/env python3
"""Version-pinned third-party Claude Code strings, separate from runtime captures."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

REPOSITORY = "Piebald-AI/claude-code-system-prompts"
URL = f"https://github.com/{REPOSITORY}"
DEFAULT_ROOT = Path(__file__).resolve().parents[1] / ".cache" / "claude-static"
VERSION = re.compile(r"^v(\d+\.\d+\.\d+)(?:\s|$)")
CATEGORIES = {"Agent Prompt", "System Prompt", "System Reminder", "Tool Description", "Tool Parameter", "Skill", "Data"}


def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), *args], check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180).stdout


def parse_prompt(path: str, text: str, commit: str) -> dict:
    header = re.match(r"\s*<!--\s*\n(.*?)\n-->\s*", text, re.S)
    if not header:
        raise ValueError(f"missing prompt metadata: {path}")
    fields = {}
    for key in ("name", "description", "ccVersion"):
        match = re.search(rf"^{key}:\s*(\".*\")\s*$", header[1], re.M)
        if not match:
            raise ValueError(f"missing {key}: {path}")
        fields[key] = json.loads(match[1])
    category = fields["name"].split(":", 1)[0]
    if category not in CATEGORIES:
        raise ValueError(f"unknown prompt category {category}: {path}")
    content = text[header.end():].strip()
    if not content:
        raise ValueError(f"empty prompt: {path}")
    return {
        "id": Path(path).stem, "name": fields["name"], "category": category,
        "description": fields["description"], "content": content,
        "content_hash": hashlib.sha256(content.encode()).hexdigest(),
        "sourceUrl": f"{URL}/blob/{commit}/{path}",
        # This is the last change of this fragment, not the snapshot version.
        "lastChangedVersion": fields["ccVersion"],
    }


def snapshot(repo: Path, version: str, commit: str) -> dict:
    raw = git(repo, "archive", commit, "system-prompts")
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError("static archive exceeds size limit")
    prompts = []
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for member in archive:
            if not member.isfile() or not member.name.endswith(".md"):
                continue
            stream = archive.extractfile(member)
            assert stream is not None
            prompts.append(parse_prompt(member.name, stream.read().decode(), commit))
    if not prompts or len(prompts) > 5000:
        raise ValueError(f"invalid prompt count for {version}: {len(prompts)}")
    prompts.sort(key=lambda item: item["id"])
    return {
        "agent_id": "claude-code", "version": version,
        "source": {"sourceType": "third-party-static-prompt", "repository": REPOSITORY,
                   "ref": commit, "url": f"{URL}/tree/{commit}/system-prompts",
                   "evidenceClass": "third-party-static-extraction",
                   "runtimeVerified": False},
        "summary": {"total": len(prompts), "known": len(prompts), "unknown": 0},
        "prompts": prompts,
    }


def sync(root: Path, window: int = 13) -> dict:
    if not 2 <= window <= 100:
        raise ValueError("window must be between 2 and 100")
    root.mkdir(parents=True, exist_ok=True)
    repo = root / "upstream"
    if not repo.exists():
        subprocess.run(["git", "clone", f"{URL}.git", str(repo)], check=True, timeout=180)
    if git(repo, "remote", "get-url", "origin").decode().strip().removesuffix(".git") != URL:
        raise ValueError("unexpected Claude static repository origin")
    git(repo, "fetch", "origin", "main")
    head = git(repo, "rev-parse", "origin/main").decode().strip()
    versions = {}
    for line in git(repo, "log", head, "--format=%H %s").decode().splitlines():
        commit, subject = line.split(" ", 1)
        match = VERSION.match(subject)
        if match:
            versions.setdefault(match[1], commit)
    selected = sorted(versions, key=lambda value: tuple(map(int, value.split("."))))[-window:]
    if len(selected) < 2:
        raise ValueError("no comparable Claude static release history")
    target = root / "normalized"
    target.mkdir(exist_ok=True)
    counts = {}
    pending_snapshots = {}
    # Publish the manifest last; failed fetch/parse never masquerades as a fresh generation.
    for version in selected:
        value = snapshot(repo, version, versions[version])
        pending_snapshots[version] = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
        counts[version] = value["summary"]["total"]
    old = json.loads((target / "manifest.json").read_text()) if (target / "manifest.json").exists() else {}
    retained_versions = {**old.get("versions", {}), **{v: versions[v] for v in selected}}
    hashes = {**old.get("sha256", {}), **{
        version: hashlib.sha256(text.encode()).hexdigest() for version, text in pending_snapshots.items()}}
    manifest = {"repository": REPOSITORY, "commit": head, "latestVersion": selected[-1],
                "window": window, "versions": retained_versions,
                "counts": {**old.get("counts", {}), **counts}, "sha256": hashes}
    for version, text in pending_snapshots.items():
        path = target / f"{version}.json"
        pending = path.with_suffix(".tmp")
        pending.write_text(text)
        pending.replace(path)
    pending = target / "manifest.tmp"
    pending.write_text(json.dumps(manifest, indent=2) + "\n")
    pending.replace(target / "manifest.json")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--window", type=int, default=13)
    args = parser.parse_args()
    print(json.dumps(sync(args.cache_root.resolve(), args.window), indent=2))


if __name__ == "__main__":
    main()
