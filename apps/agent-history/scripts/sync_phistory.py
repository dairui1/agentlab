#!/usr/bin/env python3
"""Maintain a shallow, blob-filtered, sparse checkout of Phistory captures."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from official_release_sources import phistory_agent_ids


APP_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE_ROOT = APP_ROOT / ".cache" / "phistory"
DEFAULT_REPO_DIR = DEFAULT_CACHE_ROOT / "upstream"
DEFAULT_REMOTE = "https://github.com/WEIFENG2333/phistory.git"
DEFAULT_REF = "main"
DEFAULT_AGENTS = "all"
AGENT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
SHA_RE = re.compile(r"^[0-9a-f]{40,64}$")
LOG = logging.getLogger("sync-phistory")
NETWORK_RETRY_DELAYS = (2.0, 8.0)


class SyncError(RuntimeError):
    """Raised when the managed upstream checkout is unsafe or incomplete."""


@dataclass(frozen=True)
class SyncResult:
    repo: str
    remote: str
    ref: str
    previous_sha: str | None
    fetched_sha: str
    current_sha: str
    changed: bool
    sparse_paths: tuple[str, ...]


def run(
    command: Sequence[str], *, cwd: Path | None = None, timeout: float = 300.0
) -> str:
    try:
        completed = subprocess.run(
            list(command),
            cwd=cwd,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SyncError(f"command failed to start or timed out: {' '.join(command)}: {error}") from error
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise SyncError(
            f"command exited with {completed.returncode}: {' '.join(command)}"
            + (f"\n{detail}" if detail else "")
        )
    return completed.stdout.strip()


def run_network_command(
    command: Sequence[str], *, timeout: float = 300.0
) -> str:
    for attempt, delay in enumerate((*NETWORK_RETRY_DELAYS, None), start=1):
        try:
            return run(command, timeout=timeout)
        except SyncError:
            if delay is None:
                raise
            LOG.warning(
                "network Git command failed; retrying in %.1fs (%d/%d)",
                delay,
                attempt + 1,
                len(NETWORK_RETRY_DELAYS) + 1,
            )
            time.sleep(delay)
    raise AssertionError("unreachable")


def git(repo: Path, *arguments: str, timeout: float = 300.0) -> str:
    return run(("git", "-C", str(repo), *arguments), timeout=timeout)


def parse_agents(raw: str) -> tuple[str, ...]:
    agents = tuple(dict.fromkeys(part.strip() for part in raw.split(",") if part.strip()))
    if not agents:
        raise SyncError("at least one agent is required")
    if "all" in agents:
        if agents != ("all",):
            raise SyncError("'all' cannot be combined with explicit agent ids")
        return agents
    invalid = [agent for agent in agents if not AGENT_RE.fullmatch(agent)]
    if invalid:
        raise SyncError(f"invalid agent id(s): {', '.join(invalid)}")
    return agents


def sparse_paths(agents: Sequence[str]) -> tuple[str, ...]:
    if tuple(agents) == ("all",):
        return ("captures",)
    return tuple(
        f"captures/{source_agent}"
        for agent in agents
        for source_agent in phistory_agent_ids(agent)
    )


def assert_clean(repo: Path) -> None:
    dirty = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
    if dirty:
        sample = "\n".join(dirty.splitlines()[:12])
        raise SyncError(
            f"managed checkout has local changes; refusing to overwrite {repo}:\n{sample}"
        )


def current_sha(repo: Path) -> str | None:
    completed = subprocess.run(
        ("git", "-C", str(repo), "rev-parse", "--verify", "HEAD^{commit}"),
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    value = completed.stdout.strip()
    return value if completed.returncode == 0 and SHA_RE.fullmatch(value) else None


def configure_sparse(repo: Path, paths: Sequence[str]) -> None:
    # Non-cone patterns avoid Git's cone-mode behavior of materializing every
    # root-level upstream file. We only need capture artifacts, not Phistory's
    # application source.
    patterns = tuple(f"/{path}/" for path in paths)
    git(repo, "sparse-checkout", "init", "--no-cone")
    git(repo, "sparse-checkout", "set", "--no-cone", *patterns)


def clone_checkout(
    repo: Path, *, remote: str, ref: str, paths: Sequence[str], timeout: float
) -> str:
    repo.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{repo.name}.clone-", dir=repo.parent))
    try:
        run_network_command(
            (
                "git",
                "clone",
                "--filter=blob:none",
                "--no-checkout",
                "--sparse",
                "--single-branch",
                "--depth=1",
                "--branch",
                ref,
                remote,
                str(temporary),
            ),
            timeout=timeout,
        )
        configure_sparse(temporary, paths)
        fetched = git(temporary, "rev-parse", "--verify", f"origin/{ref}^{{commit}}")
        if not SHA_RE.fullmatch(fetched):
            raise SyncError(f"upstream returned an invalid commit id: {fetched}")
        git(temporary, "switch", "--detach", fetched)
        os.replace(temporary, repo)
        return fetched
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def update_checkout(
    repo: Path, *, remote: str, ref: str, paths: Sequence[str], timeout: float
) -> tuple[str | None, str]:
    if not (repo / ".git").is_dir():
        raise SyncError(f"destination exists but is not a Git checkout: {repo}")
    configured_remote = git(repo, "remote", "get-url", "origin")
    if configured_remote != remote:
        raise SyncError(
            f"origin URL mismatch for {repo}: expected {remote!r}, found {configured_remote!r}"
        )
    assert_clean(repo)
    previous = current_sha(repo)
    configure_sparse(repo, paths)
    run_network_command(
        (
            "git",
            "-C",
            str(repo),
            "fetch",
            "--prune",
            "--depth=1",
            "--filter=blob:none",
            "origin",
            f"+refs/heads/{ref}:refs/remotes/origin/{ref}",
        ),
        timeout=timeout,
    )
    fetched = git(repo, "rev-parse", "--verify", f"origin/{ref}^{{commit}}")
    if not SHA_RE.fullmatch(fetched):
        raise SyncError(f"upstream returned an invalid commit id: {fetched}")
    if previous != fetched:
        git(repo, "switch", "--detach", fetched)
    return previous, fetched


def sync_repository(
    repo: Path,
    *,
    remote: str,
    ref: str,
    agents: Sequence[str],
    metadata_only: bool = False,
    timeout: float = 300.0,
) -> SyncResult:
    repo = repo.expanduser().resolve()
    if metadata_only and agents:
        raise SyncError("metadata-only sync cannot include capture agents")
    if not metadata_only and not agents:
        raise SyncError("at least one capture agent is required")
    paths = () if metadata_only else sparse_paths(agents)
    checkout_paths = (
        ("captures/.agentlab-metadata-only",) if metadata_only else paths
    )
    LOG.info("syncing %s ref %s into %s", remote, ref, repo)
    if repo.exists():
        previous, fetched = update_checkout(
            repo, remote=remote, ref=ref, paths=checkout_paths, timeout=timeout
        )
    else:
        previous = None
        fetched = clone_checkout(
            repo, remote=remote, ref=ref, paths=checkout_paths, timeout=timeout
        )
    current = current_sha(repo)
    if current != fetched:
        raise SyncError(
            f"checkout verification failed: fetched {fetched}, checked out {current or 'nothing'}"
        )
    if metadata_only:
        git(repo, "cat-file", "-e", "HEAD^{tree}:captures")
        captures = repo / "captures"
        captures.mkdir(exist_ok=True)
        if captures.is_symlink() or not captures.is_dir():
            raise SyncError(f"upstream captures root is invalid: {captures}")
    missing = [path for path in paths if not (repo / path).is_dir()]
    if missing:
        raise SyncError(f"upstream is missing requested sparse path(s): {', '.join(missing)}")
    LOG.info(
        "Phistory exact SHA %s (%s)",
        current,
        "updated" if previous != current else "unchanged",
    )
    return SyncResult(
        repo=str(repo),
        remote=remote,
        ref=ref,
        previous_sha=previous,
        fetched_sha=fetched,
        current_sha=current,
        changed=previous != current,
        sparse_paths=paths,
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    destination = parser.add_mutually_exclusive_group()
    destination.add_argument("--repo-dir", type=Path)
    destination.add_argument(
        "--cache-root",
        type=Path,
        help="cache directory; the checkout is stored in CACHE_ROOT/upstream",
    )
    parser.add_argument(
        "--remote", default=os.environ.get("PHISTORY_REMOTE", DEFAULT_REMOTE)
    )
    parser.add_argument("--ref", default=os.environ.get("PHISTORY_REF", DEFAULT_REF))
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument(
        "--agents",
        default=os.environ.get("PHISTORY_AGENTS", DEFAULT_AGENTS),
        help="comma-separated agent ids, or 'all' to sync every Phistory capture (default: all)",
    )
    selection.add_argument(
        "--metadata-only",
        action="store_true",
        help="sync the exact upstream commit without materializing capture contents",
    )
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9._/-]+", args.ref) or args.ref.startswith(("-", "/")):
        parser.error("--ref is not a safe branch name")
    if args.timeout <= 0:
        parser.error("--timeout must be greater than 0")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    repo_dir = args.repo_dir or (
        args.cache_root / "upstream" if args.cache_root else DEFAULT_REPO_DIR
    )
    result = sync_repository(
        repo_dir,
        remote=args.remote,
        ref=args.ref,
        agents=() if args.metadata_only else parse_agents(args.agents),
        metadata_only=args.metadata_only,
        timeout=args.timeout,
    )
    print(json.dumps(asdict(result), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SyncError as error:
        LOG.error("%s", error)
        raise SystemExit(1) from error
