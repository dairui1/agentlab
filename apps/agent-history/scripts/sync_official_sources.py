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
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


APP_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE_ROOT = APP_ROOT / ".cache" / "official-sources"
SCHEMA_VERSION = 1
USER_AGENT = "agentlab-agent-history/1.0 (+https://agentlab.dairui1.com)"

CODEX_REPOSITORY = "openai/codex"
CLAUDE_REPOSITORY = "anthropics/claude-code"
CLINE_REPOSITORY = "cline/cline"
QWEN_CODE_REPOSITORY = "QwenLM/qwen-code"
REASONIX_REPOSITORY = "esengine/DeepSeek-Reasonix"
CODEX_RELEASES_URL = f"https://api.github.com/repos/{CODEX_REPOSITORY}/releases"
CODEX_CHANGELOG_RAW_URL = (
    f"https://raw.githubusercontent.com/{CODEX_REPOSITORY}/main/CHANGELOG.md"
)
CODEX_CHANGELOG_URL = f"https://github.com/{CODEX_REPOSITORY}/blob/main/CHANGELOG.md"
CLAUDE_CHANGELOG_RAW_URL = (
    f"https://raw.githubusercontent.com/{CLAUDE_REPOSITORY}/main/CHANGELOG.md"
)
CLAUDE_CHANGELOG_URL = f"https://github.com/{CLAUDE_REPOSITORY}/blob/main/CHANGELOG.md"

MAX_JSON_RESPONSE_BYTES = 32 * 1024 * 1024
MAX_CHANGELOG_BYTES = 4 * 1024 * 1024
MAX_DIFF_BYTES = 1024 * 1024
MAX_NOTES_BYTES = 16 * 1024
MAX_KEY_FILES = 24
MAX_NORMALIZED_RELEASE_BYTES = 64 * 1024

VERSION_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
CODEX_TAG_RE = re.compile(r"^(?:rust-)?v?(\d+\.\d+\.\d+)$")
CLINE_TAG_RE = re.compile(r"^cli-v(\d+\.\d+\.\d+)$")
STANDARD_TAG_RE = re.compile(r"^v(\d+\.\d+\.\d+)$")
CHANGELOG_HEADING_RE = re.compile(
    r"^##[ \t]+v?(\d+\.\d+\.\d+)(?:[ \t].*)?$", re.MULTILINE
)
DIFF_HEADER_RE = re.compile(r"^diff --git a/(.*?) b/(.*?)$", re.MULTILINE)
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


def version_key(value: str) -> tuple[int, int, int]:
    match = VERSION_RE.fullmatch(value)
    if not match:
        raise OfficialSyncError(f"invalid official release version: {value!r}")
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


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
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            headers["X-GitHub-Api-Version"] = "2022-11-28"
        if cached and cached.etag:
            headers["If-None-Match"] = cached.etag
        elif cached and cached.last_modified:
            headers["If-Modified-Since"] = cached.last_modified
        request = Request(url, headers=headers)
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
                    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
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
            if allow_stale_on_error and cached is not None:
                self._record_stale(
                    url=url, cached=cached, reason=f"http-{error.code}"
                )
                return cached
            raise OfficialSyncError(f"HTTP {error.code} while fetching {url}") from error
        except (OSError, TimeoutError, URLError) as error:
            if allow_stale_on_error and cached is not None:
                self._record_stale(
                    url=url, cached=cached, reason=f"fetch-failure:{type(error).__name__}"
                )
                return cached
            raise OfficialSyncError(f"cannot fetch {url}: {error}") from error


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
    ranked = sorted(
        files,
        key=lambda item: (
            -(int(item["additionsObserved"]) + int(item["deletionsObserved"])),
            str(item["path"]),
        ),
    )[:MAX_KEY_FILES]
    return {
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


def github_releases(
    cache: HttpCache,
    *,
    repository: str,
    tag_pattern: re.Pattern[str],
    product_name: str,
    max_pages: int,
    timeout: float,
    allow_stale_on_error: bool,
    published_since: datetime | None = None,
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
            if raw.get("prerelease") is True:
                continue
            published = raw.get("published_at")
            if published_since is not None:
                if not isinstance(published, str) or not published:
                    continue
                try:
                    published_at = datetime.fromisoformat(
                        published.replace("Z", "+00:00")
                    )
                except ValueError:
                    continue
                if published_at < published_since:
                    continue
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
    return sorted(releases.values(), key=lambda item: version_key(str(item["version"])))


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
) -> list[Mapping[str, object]]:
    retained: dict[str, Mapping[str, object]] = {}
    path = normalized_root / f"{agent}.json"
    if path.is_file() and not path.is_symlink():
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            previous = None
        previous_releases = previous.get("releases") if isinstance(previous, dict) else None
        if isinstance(previous_releases, dict):
            retained.update(
                (version, value)
                for version, value in previous_releases.items()
                if isinstance(version, str) and isinstance(value, dict)
            )
    for release in releases:
        retained[str(release["version"])] = release
    return [retained[version] for version in sorted(retained, key=version_key)]


def attach_codex_compares(
    releases: list[dict[str, object]],
    cache: HttpCache,
    *,
    max_comparisons: int,
    timeout: float,
    allow_stale_on_error: bool,
) -> None:
    if max_comparisons <= 0:
        return
    start = max(1, len(releases) - max_comparisons)
    for index in range(start, len(releases)):
        previous = releases[index - 1]
        current = releases[index]
        base_tag = str(previous["tag"])
        head_tag = str(current["tag"])
        api_url = (
            f"https://api.github.com/repos/{CODEX_REPOSITORY}/compare/"
            f"{quote(base_tag, safe='')}...{quote(head_tag, safe='')}"
        )
        compare_url = (
            f"https://github.com/{CODEX_REPOSITORY}/compare/"
            f"{quote(base_tag, safe='')}...{quote(head_tag, safe='')}"
        )
        try:
            response = cache.fetch(
                api_url,
                accept="application/vnd.github.v3.diff",
                max_bytes=MAX_DIFF_BYTES,
                timeout=timeout,
                allow_stale_on_error=allow_stale_on_error,
                allow_truncated=True,
            )
        except OfficialSyncError as error:
            LOG.warning(
                "skipping Codex code overview %s..%s: %s",
                previous["version"],
                current["version"],
                error,
            )
            current["codeChange"] = {
                "status": "unavailable",
                "reason": "official-compare-fetch-failed",
                "baseVersion": str(previous["version"]),
                "headVersion": str(current["version"]),
                "baseTag": base_tag,
                "headTag": head_tag,
                "sourceUrl": compare_url,
            }
            cache.warnings.append(
                {
                    "type": "source-unavailable",
                    "url": api_url,
                    "reason": "official-compare-fetch-failed",
                }
            )
            continue
        current["codeChange"] = parse_compare_diff(
            response.body,
            base_version=str(previous["version"]),
            head_version=str(current["version"]),
            base_tag=base_tag,
            head_tag=head_tag,
            compare_url=compare_url,
            truncated=response.truncated,
        )


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


def sync_health_status(warnings: Sequence[Mapping[str, str]]) -> str:
    if any(warning.get("type") != "stale-cache-used" for warning in warnings):
        return "degraded"
    return "stale" if warnings else "current"


def sync(
    *,
    cache_root: Path,
    max_release_pages: int = 10,
    max_comparisons: int = 20,
    timeout: float = 45.0,
    allow_stale_on_error: bool = False,
    token: str | None = None,
) -> dict[str, object]:
    root = cache_root.expanduser().resolve()
    cache = HttpCache(root / "http", token=token)
    normalized_root = root / "normalized"

    codex_changelog = cache.fetch(
        CODEX_CHANGELOG_RAW_URL,
        accept="text/plain",
        max_bytes=MAX_CHANGELOG_BYTES,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )
    codex = codex_releases(
        cache,
        max_pages=max_release_pages,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )
    attach_codex_compares(
        codex,
        cache,
        max_comparisons=max_comparisons,
        timeout=timeout,
        allow_stale_on_error=allow_stale_on_error,
    )
    codex_value = normalized_agent(
        agent="codex",
        repository=CODEX_REPOSITORY,
        releases=codex,
        documents=[
            changelog_document(codex_changelog, source_url=CODEX_CHANGELOG_URL)
        ],
    )

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
        for version, notes in sorted(claude_entries.items(), key=lambda item: version_key(item[0]))
    ]
    claude_value = normalized_agent(
        agent="claude-code",
        repository=CLAUDE_REPOSITORY,
        releases=claude_releases,
        documents=[
            changelog_document(claude_changelog, source_url=CLAUDE_CHANGELOG_URL)
        ],
    )

    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=62)
    recent_configs = {
        "cline": (CLINE_REPOSITORY, CLINE_TAG_RE, "Cline CLI"),
        "qwen-code": (QWEN_CODE_REPOSITORY, STANDARD_TAG_RE, "Qwen Code"),
        "reasonix": (REASONIX_REPOSITORY, STANDARD_TAG_RE, "Reasonix"),
    }
    normalized_values: dict[str, dict[str, object]] = {
        "claude-code": claude_value,
        "codex": codex_value,
    }
    for agent, (repository, tag_pattern, product_name) in recent_configs.items():
        recent = github_releases(
            cache,
            repository=repository,
            tag_pattern=tag_pattern,
            product_name=product_name,
            max_pages=min(max_release_pages, 3),
            timeout=timeout,
            allow_stale_on_error=allow_stale_on_error,
            published_since=recent_cutoff,
        )
        retained = retained_release_history(normalized_root, agent, recent)
        normalized_values[agent] = normalized_agent(
            agent=agent,
            repository=repository,
            releases=retained,
            documents=[],
        )

    for agent, value in normalized_values.items():
        atomic_write(normalized_root / f"{agent}.json", pretty_json(value))
    manifest: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "agents": {
            agent: {
                "url": f"{agent}.json",
                "releaseCount": len(value["releases"]),
                "sourceDigest": value["sourceDigest"],
            }
            for agent, value in sorted(normalized_values.items())
        },
    }
    manifest["sourceDigest"] = sha256_bytes(canonical_json(manifest))
    atomic_write(normalized_root / "manifest.json", pretty_json(manifest))
    status = {
        "schemaVersion": SCHEMA_VERSION,
        "status": sync_health_status(cache.warnings),
        "warnings": sorted(cache.warnings, key=lambda item: (item["url"], item["reason"])),
        "normalizedManifestSha256": sha256_bytes(pretty_json(manifest)),
    }
    atomic_write(root / "sync-status.json", pretty_json(status))
    return manifest


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-root", type=Path, default=DEFAULT_CACHE_ROOT)
    parser.add_argument(
        "--max-release-pages",
        type=int,
        default=10,
        help="GitHub release pages to inspect; 10 covers the complete captured Codex range",
    )
    parser.add_argument("--max-comparisons", type=int, default=20)
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
    if args.max_comparisons < 0:
        parser.error("--max-comparisons must be non-negative")
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")
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
        max_comparisons=args.max_comparisons,
        timeout=args.timeout,
        allow_stale_on_error=args.allow_stale_on_error,
        token=os.environ.get("GITHUB_TOKEN"),
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
