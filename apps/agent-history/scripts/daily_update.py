#!/usr/bin/env python3
"""Run the locked Phistory-to-AgentLab daily publication pipeline."""

from __future__ import annotations

import argparse
import fcntl
import json
import logging
import os
import signal
import shlex
import socket
import subprocess
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Mapping, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from official_release_sources import GITHUB_RELEASE_SOURCES


APP_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = APP_ROOT / "scripts"
DEFAULT_CACHE_ROOT = APP_ROOT / ".cache" / "phistory"
DEFAULT_OFFICIAL_CACHE_ROOT = APP_ROOT / ".cache" / "official-sources"
DEFAULT_CAPTURE_OVERLAY_ROOT = APP_ROOT / ".cache" / "agentlab-captures"
DEFAULT_ANALYSIS_ROOT = APP_ROOT / "analysis"
DEFAULT_PUBLIC_ROOT = APP_ROOT / "public"
DEFAULT_LOCK = APP_ROOT / ".cache" / "daily-update.lock"
LOG = logging.getLogger("daily-update")
_ACTIVE_STEP_PROCESS: subprocess.Popen[bytes] | None = None
_HANDLING_SIGNAL = False


class PipelineError(RuntimeError):
    """Raised when the daily pipeline cannot complete safely."""


class PipelineInterrupted(BaseException):
    """Raised after a termination signal has cleaned up the active step."""

    def __init__(self, signum: int):
        self.signum = signum
        super().__init__(f"pipeline interrupted by signal {signum}")


@dataclass(frozen=True)
class Step:
    name: str
    command: tuple[str, ...]
    cwd: Path
    required: bool = True
    environment: Mapping[str, str] | None = None


def signal_step_group(process: subprocess.Popen[bytes], signum: int) -> None:
    try:
        os.killpg(process.pid, signum)
    except ProcessLookupError:
        pass


def stop_step_group(
    process: subprocess.Popen[bytes], *, initial_signal: int = signal.SIGTERM, grace: float = 3.0
) -> None:
    # Cooperative SIGTERM gives analyze_changelogs time to stop its own Codex
    # session before this outer process group is escalated.
    signal_step_group(process, initial_signal)
    try:
        process.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        pass
    signal_step_group(process, signal.SIGKILL)
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass


def handle_pipeline_signal(signum: int, _frame: object) -> None:
    global _HANDLING_SIGNAL
    process = _ACTIVE_STEP_PROCESS
    if _HANDLING_SIGNAL:
        if process is not None:
            signal_step_group(process, signal.SIGKILL)
        raise PipelineInterrupted(signum)
    _HANDLING_SIGNAL = True
    try:
        LOG.warning("received signal %s; stopping active pipeline step", signum)
        if process is not None:
            stop_step_group(process, initial_signal=signum)
    finally:
        _HANDLING_SIGNAL = False
    raise PipelineInterrupted(signum)


@contextmanager
def pipeline_signal_handlers() -> Iterator[None]:
    previous = {
        signum: signal.getsignal(signum) for signum in (signal.SIGTERM, signal.SIGINT)
    }
    for signum in previous:
        signal.signal(signum, handle_pipeline_signal)
    try:
        yield
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)


@contextmanager
def exclusive_lock(path: Path) -> Iterator[None]:
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+", encoding="utf-8")
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            handle.seek(0)
            owner = handle.read().strip() or "unknown owner"
            raise PipelineError(f"another daily update holds {path}: {owner}") from error
        handle.seek(0)
        handle.truncate()
        handle.write(
            json.dumps(
                {
                    "pid": os.getpid(),
                    "host": socket.gethostname(),
                    "startedAt": datetime.now(timezone.utc).isoformat(),
                },
                sort_keys=True,
            )
            + "\n"
        )
        handle.flush()
        os.fsync(handle.fileno())
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def build_steps(args: argparse.Namespace) -> list[Step]:
    python = str(Path(args.python_bin).expanduser())
    cache_root = args.cache_root.expanduser().resolve()
    upstream = cache_root / "upstream"
    official_cache_root = args.official_cache_root.expanduser().resolve()
    analysis_root = args.analysis_root.expanduser().resolve()
    public_root = args.public_root.expanduser().resolve()
    capture_overlay_root = args.capture_overlay_root.expanduser().resolve()
    agents = args.agents

    sync = [
        python,
        str(SCRIPTS / "sync_phistory.py"),
        "--cache-root",
        str(cache_root),
        "--remote",
        args.remote,
        "--ref",
        args.ref,
        "--agents",
        agents,
    ]
    sync_official = [
        python,
        str(SCRIPTS / "sync_official_sources.py"),
        "--cache-root",
        str(official_cache_root),
        "--allow-stale-on-error",
        "--agents",
        agents,
        "--capture-root",
        str(upstream),
        "--capture-root",
        str(capture_overlay_root),
    ]
    sync_source_captures = [
        python,
        str(SCRIPTS / "sync_source_captures.py"),
        "--official-root",
        str(official_cache_root / "normalized"),
        "--phistory-root",
        str(upstream),
        "--overlay-root",
        str(capture_overlay_root),
    ]
    requested_agents = None if agents == "all" else tuple(
        part.strip() for part in agents.split(",") if part.strip()
    )
    source_agents = (
        tuple(GITHUB_RELEASE_SOURCES)
        if requested_agents is None
        else tuple(
            agent for agent in requested_agents if agent in GITHUB_RELEASE_SOURCES
        )
    )
    if source_agents:
        sync_source_captures.extend(("--agents", ",".join(source_agents)))
    build = [
        python,
        str(SCRIPTS / "build_from_phistory.py"),
        "--phistory-root",
        str(upstream),
        "--capture-overlay-root",
        str(capture_overlay_root),
        "--public-root",
        str(public_root),
        "--analysis-root",
        str(analysis_root),
        "--agents",
        agents,
    ]
    analyze = [
        python,
        str(SCRIPTS / "analyze_changelogs.py"),
        "--analysis-root",
        str(analysis_root),
        "--agents",
        agents,
        "--batch-size",
        str(args.batch_size),
        "--timeout",
        str(args.codex_timeout),
        "--retries",
        str(args.retries),
        "--reasoning-effort",
        args.reasoning_effort,
        "--codex-bin",
        args.codex_bin,
        "--fair-agents",
    ]
    if args.model:
        analyze.extend(("--model", args.model))
    if args.fake_analyzer:
        analyze.append("--fake-analyzer")
    if args.batch_delay:
        analyze.extend(("--batch-delay", str(args.batch_delay)))
    if args.max_releases is not None:
        analyze.extend(("--max-releases", str(args.max_releases)))
    if args.newest_first:
        analyze.append("--newest-first")

    steps = []
    if args.require_codex:
        steps.append(
            Step(
                "check Codex login",
                (args.codex_bin, "login", "status"),
                APP_ROOT,
            )
        )
    steps.extend(
        [
            Step("sync upstream", tuple(sync), APP_ROOT),
            Step("sync official sources", tuple(sync_official), APP_ROOT),
        ]
    )
    if source_agents:
        steps.append(Step("sync source-only captures", tuple(sync_source_captures), APP_ROOT))
    steps.extend(
        [
            Step("build deterministic evidence", tuple(build), APP_ROOT),
            Step(
                "analyze stale changelogs",
                tuple(analyze),
                APP_ROOT,
                required=args.require_codex,
            ),
            Step("merge validated changelogs", tuple(build), APP_ROOT),
            Step("run tests", (args.npm_bin, "test"), APP_ROOT),
            Step(
                "build site",
                (args.npm_bin, "run", "build"),
                APP_ROOT,
                environment={
                    "AGENT_HISTORY_CAPTURE_OVERLAY_ROOT": str(capture_overlay_root),
                    "PHISTORY_AGENTS": agents,
                },
            ),
        ]
    )
    if args.deploy:
        steps.append(
            Step(
                "deploy with Wrangler",
                (args.npx_bin, "--no-install", "wrangler", "deploy"),
                APP_ROOT,
            )
        )
    return steps


def optional_failure(step: Step, message: str) -> bool:
    if step.required:
        raise PipelineError(message)
    LOG.error(
        "[%s] OPTIONAL STEP FAILED: %s; continuing with deterministic changelog fallback",
        step.name,
        message,
    )
    return False


def run_step(step: Step, *, timeout: float, dry_run: bool) -> bool:
    global _ACTIVE_STEP_PROCESS
    LOG.info("[%s] %s", step.name, shlex.join(step.command))
    if dry_run:
        return True
    try:
        process = subprocess.Popen(
            step.command,
            cwd=step.cwd,
            env=(
                {**os.environ, **step.environment}
                if step.environment is not None
                else None
            ),
            start_new_session=True,
        )
    except OSError as error:
        message = f"{step.name} failed to start: {error}"
        if step.required:
            raise PipelineError(message) from error
        return optional_failure(step, message)
    _ACTIVE_STEP_PROCESS = process
    try:
        try:
            returncode = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired as error:
            stop_step_group(process)
            message = f"{step.name} timed out after {timeout:g}s"
            if step.required:
                raise PipelineError(message) from error
            return optional_failure(step, message)
    finally:
        if _ACTIVE_STEP_PROCESS is process:
            _ACTIVE_STEP_PROCESS = None
    if returncode != 0:
        return optional_failure(step, f"{step.name} exited with {returncode}")
    return True


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock-file", type=Path, default=DEFAULT_LOCK)
    parser.add_argument(
        "--capture-overlay-root",
        type=Path,
        default=Path(
            os.environ.get(
                "AGENT_HISTORY_CAPTURE_OVERLAY_ROOT",
                str(DEFAULT_CAPTURE_OVERLAY_ROOT),
            )
        ),
        help="optional local Phistory-format capture overlay",
    )
    parser.add_argument(
        "--remote",
        default=os.environ.get(
            "PHISTORY_REMOTE", "https://github.com/WEIFENG2333/phistory.git"
        ),
    )
    parser.add_argument("--ref", default=os.environ.get("PHISTORY_REF", "main"))
    parser.add_argument(
        "--agents",
        default=os.environ.get("PHISTORY_AGENTS", "all"),
        help="comma-separated agent ids, or 'all' for every Phistory agent (default: all)",
    )
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--batch-delay", type=float, default=0.0)
    parser.add_argument(
        "--max-releases",
        type=int,
        default=20,
        help="maximum stale releases per daily run; use 0 for no cap",
    )
    parser.add_argument(
        "--newest-first",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="prioritize newest stale releases during a capped backfill",
    )
    parser.add_argument("--codex-timeout", type=float, default=180.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--codex-bin", default=os.environ.get("CODEX_BIN", "codex"))
    parser.add_argument(
        "--require-codex",
        action="store_true",
        help="fail unless Codex is installed, logged in, and analysis succeeds",
    )
    parser.add_argument("--model", default=os.environ.get("AGENT_HISTORY_CODEX_MODEL"))
    parser.add_argument(
        "--reasoning-effort",
        choices=("low", "medium", "high", "xhigh"),
        default=os.environ.get("AGENT_HISTORY_REASONING_EFFORT", "medium"),
    )
    parser.add_argument("--step-timeout", type=float, default=1800.0)
    parser.add_argument("--python-bin", default=sys.executable)
    parser.add_argument("--npm-bin", default=os.environ.get("NPM_BIN", "npm"))
    parser.add_argument("--npx-bin", default=os.environ.get("NPX_BIN", "npx"))
    parser.add_argument("--deploy", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fake-analyzer", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)
    if args.max_releases == 0:
        args.max_releases = None
    if args.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    if args.max_releases is not None and args.max_releases < 1:
        parser.error("--max-releases must be at least 1, or 0 for no cap")
    if args.batch_delay < 0 or args.codex_timeout <= 0 or args.step_timeout <= 0:
        parser.error("timeouts must be positive and --batch-delay must be non-negative")
    if args.retries < 0:
        parser.error("--retries must be non-negative")
    # npm run build intentionally uses the app's canonical generated-data paths;
    # keep every preceding pipeline step on those same paths.
    args.cache_root = DEFAULT_CACHE_ROOT
    args.official_cache_root = DEFAULT_OFFICIAL_CACHE_ROOT
    args.analysis_root = DEFAULT_ANALYSIS_ROOT
    args.public_root = DEFAULT_PUBLIC_ROOT
    return args


def _main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    steps = build_steps(args)
    LOG.info(
        "daily pipeline starting (%d steps, deploy=%s, dry-run=%s)",
        len(steps),
        args.deploy,
        args.dry_run,
    )
    if args.dry_run:
        for step in steps:
            run_step(step, timeout=args.step_timeout, dry_run=True)
        LOG.info("daily pipeline dry run completed")
        return 0
    optional_failures: list[str] = []
    with exclusive_lock(args.lock_file):
        for step in steps:
            if not run_step(step, timeout=args.step_timeout, dry_run=False):
                optional_failures.append(step.name)
    if optional_failures:
        LOG.warning(
            "daily pipeline completed with deterministic fallback; optional failures: %s",
            ", ".join(optional_failures),
        )
    else:
        LOG.info("daily pipeline completed successfully")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    with pipeline_signal_handlers():
        return _main(argv)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PipelineInterrupted as error:
        LOG.warning("daily pipeline stopped by signal %s", error.signum)
        raise SystemExit(128 + error.signum) from None
    except PipelineError as error:
        LOG.error("%s", error)
        raise SystemExit(1) from error
