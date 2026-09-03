from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import URLError
import re


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


class RouteCache:
    def __init__(self, routes: dict[str, bytes]) -> None:
        self.routes = routes
        self.warnings: list[dict[str, str]] = []

    def fetch(self, url: str, **_: object):
        body = next(
            (value for marker, value in self.routes.items() if marker in url), None
        )
        if body is None:
            raise AssertionError(f"unexpected fixture URL: {url}")
        return official.CachedResponse(
            url=url,
            accept="fixture",
            body=body,
            sha256=official.sha256_bytes(body),
            etag='"fixture"',
            last_modified=None,
            truncated=False,
        )


class OfficialSourceTests(unittest.TestCase):
    def test_default_release_page_budget_has_growth_headroom(self) -> None:
        args = official.parse_args([])

        self.assertEqual(args.max_release_pages, 50)

    def test_focused_sync_parses_only_requested_official_agents(self) -> None:
        focused = official.parse_args(["--agents", "codex"])
        complete = official.parse_args(["--agents", "all"])

        self.assertEqual(focused.agents, ("codex",))
        self.assertIn("codex", complete.agents)
        self.assertIn("claude-code", complete.agents)
        self.assertIn("deepseek-harness", complete.agents)
        self.assertIn("exo", complete.agents)
        self.assertGreater(len(complete.agents), len(focused.agents))

    def test_exo_tracks_bounded_unstable_commit_snapshots(self) -> None:
        commits = [
            {"sha": "b" * 40, "committedAt": "2026-09-03T01:02:03Z"},
            {"sha": "a" * 40, "committedAt": "2026-09-02T01:02:03Z"},
        ]
        releases = official.github_snapshot_releases(
            FakeCache(json.dumps(commits).encode()),
            repository="exoharness/exo",
            product_name="Exo",
            base_version="0.1.0",
            count=2,
            timeout=1,
            allow_stale_on_error=False,
        )

        self.assertEqual(
            [release["version"] for release in releases],
            [
                "0.1.0-dev.20260902010203.aaaaaaaa",
                "0.1.0-dev.20260903010203.bbbbbbbb",
            ],
        )
        self.assertEqual(releases[-1]["sourceRef"], "b" * 40)
        self.assertEqual(releases[-1]["notes"]["sourceKind"], "github-commit-snapshot")
        self.assertEqual(official.GITHUB_SNAPSHOT_SOURCES["exo"]["snapshotCount"], 2)

    def test_version_order_keeps_numeric_revision_source_specific(
        self,
    ) -> None:
        versions = ["0.1.0", "0.1.0-rc.10", "0.1.0-rc.2", "0.1.0-0"]

        self.assertEqual(
            sorted(versions, key=official.version_key),
            ["0.1.0-0", "0.1.0-rc.2", "0.1.0-rc.10", "0.1.0"],
        )
        self.assertLess(
            official.version_key("2026.7.1-2"),
            official.version_key("2026.7.1"),
        )
        self.assertLess(
            official.source_version_key("2026.7.1", agent="openclaw"),
            official.source_version_key("2026.7.1-2", agent="openclaw"),
        )

    def test_deepseek_harness_combines_npm_publications_with_github_tags(
        self,
    ) -> None:
        self.assertIn("deepseek-harness", official.NPM_RELEASE_SOURCES)
        self.assertNotIn("deepseek-harness", official.GITHUB_RELEASE_SOURCES)
        tag_pattern = re.compile(
            str(official.NPM_RELEASE_SOURCES["deepseek-harness"]["tagPattern"])
        )
        self.assertEqual(
            tag_pattern.fullmatch("dsh-v0.1.0-rc.8").group(1),
            "0.1.0-rc.8",
        )
        self.assertEqual(
            official.OFFICIAL_REPOSITORIES["deepseek-harness"],
            "deepseek-ai/deepseek-harness",
        )
        self.assertTrue(
            official.NPM_RELEASE_SOURCES["deepseek-harness"]["githubReleaseNotes"]
        )
        self.assertTrue(
            official.NPM_RELEASE_SOURCES["deepseek-harness"]["includePrereleases"]
        )

    def test_grok_combines_npm_publications_with_source_snapshots(self) -> None:
        config = official.NPM_RELEASE_SOURCES["grok"]

        self.assertEqual(config["repository"], "xai-org/grok-build")
        self.assertEqual(config["package"], "@xai-official/grok")
        self.assertFalse(config["requireRepositoryMetadata"])
        self.assertTrue(config["sourceSnapshotAfterPublish"])
        self.assertEqual(
            official.NO_PUBLIC_SOURCE_AGENTS,
            {
                "minimax-code": {
                    "reason": "official-repository-is-issue-tracker-only",
                    "sourceUrl": "https://github.com/MiniMax-AI/minimax-code",
                }
            },
        )

    def test_aligns_untagged_source_sync_to_latest_prior_publication(self) -> None:
        releases = [
            {"version": "1.0.4", "publishedAt": "2026-08-13T20:20:06Z"},
            {"version": "1.0.5", "publishedAt": "2026-08-16T00:25:35Z"},
            {"version": "1.0.6", "publishedAt": "2026-08-18T19:25:15Z"},
        ]
        commits = [
            {"sha": "a" * 40, "committedAt": "2026-08-13T18:26:29Z"},
            {"sha": "b" * 40, "committedAt": "2026-08-15T15:14:48Z"},
            {"sha": "c" * 40, "committedAt": "2026-08-16T19:00:58Z"},
            {"sha": "d" * 40, "committedAt": "2026-08-19T19:55:30Z"},
        ]
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(
            official, "github_commits", return_value=commits
        ), mock.patch.object(official, "attach_code_compares"):
            retained = official.enrich_repository_snapshots(
                agent="grok",
                repository="xai-org/grok-build",
                releases=releases,
                normalized_root=Path(directory),
                captured_versions=("1.0.4", "1.0.5", "1.0.6"),
                cache=mock.Mock(),
                max_commit_pages=1,
                newest_comparisons=1,
                timeout=1,
                allow_stale_on_error=False,
            )

        by_version = {release["version"]: release for release in retained}
        self.assertEqual(by_version["1.0.4"]["commitSha"], "b" * 40)
        self.assertEqual(by_version["1.0.5"]["commitSha"], "c" * 40)
        self.assertEqual(by_version["1.0.6"]["commitSha"], "d" * 40)
        self.assertEqual(
            by_version["1.0.5"]["repositorySnapshot"]["alignment"],
            "first-source-sync-after-publication",
        )

    def test_normalizes_npm_publications_without_claiming_source_code_diffs(
        self,
    ) -> None:
        body = json.dumps(
            {
                "name": "@deepseek-ai/dsh",
                "versions": {
                    version: {
                        "name": "@deepseek-ai/dsh",
                        "version": version,
                        "repository": {
                            "type": "git",
                            "url": "git+https://github.com/deepseek-ai/deepseek-harness.git",
                            "directory": "apps/cli",
                        },
                        "dist": {
                            "tarball": (
                                "https://registry.npmjs.org/@deepseek-ai/dsh/-/"
                                f"dsh-{version}.tgz"
                            ),
                            "integrity": "sha512-" + "A" * 86 + "==",
                            "shasum": "a" * 40,
                        },
                    }
                    for version in ("0.1.0-rc.10", "0.1.0-rc.2")
                },
                "time": {
                    "0.1.0-rc.2": "2026-08-13T09:48:26.232Z",
                    "0.1.0-rc.10": "2026-08-13T12:35:03.812Z",
                },
            }
        ).encode()

        releases = official.npm_releases(
            FakeCache(body),
            package_name="@deepseek-ai/dsh",
            repository="deepseek-ai/deepseek-harness",
            package_directory="apps/cli",
            product_name="DeepSeek Harness",
            timeout=1,
            allow_stale_on_error=False,
        )

        self.assertEqual(
            [release["version"] for release in releases],
            ["0.1.0-rc.2", "0.1.0-rc.10"],
        )
        latest = releases[-1]
        self.assertEqual(latest["sourceRef"], "@deepseek-ai/dsh@0.1.0-rc.10")
        self.assertEqual(latest["packageDirectory"], "apps/cli")
        self.assertEqual(latest["artifact"]["scope"], "published-package-only")
        self.assertEqual(latest["artifact"]["integrity"], "sha512-" + "A" * 86 + "==")
        self.assertEqual(latest["notes"]["sourceKind"], "npm-publication")
        self.assertEqual(latest["notes"]["text"], "")
        self.assertEqual(latest["notes"]["originalBytes"], 0)
        self.assertNotIn("codeChange", latest)
        self.assertNotIn("commitSha", latest)

    def test_github_release_parser_can_include_prerelease_notes(self) -> None:
        body = json.dumps(
            [
                {
                    "tag_name": "dsh-v0.1.0-rc.8",
                    "name": "v0.1.0-rc.8",
                    "body": "### New Features\n\n- Add native image requests.",
                    "html_url": "https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8",
                    "published_at": "2026-08-19T15:37:00Z",
                    "draft": False,
                    "prerelease": True,
                }
            ]
        ).encode()

        releases = official.github_releases(
            FakeCache(body),
            repository="deepseek-ai/deepseek-harness",
            tag_pattern=re.compile(
                official.NPM_RELEASE_SOURCES["deepseek-harness"]["tagPattern"]
            ),
            product_name="DeepSeek Harness",
            max_pages=1,
            timeout=1,
            allow_stale_on_error=False,
            include_prereleases=True,
        )

        self.assertEqual([release["version"] for release in releases], ["0.1.0-rc.8"])
        self.assertIn("native image requests", releases[0]["notes"]["text"])
        self.assertEqual(releases[0]["notes"]["sourceKind"], "github-release")

    def test_official_release_notes_overlay_preserves_npm_artifact(self) -> None:
        package_release = {
            "version": "0.1.0-rc.8",
            "sourceUrl": "https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.1.0-rc.8",
            "artifact": {"scope": "published-package-only"},
            "notes": {"sourceKind": "npm-publication", "text": ""},
        }
        github_release = {
            "version": "0.1.0-rc.8",
            "tag": "dsh-v0.1.0-rc.8",
            "sourceUrl": "https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8",
            "notes": {"sourceKind": "github-release", "text": "Release notes"},
        }

        merged = official.merge_release_histories(
            [package_release], [github_release]
        )[0]

        self.assertEqual(merged["artifact"], {"scope": "published-package-only"})
        self.assertEqual(merged["notes"]["sourceKind"], "github-release")
        self.assertEqual(merged["tag"], "dsh-v0.1.0-rc.8")

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

    def test_collects_complete_stable_opencode_release_history(self) -> None:
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
            tag_pattern=re.compile(
                str(official.GITHUB_RELEASE_SOURCES["opencode"]["tagPattern"])
            ),
            product_name="opencode",
            max_pages=1,
            timeout=1,
            allow_stale_on_error=False,
        )

        self.assertEqual(
            [item["version"] for item in releases], ["1.17.0", "1.18.15"]
        )
        self.assertIn("Chronological", releases[-1]["notes"]["text"])

    def test_fails_instead_of_silently_truncating_release_pagination(self) -> None:
        body = json.dumps(
            [
                {
                    "tag_name": f"v1.0.{index}",
                    "published_at": "2026-08-01T00:00:00Z",
                    "draft": False,
                    "prerelease": False,
                }
                for index in range(100)
            ]
        ).encode()

        with self.assertRaisesRegex(
            official.OfficialSyncError, "exceeds --max-release-pages=1"
        ):
            official.github_releases(
                FakeCache(body),
                repository="example/releases",
                tag_pattern=re.compile(r"^v(\d+\.\d+\.\d+)$"),
                product_name="Example",
                max_pages=1,
                timeout=1,
                allow_stale_on_error=False,
            )

    def test_enriches_captured_versions_with_tags_commits_and_code_diff(self) -> None:
        tags = json.dumps(
            [
                {"name": "v1.0.1", "commit": {"sha": "b" * 40}},
                {"name": "v1.0.0", "commit": {"sha": "a" * 40}},
            ]
        ).encode()
        diff = (FIXTURES / "official_codex_compare.diff").read_bytes()
        cache = RouteCache({"/tags?": tags, "/compare/": diff})

        with tempfile.TemporaryDirectory() as directory:
            releases = official.enrich_repository_history(
                agent="example",
                repository="example/agent",
                product_name="Example Agent",
                tag_pattern=re.compile(r"^v(\d+\.\d+\.\d+)$"),
                releases=[],
                normalized_root=Path(directory),
                captured_versions=("1.0.0", "1.0.1"),
                cache=cache,
                max_tag_pages=1,
                newest_comparisons=1,
                timeout=1,
                allow_stale_on_error=False,
            )

        self.assertEqual([release["version"] for release in releases], ["1.0.0", "1.0.1"])
        self.assertEqual(releases[0]["notes"]["sourceKind"], "github-tag")
        self.assertEqual(releases[0]["commitSha"], "a" * 40)
        change = releases[1]["codeChange"]
        self.assertEqual(change["status"], "available")
        self.assertIs(change["analysisEligible"], True)
        self.assertEqual(change["baseCommitSha"], "a" * 40)
        self.assertEqual(change["headCommitSha"], "b" * 40)
        self.assertGreater(change["filesObserved"], 0)

    def test_structured_compare_prioritizes_mechanism_source_and_samples(self) -> None:
        body = json.dumps(
            {
                "total_files": 3,
                "files": [
                    {
                        "filename": "docs/release.md",
                        "status": "modified",
                        "additions": 500,
                        "deletions": 20,
                        "patch": "@@ -1 +1 @@\n-old\n+new",
                    },
                    {
                        "filename": "apps/web/tests/session-retry.e2e.ts",
                        "status": "modified",
                        "additions": 200,
                        "deletions": 10,
                        "patch": "@@ -1 +1 @@\n-old test\n+new test",
                    },
                    {
                        "filename": "packages/runtime/src/session/reconnect.ts",
                        "status": "modified",
                        "additions": 12,
                        "deletions": 4,
                        "patch": "@@ -1 +1 @@\n-return failed\n+return retrySession(error)",
                    },
                ],
            }
        ).encode()

        change = official.parse_compare_json(
            body,
            base_version="1.0.0",
            head_version="1.0.1",
            base_tag="v1.0.0",
            head_tag="v1.0.1",
            compare_url="https://example.test/compare",
        )

        self.assertEqual(change["schemaVersion"], 3)
        self.assertEqual(
            change["keyFiles"][0]["path"],
            "packages/runtime/src/session/reconnect.ts",
        )
        self.assertEqual(
            change["changeSamples"][0]["sample"],
            ["-return failed", "+return retrySession(error)"],
        )
        self.assertFalse(change["truncated"])

    def test_comparison_pairs_do_not_jump_over_an_unmatched_capture(self) -> None:
        releases = [
            {"version": version, "commitSha": "a" * 40}
            for version in ("1.0.0", "1.0.2", "1.0.3")
        ]

        pairs = official.comparison_pairs(
            releases,
            ("1.0.0", "1.0.1", "1.0.2"),
            newest_count=0,
        )

        self.assertEqual(pairs, [])

    def test_discovers_capture_versions_in_capture_time_order(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for version, published in (
                ("1.0.1", "2026-01-02T00:00:00Z"),
                ("1.0.0", "2026-01-01T00:00:00Z"),
            ):
                capture = root / "captures/example" / version
                capture.mkdir(parents=True)
                (capture / "meta.json").write_text(
                    json.dumps({"version": version, "published_at": published}),
                    encoding="utf-8",
                )

            observed = official.discover_capture_sequences((root,))

        self.assertEqual(observed, {"example": ["1.0.0", "1.0.1"]})

    def test_registered_release_tag_patterns_match_capture_versions(self) -> None:
        samples = {
            "antigravity": ("1.1.11", "1.1.11"),
            "cline": ("cli-v3.0.52", "3.0.52"),
            "crush": ("v0.91.0", "0.91.0"),
            "goose": ("v1.45.0", "v1.45.0"),
            "hermes": ("v2026.7.7.2", "v2026.7.7.2"),
            "kimi-code": ("@moonshot-ai/kimi-code@0.34.0", "0.34.0"),
            "maka": ("v0.1.11", "0.1.11"),
            "mimo": ("v0.1.10", "0.1.10"),
            "omp": ("v17.2.12", "17.2.12"),
            "openclaw": ("v2026.7.1-2", "2026.7.1-2"),
            "opencode": ("v1.18.15", "1.18.15"),
            "pi": ("v0.84.1", "0.84.1"),
            "prime-agent": ("v0.8.1", "0.8.1"),
            "qwen-code": ("v0.21.8", "0.21.8"),
            "reasonix": ("v1.22.0", "1.22.0"),
        }

        self.assertEqual(set(samples), set(official.GITHUB_RELEASE_SOURCES))
        for agent, (tag, version) in samples.items():
            pattern = re.compile(
                str(official.GITHUB_RELEASE_SOURCES[agent]["tagPattern"])
            )
            match = pattern.fullmatch(tag)
            self.assertIsNotNone(match, agent)
            self.assertEqual(match.group(1), version)
            official.version_key(version)

    def test_retired_kimi_cli_points_to_maintained_successor(self) -> None:
        self.assertNotIn("kimi", official.OFFICIAL_REPOSITORIES)
        self.assertEqual(official.RETIRED_AGENTS["kimi"]["replacement"], "kimi-code")
        self.assertEqual(
            official.RETIRED_AGENTS["kimi"]["repository"], "MoonshotAI/kimi-cli"
        )

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
        self.assertEqual(value["keyFiles"][0]["path"], "codex-rs/core/src/tools/mod.rs")

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

    def test_focused_sync_retains_the_committed_unselected_generation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            normalized = root / "normalized"
            normalized.mkdir()
            codex = official.normalized_agent(
                agent="codex",
                repository="openai/codex",
                releases=[
                    {
                        "version": "1.0.0",
                        "tag": "rust-v1.0.0",
                        "commitSha": "a" * 40,
                        "codeChange": {
                            "status": "available",
                            "analysisEligible": True,
                        },
                    }
                ],
                documents=[],
            )
            codex_bytes = official.pretty_json(codex)
            codex_path = normalized / "agents" / f"{codex['sourceDigest']}.json"
            codex_path.parent.mkdir()
            codex_path.write_bytes(codex_bytes)
            (normalized / "manifest.json").write_bytes(
                official.pretty_json(official.normalized_manifest({"codex": codex}))
            )
            npm_release = {
                "version": "0.1.0-rc.6",
                "sourceRef": "@deepseek-ai/dsh@0.1.0-rc.6",
                "sourceUrl": "https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.1.0-rc.6",
                "publishedAt": "2026-08-13T12:35:03.812Z",
                "packageName": "@deepseek-ai/dsh",
                "packageDirectory": "apps/cli",
                "artifact": {
                    "scope": "published-package-only",
                    "url": "https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.6.tgz",
                    "integrity": "sha512-" + "A" * 86 + "==",
                    "shasum": "b" * 40,
                },
            }

            with (
                mock.patch.object(
                    official, "npm_releases", return_value=[npm_release]
                ),
                mock.patch.object(
                    official, "github_releases", return_value=[]
                ),
                mock.patch.object(
                    official,
                    "enrich_repository_history",
                    return_value=[npm_release],
                ) as enrich,
            ):
                manifest = official.sync(
                    cache_root=root,
                    timeout=1,
                    agents=("deepseek-harness",),
                )

            enrich.assert_called_once()
            self.assertEqual(
                enrich.call_args.kwargs["tag_pattern"].pattern,
                official.NPM_RELEASE_SOURCES["deepseek-harness"]["tagPattern"],
            )

            self.assertEqual(
                set(manifest["agents"]), {"codex", "deepseek-harness"}
            )
            self.assertEqual(codex_path.read_bytes(), codex_bytes)
            retained = json.loads(codex_path.read_text())
            self.assertEqual(
                retained["releases"]["1.0.0"]["codeChange"]["status"],
                "available",
            )
            status = json.loads((root / "sync-status.json").read_text())
            manifest_bytes = (normalized / "manifest.json").read_bytes()
            reloaded = official.load_normalized_generation(normalized)
            self.assertEqual(status["status"], "current")
            self.assertEqual(set(reloaded), {"codex", "deepseek-harness"})
            self.assertEqual(
                status["normalizedManifestSha256"],
                official.sha256_bytes(manifest_bytes),
            )
            self.assertEqual(status["warnings"], [])
            self.assertEqual(status["selectedAgents"], ["deepseek-harness"])
            self.assertEqual(status["retainedAgents"], ["codex"])

    def test_focused_sync_rejects_an_uncommitted_normalized_index(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            normalized = root / "normalized"
            normalized.mkdir()
            (normalized / "codex.json").write_text("{}\n", encoding="utf-8")

            with self.assertRaisesRegex(
                official.OfficialSyncError, "without a committed manifest"
            ):
                official.sync(
                    cache_root=root,
                    timeout=1,
                    agents=("deepseek-harness",),
                )

    def test_focused_sync_migrates_a_committed_legacy_flat_generation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            normalized = root / "normalized"
            normalized.mkdir()
            codex = official.normalized_agent(
                agent="codex",
                repository="openai/codex",
                releases=[
                    {
                        "version": "1.0.0",
                        "codeChange": {
                            "status": "available",
                            "analysisEligible": True,
                        },
                    }
                ],
                documents=[],
            )
            legacy_descriptor = official.normalized_descriptor(codex)
            legacy_descriptor["url"] = "codex.json"
            legacy_manifest: dict[str, object] = {
                "schemaVersion": 1,
                "agents": {"codex": legacy_descriptor},
            }
            legacy_manifest["sourceDigest"] = official.sha256_bytes(
                official.canonical_json(legacy_manifest)
            )
            (normalized / "codex.json").write_bytes(official.pretty_json(codex))
            (normalized / "manifest.json").write_bytes(
                official.pretty_json(legacy_manifest)
            )
            npm_release = {
                "version": "0.1.0-rc.6",
                "sourceRef": "@deepseek-ai/dsh@0.1.0-rc.6",
                "sourceUrl": "https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.1.0-rc.6",
                "publishedAt": "2026-08-13T12:35:03.812Z",
                "packageName": "@deepseek-ai/dsh",
                "packageDirectory": "apps/cli",
                "artifact": {
                    "scope": "published-package-only",
                    "url": "https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.6.tgz",
                    "integrity": "sha512-" + "A" * 86 + "==",
                    "shasum": "b" * 40,
                },
            }

            with (
                mock.patch.object(
                    official, "npm_releases", return_value=[npm_release]
                ),
                mock.patch.object(
                    official, "github_releases", return_value=[]
                ),
                mock.patch.object(
                    official,
                    "enrich_repository_history",
                    return_value=[npm_release],
                ),
            ):
                manifest = official.sync(
                    cache_root=root,
                    timeout=1,
                    agents=("deepseek-harness",),
                )

            self.assertFalse((normalized / "codex.json").exists())
            self.assertRegex(manifest["agents"]["codex"]["url"], r"^agents/[0-9a-f]{64}\.json$")
            reloaded = official.load_normalized_generation(normalized)
            self.assertEqual(
                reloaded["codex"]["releases"]["1.0.0"]["codeChange"]["status"],
                "available",
            )

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
            with (
                mock.patch.object(official, "urlopen", side_effect=URLError("offline")),
                mock.patch.object(official.time, "sleep"),
            ):
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
            self.assertEqual(len(cache.warnings), 1)

    def test_http_cache_retries_transient_fetch_before_using_stale_body(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = official.HttpCache(Path(directory))
            body = b'{"fixture":true}'
            responses = [URLError("transient"), FakeResponse(body)]
            with (
                mock.patch.object(official, "urlopen", side_effect=responses) as fetch,
                mock.patch.object(official.time, "sleep") as sleep,
            ):
                response = cache.fetch(
                    "https://example.test/releases",
                    accept="application/json",
                    max_bytes=1024,
                    timeout=1,
                    allow_stale_on_error=True,
                )

            self.assertEqual(response.body, body)
            self.assertEqual(fetch.call_count, 2)
            sleep.assert_called_once_with(official.HTTP_RETRY_DELAYS[0])
            self.assertEqual(cache.warnings, [])

    def test_http_cache_retry_budget_survives_a_prolonged_route_flap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = official.HttpCache(Path(directory))
            body = b'{"fixture":true}'
            failures = [
                URLError("transient")
                for _ in range(official.HTTP_FETCH_ATTEMPTS - 1)
            ]
            with (
                mock.patch.object(
                    official,
                    "urlopen",
                    side_effect=(*failures, FakeResponse(body)),
                ) as fetch,
                mock.patch.object(official.time, "sleep") as sleep,
            ):
                response = cache.fetch(
                    "https://example.test/releases",
                    accept="application/json",
                    max_bytes=1024,
                    timeout=1,
                    allow_stale_on_error=True,
                )

            self.assertEqual(response.body, body)
            self.assertEqual(fetch.call_count, official.HTTP_FETCH_ATTEMPTS)
            self.assertEqual(
                [call.args[0] for call in sleep.call_args_list],
                list(official.HTTP_RETRY_DELAYS),
            )
            self.assertEqual(cache.warnings, [])

    def test_http_cache_uses_verified_stale_body_after_normalization_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = official.HttpCache(Path(directory))
            body = b'{"fixture":true}'
            transform = lambda value: json.dumps(json.loads(value)).encode()
            with mock.patch.object(official, "urlopen", return_value=FakeResponse(body)):
                first = cache.fetch(
                    "https://example.test/releases",
                    accept="application/json",
                    max_bytes=1024,
                    timeout=1,
                    allow_stale_on_error=False,
                    cache_variant="json-v1",
                    transform=transform,
                )
            with mock.patch.object(
                official,
                "urlopen",
                return_value=FakeResponse(b'{"fixture":'),
            ):
                second = cache.fetch(
                    "https://example.test/releases",
                    accept="application/json",
                    max_bytes=1024,
                    timeout=1,
                    allow_stale_on_error=True,
                    cache_variant="json-v1",
                    transform=transform,
                )

            self.assertEqual(second.body, first.body)
            self.assertEqual(cache.warnings[0]["type"], "stale-cache-used")
            self.assertEqual(
                cache.warnings[0]["reason"], "normalize-failure:JSONDecodeError"
            )

    def test_http_cache_without_existing_body_fails_offline(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = official.HttpCache(Path(directory))
            with (
                mock.patch.object(official, "urlopen", side_effect=URLError("offline")),
                mock.patch.object(official.time, "sleep"),
            ):
                with self.assertRaisesRegex(official.OfficialSyncError, "cannot fetch"):
                    cache.fetch(
                        "https://example.test/releases",
                        accept="application/json",
                        max_bytes=1024,
                        timeout=1,
                        allow_stale_on_error=True,
                    )

    def test_http_cache_never_sends_github_token_to_npm(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = official.HttpCache(Path(directory), token="github-secret")
            with mock.patch.object(
                official, "urlopen", return_value=FakeResponse(b"{}")
            ) as fetch:
                cache.fetch(
                    "https://registry.npmjs.org/%40deepseek-ai%2Fdsh",
                    accept="application/json",
                    max_bytes=1024,
                    timeout=1,
                    allow_stale_on_error=False,
                )

        request = fetch.call_args.args[0]
        self.assertIsNone(request.get_header("Authorization"))
        self.assertIsNone(request.get_header("X-Github-Api-Version"))

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

    def test_github_token_falls_back_to_authenticated_cli(self) -> None:
        completed = mock.Mock(stdout="secret-token\n")
        with mock.patch.dict(official.os.environ, {}, clear=True), mock.patch.object(
            official.shutil, "which", return_value="/usr/local/bin/gh"
        ), mock.patch.object(official.subprocess, "run", return_value=completed) as run:
            self.assertEqual(official.resolve_github_token(), "secret-token")

        run.assert_called_once_with(
            ["/usr/local/bin/gh", "auth", "token"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )

    def test_failed_optional_compare_marks_sync_degraded(self) -> None:
        releases = [
            {
                "version": "0.9.0",
                "tag": "rust-v0.9.0",
                "commitSha": "a" * 40,
            },
            {
                "version": "0.10.0",
                "tag": "rust-v0.10.0",
                "commitSha": "b" * 40,
            },
        ]
        cache = FailingCompareCache()

        official.attach_code_compares(
            releases,
            cache,
            repository="openai/codex",
            pairs=(("0.9.0", "0.10.0"),),
            timeout=1,
            allow_stale_on_error=False,
        )

        self.assertEqual(releases[-1]["codeChange"]["status"], "unavailable")
        self.assertEqual(cache.warnings[-1]["type"], "source-unavailable")
        self.assertEqual(official.sync_health_status(cache.warnings), "degraded")


if __name__ == "__main__":
    unittest.main()
