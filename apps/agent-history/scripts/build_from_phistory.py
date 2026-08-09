#!/usr/bin/env python3
"""Build Agent History's static data from a local Phistory checkout.

The builder intentionally keeps capture ingestion deterministic.  Prompt bytes are
published as content-addressed objects, adjacent releases produce evidence packets,
and an optional Codex-authored analysis can replace the Chinese fallback copy.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import quote


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from terminology import normalize_changelog_record


DEFAULT_OFFICIAL_ROOT = APP_ROOT / ".cache" / "official-sources" / "normalized"
DEFAULT_CAPTURE_OVERLAY_ROOT = APP_ROOT / ".cache" / "agentlab-captures"
SCHEMA_VERSION = 1
MAX_DIFF_LINES = 500
MAX_CAPTURES_PER_AGENT = 5_000
MAX_CAPTURE_WARNINGS = 100
MAX_PROMPT_BYTES = 2 * 1024 * 1024
MAX_PROMPT_LINE_BYTES = 256 * 1024
MAX_CAPTURE_META_BYTES = 256 * 1024
MAX_TRACE_BYTES = 8 * 1024 * 1024
MAX_TRACE_LINE_BYTES = 1024 * 1024
MAX_OFFICIAL_FILE_BYTES = 16 * 1024 * 1024
MAX_OFFICIAL_RELEASE_BYTES = 64 * 1024
MAX_OFFICIAL_MANIFEST_BYTES = 1024 * 1024
MAX_OFFICIAL_STATUS_BYTES = 1024 * 1024
MAX_STATIC_PROMPTS_FILE_BYTES = 8 * 1024 * 1024
MAX_STATIC_PROMPT_ITEMS = 5_000
MAX_STATIC_PROMPT_CHANGES = 40
MAX_STATIC_PROMPT_EXCERPT_BYTES = 640
EPOCH = "1970-01-01T00:00:00Z"
UPSTREAM_REPO = "WEIFENG2333/phistory"
UPSTREAM_URL = f"https://github.com/{UPSTREAM_REPO}"
OFFICIAL_REPOSITORIES = {
    "claude-code": "anthropics/claude-code",
    "cline": "cline/cline",
    "codex": "openai/codex",
    "qwen-code": "QwenLM/qwen-code",
    "reasonix": "esengine/DeepSeek-Reasonix",
}

AGENT_DEFINITIONS: dict[str, dict[str, str]] = {
    "claude-code": {
        "label": "Claude Code",
        "description": "Anthropic Claude Code Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/anthropics/claude-code",
    },
    "codex": {
        "label": "Codex",
        "description": "OpenAI Codex CLI Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/openai/codex",
    },
    "antigravity": {
        "label": "Antigravity CLI",
        "description": "Google Antigravity CLI Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/google-antigravity/antigravity-cli",
    },
    "grok": {
        "label": "Grok Build",
        "description": "xAI Grok Build Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://www.npmjs.com/package/@xai-official/grok",
    },
    "kimi-code": {
        "label": "Kimi Code",
        "description": "Moonshot AI Kimi Code Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/MoonshotAI/kimi-code",
    },
    "mimo": {
        "label": "MiMo Code",
        "description": "Xiaomi MiMo Code Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/XiaomiMiMo/MiMo-Code",
    },
    "openclaw": {
        "label": "OpenClaw",
        "description": "OpenClaw Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/openclaw/openclaw",
    },
    "hermes": {
        "label": "Hermes Agent",
        "description": "Nous Research Hermes Agent Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/NousResearch/hermes-agent",
    },
    "kimi": {
        "label": "Kimi CLI",
        "description": "Moonshot AI Kimi CLI Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/MoonshotAI/kimi-cli",
    },
    "opencode": {
        "label": "opencode",
        "description": "opencode Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/anomalyco/opencode",
    },
    "pi": {
        "label": "Pi",
        "description": "Pi Coding Agent Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://pi.dev/",
    },
    "omp": {
        "label": "Oh My Pi",
        "description": "Oh My Pi Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/can1357/oh-my-pi",
    },
    "goose": {
        "label": "Goose",
        "description": "Goose CLI Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/aaif-goose/goose",
    },
    "cline": {
        "label": "Cline",
        "description": "Cline CLI Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/cline/cline",
    },
    "qwen-code": {
        "label": "Qwen Code",
        "description": "Qwen Code Runtime Prompt 与工具的版本历史。",
        "projectUrl": "https://github.com/QwenLM/qwen-code",
    },
    "reasonix": {
        "label": "Reasonix",
        "description": "Reasonix Coding Agent 的官方发布与 Agent 设计变更历史。",
        "projectUrl": "https://github.com/esengine/DeepSeek-Reasonix",
    },
}

PREFERRED_AGENT_ORDER = (
    "claude-code",
    "codex",
    "antigravity",
    "grok",
    "kimi-code",
    "mimo",
    "openclaw",
    "hermes",
    "kimi",
    "opencode",
    "pi",
    "omp",
    "goose",
    "cline",
    "qwen-code",
    "reasonix",
)
AGENT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
VERSION_SCHEME_RE = re.compile(
    r"^v?((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){1,3})"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
SAFE_COMPONENT_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._+-]*$")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
FENCE_RE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")
TOOL_PREFIX_RE = re.compile(r"^Tool\s+\d+\s*:\s*", re.IGNORECASE)


@dataclass(frozen=True)
class Span:
    """A parsed Markdown heading and the lines owned by it."""

    id: str
    label: str
    start_line: int
    end_line: int
    text: str

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "startLine": self.start_line,
            "endLine": self.end_line,
        }


@dataclass(frozen=True)
class Capture:
    agent: str
    version: str
    prompt: bytes
    prompt_text: str
    sha256: str
    capture_sha256: str
    captured_at: str
    published_at: str | None
    source_url: str | None
    prompt_source_url: str | None
    meta_source_url: str | None
    trace_source_url: str | None
    provenance: tuple[Mapping[str, Any], ...]
    sections: tuple[Span, ...]
    tools: tuple[Span, ...]
    meta: Mapping[str, Any]
    trace: Mapping[str, Any] | None
    static_prompts: "StaticPromptSet | None"

    @property
    def line_count(self) -> int:
        return len(self.prompt_text.splitlines())


@dataclass(frozen=True)
class CaptureIngestion:
    captures: tuple[Capture, ...]
    rejected_count: int
    warnings: tuple[dict[str, Any], ...]
    warnings_truncated: bool

    def public(self) -> dict[str, Any]:
        return {
            "acceptedCaptures": len(self.captures),
            "rejectedCaptures": self.rejected_count,
            "warningCount": len(self.warnings),
            "warningsTruncated": self.warnings_truncated,
            "warnings": [dict(warning) for warning in self.warnings],
        }


@dataclass(frozen=True)
class CaptureRoot:
    path: Path
    kind: str
    label: str
    commit: str
    repository: str | None = None
    url: str | None = None

    @property
    def ref(self) -> str:
        return self.commit if self.commit != "unknown" else "main"

    def public(self) -> dict[str, Any]:
        value: dict[str, Any] = {
            "kind": self.kind,
            "label": self.label,
            "commit": self.commit,
        }
        if self.repository is not None:
            value["repository"] = self.repository
        if self.url is not None:
            value["url"] = self.url
        return value


@dataclass(frozen=True)
class StaticPrompt:
    id: str
    name: str
    category: str
    description: str
    content_hash: str
    content: str


@dataclass(frozen=True)
class StaticPromptSet:
    sha256: str
    bytes: int
    total: int
    known: int
    unknown: int
    source_url: str
    items: tuple[StaticPrompt, ...]


@dataclass(frozen=True)
class OfficialSourceBundle:
    """A committed official-source generation plus its refresh health."""

    indices: Mapping[str, Mapping[str, Any]]
    status: str
    sync_status: str | None
    warnings: tuple[Mapping[str, str], ...]
    manifest_source_digest: str | None
    manifest_sha256: str | None

    def public(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "syncStatus": self.sync_status,
            "warningCount": len(self.warnings),
            "warnings": [dict(warning) for warning in self.warnings],
            "normalizedManifestSourceDigest": self.manifest_source_digest,
            "normalizedManifestSha256": self.manifest_sha256,
        }


def canonical_json(value: object) -> bytes:
    """Encode a value in the stable form used for evidence digests."""

    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def pretty_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def semver_key(version: str) -> tuple[Any, ...]:
    """Return a stable precedence key for Phistory's two-to-four-part versions."""

    match = VERSION_SCHEME_RE.fullmatch(version)
    if not match:
        raise ValueError(f"invalid version directory: {version!r}")
    core = tuple(int(part) for part in match.group(1).split("."))
    padded_core = (*core, *(0 for _ in range(4 - len(core))))
    prerelease = match.group(2)
    if prerelease is None:
        prerelease_key: tuple[Any, ...] = (1, ())
    else:
        identifiers: list[tuple[int, int | str]] = []
        for identifier in prerelease.split("."):
            if identifier.isdigit():
                if len(identifier) > 1 and identifier.startswith("0"):
                    raise ValueError(
                        f"invalid numeric prerelease identifier in version: {version!r}"
                    )
                identifiers.append((0, int(identifier)))
            else:
                identifiers.append((1, identifier))
        prerelease_key = (0, tuple(identifiers))
    # Build metadata does not affect SemVer precedence; the original spelling only
    # breaks ties so output remains stable if an archive happens to contain both.
    return *padded_core, prerelease_key, version


def agent_sort_key(agent: str) -> tuple[int, str]:
    try:
        return PREFERRED_AGENT_ORDER.index(agent), ""
    except ValueError:
        return len(PREFERRED_AGENT_ORDER), agent


def discover_agents(capture_roots: Sequence[CaptureRoot]) -> tuple[str, ...]:
    discovered: set[str] = set()
    for root in capture_roots:
        capture_root = root.path / "captures"
        for path in capture_root.iterdir():
            if not path.is_dir() or path.is_symlink():
                continue
            if not AGENT_ID_RE.fullmatch(path.name):
                raise ValueError(
                    f"invalid {root.label} agent directory: {path.name!r}"
                )
            discovered.add(path.name)
    if not discovered:
        raise ValueError("no agent capture directories found in configured capture roots")
    return tuple(sorted(discovered, key=agent_sort_key))


def agent_definition(agent: str, captures: Sequence["Capture"]) -> dict[str, str]:
    override = AGENT_DEFINITIONS.get(agent, {})
    latest = captures[-1] if captures else None
    captured_label = latest.meta.get("agent") if latest is not None else None
    label = override.get("label") or (
        captured_label.strip()
        if isinstance(captured_label, str) and captured_label.strip()
        else agent.replace("-", " ").title()
    )
    return {
        "label": label,
        "description": override.get("description")
        or f"{label} Runtime Prompt 与工具的版本历史。",
        **({"projectUrl": override["projectUrl"]} if override.get("projectUrl") else {}),
    }


def normalize_timestamp(value: object, *, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty ISO-8601 string")
    candidate = value.strip()
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} is not a valid ISO-8601 timestamp: {candidate!r}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_component(value: str, *, kind: str) -> str:
    if not SAFE_COMPONENT_RE.fullmatch(value) or value in {".", ".."}:
        raise ValueError(f"unsafe {kind}: {value!r}")
    return value


def ensure_within(path: Path, root: Path, *, kind: str) -> Path:
    """Resolve an input path and reject symlinks that escape its declared root."""

    resolved = path.resolve(strict=True)
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"{kind} escapes declared root: {path}") from exc
    return resolved


def output_path(root: Path, *components: str) -> Path:
    for component in components:
        safe_component(component, kind="output path component")
    candidate = root.joinpath(*components)
    # Existing parent symlinks must not redirect a generated file outside the root.
    existing_parent = candidate.parent
    while not existing_parent.exists() and existing_parent != root:
        existing_parent = existing_parent.parent
    resolved_parent = existing_parent.resolve()
    try:
        resolved_parent.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"output path escapes declared root: {candidate}") from exc
    return candidate


def atomic_write(path: Path, content: bytes) -> None:
    """Atomically replace one artifact, avoiding churn when bytes are unchanged."""

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError(f"refusing to replace symlink output: {path}")
    if path.exists():
        if not path.is_file():
            raise ValueError(f"refusing to replace non-regular output: {path}")
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


def read_bounded_bytes(path: Path, *, kind: str, maximum: int) -> bytes:
    try:
        with path.open("rb") as handle:
            raw = handle.read(maximum + 1)
    except OSError as exc:
        raise ValueError(f"cannot read {kind} at {path}: {exc}") from exc
    if len(raw) > maximum:
        raise ValueError(f"{kind} exceeds {maximum} bytes: {path}")
    return raw


def read_json_object(
    path: Path, *, kind: str, maximum: int | None = None
) -> dict[str, Any]:
    try:
        if maximum is None:
            text = path.read_text(encoding="utf-8")
        else:
            text = read_bounded_bytes(path, kind=kind, maximum=maximum).decode("utf-8")
        value = json.loads(text)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read {kind} JSON at {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{kind} must be a JSON object: {path}")
    return value


def slugify(label: str, *, fallback: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z]+", "-", label.lower()).strip("-")
    return slug or fallback


def clean_heading_label(raw: str) -> str:
    label = raw.strip()
    label = TOOL_PREFIX_RE.sub("", label)
    if len(label) >= 2 and label[0] == label[-1] == "`":
        label = label[1:-1].strip()
    return label


def markdown_headings(lines: Sequence[str]) -> list[tuple[int, int, str]]:
    """Find ATX headings outside fenced Markdown code blocks."""

    headings: list[tuple[int, int, str]] = []
    fence_character: str | None = None
    fence_length = 0
    for line_number, line in enumerate(lines, start=1):
        fence = FENCE_RE.match(line)
        if fence:
            marker = fence.group(1)
            character = marker[0]
            if fence_character is None:
                fence_character = character
                fence_length = len(marker)
            elif character == fence_character and len(marker) >= fence_length:
                fence_character = None
                fence_length = 0
            continue
        if fence_character is not None:
            continue
        match = HEADING_RE.match(line)
        if match:
            label = match.group(2).strip()
            if label:
                headings.append((line_number, len(match.group(1)), label))
    return headings


def make_spans(
    lines: Sequence[str],
    heading_rows: Sequence[tuple[int, str]],
    *,
    final_line: int,
    fallback_prefix: str,
) -> tuple[Span, ...]:
    spans: list[Span] = []
    used_ids: dict[str, int] = {}
    for index, (start_line, raw_label) in enumerate(heading_rows):
        end_line = (
            heading_rows[index + 1][0] - 1
            if index + 1 < len(heading_rows)
            else final_line
        )
        label = clean_heading_label(raw_label)
        if not label:
            raise ValueError(f"empty Markdown heading at line {start_line}")
        base_id = slugify(label, fallback=f"{fallback_prefix}-{index + 1}")
        duplicate = used_ids.get(base_id, 0)
        used_ids[base_id] = duplicate + 1
        span_id = base_id if duplicate == 0 else f"{base_id}-{duplicate + 1}"
        text = "\n".join(lines[start_line - 1 : end_line])
        spans.append(Span(span_id, label, start_line, end_line, text))
    return tuple(spans)


def parse_prompt(text: str) -> tuple[tuple[Span, ...], tuple[Span, ...]]:
    lines = text.splitlines()
    headings = markdown_headings(lines)
    top_rows = [(line, label) for line, depth, label in headings if depth == 1]
    sections = make_spans(
        lines,
        top_rows,
        final_line=len(lines),
        fallback_prefix="section",
    )

    tools_heading = next(
        (
            (line, index)
            for index, (line, depth, label) in enumerate(headings)
            if depth == 1 and clean_heading_label(label).casefold() == "tools"
        ),
        None,
    )
    if tools_heading is None:
        return sections, ()
    tools_start, heading_index = tools_heading
    tools_end = len(lines)
    for line, depth, _ in headings[heading_index + 1 :]:
        if depth == 1:
            tools_end = line - 1
            break
    tool_rows = [
        (line, label)
        for line, depth, label in headings
        if depth == 2 and tools_start < line <= tools_end
    ]
    tools = make_spans(
        lines,
        tool_rows,
        final_line=tools_end,
        fallback_prefix="tool",
    )
    labels = [tool.label for tool in tools]
    if len(labels) != len(set(labels)):
        raise ValueError("duplicate tool headings in # Tools section")
    return sections, tools


def upstream_commit(phistory_root: Path) -> str:
    top_level = subprocess.run(
        ["git", "-C", str(phistory_root), "rev-parse", "--show-toplevel"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if top_level.returncode != 0:
        return "unknown"
    try:
        repository_root = Path(top_level.stdout.strip()).resolve(strict=True)
    except (OSError, RuntimeError):
        return "unknown"
    if repository_root != phistory_root:
        return "unknown"
    result = subprocess.run(
        ["git", "-C", str(phistory_root), "rev-parse", "HEAD"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    candidate = result.stdout.strip()
    return candidate if result.returncode == 0 and re.fullmatch(r"[0-9a-fA-F]{40}", candidate) else "unknown"


def source_links(
    agent: str,
    version: str,
    ref: str,
    *,
    has_trace: bool,
    has_static_prompts: bool = False,
) -> dict[str, str | None]:
    encoded_agent = quote(agent, safe="")
    encoded_version = quote(version, safe="")
    base = f"{UPSTREAM_URL}/tree/{quote(ref, safe='')}/captures/{encoded_agent}/{encoded_version}"
    blob = f"{UPSTREAM_URL}/blob/{quote(ref, safe='')}/captures/{encoded_agent}/{encoded_version}"
    return {
        "snapshot": base,
        "prompt": f"{blob}/prompt.md",
        "meta": f"{blob}/meta.json",
        "trace": f"{blob}/trace.jsonl" if has_trace else None,
        "staticPrompts": f"{blob}/static-prompts.json" if has_static_prompts else None,
    }


def capture_digest(
    *,
    agent: str,
    version: str,
    prompt_sha256: str,
    published_at: str | None,
    meta: Mapping[str, Any],
    static_prompts: StaticPromptSet | None,
) -> str:
    stable_meta: dict[str, Any] = {
        "agent_id": meta.get("agent_id", agent),
        "version": meta.get("version", version),
    }
    stable_meta.update({
        key: meta[key]
        for key in (
            "package",
            "tap_client",
        )
        if key in meta
    })
    if published_at is not None:
        stable_meta["published_at"] = published_at
    static_prompt_semantics = (
        {
            "total": static_prompts.total,
            "known": static_prompts.known,
            "unknown": static_prompts.unknown,
            "items": [
                {
                    "id": item.id,
                    "name": item.name,
                    "category": item.category,
                    "description": item.description,
                    "contentHash": item.content_hash,
                    "content": item.content,
                }
                for item in static_prompts.items
            ],
        }
        if static_prompts is not None
        else None
    )
    return sha256_bytes(
        canonical_json(
            {
                "agent": agent,
                "version": version,
                "promptSha256": prompt_sha256,
                "stableMeta": stable_meta,
                "staticPrompts": static_prompt_semantics,
            }
        )
    )


def capture_provenance(
    root: CaptureRoot,
    *,
    meta: Mapping[str, Any],
    links: Mapping[str, str | None],
    capture_sha256: str,
    prompt_sha256: str,
    meta_sha256: str,
    trace_sha256: str | None,
    static_prompts_sha256: str | None,
) -> dict[str, Any]:
    value = root.public()
    if meta.get("capture_kind") == "official-source-history":
        repository = meta.get("source_repository")
        ref = meta.get("source_ref")
        source_url = meta.get("source_url")
        if not all(isinstance(item, str) and item for item in (repository, ref, source_url)):
            raise ValueError("official source capture metadata is incomplete")
        if not str(source_url).startswith("https://github.com/"):
            raise ValueError("official source capture URL must use https://github.com/")
        value.update(
            {
                "kind": "official-source",
                "repository": repository,
                "commit": ref,
                "url": f"https://github.com/{repository}",
                "snapshotUrl": source_url,
                "metaUrl": source_url,
            }
        )
    value.update(
        {
            "captureSha256": capture_sha256,
            "promptSha256": prompt_sha256,
            "metaSha256": meta_sha256,
        }
    )
    if trace_sha256 is not None:
        value["traceSha256"] = trace_sha256
    if static_prompts_sha256 is not None:
        value["staticPromptsSha256"] = static_prompts_sha256
    for key, link_key in (
        ("snapshotUrl", "snapshot"),
        ("promptUrl", "prompt"),
        ("metaUrl", "meta"),
        ("traceUrl", "trace"),
        ("staticPromptsUrl", "staticPrompts"),
    ):
        link = links.get(link_key)
        if link is not None:
            value[key] = link
    return value


def read_trace(path: Path) -> dict[str, Any]:
    raw = read_bounded_bytes(path, kind="capture trace", maximum=MAX_TRACE_BYTES)
    for line_number, line in enumerate(raw.splitlines(), start=1):
        if len(line) > MAX_TRACE_LINE_BYTES:
            raise ValueError(
                f"capture trace line {line_number} exceeds {MAX_TRACE_LINE_BYTES} bytes: {path}"
            )
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"trace is not UTF-8: {path}") from exc
    records = 0
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid JSONL record at {path}:{line_number}: {exc}") from exc
        records += 1
    return {"sha256": sha256_bytes(raw), "bytes": len(raw), "records": records}


def require_short_string(
    value: object, *, field: str, max_length: int, allow_empty: bool = False
) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    result = value.strip()
    if not result and not allow_empty:
        raise ValueError(f"{field} must not be empty")
    if len(result) > max_length:
        raise ValueError(f"{field} exceeds {max_length} characters")
    return result


def load_static_prompts(
    path: Path,
    *,
    agent: str,
    version: str,
    source_url: str,
) -> StaticPromptSet:
    raw = path.read_bytes()
    if len(raw) > MAX_STATIC_PROMPTS_FILE_BYTES:
        raise ValueError(f"static prompts exceed size limit: {path}")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid static prompts JSON at {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"static prompts must be a JSON object: {path}")
    if value.get("agent_id") != agent or value.get("version") != version:
        raise ValueError(f"static prompts identity does not match directory: {path}")
    raw_items = value.get("prompts")
    if not isinstance(raw_items, list) or len(raw_items) > MAX_STATIC_PROMPT_ITEMS:
        raise ValueError(f"static prompts list is missing or too large: {path}")

    items: list[StaticPrompt] = []
    seen_keys: set[tuple[str, str]] = set()
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            raise ValueError(f"static prompt item {index} must be an object: {path}")
        prefix = f"{path}:prompts[{index}]"
        item_id = require_short_string(raw_item.get("id"), field=f"{prefix}.id", max_length=256)
        content_hash = require_short_string(
            raw_item.get("content_hash"),
            field=f"{prefix}.content_hash",
            max_length=64,
        )
        if not re.fullmatch(r"[0-9a-f]{64}", content_hash):
            raise ValueError(f"invalid static prompt content_hash: {prefix}")
        identity = (item_id, content_hash)
        if identity in seen_keys:
            raise ValueError(f"duplicate static prompt id/hash pair {identity!r}: {path}")
        seen_keys.add(identity)
        content = raw_item.get("content")
        if not isinstance(content, str):
            raise ValueError(f"{prefix}.content must be a string")
        items.append(
            StaticPrompt(
                id=item_id,
                name=require_short_string(
                    raw_item.get("name", item_id),
                    field=f"{prefix}.name",
                    max_length=512,
                ),
                category=require_short_string(
                    raw_item.get("category", "unknown"),
                    field=f"{prefix}.category",
                    max_length=128,
                ),
                description=require_short_string(
                    raw_item.get("description", ""),
                    field=f"{prefix}.description",
                    max_length=2_048,
                    allow_empty=True,
                ),
                content_hash=content_hash,
                content=content,
            )
        )
    summary = value.get("summary")
    if not isinstance(summary, dict):
        raise ValueError(f"static prompt summary must be an object: {path}")
    counts: dict[str, int] = {}
    for key in ("total", "known", "unknown"):
        count = summary.get(key)
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ValueError(f"static prompt summary.{key} must be non-negative: {path}")
        counts[key] = count
    if counts["total"] != len(items) or counts["known"] + counts["unknown"] != counts["total"]:
        raise ValueError(f"static prompt summary counts are inconsistent: {path}")
    items.sort(key=lambda item: (item.id, item.content_hash))
    return StaticPromptSet(
        sha256=sha256_bytes(raw),
        bytes=len(raw),
        total=counts["total"],
        known=counts["known"],
        unknown=counts["unknown"],
        source_url=source_url,
        items=tuple(items),
    )


def load_capture(
    root: CaptureRoot,
    capture_dir: Path,
    agent: str,
) -> Capture:
    capture_root = root.path
    version = safe_component(capture_dir.name, kind="version directory")
    semver_key(version)
    resolved_dir = ensure_within(capture_dir, capture_root, kind="capture directory")
    if capture_dir.is_symlink() or not resolved_dir.is_dir():
        raise ValueError(f"capture directory must be a real directory: {capture_dir}")

    source_prompt_path = capture_dir / "prompt.md"
    source_meta_path = capture_dir / "meta.json"
    if source_prompt_path.is_symlink() or source_meta_path.is_symlink():
        raise ValueError(f"capture prompt and metadata must not be symlinks: {capture_dir}")
    prompt_path = ensure_within(source_prompt_path, capture_root, kind="prompt")
    meta_path = ensure_within(source_meta_path, capture_root, kind="metadata")
    if not prompt_path.is_file():
        raise ValueError(f"prompt must be a regular file: {prompt_path}")
    if not meta_path.is_file():
        raise ValueError(f"metadata must be a regular file: {meta_path}")

    prompt = read_bounded_bytes(
        prompt_path, kind="capture prompt", maximum=MAX_PROMPT_BYTES
    )
    for line_number, line in enumerate(prompt.splitlines(), start=1):
        if len(line) > MAX_PROMPT_LINE_BYTES:
            raise ValueError(
                f"capture prompt line {line_number} exceeds {MAX_PROMPT_LINE_BYTES} bytes: "
                f"{prompt_path}"
            )
    try:
        prompt_text = prompt.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"prompt is not UTF-8: {prompt_path}") from exc
    meta = read_json_object(
        meta_path, kind="capture metadata", maximum=MAX_CAPTURE_META_BYTES
    )
    if meta.get("agent_id", agent) != agent:
        raise ValueError(f"metadata agent_id does not match directory: {meta_path}")
    if meta.get("version", version) != version:
        raise ValueError(f"metadata version does not match directory: {meta_path}")

    captured_source = meta.get("captured_at", meta.get("published_at"))
    captured_at = normalize_timestamp(captured_source, field=f"{meta_path}:captured_at")
    published_at = (
        normalize_timestamp(meta["published_at"], field=f"{meta_path}:published_at")
        if meta.get("published_at") is not None
        else None
    )
    sections, tools = parse_prompt(prompt_text)

    trace_path = capture_dir / "trace.jsonl"
    trace: Mapping[str, Any] | None = None
    if trace_path.exists() or trace_path.is_symlink():
        resolved_trace = ensure_within(trace_path, capture_root, kind="trace")
        if trace_path.is_symlink() or not resolved_trace.is_file():
            raise ValueError(f"trace must be a regular file: {trace_path}")
        trace = read_trace(resolved_trace)
    static_path = capture_dir / "static-prompts.json"
    has_static_prompts = static_path.exists() or static_path.is_symlink()
    links = (
        source_links(
            agent,
            version,
            root.ref,
            has_trace=trace is not None,
            has_static_prompts=has_static_prompts,
        )
        if root.kind == "phistory"
        else {
            "snapshot": None,
            "prompt": None,
            "meta": None,
            "trace": None,
            "staticPrompts": None,
        }
    )
    static_prompts: StaticPromptSet | None = None
    if has_static_prompts:
        resolved_static = ensure_within(static_path, capture_root, kind="static prompts")
        if static_path.is_symlink() or not resolved_static.is_file():
            raise ValueError(f"static prompts must be a regular file: {static_path}")
        static_url = links["staticPrompts"] or ""
        static_prompts = load_static_prompts(
            resolved_static,
            agent=agent,
            version=version,
            source_url=static_url,
        )
    prompt_sha256 = sha256_bytes(prompt)
    capture_sha256 = capture_digest(
        agent=agent,
        version=version,
        prompt_sha256=prompt_sha256,
        published_at=published_at,
        meta=meta,
        static_prompts=static_prompts,
    )
    provenance = capture_provenance(
        root,
        meta=meta,
        links=links,
        capture_sha256=capture_sha256,
        prompt_sha256=prompt_sha256,
        meta_sha256=sha256_bytes(canonical_json(meta)),
        trace_sha256=str(trace["sha256"]) if trace is not None else None,
        static_prompts_sha256=(
            static_prompts.sha256 if static_prompts is not None else None
        ),
    )
    return Capture(
        agent=agent,
        version=version,
        prompt=prompt,
        prompt_text=prompt_text,
        sha256=prompt_sha256,
        capture_sha256=capture_sha256,
        captured_at=captured_at,
        published_at=published_at,
        source_url=links["snapshot"],
        prompt_source_url=links["prompt"],
        meta_source_url=links["meta"],
        trace_source_url=links["trace"],
        provenance=(provenance,),
        sections=sections,
        tools=tools,
        meta=meta,
        trace=trace,
        static_prompts=static_prompts,
    )


def load_agent_captures(
    root: CaptureRoot,
    agent: str,
) -> CaptureIngestion:
    capture_root = root.path
    safe_component(agent, kind="agent")
    agent_dir = capture_root / "captures" / agent
    resolved_agent_dir = ensure_within(
        agent_dir, capture_root, kind="agent capture directory"
    )
    if agent_dir.is_symlink() or not resolved_agent_dir.is_dir():
        raise ValueError(f"agent capture directory must be a real directory: {agent_dir}")

    warnings: list[dict[str, Any]] = []
    warnings_truncated = False
    rejected_count = 0

    def add_warning(value: dict[str, Any]) -> None:
        nonlocal warnings_truncated
        if len(warnings) < MAX_CAPTURE_WARNINGS:
            warnings.append(value)
        else:
            warnings_truncated = True

    def display_name(value: str) -> str:
        compact = re.sub(r"\s+", " ", value).strip() or "(empty)"
        return compact if len(compact) <= 120 else compact[:117] + "..."

    def error_detail(error: BaseException) -> str:
        detail = str(error).replace(str(capture_root), f"<{root.label}>")
        detail = re.sub(r"\s+", " ", detail).strip()
        return detail if len(detail) <= 320 else detail[:317] + "..."

    candidates: list[tuple[tuple[Any, ...], Path]] = []
    for path in agent_dir.iterdir():
        if not (path.is_symlink() or path.is_dir()):
            continue
        try:
            safe_component(path.name, kind="version directory")
            key = semver_key(path.name)
        except (OSError, RuntimeError, ValueError) as error:
            rejected_count += 1
            add_warning(
                {
                    "code": "capture-rejected",
                    "version": display_name(path.name),
                    "message": error_detail(error),
                }
            )
            continue
        candidates.append((key, path))
    candidates.sort(key=lambda item: item[0])

    if len(candidates) > MAX_CAPTURES_PER_AGENT:
        excess = len(candidates) - MAX_CAPTURES_PER_AGENT
        rejected_count += excess
        add_warning(
            {
                "code": "capture-count-limit",
                "rejectedCount": excess,
                "message": (
                    f"kept the newest {MAX_CAPTURES_PER_AGENT} semantic versions and "
                    f"quarantined {excess} older captures"
                ),
            }
        )
        candidates = candidates[-MAX_CAPTURES_PER_AGENT:]

    captures: list[Capture] = []
    for _key, path in candidates:
        try:
            captures.append(load_capture(root, path, agent))
        except (OSError, RecursionError, RuntimeError, ValueError) as error:
            rejected_count += 1
            add_warning(
                {
                    "code": "capture-rejected",
                    "version": display_name(path.name),
                    "message": error_detail(error),
                }
            )
    if not captures:
        raise ValueError(f"no captures found for agent {agent!r}")
    # Publication time is the common ordering contract across npm, PyPI, and
    # GitHub releases. It also handles vendor revision schemes such as
    # ``2026.7.1-2`` that look like SemVer prereleases but were published later.
    captures.sort(
        key=lambda capture: (
            capture.published_at or capture.captured_at,
            semver_key(capture.version),
        )
    )
    versions = [capture.version for capture in captures]
    if len(versions) != len(set(versions)):
        raise ValueError(f"duplicate versions found for agent {agent!r}")
    return CaptureIngestion(
        captures=tuple(captures),
        rejected_count=rejected_count,
        warnings=tuple(warnings),
        warnings_truncated=warnings_truncated,
    )


def merge_agent_captures(
    capture_roots: Sequence[CaptureRoot],
    agent: str,
) -> CaptureIngestion:
    by_version: dict[str, Capture] = {}
    warnings: list[dict[str, Any]] = []
    rejected_count = 0
    warnings_truncated = False

    def add_warning(value: Mapping[str, Any]) -> None:
        nonlocal warnings_truncated
        if len(warnings) < MAX_CAPTURE_WARNINGS:
            warnings.append(dict(value))
        else:
            warnings_truncated = True

    for root in capture_roots:
        agent_dir = root.path / "captures" / agent
        if not (agent_dir.exists() or agent_dir.is_symlink()):
            continue
        ingestion = load_agent_captures(root, agent)
        rejected_count += ingestion.rejected_count
        warnings_truncated = warnings_truncated or ingestion.warnings_truncated
        for warning in ingestion.warnings:
            add_warning({**warning, "captureRoot": root.label})
        for capture in ingestion.captures:
            existing = by_version.get(capture.version)
            if existing is None:
                by_version[capture.version] = capture
                continue
            if existing.capture_sha256 != capture.capture_sha256:
                existing_label = str(existing.provenance[0]["label"])
                raise ValueError(
                    f"conflicting capture for {agent} {capture.version}: "
                    f"{existing_label} sha256 {existing.capture_sha256} differs from "
                    f"{root.label} sha256 {capture.capture_sha256}"
                )
            seen = {canonical_json(item) for item in existing.provenance}
            merged_provenance = existing.provenance + tuple(
                item
                for item in capture.provenance
                if canonical_json(item) not in seen
            )
            by_version[capture.version] = replace(
                existing, provenance=merged_provenance
            )

    if not by_version:
        raise ValueError(f"no captures found for agent {agent!r}")
    captures = sorted(
        by_version.values(),
        key=lambda capture: (
            capture.published_at or capture.captured_at,
            semver_key(capture.version),
        ),
    )
    if len(captures) > MAX_CAPTURES_PER_AGENT:
        excess = len(captures) - MAX_CAPTURES_PER_AGENT
        rejected_count += excess
        add_warning(
            {
                "code": "capture-count-limit",
                "rejectedCount": excess,
                "message": (
                    f"kept the newest {MAX_CAPTURES_PER_AGENT} merged captures and "
                    f"quarantined {excess} older captures"
                ),
            }
        )
        captures = captures[-MAX_CAPTURES_PER_AGENT:]
    return CaptureIngestion(
        captures=tuple(captures),
        rejected_count=rejected_count,
        warnings=tuple(warnings),
        warnings_truncated=warnings_truncated,
    )


def capture_root_manifest(
    root: CaptureRoot,
    captures_by_agent: Mapping[str, Sequence[Capture]],
) -> dict[str, Any]:
    accepted = sorted(
        (capture.agent, capture.version, capture.capture_sha256)
        for captures in captures_by_agent.values()
        for capture in captures
        if any(origin.get("label") == root.label for origin in capture.provenance)
    )
    return {
        **root.public(),
        "acceptedCaptures": len(accepted),
        "contentDigest": sha256_bytes(canonical_json(accepted)),
    }


def prune_evidence_files(directory: Path, *, keep_versions: set[str]) -> None:
    if not directory.exists():
        return
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"evidence output must be a regular directory: {directory}")
    for path in directory.iterdir():
        if path.is_symlink():
            raise ValueError(f"evidence output must not be a symlink: {path}")
        if path.is_file() and path.suffix == ".json" and path.stem not in keep_versions:
            path.unlink()


def prune_agent_directories(directory: Path, *, keep_agents: set[str]) -> None:
    if not directory.exists():
        return
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"agent output root must be a regular directory: {directory}")
    for path in directory.iterdir():
        if path.name in keep_agents:
            continue
        if path.is_symlink():
            raise ValueError(f"agent output must not be a symlink: {path}")
        if path.is_dir():
            shutil.rmtree(path)


def spans_by_label(spans: Iterable[Span]) -> dict[str, Span]:
    result: dict[str, Span] = {}
    for span in spans:
        if span.label in result:
            raise ValueError(f"duplicate section heading: {span.label!r}")
        result[span.label] = span
    return result


def structure_changes(previous: Capture | None, current: Capture) -> dict[str, Any]:
    previous_sections = spans_by_label(previous.sections if previous else ())
    current_sections = spans_by_label(current.sections)
    previous_tools = spans_by_label(previous.tools if previous else ())
    current_tools = spans_by_label(current.tools)

    sections_added = sorted(set(current_sections) - set(previous_sections))
    sections_removed = sorted(set(previous_sections) - set(current_sections))
    sections_modified = sorted(
        label
        for label in set(previous_sections) & set(current_sections)
        if previous_sections[label].text != current_sections[label].text
    )
    tools_added = sorted(set(current_tools) - set(previous_tools))
    tools_removed = sorted(set(previous_tools) - set(current_tools))
    tools_modified = sorted(
        label
        for label in set(previous_tools) & set(current_tools)
        if previous_tools[label].text != current_tools[label].text
    )
    changed_sections = sorted(sections_added + sections_removed + sections_modified)
    return {
        "changedSections": changed_sections,
        "sectionsAdded": sections_added,
        "sectionsRemoved": sections_removed,
        "sectionsModified": sections_modified,
        "toolsAdded": tools_added,
        "toolsRemoved": tools_removed,
        "toolsModified": tools_modified,
    }


def unified_diff(previous: Capture | None, current: Capture) -> dict[str, Any]:
    before_lines = previous.prompt_text.splitlines() if previous else []
    after_lines = current.prompt_text.splitlines()
    before_name = f"{current.agent}/{previous.version}/prompt.md" if previous else "/dev/null"
    after_name = f"{current.agent}/{current.version}/prompt.md"
    additions = 0
    deletions = 0
    total_lines = 0
    bounded: list[str] = []
    for line in difflib.unified_diff(
        before_lines,
        after_lines,
        fromfile=before_name,
        tofile=after_name,
        lineterm="",
    ):
        total_lines += 1
        if line.startswith("+") and not line.startswith("+++"):
            additions += 1
        elif line.startswith("-") and not line.startswith("---"):
            deletions += 1
        if len(bounded) < MAX_DIFF_LINES:
            bounded.append(line)
    return {
        "additions": additions,
        "deletions": deletions,
        "diff": {
            "format": "unified",
            "truncated": total_lines > MAX_DIFF_LINES,
            "maxLines": MAX_DIFF_LINES,
            "totalLines": total_lines,
            "lines": bounded,
            "text": "\n".join(bounded),
        },
    }


def bounded_excerpt(value: str, max_bytes: int = MAX_STATIC_PROMPT_EXCERPT_BYTES) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    raw = compact.encode("utf-8")
    if len(raw) <= max_bytes:
        return compact
    bounded = raw[:max_bytes]
    while bounded:
        try:
            return bounded.decode("utf-8").rstrip() + "..."
        except UnicodeDecodeError as error:
            bounded = bounded[: error.start]
    return ""


def static_prompt_facts(value: StaticPromptSet | None) -> dict[str, Any] | None:
    if value is None:
        return None
    return {
        "sha256": value.sha256,
        "bytes": value.bytes,
        "total": value.total,
        "known": value.known,
        "unknown": value.unknown,
    }


def static_prompt_change(
    item: StaticPrompt,
    *,
    change: str,
    before_hash: str | None,
    after_hash: str | None,
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "change": change,
        "beforeHash": before_hash,
        "afterHash": after_hash,
    }
    if item.description:
        value["description"] = bounded_excerpt(item.description, 512)
    excerpt = bounded_excerpt(item.content)
    if excerpt:
        value["excerpt"] = excerpt
    return value


def static_prompt_evidence(
    previous: Capture | None,
    current: Capture,
) -> dict[str, Any]:
    current_set = current.static_prompts
    previous_set = previous.static_prompts if previous else None
    if current_set is None:
        return {
            "status": "unavailable",
            "reason": "current-capture-has-no-static-prompts",
            "current": None,
            "previous": static_prompt_facts(previous_set),
            "comparisonStatus": "unavailable",
        }
    if previous_set is None:
        return {
            "status": "available",
            "current": static_prompt_facts(current_set),
            "previous": None,
            "comparisonStatus": "unavailable",
            "comparisonReason": (
                "no-previous-release"
                if previous is None
                else "previous-capture-has-no-static-prompts"
            ),
            "changes": {
                "addedCount": 0,
                "removedCount": 0,
                "modifiedCount": 0,
                "items": [],
                "truncated": False,
            },
        }

    before_exact = {(item.id, item.content_hash): item for item in previous_set.items}
    after_exact = {(item.id, item.content_hash): item for item in current_set.items}
    unchanged = set(before_exact) & set(after_exact)
    before_remaining = [
        item for key, item in before_exact.items() if key not in unchanged
    ]
    after_remaining = [item for key, item in after_exact.items() if key not in unchanged]
    before_by_id: dict[str, list[StaticPrompt]] = {}
    after_by_id: dict[str, list[StaticPrompt]] = {}
    for item in before_remaining:
        before_by_id.setdefault(item.id, []).append(item)
    for item in after_remaining:
        after_by_id.setdefault(item.id, []).append(item)
    modified: list[tuple[StaticPrompt, StaticPrompt]] = []
    added: list[StaticPrompt] = []
    removed: list[StaticPrompt] = []
    for item_id in sorted(set(before_by_id) | set(after_by_id)):
        old_items = sorted(before_by_id.get(item_id, []), key=lambda item: item.content_hash)
        new_items = sorted(after_by_id.get(item_id, []), key=lambda item: item.content_hash)
        pairs = min(len(old_items), len(new_items))
        modified.extend(zip(old_items[:pairs], new_items[:pairs]))
        removed.extend(old_items[pairs:])
        added.extend(new_items[pairs:])
    candidates: list[dict[str, Any]] = []
    for old_item, new_item in modified:
        candidates.append(
            static_prompt_change(
                new_item,
                change="modified",
                before_hash=old_item.content_hash,
                after_hash=new_item.content_hash,
            )
        )
    for item in added:
        candidates.append(
            static_prompt_change(
                item,
                change="added",
                before_hash=None,
                after_hash=item.content_hash,
            )
        )
    for item in removed:
        candidates.append(
            static_prompt_change(
                item,
                change="removed",
                before_hash=item.content_hash,
                after_hash=None,
            )
        )
    return {
        "status": "available",
        "current": static_prompt_facts(current_set),
        "previous": static_prompt_facts(previous_set),
        "comparisonStatus": "complete",
        "changes": {
            "addedCount": len(added),
            "removedCount": len(removed),
            "modifiedCount": len(modified),
            "items": candidates[:MAX_STATIC_PROMPT_CHANGES],
            "truncated": len(candidates) > MAX_STATIC_PROMPT_CHANGES,
            "maxItems": MAX_STATIC_PROMPT_CHANGES,
        },
    }


def validate_source_digest(value: Mapping[str, Any], *, path: Path) -> None:
    recorded = value.get("sourceDigest")
    if not isinstance(recorded, str) or not re.fullmatch(r"[0-9a-f]{64}", recorded):
        raise ValueError(f"invalid official sourceDigest: {path}")
    projection = dict(value)
    projection.pop("sourceDigest", None)
    actual = sha256_bytes(canonical_json(projection))
    if actual != recorded:
        raise ValueError(f"official sourceDigest mismatch: {path}")


def degraded_official_bundle(
    *,
    indices: Mapping[str, Mapping[str, Any]],
    reason: str,
    manifest_source_digest: str,
    manifest_sha256: str,
    sync_status: str | None = None,
    warnings: Sequence[Mapping[str, str]] = (),
) -> OfficialSourceBundle:
    public_warnings = [dict(warning) for warning in warnings]
    public_warnings.append(
        {
            "type": "official-sync-status-invalid",
            "reason": reason,
        }
    )
    return OfficialSourceBundle(
        indices=indices,
        status="degraded",
        sync_status=sync_status,
        warnings=tuple(public_warnings),
        manifest_source_digest=manifest_source_digest,
        manifest_sha256=manifest_sha256,
    )


def load_official_sync_status(
    *,
    root: Path,
    indices: Mapping[str, Mapping[str, Any]],
    manifest_source_digest: str,
    manifest_sha256: str,
) -> OfficialSourceBundle:
    """Load refresh health without confusing a coherent cache with a fresh one."""

    status_path = root.parent / "sync-status.json"
    if not status_path.exists():
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-missing",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
        )
    if status_path.is_symlink() or not status_path.is_file():
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-not-regular-file",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
        )
    try:
        if status_path.stat().st_size > MAX_OFFICIAL_STATUS_BYTES:
            raise ValueError("sync status exceeds size limit")
        status_value = json.loads(status_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-unreadable",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
        )
    if not isinstance(status_value, dict) or status_value.get("schemaVersion") != SCHEMA_VERSION:
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-schema-mismatch",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
        )

    recorded_status = status_value.get("status")
    if recorded_status not in {"current", "stale", "degraded"}:
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-value-invalid",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
        )
    raw_warnings = status_value.get("warnings")
    if not isinstance(raw_warnings, list):
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-warnings-invalid",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
            sync_status=recorded_status,
        )
    warnings: list[dict[str, str]] = []
    for warning in raw_warnings:
        if not isinstance(warning, dict):
            return degraded_official_bundle(
                indices=indices,
                reason="sync-status-warnings-invalid",
                manifest_source_digest=manifest_source_digest,
                manifest_sha256=manifest_sha256,
                sync_status=recorded_status,
                warnings=warnings,
            )
        public_warning = {
            key: value
            for key in ("type", "url", "reason", "cachedSha256")
            if isinstance((value := warning.get(key)), str)
        }
        if "type" not in public_warning or "reason" not in public_warning:
            return degraded_official_bundle(
                indices=indices,
                reason="sync-status-warnings-invalid",
                manifest_source_digest=manifest_source_digest,
                manifest_sha256=manifest_sha256,
                sync_status=recorded_status,
                warnings=warnings,
            )
        warnings.append(public_warning)

    if status_value.get("normalizedManifestSha256") != manifest_sha256:
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-manifest-mismatch",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
            sync_status=recorded_status,
            warnings=warnings,
        )

    expected_status = (
        "degraded"
        if any(warning["type"] != "stale-cache-used" for warning in warnings)
        else "stale"
        if warnings
        else "current"
    )
    if recorded_status != expected_status:
        return degraded_official_bundle(
            indices=indices,
            reason="sync-status-health-inconsistent",
            manifest_source_digest=manifest_source_digest,
            manifest_sha256=manifest_sha256,
            sync_status=recorded_status,
            warnings=warnings,
        )
    return OfficialSourceBundle(
        indices=indices,
        status="fresh" if recorded_status == "current" else recorded_status,
        sync_status=recorded_status,
        warnings=tuple(warnings),
        manifest_source_digest=manifest_source_digest,
        manifest_sha256=manifest_sha256,
    )


def load_official_sources(
    official_root: Path | None,
    agents: Sequence[str],
) -> OfficialSourceBundle:
    if official_root is None:
        return OfficialSourceBundle({}, "not-synced", None, (), None, None)
    if official_root.is_symlink():
        raise ValueError(f"official source root must not be a symlink: {official_root}")
    if not official_root.exists():
        return OfficialSourceBundle({}, "not-synced", None, (), None, None)
    root = official_root.expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError(f"official source root must be a regular directory: {official_root}")

    manifest_path = root / "manifest.json"
    present_indices = {
        agent for agent in OFFICIAL_REPOSITORIES if (root / f"{agent}.json").exists()
    }
    if not manifest_path.exists():
        if present_indices:
            raise ValueError("official source indices exist without a committed manifest")
        return OfficialSourceBundle({}, "not-synced", None, (), None, None)
    resolved_manifest = ensure_within(
        manifest_path, root, kind="official normalized manifest"
    )
    if manifest_path.is_symlink() or not resolved_manifest.is_file():
        raise ValueError(f"official normalized manifest must be a regular file: {manifest_path}")
    manifest_raw = resolved_manifest.read_bytes()
    if len(manifest_raw) > MAX_OFFICIAL_MANIFEST_BYTES:
        raise ValueError(f"official normalized manifest exceeds size limit: {manifest_path}")
    try:
        manifest = json.loads(manifest_raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read official normalized manifest: {manifest_path}") from exc
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"official normalized manifest identity mismatch: {manifest_path}")
    validate_source_digest(manifest, path=manifest_path)
    manifest_agents = manifest.get("agents")
    if not isinstance(manifest_agents, dict):
        raise ValueError(f"official normalized manifest agents are invalid: {manifest_path}")

    result: dict[str, dict[str, Any]] = {}
    for agent, descriptor in manifest_agents.items():
        if agent not in OFFICIAL_REPOSITORIES or not isinstance(descriptor, dict):
            raise ValueError(f"official normalized manifest agent is invalid: {agent!r}")
        expected_url = f"{agent}.json"
        if descriptor.get("url") != expected_url:
            raise ValueError(f"official normalized manifest URL mismatch: {agent}")
        recorded_count = descriptor.get("releaseCount")
        recorded_digest = descriptor.get("sourceDigest")
        if (
            not isinstance(recorded_count, int)
            or isinstance(recorded_count, bool)
            or recorded_count < 0
            or not isinstance(recorded_digest, str)
            or not re.fullmatch(r"[0-9a-f]{64}", recorded_digest)
        ):
            raise ValueError(f"official normalized manifest descriptor is invalid: {agent}")
        path = root / expected_url
        if not path.exists():
            raise ValueError(f"official source index is missing from committed generation: {path}")
        resolved = ensure_within(path, root, kind="official source index")
        if path.is_symlink() or not resolved.is_file():
            raise ValueError(f"official source index must be a regular file: {path}")
        if resolved.stat().st_size > MAX_OFFICIAL_FILE_BYTES:
            raise ValueError(f"official source index exceeds size limit: {path}")
        value = read_json_object(resolved, kind="official source index")
        if value.get("schemaVersion") != SCHEMA_VERSION or value.get("agent") != agent:
            raise ValueError(f"official source index identity mismatch: {path}")
        expected_repository = OFFICIAL_REPOSITORIES[agent]
        if value.get("repository") != expected_repository:
            raise ValueError(f"official source repository mismatch: {path}")
        validate_source_digest(value, path=path)
        if value.get("sourceDigest") != recorded_digest:
            raise ValueError(f"official manifest/index sourceDigest mismatch: {path}")
        releases = value.get("releases")
        documents = value.get("documents")
        if not isinstance(releases, dict) or not isinstance(documents, list):
            raise ValueError(f"official source releases/documents are invalid: {path}")
        for version, release in releases.items():
            if not isinstance(version, str) or not isinstance(release, dict):
                raise ValueError(f"official source release map is invalid: {path}")
            semver_key(version)
            if release.get("version") != version:
                raise ValueError(f"official source release identity mismatch: {path}")
            if len(canonical_json(release)) > MAX_OFFICIAL_RELEASE_BYTES:
                raise ValueError(f"official source release exceeds size limit: {agent} {version}")
        if len(releases) != recorded_count:
            raise ValueError(f"official manifest/index releaseCount mismatch: {path}")
        result[agent] = value

    uncommitted_indices = present_indices.difference(manifest_agents)
    if uncommitted_indices:
        raise ValueError(
            "official source indices are not listed by the committed manifest: "
            + ", ".join(sorted(uncommitted_indices))
        )
    manifest_source_digest = str(manifest["sourceDigest"])
    manifest_sha256 = sha256_bytes(manifest_raw)
    return load_official_sync_status(
        root=root,
        indices=result,
        manifest_source_digest=manifest_source_digest,
        manifest_sha256=manifest_sha256,
    )


def official_document_sources(index: Mapping[str, Any]) -> list[dict[str, Any]]:
    repository = str(index["repository"])
    sources: list[dict[str, Any]] = []
    documents = index.get("documents")
    if not isinstance(documents, list):
        return sources
    for document in documents:
        if not isinstance(document, Mapping):
            continue
        url = document.get("sourceUrl")
        digest = document.get("sha256")
        if isinstance(url, str) and isinstance(digest, str):
            sources.append(
                {
                    "sourceType": "official-changelog",
                    "repository": repository,
                    "url": url,
                    "ref": "main",
                    "contentSha256": digest,
                }
            )
    return sources


def official_evidence(
    agent: str,
    version: str,
    index: Mapping[str, Any] | None,
    *,
    freshness: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    repository = OFFICIAL_REPOSITORIES.get(agent)
    if index is None:
        integrated = repository is not None
        value: dict[str, Any] = {
            "status": "not-synced" if integrated else "not-collected",
            "version": version,
            "reason": (
                "official-source-cache-missing"
                if integrated
                else "official-source-not-integrated"
            ),
            "freshness": "not-synced" if integrated else "not-collected",
        }
        if repository is not None:
            value["repository"] = repository
        return (
            value,
            [],
        )
    if repository is None:
        raise ValueError(f"official source index is not configured for agent: {agent}")
    sources = official_document_sources(index)
    releases = index["releases"]
    assert isinstance(releases, Mapping)
    raw = releases.get(version)
    if not isinstance(raw, Mapping):
        return (
            {
                "status": "unavailable",
                "repository": repository,
                "version": version,
                "reason": "version-not-listed-by-official-source",
                "freshness": freshness,
            },
            sources,
        )

    notes = raw.get("notes")
    if not isinstance(notes, Mapping):
        raise ValueError(f"official release notes missing: {agent} {version}")
    semantic_notes = {
        key: notes[key]
        for key in ("sourceKind", "text", "truncated", "sha256", "originalBytes")
        if key in notes
    }
    release: dict[str, Any] = {
        "version": version,
        "tag": raw.get("tag"),
        "title": raw.get("title"),
        "notes": semantic_notes,
    }
    source_url = raw.get("sourceUrl")
    if isinstance(source_url, str):
        release_source: dict[str, Any] = {
            "sourceType": "official-release",
            "repository": repository,
            "url": source_url,
            "ref": str(raw.get("tag", version)),
            "contentSha256": notes.get("sha256"),
        }
        if isinstance(raw.get("publishedAt"), str):
            release_source["publishedAt"] = raw["publishedAt"]
        sources.append(release_source)

    official: dict[str, Any] = {
        "status": "available",
        "repository": repository,
        "version": version,
        "freshness": freshness,
        "release": release,
    }
    code_change = raw.get("codeChange")
    if isinstance(code_change, Mapping):
        semantic_code = {
            key: code_change[key]
            for key in (
                "status",
                "reason",
                "baseVersion",
                "headVersion",
                "baseTag",
                "headTag",
                "diffSha256",
                "digestScope",
                "truncated",
                "bytesInspected",
                "filesObserved",
                "additionsObserved",
                "deletionsObserved",
                "keyFiles",
            )
            if key in code_change
        }
        official["codeChange"] = semantic_code
        compare_url = code_change.get("sourceUrl")
        compare_digest = code_change.get("diffSha256")
        if isinstance(compare_url, str) and isinstance(compare_digest, str):
            sources.append(
                {
                    "sourceType": "official-code-compare",
                    "repository": repository,
                    "url": compare_url,
                    "ref": f"{code_change.get('baseTag')}...{code_change.get('headTag')}",
                    "contentSha256": compare_digest,
                }
            )
    return official, sources


def capture_sources(
    capture: Capture,
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for origin in capture.provenance:
        prefix = (
            "phistory"
            if origin.get("kind") == "phistory"
            else "official-source"
            if origin.get("kind") == "official-source"
            else "local-overlay"
        )

        def source(source_type: str, *, url_key: str, sha_key: str) -> dict[str, Any]:
            value: dict[str, Any] = {
                "sourceType": source_type,
                "captureRoot": origin["label"],
                "ref": origin["commit"],
                "contentSha256": origin[sha_key],
            }
            if origin.get("repository") is not None:
                value["repository"] = origin["repository"]
            if origin.get(url_key) is not None:
                value["url"] = origin[url_key]
            return value

        sources.append(
            source(
                f"{prefix}-prompt-capture",
                url_key="promptUrl",
                sha_key="promptSha256",
            )
        )
        sources.append(
            source(
                f"{prefix}-capture-metadata",
                url_key="metaUrl",
                sha_key="metaSha256",
            )
        )
        if origin.get("traceSha256") is not None:
            sources.append(
                source(
                    f"{prefix}-trace",
                    url_key="traceUrl",
                    sha_key="traceSha256",
                )
            )
        if origin.get("staticPromptsSha256") is not None:
            sources.append(
                source(
                    f"{prefix}-static-prompt",
                    url_key="staticPromptsUrl",
                    sha_key="staticPromptsSha256",
                )
            )
    return sources


def capture_facts(capture: Capture) -> dict[str, Any]:
    value: dict[str, Any] = {
        "sha256": capture.sha256,
        "bytes": len(capture.prompt),
        "lineCount": capture.line_count,
        "sectionCount": len(capture.sections),
        "toolCount": len(capture.tools),
    }
    if capture.trace is not None:
        value["trace"] = dict(capture.trace)
    return value


def evidence_packet(
    capture: Capture,
    previous: Capture | None,
    *,
    generated_at: str,
    commit: str,
    official_index: Mapping[str, Any] | None = None,
    official_freshness: str = "not-synced",
) -> dict[str, Any]:
    structure = structure_changes(previous, capture)
    line_diff = unified_diff(previous, capture)
    stats = {
        "additions": line_diff["additions"],
        "deletions": line_diff["deletions"],
        **structure,
    }
    static_prompt = static_prompt_evidence(previous, capture)
    official, official_sources = official_evidence(
        capture.agent,
        capture.version,
        official_index,
        freshness=official_freshness,
    )
    packet: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "agent": capture.agent,
        "version": capture.version,
        "previousVersion": previous.version if previous else None,
        "generatedAt": generated_at,
        "capturedAt": capture.captured_at,
        "source": {
            "snapshotUrl": capture.source_url,
            "promptUrl": capture.prompt_source_url,
            "metaUrl": capture.meta_source_url,
            "traceUrl": capture.trace_source_url,
            "upstreamCommit": commit,
            "captureSha256": capture.capture_sha256,
            "provenance": [dict(origin) for origin in capture.provenance],
        },
        "current": capture_facts(capture),
        "previous": capture_facts(previous) if previous else None,
        "stats": stats,
        "changes": {
            "sections": {
                "added": structure["sectionsAdded"],
                "removed": structure["sectionsRemoved"],
                "modified": structure["sectionsModified"],
            },
            "tools": {
                "added": structure["toolsAdded"],
                "removed": structure["toolsRemoved"],
                "modified": structure["toolsModified"],
            },
        },
        "diff": line_diff["diff"],
        "staticPrompt": static_prompt,
        "official": official,
        "sources": capture_sources(capture) + official_sources,
    }
    packet["evidenceDigest"] = evidence_digest(packet)
    return packet


def evidence_digest(packet: Mapping[str, Any]) -> str:
    """Hash only semantic diff evidence, never mutable provenance metadata."""

    def prompt_facts(value: object) -> dict[str, Any] | None:
        if value is None:
            return None
        if not isinstance(value, Mapping):
            raise ValueError("evidence current/previous facts must be objects")
        return {
            key: value[key]
            for key in ("sha256", "bytes", "lineCount", "sectionCount", "toolCount")
        }

    raw_official = packet["official"]
    if not isinstance(raw_official, Mapping):
        raise ValueError("evidence official facts must be an object")
    semantic_official = dict(raw_official)
    # Refresh health is provenance, not a semantic product change. A stale-cache
    # warning must not invalidate an otherwise matching Codex analysis.
    semantic_official.pop("freshness", None)
    projection = {
        "schemaVersion": packet["schemaVersion"],
        "agent": packet["agent"],
        "version": packet["version"],
        "previousVersion": packet["previousVersion"],
        "current": prompt_facts(packet["current"]),
        "previous": prompt_facts(packet["previous"]),
        "stats": packet["stats"],
        "changes": packet["changes"],
        "diff": packet["diff"],
        "staticPrompt": packet["staticPrompt"],
        "official": semantic_official,
    }
    return sha256_bytes(canonical_json(projection))


def has_observed_code_changes(official: object) -> bool:
    if not isinstance(official, Mapping):
        return False
    code_change = official.get("codeChange")
    if not isinstance(code_change, Mapping) or code_change.get("status") != "available":
        return False
    for key in ("filesObserved", "additionsObserved", "deletionsObserved"):
        value = code_change.get(key)
        if isinstance(value, int) and not isinstance(value, bool) and value > 0:
            return True
    key_files = code_change.get("keyFiles")
    return isinstance(key_files, list) and bool(key_files)


def fallback_analysis(
    capture: Capture,
    previous: Capture | None,
    packet: Mapping[str, Any],
) -> dict[str, Any]:
    label = agent_definition(capture.agent, (capture,))["label"]
    stats = packet["stats"]
    assert isinstance(stats, Mapping)
    changed_sections = list(stats["changedSections"])
    tools_added = list(stats["toolsAdded"])
    tools_removed = list(stats["toolsRemoved"])
    tools_modified = list(stats["toolsModified"])
    official = packet.get("official")
    static_prompt = packet.get("staticPrompt")
    has_official = isinstance(official, Mapping) and official.get("status") == "available"
    has_code_changes = has_observed_code_changes(official)
    static_changes = (
        static_prompt.get("changes") if isinstance(static_prompt, Mapping) else None
    )
    has_static_changes = isinstance(static_changes, Mapping) and any(
        int(static_changes.get(key, 0)) > 0
        for key in ("addedCount", "removedCount", "modifiedCount")
    )

    if previous is None:
        return {
            "title": f"{label} {capture.version} 基线快照",
            "summary": (
                f"建立首个可比较基线，记录 {len(capture.sections)} 个顶层区段、"
                f"{len(capture.tools)} 个 Tool Definition 和 {capture.line_count} 行 Prompt。"
            ),
            "highlights": [
                "后续版本将以此快照为相邻差异基准。",
                f"原始 Prompt 内容以 SHA-256 {capture.sha256[:12]}… 固定存档。",
            ],
            "categories": ["baseline"],
            "importance": "none",
            "implications": [],
            "analysisStatus": "pending",
        }

    additions = int(stats["additions"])
    deletions = int(stats["deletions"])
    if additions == 0 and deletions == 0 and not has_official and not has_static_changes:
        return {
            "title": f"{label} {capture.version} 未发现 Prompt 变化",
            "summary": f"与 {previous.version} 的 Runtime Prompt 逐行一致，可作为发布存在但 Prompt 未变的证据。",
            "highlights": ["顶层区段和 Tool Definition 均未检测到变化。"],
            "categories": ["no-change"],
            "importance": "none",
            "implications": [],
            "analysisStatus": "pending",
        }

    if additions == 0 and deletions == 0:
        highlights = ["Runtime Prompt 及 Tool Schema 未检测到变化。"]
        categories: list[str] = []
        if has_official:
            assert isinstance(official, Mapping)
            release = official.get("release")
            release_title = release.get("title") if isinstance(release, Mapping) else None
            highlights.append(
                "已收录官方发布说明"
                + (f"：{release_title}" if isinstance(release_title, str) else "。")
            )
            categories.append("release")
            if has_code_changes:
                categories.append("code")
        if has_static_changes:
            assert isinstance(static_changes, Mapping)
            highlights.append(
                "Static Prompt 集合变化："
                f"新增 {static_changes['addedCount']}、"
                f"删除 {static_changes['removedCount']}、"
                f"修改 {static_changes['modifiedCount']}。"
            )
            categories.append("static-prompt")
        official_notes = ""
        if has_official:
            assert isinstance(official, Mapping)
            official_release = official.get("release")
            official_notes_value = (
                official_release.get("notes")
                if isinstance(official_release, Mapping)
                else None
            )
            if isinstance(official_notes_value, Mapping) and isinstance(
                official_notes_value.get("text"), str
            ):
                official_notes = official_notes_value["text"].strip()
        normalized_official = re.sub(
            r"^[#*\-\s]+|[#*\-\s.]+$", "", official_notes.lower()
        )
        generic_official = normalized_official in {
            "bug fixes",
            "bug fixes and reliability improvements",
            "various bug fixes and improvements",
        }
        meaningful_official = bool(official_notes) and not generic_official
        importance = (
            "medium"
            if has_static_changes or meaningful_official or has_code_changes
            else "none"
        )
        return {
            "title": f"{label} {capture.version} 版本情报更新",
            "summary": (
                f"与 {previous.version} 的 Runtime Prompt 一致，但官方发布证据或 Static Prompt 集合"
                "记录了独立变化；不再将“prompt 未变”误判成“版本无变化”。"
            ),
            "highlights": highlights,
            "categories": categories,
            "importance": importance,
            "implications": [],
            "analysisStatus": "pending",
        }

    categories = ["prompt"]
    if tools_added or tools_removed or tools_modified:
        categories.append("tools")
    if has_official:
        categories.append("release")
        assert isinstance(official, Mapping)
        if has_code_changes:
            categories.append("code")
    if has_static_changes:
        categories.append("static-prompt")
    highlights: list[str] = []
    if changed_sections:
        highlights.append("变更区段：" + "、".join(changed_sections[:8]))
    tool_fragments: list[str] = []
    if tools_added:
        tool_fragments.append("新增 " + "、".join(tools_added[:8]))
    if tools_removed:
        tool_fragments.append("移除 " + "、".join(tools_removed[:8]))
    if tools_modified:
        tool_fragments.append("修改 " + "、".join(tools_modified[:8]))
    if tool_fragments:
        highlights.append("工具变化：" + "；".join(tool_fragments))
    if not highlights:
        highlights.append("检测到文本行变化，尚待 Codex 归纳具体行为影响。")
    return {
        "title": f"{label} {capture.version} Prompt 更新",
        "summary": (
            f"相较 {previous.version}，Prompt 新增 {additions} 行、删除 {deletions} 行；"
            f"涉及 {len(changed_sections)} 个顶层区段。当前为确定性摘要，等待 Codex 深度分析。"
        ),
        "highlights": highlights,
        "categories": categories,
        "importance": (
            "medium"
            if tools_added or tools_removed or tools_modified or has_official or has_static_changes
            else "low"
        ),
        "implications": [],
        "analysisStatus": "pending",
    }


def string_list(value: object, *, field: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise ValueError(f"{field} must be an array of non-empty strings")
    return [item.strip() for item in value]


def load_ai_analysis(
    path: Path,
    *,
    agent: str,
    version: str,
    evidence_digest: str,
) -> dict[str, Any] | None:
    if path.is_symlink():
        raise ValueError(f"analysis must not be a symlink: {path}")
    if not path.exists():
        return None
    if not path.is_file():
        raise ValueError(f"analysis must be a regular JSON file: {path}")
    value = read_json_object(path, kind="AI changelog analysis")
    if value.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"analysis schemaVersion must equal {SCHEMA_VERSION}: {path}")
    # A newly captured release can invalidate a previously generated analysis.
    # Ignore stale identity/evidence so the deterministic build can finish and the
    # analyzer gets a chance to regenerate it in the same refresh workflow.
    if value.get("agent") != agent or value.get("version") != version:
        return None
    if value.get("evidenceDigest") != evidence_digest:
        return None
    title = value.get("title")
    summary = value.get("summary")
    if not isinstance(title, str) or not title.strip():
        raise ValueError(f"analysis title must be a non-empty string: {path}")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError(f"analysis summary must be a non-empty string: {path}")
    status = value.get("analysisStatus", "complete")
    if status not in {"complete", "reviewed"}:
        raise ValueError(f"analysisStatus must be 'complete' or 'reviewed': {path}")
    # Analyses written before the intelligence-feed schema gained these fields
    # are stale, not fatal. Ignore them so the deterministic fallback can ship
    # while the analyzer regenerates the richer record.
    if "importance" not in value or "implications" not in value:
        return None
    merged: dict[str, Any] = {
        "title": title.strip(),
        "summary": summary.strip(),
        "highlights": string_list(value.get("highlights"), field=f"{path}:highlights"),
        "categories": string_list(value.get("categories"), field=f"{path}:categories"),
        "importance": value.get("importance"),
        "implications": string_list(
            value.get("implications"), field=f"{path}:implications"
        ),
        "analysisStatus": status,
    }
    if merged["importance"] not in {"high", "medium", "low", "none"}:
        raise ValueError(f"analysis importance is invalid: {path}")
    for optional in ("analyzedAt", "model"):
        if optional in value:
            if not isinstance(value[optional], str) or not value[optional].strip():
                raise ValueError(f"analysis {optional} must be a non-empty string: {path}")
            merged[optional] = value[optional].strip()
    return merged


def history_version(capture: Capture) -> dict[str, Any]:
    value: dict[str, Any] = {
        "version": capture.version,
        "capturedAt": capture.captured_at,
        "promptUrl": f"/data/objects/{capture.sha256}.md",
        "sha256": capture.sha256,
        "captureSha256": capture.capture_sha256,
        "provenance": [dict(origin) for origin in capture.provenance],
        "bytes": len(capture.prompt),
        "lineCount": capture.line_count,
        "sections": [section.public() for section in capture.sections],
        "tools": [tool.public() for tool in capture.tools],
    }
    for key, source_url in (
        ("sourceUrl", capture.source_url),
        ("promptSourceUrl", capture.prompt_source_url),
        ("metaSourceUrl", capture.meta_source_url),
        ("traceSourceUrl", capture.trace_source_url),
    ):
        if source_url is not None:
            value[key] = source_url
    if capture.published_at is not None:
        value["publishedAt"] = capture.published_at
    for key in ("package", "binary_version", "tarball_url"):
        if isinstance(capture.meta.get(key), str):
            public_key = {
                "binary_version": "binaryVersion",
                "tarball_url": "tarballUrl",
            }.get(key, key)
            value[public_key] = capture.meta[key]
    if capture.trace is not None:
        value["trace"] = dict(capture.trace)
    if capture.static_prompts is not None:
        value["staticPrompt"] = static_prompt_facts(capture.static_prompts) or {}
        if capture.static_prompts.source_url:
            value["staticPrompt"]["sourceUrl"] = capture.static_prompts.source_url
    return value


def runtime_layer(
    capture: Capture,
    *,
    metadata_field: str,
    available: Mapping[str, Any],
) -> dict[str, Any]:
    if capture.meta.get(metadata_field) == "unavailable":
        return {
            "status": "unavailable",
            "reason": "official-source-history-has-no-runtime-capture",
        }
    return dict(available)


def compact_feed_release(capture: Capture) -> dict[str, Any]:
    value: dict[str, Any] = {
        "version": capture.version,
        "capturedAt": capture.captured_at,
    }
    if capture.published_at is not None:
        value["publishedAt"] = capture.published_at
    return value


def compact_feed_entry(entry: Mapping[str, Any]) -> dict[str, Any]:
    value = {
        key: entry[key]
        for key in (
            "version",
            "previousVersion",
            "title",
            "summary",
            "importance",
            "implications",
            "analysisStatus",
            "stats",
            "capturedAt",
        )
        if key in entry
    }
    raw_layers = entry.get("layers")
    if not isinstance(raw_layers, Mapping):
        return value

    layers: dict[str, Any] = {}
    for key in ("prompt", "tools"):
        layer = raw_layers.get(key)
        if isinstance(layer, Mapping):
            layers[key] = dict(layer)

    static_prompt = raw_layers.get("staticPrompt")
    if isinstance(static_prompt, Mapping):
        compact_static = {
            key: static_prompt[key]
            for key in ("status", "comparisonStatus")
            if key in static_prompt
        }
        changes = static_prompt.get("changes")
        if isinstance(changes, Mapping):
            compact_static["changes"] = {
                key: changes.get(key, 0)
                for key in ("addedCount", "removedCount", "modifiedCount")
            }
        layers["staticPrompt"] = compact_static

    official = raw_layers.get("official")
    if isinstance(official, Mapping):
        compact_official: dict[str, Any] = {
            key: official[key]
            for key in ("status", "freshness")
            if key in official
        }
        release = official.get("release")
        if isinstance(release, Mapping):
            notes = release.get("notes")
            compact_official["release"] = {
                "title": release.get("title"),
                "hasNotes": isinstance(notes, Mapping)
                and bool(str(notes.get("text", "")).strip()),
            }
        code_change = official.get("codeChange")
        if isinstance(code_change, Mapping):
            compact_official["codeChange"] = {
                key: code_change[key]
                for key in (
                    "status",
                    "filesObserved",
                    "additionsObserved",
                    "deletionsObserved",
                    "keyFiles",
                )
                if key in code_change
            }
        layers["official"] = compact_official
    value["layers"] = layers
    return value


def latest_generated_at(captures_by_agent: Mapping[str, Sequence[Capture]]) -> str:
    timestamps = [
        capture.captured_at
        for captures in captures_by_agent.values()
        for capture in captures
    ]
    if not timestamps:
        return EPOCH
    parsed = [datetime.fromisoformat(value.replace("Z", "+00:00")) for value in timestamps]
    return max(parsed).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_capture_root(
    path: Path,
    *,
    label: str,
    required: bool,
) -> Path | None:
    expanded = path.expanduser()
    if expanded.is_symlink():
        raise ValueError(f"{label} root must not be a symlink: {expanded}")
    if not expanded.exists():
        if required:
            raise ValueError(f"{label} root does not exist: {expanded}")
        return None
    root = expanded.resolve(strict=True)
    if not root.is_dir():
        raise ValueError(f"{label} root is not a directory: {root}")
    captures = root / "captures"
    if not captures.is_dir() or captures.is_symlink():
        raise ValueError(f"{label} root has no regular captures directory: {root}")
    return root


def validate_roots(
    phistory_root: Path,
    capture_overlay_root: Path | None,
    public_root: Path,
    analysis_root: Path,
) -> tuple[tuple[CaptureRoot, ...], Path, Path]:
    source = validate_capture_root(phistory_root, label="Phistory", required=True)
    assert source is not None
    capture_roots = [
        CaptureRoot(
            path=source,
            kind="phistory",
            label="phistory",
            commit=upstream_commit(source),
            repository=UPSTREAM_REPO,
            url=UPSTREAM_URL,
        )
    ]
    if capture_overlay_root is not None:
        overlay = validate_capture_root(
            capture_overlay_root,
            label="local overlay",
            required=False,
        )
        if overlay is not None:
            capture_roots.append(
                CaptureRoot(
                    path=overlay,
                    kind="local-overlay",
                    label="local-overlay",
                    commit=upstream_commit(overlay),
                )
            )
    public_root.expanduser().mkdir(parents=True, exist_ok=True)
    analysis_root.expanduser().mkdir(parents=True, exist_ok=True)
    public = public_root.expanduser().resolve(strict=True)
    analysis = analysis_root.expanduser().resolve(strict=True)
    if not public.is_dir() or not analysis.is_dir():
        raise ValueError("public and analysis roots must be directories")
    all_roots = [root.path for root in capture_roots]
    if len(set((*all_roots, public, analysis))) != len(all_roots) + 2:
        raise ValueError("capture, public, and analysis roots must be distinct")
    return tuple(capture_roots), public, analysis


def build(
    *,
    phistory_root: Path,
    capture_overlay_root: Path | None = None,
    public_root: Path,
    analysis_root: Path,
    agents: Sequence[str] | None = None,
    official_root: Path | None = None,
) -> dict[str, Any]:
    capture_roots, public, analysis = validate_roots(
        phistory_root,
        capture_overlay_root,
        public_root,
        analysis_root,
    )
    agents = tuple(agents) if agents is not None else discover_agents(capture_roots)
    if not agents:
        raise ValueError("at least one agent is required")
    if len(agents) != len(set(agents)):
        raise ValueError("agents must not contain duplicates")
    invalid = [agent for agent in agents if not AGENT_ID_RE.fullmatch(agent)]
    if invalid:
        raise ValueError(f"invalid agent ids: {', '.join(invalid)}")

    commit = capture_roots[0].commit
    ingestion_by_agent = {
        agent: merge_agent_captures(capture_roots, agent) for agent in agents
    }
    captures_by_agent = {
        agent: ingestion_by_agent[agent].captures for agent in agents
    }
    official_sources = load_official_sources(official_root, agents)
    official_by_agent = official_sources.indices
    generated_at = latest_generated_at(captures_by_agent)

    manifest_agents: list[dict[str, Any]] = []
    feed_datasets: list[dict[str, Any]] = []
    for agent in agents:
        ingestion = ingestion_by_agent[agent]
        captures = captures_by_agent[agent]
        agent_generated_at = latest_generated_at({agent: captures})
        entries: list[dict[str, Any]] = []
        official_available = 0
        official_code_available = 0
        static_prompt_available = 0
        static_prompt_comparable = 0
        analyzed_releases = 0
        previous: Capture | None = None
        for capture in captures:
            object_path = output_path(public, "data", "objects", f"{capture.sha256}.md")
            if object_path.is_symlink():
                raise ValueError(f"content-addressed object must not be a symlink: {object_path}")
            if object_path.exists() and object_path.read_bytes() != capture.prompt:
                raise ValueError(f"content-address collision at {object_path}")
            atomic_write(object_path, capture.prompt)

            packet = evidence_packet(
                capture,
                previous,
                generated_at=capture.captured_at,
                commit=commit,
                official_index=official_by_agent.get(agent),
                official_freshness=(
                    official_sources.status
                    if agent in official_by_agent
                    else (
                        "not-synced"
                        if agent in OFFICIAL_REPOSITORIES
                        else "not-collected"
                    )
                ),
            )
            evidence_path = output_path(
                analysis, "evidence", agent, f"{capture.version}.json"
            )
            atomic_write(evidence_path, pretty_json(packet))

            analysis_path = output_path(
                analysis, "changelogs", agent, f"{capture.version}.json"
            )
            authored = load_ai_analysis(
                analysis_path,
                agent=agent,
                version=capture.version,
                evidence_digest=str(packet["evidenceDigest"]),
            )
            prose = normalize_changelog_record(
                authored or fallback_analysis(capture, previous, packet)
            )
            if authored is not None:
                analyzed_releases += 1
            packet_official = packet["official"]
            packet_static = packet["staticPrompt"]
            assert isinstance(packet_official, Mapping)
            assert isinstance(packet_static, Mapping)
            if packet_official.get("status") == "available":
                official_available += 1
                code_change = packet_official.get("codeChange")
                if isinstance(code_change, Mapping) and code_change.get("status") == "available":
                    official_code_available += 1
            if packet_static.get("status") == "available":
                static_prompt_available += 1
            if packet_static.get("comparisonStatus") == "complete":
                static_prompt_comparable += 1
            packet_stats = packet["stats"]
            assert isinstance(packet_stats, Mapping)
            entry: dict[str, Any] = {
                "version": capture.version,
                "previousVersion": previous.version if previous else None,
                **prose,
                "stats": {
                    "additions": packet_stats["additions"],
                    "deletions": packet_stats["deletions"],
                    "changedSections": packet_stats["changedSections"],
                    "toolsAdded": packet_stats["toolsAdded"],
                    "toolsRemoved": packet_stats["toolsRemoved"],
                    "toolsModified": packet_stats["toolsModified"],
                },
                "evidenceDigest": packet["evidenceDigest"],
                "capturedAt": capture.captured_at,
                "sourceUrl": capture.source_url,
                "promptUrl": f"/data/objects/{capture.sha256}.md",
                "sources": packet["sources"],
                "layers": {
                    "prompt": runtime_layer(
                        capture,
                        metadata_field="runtime_prompt_status",
                        available={
                            "status": "available",
                            "additions": packet_stats["additions"],
                            "deletions": packet_stats["deletions"],
                            "changedSections": packet_stats["changedSections"],
                        },
                    ),
                    "tools": runtime_layer(
                        capture,
                        metadata_field="tool_schema_status",
                        available={
                            "status": "available",
                            "added": packet_stats["toolsAdded"],
                            "removed": packet_stats["toolsRemoved"],
                            "modified": packet_stats["toolsModified"],
                        },
                    ),
                    "staticPrompt": packet["staticPrompt"],
                    "official": packet["official"],
                },
            }
            entries.append(entry)
            previous = capture

        prune_evidence_files(
            output_path(analysis, "evidence", agent),
            keep_versions={capture.version for capture in captures},
        )

        history = {
            "schemaVersion": SCHEMA_VERSION,
            "agent": agent,
            "generatedAt": agent_generated_at,
            "versions": [history_version(capture) for capture in captures],
        }
        changelog = {
            "schemaVersion": SCHEMA_VERSION,
            "agent": agent,
            "generatedAt": agent_generated_at,
            "entries": entries,
        }
        history_path = output_path(public, "data", "agents", agent, "history.json")
        changelog_path = output_path(public, "data", "agents", agent, "changelog.json")
        atomic_write(history_path, pretty_json(history))
        atomic_write(changelog_path, pretty_json(changelog))

        definition = agent_definition(agent, captures)
        official_index = official_by_agent.get(agent)
        official_repository = OFFICIAL_REPOSITORIES.get(agent)
        agent_source_url = (
            captures[-1].source_url
            or definition.get("projectUrl")
            or UPSTREAM_URL
        )
        source_coverage = {
            "promptCaptures": len(captures),
            "officialReleases": official_available,
            "officialUnavailable": (
                len(captures) - official_available if official_repository else 0
            ),
            "officialNotIntegrated": 0 if official_repository else len(captures),
            "officialCodeComparisons": official_code_available,
            "staticPromptSnapshots": static_prompt_available,
            "staticPromptComparisons": static_prompt_comparable,
        }
        manifest_agent: dict[str, Any] = {
                "id": agent,
                "label": definition["label"],
                "description": definition["description"],
                "sourceUrl": agent_source_url,
                "officialSourceStatus": (
                    official_sources.status
                    if agent in official_by_agent
                    else "not-synced" if official_repository else "not-collected"
                ),
                "officialSourceDigest": (
                    official_index.get("sourceDigest")
                    if isinstance(official_index, Mapping)
                    else None
                ),
                "latestVersion": captures[-1].version,
                "releaseCount": len(captures),
                "ingestion": ingestion.public(),
                "sourceCoverage": source_coverage,
                "analysisCoverage": {
                    "complete": analyzed_releases,
                    "pending": len(captures) - analyzed_releases,
                },
                "historyUrl": f"/data/agents/{agent}/history.json",
                "changelogUrl": f"/data/agents/{agent}/changelog.json",
        }
        if official_repository:
            manifest_agent["officialSourceUrl"] = f"https://github.com/{official_repository}"
        if definition.get("projectUrl"):
            manifest_agent["projectUrl"] = definition["projectUrl"]
        manifest_agents.append(manifest_agent)
        feed_datasets.append(
            {
                "agent": agent,
                "history": {
                    "versions": [compact_feed_release(capture) for capture in captures]
                },
                "changelog": {
                    "entries": [compact_feed_entry(entry) for entry in entries]
                },
            }
        )

    keep_agents = set(agents)
    prune_agent_directories(analysis / "evidence", keep_agents=keep_agents)
    prune_agent_directories(public / "data" / "agents", keep_agents=keep_agents)

    analysis_complete = sum(
        int(agent["analysisCoverage"]["complete"]) for agent in manifest_agents
    )
    release_total = sum(int(agent["releaseCount"]) for agent in manifest_agents)
    feed = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "datasets": feed_datasets,
    }
    atomic_write(output_path(public, "data", "feed.json"), pretty_json(feed))

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "defaultAgent": agents[0],
        "feedUrl": "/data/feed.json",
        "analysisCounts": {
            "complete": analysis_complete,
            "stale": release_total - analysis_complete,
        },
        "upstream": {
            "repo": UPSTREAM_REPO,
            "commit": commit,
            "url": UPSTREAM_URL,
        },
        "captureRoots": [
            capture_root_manifest(root, captures_by_agent) for root in capture_roots
        ],
        "ingestion": {
            "acceptedCaptures": sum(
                len(ingestion.captures) for ingestion in ingestion_by_agent.values()
            ),
            "rejectedCaptures": sum(
                ingestion.rejected_count for ingestion in ingestion_by_agent.values()
            ),
            "warningCount": sum(
                len(ingestion.warnings) for ingestion in ingestion_by_agent.values()
            ),
            "warningsTruncated": any(
                ingestion.warnings_truncated for ingestion in ingestion_by_agent.values()
            ),
            "limits": {
                "maxCapturesPerAgent": MAX_CAPTURES_PER_AGENT,
                "maxPromptBytes": MAX_PROMPT_BYTES,
                "maxPromptLineBytes": MAX_PROMPT_LINE_BYTES,
                "maxMetadataBytes": MAX_CAPTURE_META_BYTES,
                "maxTraceBytes": MAX_TRACE_BYTES,
                "maxTraceLineBytes": MAX_TRACE_LINE_BYTES,
            },
        },
        "officialSources": official_sources.public(),
        "agents": manifest_agents,
    }
    # The manifest is the publication marker and is written only after every file it
    # references has been atomically installed.
    manifest_path = output_path(public, "data", "manifest.json")
    atomic_write(manifest_path, pretty_json(manifest))
    return manifest


def parse_agents(value: str) -> tuple[str, ...] | None:
    if value.strip().lower() == "all":
        return None
    agents = tuple(part.strip() for part in value.split(",") if part.strip())
    if not agents:
        raise argparse.ArgumentTypeError("agents must contain at least one id")
    invalid = [agent for agent in agents if not AGENT_ID_RE.fullmatch(agent)]
    if invalid:
        raise argparse.ArgumentTypeError(f"invalid agent ids: {', '.join(invalid)}")
    if len(agents) != len(set(agents)):
        raise argparse.ArgumentTypeError("agents must not contain duplicates")
    return agents


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--phistory-root", type=Path, required=True)
    value.add_argument(
        "--capture-overlay-root",
        type=Path,
        default=DEFAULT_CAPTURE_OVERLAY_ROOT,
        help=(
            "optional local Phistory-format capture overlay; a missing directory is ignored "
            f"(default: {DEFAULT_CAPTURE_OVERLAY_ROOT})"
        ),
    )
    value.add_argument("--public-root", type=Path, required=True)
    value.add_argument("--analysis-root", type=Path, required=True)
    value.add_argument(
        "--official-root",
        type=Path,
        default=DEFAULT_OFFICIAL_ROOT,
        help="normalized official-source cache; missing cache is represented as not-synced evidence",
    )
    value.add_argument(
        "--agents",
        type=parse_agents,
        default=None,
        help="comma-separated agent ids, or 'all' to discover every capture directory (default: all)",
    )
    return value


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    try:
        manifest = build(
            phistory_root=arguments.phistory_root,
            capture_overlay_root=arguments.capture_overlay_root,
            public_root=arguments.public_root,
            analysis_root=arguments.analysis_root,
            agents=arguments.agents,
            official_root=arguments.official_root,
        )
    except ValueError as exc:
        parser().error(str(exc))
    print(
        f"Built {sum(agent['releaseCount'] for agent in manifest['agents'])} releases "
        f"for {len(manifest['agents'])} agents."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
