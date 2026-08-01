#!/usr/bin/env python3
"""Render and optionally load the Agent History daily launch agent."""

from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Mapping, Sequence
from xml.sax.saxutils import escape


OPS_ROOT = Path(__file__).resolve().parent
APP_ROOT = OPS_ROOT.parent
TEMPLATE = OPS_ROOT / "com.dairui.agentlab.agent-history.plist.in"
DEFAULT_LABEL = "com.dairui.agentlab.agent-history"
NETWORK_ENVIRONMENT_NAMES = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
)


class InstallError(RuntimeError):
    """Raised when a launch agent cannot be rendered or installed."""


def local_timezone() -> str | None:
    try:
        target = Path("/etc/localtime").resolve()
    except OSError:
        return None
    marker = "/zoneinfo/"
    raw = str(target)
    return raw.split(marker, 1)[1] if marker in raw else None


def render_plist(
    *,
    label: str,
    python: Path,
    app_root: Path,
    search_path: str,
    hour: int,
    minute: int,
    deploy: bool,
    stdout_log: Path,
    stderr_log: Path,
    network_environment: Mapping[str, str] | None = None,
) -> str:
    network_lines: list[str] = []
    for name in NETWORK_ENVIRONMENT_NAMES:
        value = network_environment.get(name) if network_environment else None
        if value:
            network_lines.extend(
                (f"    <key>{name}</key>", f"    <string>{escape(value)}</string>")
            )
    replacements = {
        "{{LABEL}}": escape(label),
        "{{PYTHON}}": escape(str(python)),
        "{{DAILY_SCRIPT}}": escape(str(app_root / "scripts" / "daily_update.py")),
        "{{DEPLOY_ARGUMENT}}": "    <string>--deploy</string>\n" if deploy else "",
        "{{WORKING_DIRECTORY}}": escape(str(app_root)),
        "{{PATH}}": escape(search_path),
        "{{HOUR}}": str(hour),
        "{{MINUTE}}": str(minute),
        "{{STDOUT_LOG}}": escape(str(stdout_log)),
        "{{STDERR_LOG}}": escape(str(stderr_log)),
        "{{NETWORK_ENVIRONMENT}}": "\n".join(network_lines),
    }
    try:
        rendered = TEMPLATE.read_text(encoding="utf-8")
    except OSError as error:
        raise InstallError(f"cannot read launchd template: {error}") from error
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    if "{{" in rendered or "}}" in rendered:
        raise InstallError("launchd template contains an unresolved placeholder")
    try:
        plistlib.loads(rendered.encode("utf-8"))
    except Exception as error:
        raise InstallError(f"rendered launchd plist is invalid: {error}") from error
    return rendered


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, raw_temporary = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(raw_temporary)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        # Proxy URLs can contain credentials. Keep the rendered launch agent
        # private to the installing user even when today's proxy is local-only.
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def launchctl(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    try:
        completed = subprocess.run(
            ("launchctl", *arguments),
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except OSError as error:
        raise InstallError(f"cannot run launchctl: {error}") from error
    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise InstallError(
            f"launchctl {' '.join(arguments)} exited with {completed.returncode}"
            + (f": {detail}" if detail else "")
        )
    return completed


def install_and_load(destination: Path, rendered: str, *, domain: str) -> None:
    previous = destination.read_text(encoding="utf-8") if destination.exists() else None
    if previous is not None:
        launchctl("bootout", domain, str(destination), check=False)
    atomic_write(destination, rendered)
    try:
        launchctl("bootstrap", domain, str(destination))
    except InstallError as error:
        if previous is None:
            destination.unlink(missing_ok=True)
            raise
        atomic_write(destination, previous)
        try:
            launchctl("bootstrap", domain, str(destination))
        except InstallError as rollback_error:
            raise InstallError(
                f"new launch agent failed ({error}); restoring the previous job also failed "
                f"({rollback_error})"
            ) from error
        raise InstallError(
            f"new launch agent failed; the previous plist and loaded job were restored: {error}"
        ) from error


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", default=DEFAULT_LABEL)
    parser.add_argument("--app-root", type=Path, default=APP_ROOT)
    parser.add_argument("--python-bin", type=Path, default=Path(sys.executable))
    parser.add_argument("--hour", type=int, default=8)
    parser.add_argument("--minute", type=int, default=37)
    parser.add_argument("--deploy", action="store_true")
    parser.add_argument("--no-load", action="store_true", help="write plist without loading it")
    parser.add_argument("--dry-run", action="store_true", help="print plist without writing it")
    parser.add_argument("--allow-timezone-mismatch", action="store_true")
    parser.add_argument(
        "--destination",
        type=Path,
        help="default: ~/Library/LaunchAgents/LABEL.plist",
    )
    parser.add_argument("--stdout-log", type=Path)
    parser.add_argument("--stderr-log", type=Path)
    args = parser.parse_args(argv)
    if not 0 <= args.hour <= 23 or not 0 <= args.minute <= 59:
        parser.error("hour must be 0-23 and minute must be 0-59")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    timezone = local_timezone()
    if timezone != "Asia/Shanghai" and not args.allow_timezone_mismatch:
        raise InstallError(
            "launchd calendar schedules use the Mac's local timezone; expected "
            f"Asia/Shanghai, found {timezone or 'unknown'}. Change the system timezone or "
            "pass --allow-timezone-mismatch intentionally."
        )
    app_root = args.app_root.expanduser().resolve()
    python = args.python_bin.expanduser().resolve()
    destination = (
        args.destination.expanduser().resolve()
        if args.destination
        else Path.home() / "Library" / "LaunchAgents" / f"{args.label}.plist"
    )
    logs = Path.home() / "Library" / "Logs"
    stdout_log = (
        args.stdout_log.expanduser().resolve()
        if args.stdout_log
        else logs / "agentlab-agent-history.log"
    )
    stderr_log = (
        args.stderr_log.expanduser().resolve()
        if args.stderr_log
        else logs / "agentlab-agent-history.error.log"
    )
    rendered = render_plist(
        label=args.label,
        python=python,
        app_root=app_root,
        search_path=os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"),
        hour=args.hour,
        minute=args.minute,
        deploy=args.deploy,
        stdout_log=stdout_log,
        stderr_log=stderr_log,
        network_environment={
            name: value
            for name in NETWORK_ENVIRONMENT_NAMES
            if (value := os.environ.get(name))
        },
    )
    if args.dry_run:
        print(rendered, end="")
        return 0
    stdout_log.parent.mkdir(parents=True, exist_ok=True)
    stderr_log.parent.mkdir(parents=True, exist_ok=True)
    domain = f"gui/{os.getuid()}"
    if args.no_load:
        atomic_write(destination, rendered)
    else:
        install_and_load(destination, rendered, domain=domain)
    print(f"wrote {destination}")
    if not args.no_load:
        print(f"loaded {args.label}; next calendar run is {args.hour:02d}:{args.minute:02d} local time")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except InstallError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
