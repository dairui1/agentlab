#!/usr/bin/env python3
"""Cache and normalize official release evidence for Agent History.

The normalized artifacts deliberately contain no wall-clock fetch timestamp.  Given
the same upstream bytes they are byte-for-byte reproducible, while the HTTP cache
uses validators and content-addressed objects to keep the daily refresh inexpensive.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from official_release_sources import (
    GITHUB_RELEASE_SOURCES,
    NPM_RELEASE_SOURCES,
    NO_PUBLIC_SOURCE_AGENTS,
    OFFICIAL_REPOSITORIES,
    RETIRED_AGENTS,
    SOURCE_CODE_COMPARISON_WINDOW,
)


APP_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE_ROOT = APP_ROOT / ".cache" / "official-sources"
SCHEMA_VERSION = 1
USER_AGENT = "agentlab-agent-history/1.0 (+https://agentlab.dairui1.com)"

CODEX_REPOSITORY = "openai/codex"
CLAUDE_REPOSITORY = "anthropics/claude-code"
CODEX_RELEASES_URL = f"https://api.github.com/repos/{CODEX_REPOSITORY}/releases"
CODEX_CHANGELOG_RAW_URL = (
    f"https://raw.githubusercontent.com/{CODEX_REPOSITORY}/main/CHANGELOG.md"
)
CODEX_CHANGELOG_URL = f"https://github.com/{CODEX_REPOSITORY}/blob/main/CHANGELOG.md"
CLAUDE_CHANGELOG_RAW_URL = (
    f"https://raw.githubusercontent.com/{CLAUDE_REPOSITORY}/main/CHANGELOG.md"
)
CLAUDE_CHANGELOG_URL = f"https://github.com/{CLAUDE_REPOSITORY}/blob/main/CHANGELOG.md"
NPM_REGISTRY_URL = "https://registry.npmjs.org"

MAX_JSON_RESPONSE_BYTES = 32 * 1024 * 1024
MAX_CHANGELOG_BYTES = 4 * 1024 * 1024
MAX_DIFF_BYTES = 1024 * 1024
MAX_NOTES_BYTES = 16 * 1024
MAX_KEY_FILES = 24
MAX_CHANGE_SAMPLES = 12
MAX_SAMPLE_LINES = 8
MAX_SAMPLE_LINE_LENGTH = 240
CODE_CHANGE_SCHEMA_VERSION = 3
MAX_NORMALIZED_RELEASE_BYTES = 64 * 1024
MAX_NORMALIZED_INDEX_BYTES = 16 * 1024 * 1024
MAX_NORMALIZED_MANIFEST_BYTES = 1024 * 1024
MAX_CAPTURE_META_BYTES = 64 * 1024
# A full catalog sync makes hundreds of requests, so a short per-request retry
# budget still makes one transient route flap likely to degrade the generation.
HTTP_RETRY_DELAYS = (1.0, 3.0, 7.0, 15.0, 30.0)
HTTP_FETCH_ATTEMPTS = len(HTTP_RETRY_DELAYS) + 1
TRANSIENT_HTTP_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})

VERSION_RE = re.compile(
    r"^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:\.(0|[1-9]\d*))?"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
CODEX_TAG_RE = re.compile(r"^(?:rust-)?v?(\d+\.\d+\.\d+)$")
CLAUDE_TAG_RE = re.compile(r"^v(\d+\.\d+\.\d+)$")
CHANGELOG_HEADING_RE = re.compile(
    r"^##[ \t]+v?(\d+\.\d+\.\d+)(?:[ \t].*)?$", re.MULTILINE
)
DIFF_HEADER_RE = re.compile(r"^diff --git a/(.*?) b/(.*?)$", re.MULTILINE)

MECHANISM_PATH_TERMS = (
    "agent", "context", "event", "gateway", "permission", "plugin", "preset",
    "prompt", "queue", "reconnect", "remote", "retry", "schedule", "session",
    "stream", "thread", "tool",
)
LOG = logging.getLogger("sync-official-sources")


class OfficialSyncError(RuntimeError):
    """Raised when official evidence cannot be fetched or trusted."""


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def pretty_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(
        "utf-8"
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise OfficialSyncError(f"refusing to replace symlink: {path}")
    if path.exists():
        if not path.is_file():
            raise OfficialSyncError(f"refusing to replace non-file: {path}")
        if path.read_bytes() == content:
            return
    temporary: Path | None = None
    try:
        descriptor, name = tempfile.mkstemp(
            dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
        )
        temporary = Path(name)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def bounded_text(value: str, max_bytes: int = MAX_NOTES_BYTES) -> tuple[str, bool]:
    raw = value.strip().encode("utf-8")
    if len(raw) <= max_bytes:
        return raw.decode("utf-8"), False
    bounded = raw[:max_bytes]
    while bounded:
        try:
            return bounded.decode("utf-8").rstrip(), True
        except UnicodeDecodeError as error:
            bounded = bounded[: error.start]
    return "", True


def version_key(
    value: str, *, numeric_revision: bool = False
) -> tuple[Any, ...]:
    match = VERSION_RE.fullmatch(value)
    if not match:
        raise OfficialSyncError(f"invalid official release version: {value!r}")
    major, minor, patch, extra, prerelease, _build = match.groups()
    if (
        numeric_revision
        and extra is None
        and prerelease is not None
        and prerelease.isdigit()
    ):
        extra, prerelease = prerelease, None
    if prerelease is None:
        prerelease_key: tuple[Any, ...] = (1, ())
    else:
        identifiers: list[tuple[int, int | str]] = []
        for identifier in prerelease.split("."):
            if identifier.isdigit():
                if len(identifier) > 1 and identifier.startswith("0"):
                    raise OfficialSyncError(
                        f"invalid numeric prerelease identifier: {value!r}"
                    )
                identifiers.append((0, int(identifier)))
            else:
                identifiers.append((1, identifier))
        prerelease_key = (0, tuple(identifiers))
    return (
        int(major),
        int(minor),
        int(patch),
        int(extra or -1),
        prerelease_key,
        value,
    )


def source_version_key(
    value: str, *, agent: str | None = None, repository: str | None = None
) -> tuple[Any, ...]:
    """Apply source-specific ordering without changing standard npm SemVer."""

    return version_key(
        value,
        numeric_revision=(
            agent == "openclaw" or repository == "openclaw/openclaw"
        ),
    )


@dataclass(frozen=True)
class CachedResponse:
    url: str
    accept: str
    body: bytes
    sha256: str
    etag: str | None
    last_modified: str | None
    truncated: bool


class HttpCache:
    """Small validator-aware cache whose bodies are addressed by SHA-256."""

    def __init__(self, root: Path, *, token: str | None = None) -> None:
        self.root = root.expanduser().resolve()
        self.objects = self.root / "objects"
        self.index_path = self.root / "index.json"
        self.token = token
        self.warnings: list[dict[str, str]] = []
        self.index = self._load_index()

    def _record_stale(self, *, url: str, cached: CachedResponse, reason: str) -> None:
        warning = {
            "type": "stale-cache-used",
            "url": url,
            "reason": reason,
            "cachedSha256": cached.sha256,
        }
        self.warnings.append(warning)
        LOG.warning("using cached official response after %s: %s", reason, url)

    def _load_index(self) -> dict[str, dict[str, object]]:
        if not self.index_path.exists():
            return {}
        if self.index_path.is_symlink() or not self.index_path.is_file():
            raise OfficialSyncError(f"invalid HTTP cache index: {self.index_path}")
        try:
            value = json.loads(self.index_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise OfficialSyncError(f"cannot read HTTP cache index: {error}") from error
        if not isinstance(value, dict) or any(
            not isinstance(key, str) or not isinstance(entry, dict)
            for key, entry in value.items()
        ):
            raise OfficialSyncError("HTTP cache index must be an object of objects")
        return value

    @staticmethod
    def _key(url: str, accept: str) -> str:
        return sha256_bytes(f"{url}\n{accept}".encode("utf-8"))

    def _cached(self, key: str) -> CachedResponse | None:
        entry = self.index.get(key)
        if not isinstance(entry, dict):
            return None
        sha = entry.get("sha256")
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
            return None
        path = self.objects / f"{sha}.bin"
        if path.is_symlink() or not path.is_file():
            return None
        body = path.read_bytes()
        if sha256_bytes(body) != sha:
            raise OfficialSyncError(f"corrupt cached response object: {path}")
        return CachedResponse(
            url=str(entry.get("url", "")),
            accept=str(entry.get("accept", "")),
            body=body,
            sha256=sha,
            etag=entry.get("etag") if isinstance(entry.get("etag"), str) else None,
            last_modified=(
                entry.get("lastModified")
                if isinstance(entry.get("lastModified"), str)
                else None
            ),
            truncated=bool(entry.get("truncated", False)),
        )

    def _store(
        self,
        key: str,
        *,
        url: str,
        accept: str,
        body: bytes,
        etag: str | None,
        last_modified: str | None,
        truncated: bool,
    ) -> CachedResponse:
        digest = sha256_bytes(body)
        atomic_write(self.objects / f"{digest}.bin", body)
        entry: dict[str, object] = {
            "url": url,
            "accept": accept,
            "sha256": digest,
            "bytes": len(body),
            "truncated": truncated,
        }
        if etag:
            entry["etag"] = etag
        if last_modified:
            entry["lastModified"] = last_modified
        self.index[key] = entry
        atomic_write(self.index_path, pretty_json(self.index))
        return CachedResponse(
            url=url,
            accept=accept,
            body=body,
            sha256=digest,
            etag=etag,
            last_modified=last_modified,
            truncated=truncated,
        )

    def fetch(
        self,
        url: str,
        *,
        accept: str,
        max_bytes: int,
        timeout: float,
        allow_stale_on_error: bool,
        allow_truncated: bool = False,
        cache_variant: str = "raw-v1",
        transform: Callable[[bytes], bytes] | None = None,
    ) -> CachedResponse:
        key = self._key(url, f"{accept}\n{cache_variant}")
        cached = self._cached(key)
        headers = {"Accept": accept, "User-Agent": USER_AGENT}
        if self.token and urlsplit(url).hostname in {
            "api.github.com",
            "raw.githubusercontent.com",
        }:
            headers["Authorization"] = f"Bearer {self.token}"
            headers["X-GitHub-Api-Version"] = "2022-11-28"
        if cached and cached.etag:
            headers["If-None-Match"] = cached.etag
        elif cached and cached.last_modified:
            headers["If-Modified-Since"] = cached.last_modified
        request = Request(url, headers=headers)
        for attempt in range(HTTP_FETCH_ATTEMPTS):
            try:
                with urlopen(request, timeout=timeout) as response:
                    body = response.read(max_bytes + 1)
                    truncated = len(body) > max_bytes
                    body = body[:max_bytes]
                    if truncated and not allow_truncated:
                        raise OfficialSyncError(
                            f"official response exceeds {max_bytes} bytes: {url}"
                        )
                    if transform is not None:
                        try:
                            body = transform(body)
                        except (
                            UnicodeDecodeError,
                            json.JSONDecodeError,
                            ValueError,
                        ) as error:
                            if allow_stale_on_error and cached is not None:
                                self._record_stale(
                                    url=url,
                                    cached=cached,
                                    reason=(
                                        f"normalize-failure:{type(error).__name__}"
                                    ),
                                )
                                return cached
                            raise OfficialSyncError(
                                f"cannot normalize official response from {url}: {error}"
                            ) from error
                    return self._store(
                        key,
                        url=url,
                        accept=accept,
                        body=body,
                        etag=response.headers.get("ETag"),
                        last_modified=response.headers.get("Last-Modified"),
                        truncated=truncated,
                    )
            except HTTPError as error:
                if error.code == 304 and cached is not None:
                    return cached
                retryable = error.code in TRANSIENT_HTTP_STATUS
                if retryable and attempt + 1 < HTTP_FETCH_ATTEMPTS:
                    delay = HTTP_RETRY_DELAYS[attempt]
                    LOG.warning(
                        "transient HTTP %s fetching %s; retrying in %.1fs (%s/%s)",
                        error.code,
                        url,
                        delay,
                        attempt + 2,
                        HTTP_FETCH_ATTEMPTS,
                    )
                    time.sleep(delay)
                    continue
                if allow_stale_on_error and cached is not None:
                    self._record_stale(
                        url=url, cached=cached, reason=f"http-{error.code}"
                    )
                    return cached
                raise OfficialSyncError(
                    f"HTTP {error.code} while fetching {url}"
                ) from error
            except (OSError, TimeoutError, URLError) as error:
                if attempt + 1 < HTTP_FETCH_ATTEMPTS:
                    delay = HTTP_RETRY_DELAYS[attempt]
                    LOG.warning(
                        "transient %s fetching %s; retrying in %.1fs (%s/%s)",
                        type(error).__name__,
                        url,
                        delay,
                        attempt + 2,
                        HTTP_FETCH_ATTEMPTS,
                    )
                    time.sleep(delay)
                    continue
                if allow_stale_on_error and cached is not None:
                    self._record_stale(
                        url=url,
                        cached=cached,
                        reason=f"fetch-failure:{type(error).__name__}",
                    )
                    return cached
                raise OfficialSyncError(f"cannot fetch {url}: {error}") from error

        raise AssertionError("HTTP fetch retry loop exhausted without a result")


def parse_markdown_changelog(text: str) -> dict[str, str]:
    matches = list(CHANGELOG_HEADING_RE.finditer(text))
    result: dict[str, str] = {}
    for index, match in enumerate(matches):
        version = match.group(1)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        notes = text[match.end() : end].strip()
        if version in result:
            raise OfficialSyncError(f"duplicate changelog version heading: {version}")
        result[version] = notes
    return result


def notes_value(text: str, *, source_kind: str, source_url: str) -> dict[str, object]:
    bounded, truncated = bounded_text(text)
    raw = text.strip().encode("utf-8")
    return {
        "sourceKind": source_kind,
        "sourceUrl": source_url,
        "text": bounded,
        "truncated": truncated,
        "sha256": sha256_bytes(raw),
        "originalBytes": len(raw),
    }


def parse_compare_diff(
    body: bytes,
    *,
    base_version: str,
    head_version: str,
    base_tag: str,
    head_tag: str,
    compare_url: str,
    truncated: bool,
) -> dict[str, object]:
    text = body.decode("utf-8", errors="replace")
    headers = list(DIFF_HEADER_RE.finditer(text))
    files: list[dict[str, object]] = []
    additions_total = 0
    deletions_total = 0
    for index, match in enumerate(headers):
        start = match.end()
        end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
        segment = text[start:end]
        old_path, new_path = match.groups()
        status = "modified"
        path = new_path
        if "\nnew file mode " in segment:
            status = "added"
        elif "\ndeleted file mode " in segment:
            status = "removed"
            path = old_path
        elif "\nrename from " in segment and "\nrename to " in segment:
            status = "renamed"
        additions = sum(
            1
            for line in segment.splitlines()
            if line.startswith("+") and not line.startswith("+++")
        )
        deletions = sum(
            1
            for line in segment.splitlines()
            if line.startswith("-") and not line.startswith("---")
        )
        additions_total += additions
        deletions_total += deletions
        files.append(
            {
                "path": path,
                "status": status,
                "additionsObserved": additions,
                "deletionsObserved": deletions,
            }
        )
    ranked = sorted(files, key=code_file_rank)[:MAX_KEY_FILES]
    return {
        "schemaVersion": CODE_CHANGE_SCHEMA_VERSION,
        "status": "available",
        "baseVersion": base_version,
        "headVersion": head_version,
        "baseTag": base_tag,
        "headTag": head_tag,
        "sourceUrl": compare_url,
        "diffSha256": sha256_bytes(body),
        "digestScope": "prefix" if truncated else "complete",
        "truncated": truncated,
        "bytesInspected": len(body),
        "filesObserved": len(files),
        "additionsObserved": additions_total,
        "deletionsObserved": deletions_total,
        "keyFiles": ranked,
    }


def code_file_rank(item: Mapping[str, object]) -> tuple[int, int, str]:
    path = str(item.get("path", ""))
    lowered = f"/{path.lower()}"
    score = 0
    if any(token in lowered for token in ("/src/", "/lib/", "/packages/", "/crates/")):
        score += 80
    if lowered.endswith((".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go")):
        score += 30
    score += min(60, 12 * sum(term in lowered for term in MECHANISM_PATH_TERMS))
    if any(token in lowered for token in ("/test", "/tests/", "/fixtures/", ".expected.")):
        score -= 70
    if any(token in lowered for token in ("/docs/", "/.agents/", "/notes/")):
        score -= 90
    if lowered.endswith((".md", ".yaml", ".yml", ".lock", ".snap")):
        score -= 40
    churn = int(item.get("additionsObserved", 0)) + int(item.get("deletionsObserved", 0))
    return (-score, -min(churn, 200), path)


def patch_sample(patch: object) -> list[str]:
    if not isinstance(patch, str):
        return []
    result: list[str] = []
    for raw_line in patch.splitlines():
        if not raw_line.startswith(("+", "-")) or raw_line.startswith(("+++", "---")):
            continue
        value = raw_line[:1] + raw_line[1:].strip()
        if len(value) <= 1 or value[1:].startswith(("//", "#", "*")):
            continue
        result.append(value[:MAX_SAMPLE_LINE_LENGTH])
        if len(result) >= MAX_SAMPLE_LINES:
            break
    return result


def parse_compare_json(
    body: bytes,
    *,
    base_version: str,
    head_version: str,
    base_tag: str,
    head_tag: str,
    compare_url: str,
) -> dict[str, object]:
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, Mapping) or not isinstance(value.get("files"), list):
        raise OfficialSyncError("GitHub compare response has no files list")
    files: list[dict[str, object]] = []
    for raw in value["files"]:
        if not isinstance(raw, Mapping) or not isinstance(raw.get("filename"), str):
            continue
        item: dict[str, object] = {
            "path": raw["filename"],
            "status": str(raw.get("status", "modified")),
            "additionsObserved": int(raw.get("additions", 0)),
            "deletionsObserved": int(raw.get("deletions", 0)),
        }
        sample = patch_sample(raw.get("patch"))
        if sample:
            item["sample"] = sample
        files.append(item)
    ranked = sorted(files, key=code_file_rank)
    key_files = [
        {key: field for key, field in item.items() if key != "sample"}
        for item in ranked[:MAX_KEY_FILES]
    ]
    change_samples = [item for item in ranked if item.get("sample")][:MAX_CHANGE_SAMPLES]
    total_files_value = value.get("total_files")
    total_files = int(total_files_value) if isinstance(total_files_value, int) else len(files)
    capped = total_files_value is None and len(files) >= 300
    return {
        "schemaVersion": CODE_CHANGE_SCHEMA_VERSION,
        "status": "available",
        "baseVersion": base_version,
        "headVersion": head_version,
        "baseTag": base_tag,
        "headTag": head_tag,
        "sourceUrl": compare_url,
        "diffSha256": sha256_bytes(body),
        "digestScope": "prefix" if capped or total_files != len(files) else "complete",
        "truncated": capped or total_files != len(files),
        "bytesInspected": len(body),
        "filesObserved": len(files),
        "filesTotal": total_files,
        "additionsObserved": sum(int(item["additionsObserved"]) for item in files),
        "deletionsObserved": sum(int(item["deletionsObserved"]) for item in files),
        "keyFiles": key_files,
        "changeSamples": change_samples,
    }


def run_git(args: Sequence[str], *, cwd: Path | None = None, timeout: float = 180) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return completed.stdout


def parse_numstat(text: str) -> dict[str, tuple[int, int]]:
    result: dict[str, tuple[int, int]] = {}
    for line in text.splitlines():
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        additions, deletions, path = parts
        result[path] = (
            int(additions) if additions.isdigit() else 0,
            int(deletions) if deletions.isdigit() else 0,
        )
    return result


def local_git_compare(
    *,
    cache_root: Path,
    repository: str,
    base_version: str,
    head_version: str,
    base_tag: str,
    head_tag: str,
    compare_url: str,
) -> dict[str, object]:
    repository_dir = cache_root / hashlib.sha256(repository.encode()).hexdigest()
    if not repository_dir.exists():
        repository_dir.parent.mkdir(parents=True, exist_ok=True)
        run_git(["init", "--bare", str(repository_dir)])
        run_git(
            ["remote", "add", "origin", f"https://github.com/{repository}.git"],
            cwd=repository_dir,
        )
    resolved_refs: list[str] = []
    for source_ref in (base_tag, head_tag):
        if re.fullmatch(r"[0-9a-f]{40}", source_ref):
            run_git(["fetch", "--depth=1", "origin", source_ref], cwd=repository_dir)
            resolved_refs.append(
                run_git(["rev-parse", "FETCH_HEAD"], cwd=repository_dir).strip()
            )
        else:
            local_ref = f"refs/tags/{source_ref}"
            run_git(
                [
                    "fetch",
                    "--depth=1",
                    "origin",
                    f"{local_ref}:{local_ref}",
                ],
                cwd=repository_dir,
            )
            resolved_refs.append(local_ref)
    range_spec = f"{resolved_refs[0]}..{resolved_refs[1]}"
    counts = parse_numstat(
        run_git(["diff", "--numstat", "--no-renames", range_spec], cwd=repository_dir)
    )
    statuses: dict[str, str] = {}
    for line in run_git(
        ["diff", "--name-status", "--no-renames", range_spec], cwd=repository_dir
    ).splitlines():
        status_code, _, path = line.partition("\t")
        statuses[path] = {"A": "added", "D": "removed"}.get(status_code, "modified")
    files = [
        {
            "path": path,
            "status": statuses.get(path, "modified"),
            "additionsObserved": additions,
            "deletionsObserved": deletions,
        }
        for path, (additions, deletions) in counts.items()
    ]
    ranked = sorted(files, key=code_file_rank)
    change_samples: list[dict[str, object]] = []
    for item in ranked:
        patch = run_git(
            ["diff", "--unified=1", "--no-renames", range_spec, "--", str(item["path"])],
            cwd=repository_dir,
        )
        sample = patch_sample(patch)
        if sample:
            change_samples.append({**item, "sample": sample})
        if len(change_samples) >= MAX_CHANGE_SAMPLES:
            break
    digest = sha256_bytes(
        json.dumps(files, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    )
    return {
        "schemaVersion": CODE_CHANGE_SCHEMA_VERSION,
        "status": "available",
        "baseVersion": base_version,
        "headVersion": head_version,
        "baseTag": base_tag,
        "headTag": head_tag,
        "sourceUrl": compare_url,
        "diffSha256": digest,
        "digestScope": "complete",
        "truncated": False,
        "filesObserved": len(files),
        "filesTotal": len(files),
        "additionsObserved": sum(item["additionsObserved"] for item in files),
        "deletionsObserved": sum(item["deletionsObserved"] for item in files),
        "keyFiles": ranked[:MAX_KEY_FILES],
        "changeSamples": change_samples,
        "extraction": "local-git-tags",
    }


def github_json(response: CachedResponse, *, url: str) -> object:
    if response.truncated:
        raise OfficialSyncError(f"truncated JSON response cannot be parsed: {url}")
    try:
        return json.loads(response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OfficialSyncError(f"invalid GitHub JSON from {url}: {error}") from error


def minimize_github_releases(body: bytes) -> bytes:
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, list):
        raise ValueError("GitHub releases response is not an array")
    fields = (
        "tag_name",
        "name",
        "body",
        "html_url",
        "published_at",
        "draft",
        "prerelease",
    )
    minimized = [
        {key: raw.get(key) for key in fields}
        for raw in value
        if isinstance(raw, dict)
    ]
    return canonical_json(minimized)


def minimize_github_tags(body: bytes) -> bytes:
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, list):
        raise ValueError("GitHub tags response is not an array")
    minimized = []
    for raw in value:
        if not isinstance(raw, dict):
            continue
        commit = raw.get("commit")
        minimized.append(
            {
                "name": raw.get("name"),
                "commit": {
                    "sha": commit.get("sha") if isinstance(commit, dict) else None
                },
            }
        )
    return canonical_json(minimized)


def minimize_github_commits(body: bytes) -> bytes:
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, list):
        raise ValueError("GitHub commits response is not an array")
    minimized = []
    for raw in value:
        if not isinstance(raw, dict):
            continue
        commit = raw.get("commit")
        committer = commit.get("committer") if isinstance(commit, dict) else None
        minimized.append(
            {
                "sha": raw.get("sha"),
                "committedAt": (
                    committer.get("date") if isinstance(committer, dict) else None
                ),
            }
        )
    return canonical_json(minimized)


def minimize_npm_package(body: bytes) -> bytes:
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("npm package response is not an object")
    versions = value.get("versions")
    timestamps = value.get("time")
    if not isinstance(versions, dict) or not isinstance(timestamps, dict):
        raise ValueError("npm package response has no versions or publication times")
    minimized_versions: dict[str, object] = {}
    minimized_times: dict[str, object] = {}
    for version, raw in versions.items():
        if not isinstance(version, str) or not isinstance(raw, dict):
            continue
        repository = raw.get("repository")
        dist = raw.get("dist")
        minimized_versions[version] = {
            "name": raw.get("name"),
            "version": raw.get("version"),
            "repository": (
                {
                    key: repository.get(key)
                    for key in ("type", "url", "directory")
                }
                if isinstance(repository, dict)
                else repository
            ),
            "dist": (
                {key: dist.get(key) for key in ("tarball", "integrity", "shasum")}
                if isinstance(dist, dict)
                else dist
            ),
        }
        if version in timestamps:
            minimized_times[version] = timestamps[version]
    return canonical_json(
        {
            "name": value.get("name"),
            "versions": minimized_versions,
            "time": minimized_times,
        }
    )


def npm_releases(
    cache: HttpCache,
    *,
    package_name: str,
    repository: str,
    package_directory: str | None,
    product_name: str,
    timeout: float,
    allow_stale_on_error: bool,
    require_repository_metadata: bool = True,
) -> list[dict[str, object]]:
    registry_url = f"{NPM_REGISTRY_URL}/{quote(package_name, safe='')}"
    response = cache.fetch(
        registry_url,
        accept="application/json",
        max_bytes=MAX_JSON_RESPONSE_BYTES,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
        cache_variant="npm-package-minimal-v1",
        transform=minimize_npm_package,
    )
    try:
        value = json.loads(response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OfficialSyncError(
            f"invalid npm package JSON from {registry_url}: {error}"
        ) from error
    if not isinstance(value, dict) or value.get("name") != package_name:
        raise OfficialSyncError(f"npm package identity mismatch: {registry_url}")
    versions = value.get("versions")
    timestamps = value.get("time")
    if not isinstance(versions, dict) or not isinstance(timestamps, dict):
        raise OfficialSyncError(f"npm package history is incomplete: {registry_url}")

    expected_repository_url = f"https://github.com/{repository}"
    releases: list[dict[str, object]] = []
    for version, raw in versions.items():
        if not isinstance(version, str) or not isinstance(raw, dict):
            raise OfficialSyncError(f"invalid npm version record: {registry_url}")
        version_key(version)
        if raw.get("name") != package_name or raw.get("version") != version:
            raise OfficialSyncError(
                f"npm version identity mismatch: {package_name} {version}"
            )
        repository_value = raw.get("repository")
        if not isinstance(repository_value, dict) and require_repository_metadata:
            raise OfficialSyncError(
                f"npm version has no repository metadata: {package_name} {version}"
            )
        if isinstance(repository_value, dict):
            repository_url = repository_value.get("url")
            if isinstance(repository_url, str) and repository_url.startswith("git+"):
                repository_url = repository_url[4:]
            if isinstance(repository_url, str) and repository_url.endswith(".git"):
                repository_url = repository_url[:-4]
            if repository_url != expected_repository_url:
                raise OfficialSyncError(
                    f"npm repository mismatch: {package_name} {version}"
                )
            if repository_value.get("directory") != package_directory:
                raise OfficialSyncError(
                    f"npm repository directory mismatch: {package_name} {version}"
                )

        published_at = timestamps.get(version)
        if not isinstance(published_at, str) or not published_at:
            raise OfficialSyncError(
                f"npm version has no publication time: {package_name} {version}"
            )
        parse_capture_timestamp(published_at)
        dist = raw.get("dist")
        if not isinstance(dist, dict):
            raise OfficialSyncError(
                f"npm version has no dist metadata: {package_name} {version}"
            )
        tarball_url = dist.get("tarball")
        integrity = dist.get("integrity")
        shasum = dist.get("shasum")
        if not isinstance(tarball_url, str) or not tarball_url.startswith(
            f"{NPM_REGISTRY_URL}/"
        ):
            raise OfficialSyncError(
                f"npm tarball URL is invalid: {package_name} {version}"
            )
        if not isinstance(integrity, str) or not re.fullmatch(
            r"sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}", integrity
        ):
            raise OfficialSyncError(
                f"npm tarball integrity is invalid: {package_name} {version}"
            )
        if not isinstance(shasum, str) or not re.fullmatch(r"[0-9a-f]{40}", shasum):
            raise OfficialSyncError(
                f"npm tarball shasum is invalid: {package_name} {version}"
            )

        package_url = (
            f"https://www.npmjs.com/package/{quote(package_name, safe='@/')}"
            f"/v/{quote(version, safe='.-')}"
        )
        releases.append(
            {
                "version": version,
                "sourceRef": f"{package_name}@{version}",
                "title": f"{product_name} {version}",
                "sourceUrl": package_url,
                "publishedAt": published_at,
                "packageName": package_name,
                **(
                    {"packageDirectory": package_directory}
                    if package_directory is not None
                    else {}
                ),
                "artifact": {
                    "scope": "published-package-only",
                    "url": tarball_url,
                    "integrity": integrity,
                    "shasum": shasum,
                },
                "notes": notes_value(
                    "",
                    source_kind="npm-publication",
                    source_url=package_url,
                ),
            }
        )
    return sorted(releases, key=lambda item: version_key(str(item["version"])))


def github_tags(
    cache: HttpCache,
    *,
    repository: str,
    tag_pattern: re.Pattern[str],
    max_pages: int,
    timeout: float,
    allow_stale_on_error: bool,
) -> dict[str, dict[str, str]]:
    tags: dict[str, dict[str, str]] = {}
    for page in range(1, max_pages + 1):
        url = f"https://api.github.com/repos/{repository}/tags?per_page=100&page={page}"
        response = cache.fetch(
            url,
            accept="application/vnd.github+json",
            max_bytes=MAX_JSON_RESPONSE_BYTES,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
            cache_variant="github-tag-minimal-v1",
            transform=minimize_github_tags,
        )
        value = github_json(response, url=url)
        if not isinstance(value, list):
            raise OfficialSyncError(f"GitHub tags response is not an array: {url}")
        if not value:
            break
        for raw in value:
            if not isinstance(raw, dict):
                continue
            name = raw.get("name")
            match = tag_pattern.fullmatch(name) if isinstance(name, str) else None
            commit = raw.get("commit")
            sha = commit.get("sha") if isinstance(commit, dict) else None
            if match is None or not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
                continue
            tags.setdefault(match.group(1), {"tag": name, "commitSha": sha})
        if len(value) < 100:
            break
        if page == max_pages:
            raise OfficialSyncError(
                f"GitHub tag history exceeds --max-tag-pages={max_pages}: {repository}"
            )
    return tags


def github_commits(
    cache: HttpCache,
    *,
    repository: str,
    max_pages: int,
    timeout: float,
    allow_stale_on_error: bool,
) -> list[dict[str, str]]:
    commits: list[dict[str, str]] = []
    for page in range(1, max_pages + 1):
        url = f"https://api.github.com/repos/{repository}/commits?per_page=100&page={page}"
        response = cache.fetch(
            url,
            accept="application/vnd.github+json",
            max_bytes=MAX_JSON_RESPONSE_BYTES,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
            cache_variant="github-commit-minimal-v1",
            transform=minimize_github_commits,
        )
        value = github_json(response, url=url)
        if not isinstance(value, list):
            raise OfficialSyncError(f"GitHub commits response is not an array: {url}")
        if not value:
            break
        for raw in value:
            if not isinstance(raw, dict):
                continue
            sha = raw.get("sha")
            committed_at = raw.get("committedAt")
            if (
                isinstance(sha, str)
                and re.fullmatch(r"[0-9a-f]{40}", sha)
                and isinstance(committed_at, str)
            ):
                parse_capture_timestamp(committed_at)
                commits.append({"sha": sha, "committedAt": committed_at})
        if len(value) < 100:
            break
        if page == max_pages:
            raise OfficialSyncError(
                f"GitHub commit history exceeds --max-tag-pages={max_pages}: {repository}"
            )
    return sorted(commits, key=lambda item: parse_capture_timestamp(item["committedAt"]))


def github_releases(
    cache: HttpCache,
    *,
    repository: str,
    tag_pattern: re.Pattern[str],
    product_name: str,
    max_pages: int,
    timeout: float,
    allow_stale_on_error: bool,
    include_prereleases: bool = False,
) -> list[dict[str, object]]:
    releases: dict[str, dict[str, object]] = {}
    for page in range(1, max_pages + 1):
        url = f"https://api.github.com/repos/{repository}/releases?per_page=100&page={page}"
        response = cache.fetch(
            url,
            accept="application/vnd.github+json",
            max_bytes=MAX_JSON_RESPONSE_BYTES,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
            cache_variant="github-release-minimal-v1",
            transform=minimize_github_releases,
        )
        value = github_json(response, url=url)
        if not isinstance(value, list):
            raise OfficialSyncError(f"GitHub releases response is not an array: {url}")
        if not value:
            break
        for raw in value:
            if not isinstance(raw, dict) or raw.get("draft") is True:
                continue
            tag = raw.get("tag_name")
            match = tag_pattern.fullmatch(tag) if isinstance(tag, str) else None
            if match is None:
                continue
            version = match.group(1)
            if raw.get("prerelease") is True and not include_prereleases:
                continue
            published = raw.get("published_at")
            body = raw.get("body") if isinstance(raw.get("body"), str) else ""
            title = raw.get("name") if isinstance(raw.get("name"), str) else ""
            url_value = raw.get("html_url")
            if not isinstance(url_value, str) or not url_value.startswith("https://github.com/"):
                url_value = f"https://github.com/{repository}/releases/tag/{quote(tag, safe='')}"
            record: dict[str, object] = {
                "version": version,
                "tag": tag,
                "title": title.strip() or f"{product_name} {version}",
                "sourceUrl": url_value,
                "notes": notes_value(
                    body,
                    source_kind="github-release",
                    source_url=url_value,
                ),
            }
            if isinstance(published, str) and published:
                record["publishedAt"] = published
            releases.setdefault(version, record)
        if len(value) < 100:
            break
        if page == max_pages:
            raise OfficialSyncError(
                f"GitHub release history exceeds --max-release-pages={max_pages}: "
                f"{repository}"
            )
    return sorted(
        releases.values(),
        key=lambda item: source_version_key(
            str(item["version"]), repository=repository
        ),
    )


def merge_release_histories(
    primary: Sequence[Mapping[str, object]],
    official: Sequence[Mapping[str, object]],
) -> list[dict[str, object]]:
    """Overlay authoritative release-page metadata onto package publications."""

    merged = {str(release["version"]): dict(release) for release in primary}
    for release in official:
        version = str(release["version"])
        record = merged.setdefault(version, {})
        record.update(release)
    return [
        merged[version]
        for version in sorted(merged, key=version_key)
    ]


def codex_releases(
    cache: HttpCache,
    *,
    max_pages: int,
    timeout: float,
    allow_stale_on_error: bool,
) -> list[dict[str, object]]:
    return github_releases(
        cache,
        repository=CODEX_REPOSITORY,
        tag_pattern=CODEX_TAG_RE,
        product_name="Codex",
        max_pages=max_pages,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )


def retained_release_history(
    normalized_root: Path,
    agent: str,
    releases: Sequence[Mapping[str, object]],
    previous_value: Mapping[str, object] | None = None,
) -> list[Mapping[str, object]]:
    retained: dict[str, Mapping[str, object]] = {}
    if previous_value is None:
        previous_value = load_normalized_generation(normalized_root).get(agent)
    previous_releases = (
        previous_value.get("releases")
        if isinstance(previous_value, Mapping)
        else None
    )
    if isinstance(previous_releases, dict):
        retained.update(
            (version, value)
            for version, value in previous_releases.items()
            if isinstance(version, str) and isinstance(value, dict)
        )
    for release in releases:
        version = str(release["version"])
        previous = retained.get(version)
        merged = dict(release)
        if (
            isinstance(previous, Mapping)
            and "codeChange" not in merged
            and isinstance(previous.get("codeChange"), Mapping)
        ):
            merged["codeChange"] = previous["codeChange"]
        retained[version] = merged
    return [
        retained[version]
        for version in sorted(
            retained, key=lambda value: source_version_key(value, agent=agent)
        )
    ]


def merge_tag_history(
    releases: Sequence[Mapping[str, object]],
    *,
    repository: str,
    product_name: str,
    tags: Mapping[str, Mapping[str, str]],
) -> list[dict[str, object]]:
    merged = {str(release["version"]): dict(release) for release in releases}
    for version, tag in tags.items():
        record = merged.get(version)
        if record is None:
            source_url = f"https://github.com/{repository}/tree/{quote(tag['tag'], safe='')}"
            record = {
                "version": version,
                "tag": tag["tag"],
                "title": f"{product_name} {version}",
                "sourceUrl": source_url,
                "notes": notes_value(
                    "", source_kind="github-tag", source_url=source_url
                ),
            }
            merged[version] = record
        record["commitSha"] = tag["commitSha"]
        if not isinstance(record.get("tag"), str):
            record["tag"] = tag["tag"]
    return [
        merged[version]
        for version in sorted(
            merged,
            key=lambda value: source_version_key(value, repository=repository),
        )
    ]


def parse_capture_timestamp(value: str) -> float:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise OfficialSyncError(f"invalid capture timestamp: {value!r}") from error
    if parsed.tzinfo is None:
        raise OfficialSyncError(f"capture timestamp has no timezone: {value!r}")
    return parsed.timestamp()


def discover_capture_sequences(roots: Sequence[Path]) -> dict[str, list[str]]:
    observed: dict[str, dict[str, float]] = {}
    for raw_root in roots:
        root = raw_root.expanduser().resolve()
        captures = root / "captures"
        if not captures.is_dir() or captures.is_symlink():
            continue
        for agent_dir in captures.iterdir():
            if not agent_dir.is_dir() or agent_dir.is_symlink():
                continue
            for capture_dir in agent_dir.iterdir():
                metadata_path = capture_dir / "meta.json"
                if (
                    not capture_dir.is_dir()
                    or capture_dir.is_symlink()
                    or not metadata_path.is_file()
                    or metadata_path.is_symlink()
                    or metadata_path.stat().st_size > MAX_CAPTURE_META_BYTES
                ):
                    continue
                try:
                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                    continue
                if not isinstance(metadata, dict):
                    continue
                version = metadata.get("version", capture_dir.name)
                timestamp = metadata.get("published_at", metadata.get("captured_at"))
                if not isinstance(version, str) or not isinstance(timestamp, str):
                    continue
                try:
                    parsed = parse_capture_timestamp(timestamp)
                    version_key(version)
                except OfficialSyncError:
                    continue
                observed.setdefault(agent_dir.name, {}).setdefault(version, parsed)
    return {
        agent: [
            version
            for version, _ in sorted(
                versions.items(),
                key=lambda item: (
                    item[1],
                    source_version_key(item[0], agent=agent),
                ),
            )
        ]
        for agent, versions in observed.items()
    }


def comparison_pairs(
    releases: Sequence[Mapping[str, object]],
    captured_versions: Sequence[str],
    *,
    newest_count: int,
) -> list[tuple[str, str]]:
    release_versions = [
        str(release["version"])
        for release in releases
        if isinstance(release.get("commitSha"), str)
    ]
    available = set(release_versions)
    captured_window = (
        captured_versions[-(newest_count + 1) :] if newest_count > 0 else ()
    )
    pairs = [
        (base, head)
        for base, head in zip(captured_window, captured_window[1:])
        if base in available and head in available
    ]
    if newest_count > 0:
        start = max(1, len(release_versions) - newest_count)
        pairs.extend(
            (release_versions[index - 1], release_versions[index])
            for index in range(start, len(release_versions))
        )
    by_head: dict[str, tuple[str, str]] = {}
    for pair in pairs:
        by_head.setdefault(pair[1], pair)
    return list(by_head.values())


def attach_code_compares(
    releases: list[dict[str, object]],
    cache: HttpCache,
    *,
    repository: str,
    pairs: Sequence[tuple[str, str]],
    timeout: float,
    allow_stale_on_error: bool,
) -> None:
    by_version = {str(release["version"]): release for release in releases}
    for base_version, head_version in pairs:
        previous = by_version.get(base_version)
        current = by_version.get(head_version)
        if previous is None or current is None:
            continue
        base_tag = previous.get("tag")
        head_tag = current.get("tag")
        if not isinstance(base_tag, str) or not isinstance(head_tag, str):
            continue
        base_sha = previous.get("commitSha")
        head_sha = current.get("commitSha")
        existing = current.get("codeChange")
        if (
            isinstance(existing, Mapping)
            and existing.get("status") == "available"
            and existing.get("schemaVersion") == CODE_CHANGE_SCHEMA_VERSION
            and existing.get("truncated") is not True
            and existing.get("baseTag") == base_tag
            and existing.get("headTag") == head_tag
        ):
            existing["analysisEligible"] = True
            continue
        api_url = (
            f"https://api.github.com/repos/{repository}/compare/"
            f"{quote(base_tag, safe='')}...{quote(head_tag, safe='')}"
        )
        compare_url = (
            f"https://github.com/{repository}/compare/"
            f"{quote(base_tag, safe='')}...{quote(head_tag, safe='')}"
        )
        try:
            response = cache.fetch(
                api_url,
                accept="application/vnd.github+json",
                max_bytes=MAX_JSON_RESPONSE_BYTES,
                timeout=timeout,
                allow_stale_on_error=allow_stale_on_error,
            )
        except OfficialSyncError as error:
            LOG.warning(
                "skipping %s code overview %s..%s: %s",
                repository,
                base_version,
                head_version,
                error,
            )
            current["codeChange"] = {
                "schemaVersion": CODE_CHANGE_SCHEMA_VERSION,
                "status": "unavailable",
                "reason": "official-compare-fetch-failed",
                "baseVersion": base_version,
                "headVersion": head_version,
                "baseTag": base_tag,
                "headTag": head_tag,
                "sourceUrl": compare_url,
                "analysisEligible": True,
            }
            if isinstance(base_sha, str):
                current["codeChange"]["baseCommitSha"] = base_sha
            if isinstance(head_sha, str):
                current["codeChange"]["headCommitSha"] = head_sha
            cache.warnings.append(
                {
                    "type": "source-unavailable",
                    "url": api_url,
                    "reason": "official-compare-fetch-failed",
                }
            )
            continue
        try:
            current["codeChange"] = parse_compare_json(
                response.body,
                base_version=base_version,
                head_version=head_version,
                base_tag=base_tag,
                head_tag=head_tag,
                compare_url=compare_url,
            )
        except (UnicodeDecodeError, json.JSONDecodeError, OfficialSyncError):
            current["codeChange"] = parse_compare_diff(
                response.body,
                base_version=base_version,
                head_version=head_version,
                base_tag=base_tag,
                head_tag=head_tag,
                compare_url=compare_url,
                truncated=response.truncated,
            )
        if (
            current["codeChange"].get("truncated") is True
            and isinstance(cache, HttpCache)
        ):
            try:
                current["codeChange"] = local_git_compare(
                    cache_root=cache.root.parent / "git",
                    repository=repository,
                    base_version=base_version,
                    head_version=head_version,
                    base_tag=base_tag,
                    head_tag=head_tag,
                    compare_url=compare_url,
                )
            except (OSError, subprocess.SubprocessError, ValueError) as error:
                LOG.warning(
                    "local source compare failed for %s %s..%s: %s",
                    repository,
                    base_version,
                    head_version,
                    error,
                )
                cache.warnings.append(
                    {
                        "type": "source-unavailable",
                        "url": compare_url,
                        "reason": "local-git-compare-failed",
                    }
                )
        current["codeChange"]["analysisEligible"] = True
        if isinstance(base_sha, str):
            current["codeChange"]["baseCommitSha"] = base_sha
        if isinstance(head_sha, str):
            current["codeChange"]["headCommitSha"] = head_sha


def enrich_repository_history(
    *,
    agent: str,
    repository: str,
    product_name: str,
    tag_pattern: re.Pattern[str],
    releases: Sequence[Mapping[str, object]],
    normalized_root: Path,
    captured_versions: Sequence[str],
    cache: HttpCache,
    max_tag_pages: int,
    newest_comparisons: int,
    timeout: float,
    allow_stale_on_error: bool,
    previous_value: Mapping[str, object] | None = None,
) -> list[dict[str, object]]:
    tags = github_tags(
        cache,
        repository=repository,
        tag_pattern=tag_pattern,
        max_pages=max_tag_pages,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )
    tagged = merge_tag_history(
        releases,
        repository=repository,
        product_name=product_name,
        tags=tags,
    )
    retained = [
        dict(release)
        for release in retained_release_history(
            normalized_root,
            agent,
            tagged,
            previous_value=previous_value,
        )
    ]
    pairs = comparison_pairs(
        retained, captured_versions, newest_count=newest_comparisons
    )
    attach_code_compares(
        retained,
        cache,
        repository=repository,
        pairs=pairs,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )
    return retained


def enrich_repository_snapshots(
    *,
    agent: str,
    repository: str,
    releases: Sequence[Mapping[str, object]],
    normalized_root: Path,
    captured_versions: Sequence[str],
    cache: HttpCache,
    max_commit_pages: int,
    newest_comparisons: int,
    timeout: float,
    allow_stale_on_error: bool,
    previous_value: Mapping[str, object] | None = None,
) -> list[dict[str, object]]:
    """Align an untagged source mirror to the latest prior publication."""
    retained = [
        dict(release)
        for release in retained_release_history(
            normalized_root,
            agent,
            releases,
            previous_value=previous_value,
        )
    ]
    commits = github_commits(
        cache,
        repository=repository,
        max_pages=max_commit_pages,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )
    published = [
        (parse_capture_timestamp(str(release["publishedAt"])), release)
        for release in retained
        if isinstance(release.get("publishedAt"), str)
    ]
    published.sort(key=lambda item: item[0])
    if commits and published:
        previous_sync_at = parse_capture_timestamp(commits[0]["committedAt"])
        for commit in commits:
            committed_at = parse_capture_timestamp(commit["committedAt"])
            candidates = [
                release
                for published_at, release in published
                if previous_sync_at <= published_at <= committed_at
            ]
            if candidates:
                release = candidates[-1]
                sha = commit["sha"]
                release["commitSha"] = sha
                release["tag"] = sha
                release["repositorySnapshot"] = {
                    "alignment": "first-source-sync-after-publication",
                    "committedAt": commit["committedAt"],
                    "sourceUrl": f"https://github.com/{repository}/tree/{sha}",
                }
            previous_sync_at = committed_at
    pairs = comparison_pairs(
        retained, captured_versions, newest_count=newest_comparisons
    )
    attach_code_compares(
        retained,
        cache,
        repository=repository,
        pairs=pairs,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )
    return retained


def changelog_document(
    response: CachedResponse, *, source_url: str
) -> dict[str, object]:
    return {
        "sourceUrl": source_url,
        "sha256": response.sha256,
        "bytes": len(response.body),
        "truncated": response.truncated,
    }


def normalized_agent(
    *,
    agent: str,
    repository: str,
    releases: Sequence[Mapping[str, object]],
    documents: Sequence[Mapping[str, object]],
) -> dict[str, object]:
    release_map: dict[str, Mapping[str, object]] = {}
    for raw in releases:
        version = str(raw.get("version", ""))
        version_key(version)
        if version in release_map:
            raise OfficialSyncError(f"duplicate normalized release: {agent} {version}")
        if len(canonical_json(raw)) > MAX_NORMALIZED_RELEASE_BYTES:
            raise OfficialSyncError(f"normalized release exceeds size limit: {agent} {version}")
        release_map[version] = raw
    value: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "agent": agent,
        "repository": repository,
        "documents": list(documents),
        "releases": release_map,
    }
    value["sourceDigest"] = sha256_bytes(canonical_json(value))
    return value


def normalized_descriptor(value: Mapping[str, object]) -> dict[str, object]:
    releases = value.get("releases")
    if not isinstance(releases, Mapping):
        raise OfficialSyncError("normalized source releases must be an object")
    return {
        "url": f"agents/{value['sourceDigest']}.json",
        "releaseCount": len(releases),
        "tagCommitCount": sum(
            1
            for release in releases.values()
            if isinstance(release, Mapping)
            and isinstance(release.get("commitSha"), str)
        ),
        "codeComparisonCount": sum(
            1
            for release in releases.values()
            if isinstance(release, Mapping)
            and isinstance(release.get("codeChange"), Mapping)
            and release["codeChange"].get("status") == "available"
        ),
        "analysisCodeComparisonCount": sum(
            1
            for release in releases.values()
            if isinstance(release, Mapping)
            and isinstance(release.get("codeChange"), Mapping)
            and release["codeChange"].get("status") == "available"
            and release["codeChange"].get("analysisEligible") is True
        ),
        "sourceDigest": value["sourceDigest"],
    }


def normalized_manifest(
    values: Mapping[str, Mapping[str, object]],
) -> dict[str, object]:
    manifest: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "agents": {
            agent: normalized_descriptor(value)
            for agent, value in sorted(values.items())
        },
    }
    manifest["sourceDigest"] = sha256_bytes(canonical_json(manifest))
    return manifest


def validate_normalized_digest(value: Mapping[str, object], *, path: Path) -> None:
    recorded = value.get("sourceDigest")
    if not isinstance(recorded, str) or not re.fullmatch(r"[0-9a-f]{64}", recorded):
        raise OfficialSyncError(f"invalid normalized sourceDigest: {path}")
    projection = dict(value)
    projection.pop("sourceDigest", None)
    if sha256_bytes(canonical_json(projection)) != recorded:
        raise OfficialSyncError(f"normalized sourceDigest mismatch: {path}")


def read_normalized_object(path: Path, *, maximum: int) -> dict[str, object]:
    if path.is_symlink() or not path.is_file():
        raise OfficialSyncError(f"normalized source must be a regular file: {path}")
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise OfficialSyncError(f"cannot read normalized source: {path}: {error}") from error
    if len(raw) > maximum:
        raise OfficialSyncError(f"normalized source exceeds size limit: {path}")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OfficialSyncError(f"cannot parse normalized source: {path}: {error}") from error
    if not isinstance(value, dict):
        raise OfficialSyncError(f"normalized source must be an object: {path}")
    return value


def load_normalized_generation(
    normalized_root: Path,
) -> dict[str, dict[str, object]]:
    if normalized_root.is_symlink():
        raise OfficialSyncError(
            f"normalized source root must not be a symlink: {normalized_root}"
        )
    if not normalized_root.exists():
        return {}
    if not normalized_root.is_dir():
        raise OfficialSyncError(
            f"normalized source root must be a directory: {normalized_root}"
        )
    manifest_path = normalized_root / "manifest.json"
    legacy_present = {
        path.name
        for path in normalized_root.glob("*.json")
        if path.name != "manifest.json"
    }
    if not manifest_path.exists():
        if legacy_present:
            raise OfficialSyncError(
                "normalized source indices exist without a committed manifest"
            )
        return {}
    manifest = read_normalized_object(
        manifest_path, maximum=MAX_NORMALIZED_MANIFEST_BYTES
    )
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise OfficialSyncError(f"normalized manifest schema mismatch: {manifest_path}")
    validate_normalized_digest(manifest, path=manifest_path)
    descriptors = manifest.get("agents")
    if not isinstance(descriptors, dict):
        raise OfficialSyncError(f"normalized manifest agents are invalid: {manifest_path}")

    values: dict[str, dict[str, object]] = {}
    expected_paths: set[Path] = set()
    known_repositories = {
        **OFFICIAL_REPOSITORIES,
        **{
            agent: str(config["repository"])
            for agent, config in RETIRED_AGENTS.items()
        },
    }
    for agent, descriptor in descriptors.items():
        if agent not in known_repositories or not isinstance(descriptor, dict):
            raise OfficialSyncError(f"normalized manifest agent is invalid: {agent!r}")
        expected_url = f"agents/{descriptor.get('sourceDigest')}.json"
        legacy_url = f"{agent}.json"
        descriptor_url = descriptor.get("url")
        if descriptor_url == legacy_url:
            path = normalized_root / legacy_url
        elif descriptor_url == expected_url:
            path = normalized_root / expected_url
        else:
            raise OfficialSyncError(f"normalized manifest URL mismatch: {agent}")
        expected_paths.add(path)
        value = read_normalized_object(path, maximum=MAX_NORMALIZED_INDEX_BYTES)
        if (
            value.get("schemaVersion") != SCHEMA_VERSION
            or value.get("agent") != agent
            or value.get("repository") != known_repositories[agent]
            or not isinstance(value.get("documents"), list)
            or not isinstance(value.get("releases"), dict)
        ):
            raise OfficialSyncError(f"normalized source identity mismatch: {path}")
        validate_normalized_digest(value, path=path)
        releases = value["releases"]
        assert isinstance(releases, dict)
        for version, release in releases.items():
            if (
                not isinstance(version, str)
                or not isinstance(release, dict)
                or release.get("version") != version
            ):
                raise OfficialSyncError(f"normalized release identity mismatch: {path}")
            version_key(version)
            if len(canonical_json(release)) > MAX_NORMALIZED_RELEASE_BYTES:
                raise OfficialSyncError(
                    f"normalized release exceeds size limit: {agent} {version}"
                )
        expected_descriptor = normalized_descriptor(value)
        comparable_descriptor = dict(expected_descriptor)
        comparable_descriptor["url"] = descriptor_url
        if canonical_json(descriptor) != canonical_json(comparable_descriptor):
            raise OfficialSyncError(f"normalized manifest descriptor mismatch: {agent}")
        values[agent] = value

    # A content-addressed manifest may coexist with orphaned flat files after
    # the atomic manifest switch. Only manifest-referenced objects are trusted.
    missing = [path for path in expected_paths if not path.is_file()]
    if missing:
        raise OfficialSyncError(
            "normalized manifest source indices are missing: "
            + ", ".join(sorted(str(path) for path in missing))
        )
    return values


def sync_health_status(warnings: Sequence[Mapping[str, str]]) -> str:
    if any(warning.get("type") != "stale-cache-used" for warning in warnings):
        return "degraded"
    return "stale" if warnings else "current"


def resolve_github_token() -> str | None:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token
    gh = shutil.which("gh")
    if gh is None:
        return None
    try:
        result = subprocess.run(
            [gh, "auth", "token"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip() or None


def sync(
    *,
    cache_root: Path,
    max_release_pages: int = 50,
    max_tag_pages: int = 50,
    max_comparisons: int = SOURCE_CODE_COMPARISON_WINDOW,
    timeout: float = 45.0,
    allow_stale_on_error: bool = False,
    token: str | None = None,
    capture_roots: Sequence[Path] = (),
    agents: Sequence[str] | None = None,
) -> dict[str, object]:
    root = cache_root.expanduser().resolve()
    cache = HttpCache(root / "http", token=token)
    normalized_root = root / "normalized"
    previous_values = {
        agent: value
        for agent, value in load_normalized_generation(normalized_root).items()
        if agent not in RETIRED_AGENTS
    }
    captured = discover_capture_sequences(capture_roots)
    selected = set(agents or OFFICIAL_REPOSITORIES)
    selected.intersection_update(OFFICIAL_REPOSITORIES)
    normalized_values = dict(previous_values)

    for agent in selected:
        normalized_values.pop(agent, None)

    if "codex" in selected:
        codex_changelog = cache.fetch(
            CODEX_CHANGELOG_RAW_URL,
            accept="text/plain",
            max_bytes=MAX_CHANGELOG_BYTES,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
        )
        codex_releases_raw = codex_releases(
            cache,
            max_pages=max_release_pages,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
        )
        codex = enrich_repository_history(
            agent="codex",
            repository=CODEX_REPOSITORY,
            product_name="Codex",
            tag_pattern=CODEX_TAG_RE,
            releases=codex_releases_raw,
            normalized_root=normalized_root,
            captured_versions=captured.get("codex", ()),
            cache=cache,
            max_tag_pages=max_tag_pages,
            newest_comparisons=max_comparisons,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
            previous_value=previous_values.get("codex"),
        )
        normalized_values["codex"] = normalized_agent(
            agent="codex",
            repository=CODEX_REPOSITORY,
            releases=codex,
            documents=[
                changelog_document(codex_changelog, source_url=CODEX_CHANGELOG_URL)
            ],
        )

    if "claude-code" in selected:
        claude_changelog = cache.fetch(
            CLAUDE_CHANGELOG_RAW_URL,
            accept="text/plain",
            max_bytes=MAX_CHANGELOG_BYTES,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
        )
        try:
            claude_text = claude_changelog.body.decode("utf-8")
        except UnicodeDecodeError as error:
            raise OfficialSyncError("Claude Code changelog is not UTF-8") from error
        claude_entries = parse_markdown_changelog(claude_text)
        claude_releases = [
            {
                "version": version,
                "tag": f"v{version}",
                "title": f"Claude Code {version}",
                "sourceUrl": CLAUDE_CHANGELOG_URL,
                "notes": notes_value(
                    notes,
                    source_kind="official-changelog",
                    source_url=CLAUDE_CHANGELOG_URL,
                ),
            }
            for version, notes in sorted(
                claude_entries.items(), key=lambda item: version_key(item[0])
            )
        ]
        claude_releases = enrich_repository_history(
            agent="claude-code",
            repository=CLAUDE_REPOSITORY,
            product_name="Claude Code",
            tag_pattern=CLAUDE_TAG_RE,
            releases=claude_releases,
            normalized_root=normalized_root,
            captured_versions=captured.get("claude-code", ()),
            cache=cache,
            max_tag_pages=max_tag_pages,
            newest_comparisons=max_comparisons,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
            previous_value=previous_values.get("claude-code"),
        )
        normalized_values["claude-code"] = normalized_agent(
            agent="claude-code",
            repository=CLAUDE_REPOSITORY,
            releases=claude_releases,
            documents=[
                changelog_document(claude_changelog, source_url=CLAUDE_CHANGELOG_URL)
            ],
        )

    for agent, config in GITHUB_RELEASE_SOURCES.items():
        if agent not in selected:
            continue
        repository = str(config["repository"])
        tag_pattern = re.compile(str(config["tagPattern"]))
        product_name = str(config["label"])
        complete = github_releases(
            cache,
            repository=repository,
            tag_pattern=tag_pattern,
            product_name=product_name,
            max_pages=max_release_pages,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
        )
        retained = enrich_repository_history(
            agent=agent,
            repository=repository,
            product_name=product_name,
            tag_pattern=tag_pattern,
            releases=complete,
            normalized_root=normalized_root,
            captured_versions=captured.get(agent, ()),
            cache=cache,
            max_tag_pages=max_tag_pages,
            newest_comparisons=max_comparisons,
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
            previous_value=previous_values.get(agent),
        )
        normalized_values[agent] = normalized_agent(
            agent=agent,
            repository=repository,
            releases=retained,
            documents=[],
        )

    for agent, config in NPM_RELEASE_SOURCES.items():
        if agent not in selected:
            continue
        repository = str(config["repository"])
        complete = npm_releases(
            cache,
            package_name=str(config["package"]),
            repository=repository,
            package_directory=(
                str(config["packageDirectory"])
                if config.get("packageDirectory") is not None
                else None
            ),
            product_name=str(config["label"]),
            require_repository_metadata=(
                config.get("requireRepositoryMetadata") is not False
            ),
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
        )
        tag_pattern_value = config.get("tagPattern")
        if config.get("githubReleaseNotes") is True:
            if not isinstance(tag_pattern_value, str):
                raise OfficialSyncError(
                    f"GitHub release notes require a tag pattern: {agent}"
                )
            release_notes = github_releases(
                cache,
                repository=repository,
                tag_pattern=re.compile(tag_pattern_value),
                product_name=str(config["label"]),
                max_pages=max_release_pages,
                timeout=timeout,
                allow_stale_on_error=allow_stale_on_error,
                include_prereleases=config.get("includePrereleases") is True,
            )
            complete = merge_release_histories(complete, release_notes)
        if isinstance(tag_pattern_value, str):
            retained = enrich_repository_history(
                agent=agent,
                repository=repository,
                product_name=str(config["label"]),
                tag_pattern=re.compile(tag_pattern_value),
                releases=complete,
                normalized_root=normalized_root,
                captured_versions=captured.get(agent, ()),
                cache=cache,
                max_tag_pages=max_tag_pages,
                newest_comparisons=max_comparisons,
                timeout=timeout,
                allow_stale_on_error=allow_stale_on_error,
                previous_value=previous_values.get(agent),
            )
        elif config.get("sourceSnapshotAfterPublish") is True:
            retained = enrich_repository_snapshots(
                agent=agent,
                repository=repository,
                releases=complete,
                normalized_root=normalized_root,
                captured_versions=captured.get(agent, ()),
                cache=cache,
                max_commit_pages=max_tag_pages,
                newest_comparisons=max_comparisons,
                timeout=timeout,
                allow_stale_on_error=allow_stale_on_error,
                previous_value=previous_values.get(agent),
            )
        else:
            retained = retained_release_history(
                normalized_root,
                agent,
                complete,
                previous_value=previous_values.get(agent),
            )
        normalized_values[agent] = normalized_agent(
            agent=agent,
            repository=repository,
            releases=retained,
            documents=[],
        )

    normalized_root.mkdir(parents=True, exist_ok=True)
    object_root = normalized_root / "agents"
    if object_root.is_symlink() or (object_root.exists() and not object_root.is_dir()):
        raise OfficialSyncError(
            f"normalized object root must be a regular directory: {object_root}"
        )
    object_root.mkdir(exist_ok=True)
    for value in normalized_values.values():
        digest = value["sourceDigest"]
        if not isinstance(digest, str):
            raise OfficialSyncError("normalized sourceDigest must be a string")
        atomic_write(object_root / f"{digest}.json", pretty_json(value))
    manifest = normalized_manifest(normalized_values)
    atomic_write(normalized_root / "manifest.json", pretty_json(manifest))
    # Old immutable objects are harmless and let an interrupted reader finish
    # against the manifest generation it already opened.
    for path in normalized_root.glob("*.json"):
        if path.name != "manifest.json" and path.is_file() and not path.is_symlink():
            path.unlink()
    status = {
        "schemaVersion": SCHEMA_VERSION,
        "status": sync_health_status(cache.warnings),
        "warnings": sorted(cache.warnings, key=lambda item: (item["url"], item["reason"])),
        "selectedAgents": sorted(selected),
        "retainedAgents": sorted(previous_values.keys() - selected),
        "normalizedManifestSha256": sha256_bytes(pretty_json(manifest)),
    }
    atomic_write(root / "sync-status.json", pretty_json(status))
    return manifest


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-root", type=Path, default=DEFAULT_CACHE_ROOT)
    parser.add_argument(
        "--agents",
        default="all",
        help="comma-separated agent ids, or 'all' (default: all official sources)",
    )
    parser.add_argument(
        "--max-release-pages",
        type=int,
        default=50,
        help="GitHub release pages to inspect; failure is explicit if history exceeds 5,000 releases",
    )
    parser.add_argument(
        "--max-tag-pages",
        type=int,
        default=50,
        help="GitHub tag pages to inspect; failure is explicit if the history is larger",
    )
    parser.add_argument(
        "--max-comparisons", type=int, default=SOURCE_CODE_COMPARISON_WINDOW
    )
    parser.add_argument(
        "--capture-root",
        action="append",
        type=Path,
        default=[],
        help="Phistory-format root whose adjacent versions require source comparisons",
    )
    parser.add_argument("--timeout", type=float, default=45.0)
    parser.add_argument(
        "--allow-stale-on-error",
        action="store_true",
        help="reuse an existing cached response when a refresh request fails",
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)
    if args.max_release_pages < 1:
        parser.error("--max-release-pages must be at least 1")
    if args.max_tag_pages < 1:
        parser.error("--max-tag-pages must be at least 1")
    if args.max_comparisons < 0:
        parser.error("--max-comparisons must be non-negative")
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")
    requested = tuple(
        dict.fromkeys(part.strip() for part in args.agents.split(",") if part.strip())
    )
    if requested == ("all",):
        args.agents = tuple(OFFICIAL_REPOSITORIES)
    elif not requested or "all" in requested:
        parser.error("--agents must be a comma-separated list or exactly 'all'")
    else:
        invalid = [
            agent
            for agent in requested
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", agent)
        ]
        if invalid:
            parser.error("invalid agent id(s): " + ", ".join(invalid))
        args.agents = requested
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    manifest = sync(
        cache_root=args.cache_root,
        max_release_pages=args.max_release_pages,
        max_tag_pages=args.max_tag_pages,
        max_comparisons=args.max_comparisons,
        timeout=args.timeout,
        allow_stale_on_error=args.allow_stale_on_error,
        token=resolve_github_token(),
        capture_roots=args.capture_root,
        agents=args.agents,
    )
    counts = manifest["agents"]
    assert isinstance(counts, Mapping)
    print(
        "Synced official evidence: "
        + ", ".join(
            f"{agent}={value['releaseCount']}"
            for agent, value in sorted(counts.items())
            if isinstance(value, Mapping)
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OfficialSyncError as error:
        LOG.error("%s", error)
        raise SystemExit(1) from error
