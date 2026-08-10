from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock
from urllib.error import URLError


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "sync_official_sources.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
SPEC = importlib.util.spec_from_file_location("sync_official_sources", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
official = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = official
SPEC.loader.exec_module(official)


class FakeCache:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.urls: list[str] = []

    def fetch(self, url: str, **_: object):
        self.urls.append(url)
        return official.CachedResponse(
            url=url,
            accept="application/vnd.github+json",
            body=self.body,
            sha256=official.sha256_bytes(self.body),
            etag='"fixture"',
            last_modified=None,
            truncated=False,
        )


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.headers = {"ETag": '"fixture-etag"'}

    def __enter__(self):
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self, amount: int) -> bytes:
        return self.body[:amount]


class FailingCompareCache:
    def __init__(self) -> None:
        self.warnings: list[dict[str, str]] = []

    def fetch(self, *_: object, **__: object):
        raise official.OfficialSyncError("fixture compare failure")


class OfficialSourceTests(unittest.TestCase):
    def test_parses_claude_changelog_by_exact_semver_heading(self) -> None:
        text = (FIXTURES / "official_claude_changelog.md").read_text(encoding="utf-8")
        parsed = official.parse_markdown_changelog(text)

        self.assertEqual(list(parsed), ["1.10.0", "1.2.0"])
        self.assertIn("bounded background agents", parsed["1.10.0"])
        self.assertNotIn("Established", parsed["1.10.0"])

    def test_normalizes_only_stable_codex_releases_without_network(self) -> None:
        body = (FIXTURES / "official_codex_releases.json").read_bytes()
        cache = FakeCache(body)

        releases = official.codex_releases(
            cache,
            max_pages=1,
            timeout=1,
            allow_stale_on_error=False,
        )

        self.assertEqual([item["version"] for item in releases], ["0.9.0", "0.10.0"])
        self.assertEqual(releases[-1]["tag"], "rust-v0.10.0")
        self.assertEqual(releases[-1]["notes"]["sourceKind"], "github-release")
        self.assertNotIn("0.11.0-alpha.1", json.dumps(releases))

    def test_collects_recent_stable_opencode_releases(self) -> None:
        body = json.dumps(
            [
                {
                    "tag_name": "v1.18.15",
                    "name": "opencode 1.18.15",
                    "body": "Chronological message ordering is fixed.",
                    "html_url": "https://github.com/anomalyco/opencode/releases/tag/v1.18.15",
                    "published_at": "2026-08-07T06:49:55Z",
                    "draft": False,
                    "prerelease": False,
                },
                {
                    "tag_name": "pr-38252-videos",
                    "published_at": "2026-08-07T06:49:55Z",
                    "draft": False,
                    "prerelease": False,
                },
                {
                    "tag_name": "v1.17.0",
                    "published_at": "2026-05-01T00:00:00Z",
                    "draft": False,
                    "prerelease": False,
                },
            ]
        ).encode()
        releases = official.github_releases(
            FakeCache(body),
            repository="anomalyco/opencode",
            tag_pattern=official.STANDARD_TAG_RE,
            product_name="opencode",
            max_pages=1,
            timeout=1,
            allow_stale_on_error=False,
            published_since=datetime(2026, 6, 1, tzinfo=timezone.utc),
        )

        self.assertEqual([item["version"] for item in releases], ["1.18.15"])
        self.assertIn("Chronological", releases[0]["notes"]["text"])

    def test_extracts_bounded_key_files_from_official_compare_diff(self) -> None:
        body = (FIXTURES / "official_codex_compare.diff").read_bytes()
        value = official.parse_compare_diff(
            body,
            base_version="0.9.0",
            head_version="0.10.0",
            base_tag="rust-v0.9.0",
            head_tag="rust-v0.10.0",
            compare_url="https://github.com/openai/codex/compare/old...new",
            truncated=False,
        )

        self.assertEqual(value["filesObserved"], 2)
        self.assertEqual(value["additionsObserved"], 2)
        self.assertEqual(value["deletionsObserved"], 1)
        self.assertEqual(value["digestScope"], "complete")
        self.assertEqual(value["keyFiles"][0]["path"], "codex-rs/protocol/src/models.rs")

    def test_normalized_output_is_deterministic_and_self_verifying(self) -> None:
        releases = [
            {
                "version": "0.10.0",
                "tag": "rust-v0.10.0",
                "title": "Codex 0.10.0",
                "sourceUrl": "https://github.com/openai/codex/releases/tag/rust-v0.10.0",
                "notes": official.notes_value(
                    "A small release.",
                    source_kind="github-release",
                    source_url="https://github.com/openai/codex/releases/tag/rust-v0.10.0",
                ),
            }
        ]
        first = official.normalized_agent(
            agent="codex",
            repository="openai/codex",
            releases=releases,
            documents=[],
        )
        second = official.normalized_agent(
            agent="codex",
            repository="openai/codex",
            releases=releases,
            documents=[],
        )

        self.assertEqual(official.pretty_json(first), official.pretty_json(second))
        projection = dict(first)
        digest = projection.pop("sourceDigest")
        self.assertEqual(digest, official.sha256_bytes(official.canonical_json(projection)))
        self.assertNotIn("fetchedAt", first)

    def test_http_cache_uses_verified_stale_body_after_refresh_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = official.HttpCache(Path(directory))
            body = b'{"fixture":true}'
            with mock.patch.object(official, "urlopen", return_value=FakeResponse(body)):
                first = cache.fetch(
                    "https://example.test/releases",
                    accept="application/json",
                    max_bytes=1024,
                    timeout=1,
                    allow_stale_on_error=False,
                )
            with mock.patch.object(official, "urlopen", side_effect=URLError("offline")):
                second = cache.fetch(
                    "https://example.test/releases",
                    accept="application/json",
                    max_bytes=1024,
                    timeout=1,
                    allow_stale_on_error=True,
                )

            self.assertEqual(first.body, body)
            self.assertEqual(second.body, body)
            self.assertEqual(first.sha256, second.sha256)
            self.assertTrue((Path(directory) / "index.json").is_file())

    def test_http_cache_without_existing_body_fails_offline(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = official.HttpCache(Path(directory))
            with mock.patch.object(official, "urlopen", side_effect=URLError("offline")):
                with self.assertRaisesRegex(official.OfficialSyncError, "cannot fetch"):
                    cache.fetch(
                        "https://example.test/releases",
                        accept="application/json",
                        max_bytes=1024,
                        timeout=1,
                        allow_stale_on_error=True,
                    )

    def test_sync_health_distinguishes_current_stale_and_degraded(self) -> None:
        self.assertEqual(official.sync_health_status([]), "current")
        self.assertEqual(
            official.sync_health_status(
                [{"type": "stale-cache-used", "reason": "offline"}]
            ),
            "stale",
        )
        self.assertEqual(
            official.sync_health_status(
                [{"type": "source-unavailable", "reason": "compare-failed"}]
            ),
            "degraded",
        )

    def test_failed_optional_compare_marks_sync_degraded(self) -> None:
        releases = [
            {"version": "0.9.0", "tag": "rust-v0.9.0"},
            {"version": "0.10.0", "tag": "rust-v0.10.0"},
        ]
        cache = FailingCompareCache()

        official.attach_codex_compares(
            releases,
            cache,
            max_comparisons=1,
            timeout=1,
            allow_stale_on_error=False,
        )

        self.assertEqual(releases[-1]["codeChange"]["status"], "unavailable")
        self.assertEqual(cache.warnings[-1]["type"], "source-unavailable")
        self.assertEqual(official.sync_health_status(cache.warnings), "degraded")


if __name__ == "__main__":
    unittest.main()
