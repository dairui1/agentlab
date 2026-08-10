from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_from_phistory.py"
SPEC = importlib.util.spec_from_file_location("build_from_phistory", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = builder
SPEC.loader.exec_module(builder)


CLAUDE_OLD = """# System Prompt
Be precise.

# Tools
## Read
Read a file.
"""

CLAUDE_NEW = """# System Prompt
Be precise and verify the result.

# User Message
Reply briefly.

# Tools
## Read
Read a file safely.

## Write
Write a file.
"""

CODEX_SHARED = CLAUDE_OLD


class BuildFromPhistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.phistory = self.root / "phistory"
        self.public = self.root / "public"
        self.analysis = self.root / "analysis"
        self._capture("claude-code", "1.10.0", CLAUDE_NEW, "2026-02-10T12:00:00Z", trace=True)
        self._capture("claude-code", "1.2.0", CLAUDE_OLD, "2026-01-02T12:00:00Z")
        self._capture("codex", "0.10.0", CODEX_SHARED, "2026-02-01T12:00:00Z")
        self._capture("codex", "0.9.0", CODEX_SHARED, "2026-01-01T12:00:00Z")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _capture(
        self,
        agent: str,
        version: str,
        prompt: str,
        captured_at: str,
        *,
        trace: bool = False,
        root: Path | None = None,
        published_at: str | None = None,
        trace_text: str | None = None,
        extra_meta: dict[str, object] | None = None,
    ) -> None:
        directory = (root or self.phistory) / "captures" / agent / version
        directory.mkdir(parents=True)
        (directory / "prompt.md").write_text(prompt, encoding="utf-8")
        (directory / "meta.json").write_text(
            json.dumps(
                {
                    "agent_id": agent,
                    "agent": "fixture",
                    "package": f"fixture/{agent}",
                    "version": version,
                    "published_at": published_at or captured_at,
                    "captured_at": captured_at,
                    **(extra_meta or {}),
                }
            ),
            encoding="utf-8",
        )
        if trace or trace_text is not None:
            (directory / "trace.jsonl").write_text(
                trace_text or '{"event":"request"}\n{"event":"response"}\n',
                encoding="utf-8",
            )

    def _build(
        self,
        *,
        official_root: Path | None = None,
        capture_overlay_root: Path | None = None,
    ) -> dict[str, object]:
        return builder.build(
            phistory_root=self.phistory,
            capture_overlay_root=capture_overlay_root,
            public_root=self.public,
            analysis_root=self.analysis,
            official_root=official_root,
        )

    def _static_prompts(
        self, agent: str, version: str, items: list[tuple[str, str, str]]
    ) -> None:
        directory = self.phistory / "captures" / agent / version
        prompts = [
            {
                "id": item_id,
                "name": name,
                "category": "system-prompt",
                "description": f"Fixture {name}",
                "content_hash": hashlib.sha256(content.encode()).hexdigest(),
                "content": content,
            }
            for item_id, name, content in items
        ]
        (directory / "static-prompts.json").write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "agent_id": agent,
                    "version": version,
                    "source": "fixture",
                    "summary": {"total": len(prompts), "known": len(prompts), "unknown": 0},
                    "prompts": prompts,
                }
            ),
            encoding="utf-8",
        )

    def _official_index(self) -> Path:
        root = self.root / "official/normalized"
        root.mkdir(parents=True)
        notes = {
            "sourceKind": "official-changelog",
            "sourceUrl": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
            "text": "Added bounded background agents.",
            "truncated": False,
            "sha256": hashlib.sha256(b"Added bounded background agents.").hexdigest(),
            "originalBytes": len(b"Added bounded background agents."),
        }
        value: dict[str, object] = {
            "schemaVersion": 1,
            "agent": "claude-code",
            "repository": "anthropics/claude-code",
            "documents": [
                {
                    "sourceUrl": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
                    "sha256": "a" * 64,
                    "bytes": 123,
                    "truncated": False,
                }
            ],
            "releases": {
                "1.10.0": {
                    "version": "1.10.0",
                    "tag": "v1.10.0",
                    "title": "Claude Code 1.10.0",
                    "sourceUrl": "https://github.com/anthropics/claude-code/releases/tag/v1.10.0",
                    "notes": notes,
                }
            },
        }
        value["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(value))
        (root / "claude-code.json").write_text(
            json.dumps(value, ensure_ascii=False), encoding="utf-8"
        )
        self._refresh_official_generation(root)
        return root

    def _refresh_official_generation(self, root: Path) -> None:
        agents: dict[str, object] = {}
        for agent in ("claude-code", "codex"):
            path = root / f"{agent}.json"
            if not path.exists():
                continue
            value = self._json(path)
            agents[agent] = {
                "url": path.name,
                "releaseCount": len(value["releases"]),
                "sourceDigest": value["sourceDigest"],
            }
        manifest: dict[str, object] = {
            "schemaVersion": 1,
            "agents": agents,
        }
        manifest["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(manifest))
        manifest_bytes = builder.pretty_json(manifest)
        (root / "manifest.json").write_bytes(manifest_bytes)
        status = {
            "schemaVersion": 1,
            "status": "current",
            "warnings": [],
            "normalizedManifestSha256": builder.sha256_bytes(manifest_bytes),
        }
        (root.parent / "sync-status.json").write_bytes(builder.pretty_json(status))

    def _set_official_status(
        self,
        root: Path,
        *,
        status: str,
        warnings: list[dict[str, str]],
        manifest_sha256: str | None = None,
    ) -> None:
        manifest_bytes = (root / "manifest.json").read_bytes()
        value = {
            "schemaVersion": 1,
            "status": status,
            "warnings": warnings,
            "normalizedManifestSha256": (
                manifest_sha256
                if manifest_sha256 is not None
                else builder.sha256_bytes(manifest_bytes)
            ),
        }
        (root.parent / "sync-status.json").write_bytes(builder.pretty_json(value))

    def _json(self, path: Path) -> dict[str, object]:
        return json.loads(path.read_text(encoding="utf-8"))

    def test_every_github_backed_agent_has_official_release_intelligence(self) -> None:
        github_agents = {
            agent
            for agent, definition in builder.AGENT_DEFINITIONS.items()
            if definition.get("projectUrl", "").startswith("https://github.com/")
        }

        self.assertLessEqual(github_agents, set(builder.OFFICIAL_REPOSITORIES))
        self.assertIn("pi", builder.OFFICIAL_REPOSITORIES)

    def test_builds_two_agents_in_semver_order_with_sections_and_tools(self) -> None:
        manifest = self._build()

        self.assertEqual(manifest["defaultAgent"], "claude-code")
        self.assertEqual([item["id"] for item in manifest["agents"]], ["claude-code", "codex"])
        self.assertEqual([item["releaseCount"] for item in manifest["agents"]], [2, 2])
        self.assertEqual(manifest["feedUrl"], "/data/feed.json")
        self.assertEqual(manifest["analysisCounts"], {"complete": 0, "stale": 4})
        feed = self._json(self.public / "data/feed.json")
        self.assertEqual([item["agent"] for item in feed["datasets"]], ["claude-code", "codex"])
        self.assertEqual(len(feed["datasets"][0]["history"]["versions"]), 2)
        claude = self._json(self.public / "data/agents/claude-code/history.json")
        self.assertEqual([item["version"] for item in claude["versions"]], ["1.2.0", "1.10.0"])
        latest = claude["versions"][-1]
        self.assertEqual(
            [section["label"] for section in latest["sections"]],
            ["System Prompt", "User Message", "Tools"],
        )
        self.assertEqual([tool["label"] for tool in latest["tools"]], ["Read", "Write"])
        self.assertEqual(latest["sections"][0]["startLine"], 1)
        self.assertLess(latest["sections"][0]["endLine"], latest["sections"][1]["startLine"])
        self.assertEqual(latest["trace"]["records"], 2)

        changelog = self._json(self.public / "data/agents/claude-code/changelog.json")
        changed = changelog["entries"][-1]
        self.assertEqual(changed["previousVersion"], "1.2.0")
        self.assertEqual(changed["analysisStatus"], "pending")
        self.assertIn("User Message", changed["stats"]["changedSections"])
        self.assertEqual(changed["stats"]["toolsAdded"], ["Write"])
        self.assertEqual(changed["stats"]["toolsModified"], ["Read"])

    def test_discovers_all_agents_and_accepts_vendor_version_schemes(self) -> None:
        self._capture("kimi", "1.6", CLAUDE_OLD, "2026-02-02T12:00:00Z")
        self._capture("kimi", "1.35.0", CLAUDE_NEW, "2026-04-02T12:00:00Z")
        self._capture("hermes", "v2026.7.7", CLAUDE_OLD, "2026-07-07T12:00:00Z")
        self._capture("hermes", "v2026.7.7.2", CLAUDE_NEW, "2026-07-08T12:00:00Z")
        self._capture("future-agent", "1.0.0", CLAUDE_OLD, "2026-08-01T12:00:00Z")
        self._capture("openclaw", "2026.7.1", CLAUDE_OLD, "2026-07-13T12:00:00Z")
        self._capture("openclaw", "2026.7.1-2", CLAUDE_NEW, "2026-07-18T12:00:00Z")

        manifest = self._build()

        ids = [item["id"] for item in manifest["agents"]]
        self.assertEqual(
            ids,
            ["claude-code", "codex", "openclaw", "hermes", "kimi", "future-agent"],
        )
        kimi = self._json(self.public / "data/agents/kimi/history.json")
        hermes = self._json(self.public / "data/agents/hermes/history.json")
        openclaw = self._json(self.public / "data/agents/openclaw/history.json")
        self.assertEqual([item["version"] for item in kimi["versions"]], ["1.6", "1.35.0"])
        self.assertEqual(
            [item["version"] for item in hermes["versions"]],
            ["v2026.7.7", "v2026.7.7.2"],
        )
        self.assertEqual(openclaw["versions"][-1]["version"], "2026.7.1-2")
        kimi_manifest = next(item for item in manifest["agents"] if item["id"] == "kimi")
        self.assertEqual(kimi_manifest["officialSourceStatus"], "not-synced")
        self.assertEqual(
            kimi_manifest["officialSourceUrl"],
            "https://github.com/MoonshotAI/kimi-cli",
        )
        future = next(item for item in manifest["agents"] if item["id"] == "future-agent")
        self.assertEqual(future["label"], "fixture")

    def test_new_agent_definitions_override_capture_metadata(self) -> None:
        for agent in ("goose", "cline", "qwen-code", "reasonix"):
            self._capture(agent, "1.0.0", CLAUDE_OLD, "2026-08-06T12:00:00Z")

        manifest = self._build()

        agents = {item["id"]: item for item in manifest["agents"]}
        self.assertEqual(
            [item["id"] for item in manifest["agents"]],
            ["claude-code", "codex", "goose", "cline", "qwen-code", "reasonix"],
        )
        self.assertEqual(agents["goose"]["label"], "Goose")
        self.assertEqual(
            agents["goose"]["projectUrl"], "https://github.com/aaif-goose/goose"
        )
        self.assertEqual(agents["cline"]["label"], "Cline")
        self.assertEqual(agents["cline"]["projectUrl"], "https://github.com/cline/cline")
        self.assertEqual(agents["qwen-code"]["label"], "Qwen Code")
        self.assertEqual(
            agents["qwen-code"]["projectUrl"], "https://github.com/QwenLM/qwen-code"
        )
        self.assertEqual(agents["reasonix"]["label"], "Reasonix")
        self.assertEqual(
            agents["reasonix"]["projectUrl"],
            "https://github.com/esengine/DeepSeek-Reasonix",
        )
        for agent in ("goose", "cline", "qwen-code"):
            self.assertIn("Runtime Prompt", agents[agent]["description"])

    def test_source_only_capture_exposes_official_provenance_and_unavailable_layers(self) -> None:
        overlay = self.root / "overlay"
        self._capture(
            "reasonix",
            "1.20.0",
            "# Runtime Evidence\n\nOfficial release only.\n",
            "2026-08-05T14:01:12Z",
            root=overlay,
            extra_meta={
                "capture_kind": "official-source-history",
                "runtime_prompt_status": "unavailable",
                "tool_schema_status": "unavailable",
                "source_repository": "esengine/DeepSeek-Reasonix",
                "source_ref": "v1.20.0",
                "source_url": "https://github.com/esengine/DeepSeek-Reasonix/releases/tag/v1.20.0",
            },
        )

        self._build(capture_overlay_root=overlay)

        changelog = self._json(self.public / "data/agents/reasonix/changelog.json")
        entry = changelog["entries"][0]
        self.assertEqual(entry["layers"]["prompt"]["status"], "unavailable")
        self.assertEqual(entry["layers"]["tools"]["status"], "unavailable")
        source = next(
            source
            for source in entry["sources"]
            if source["sourceType"] == "official-source-prompt-capture"
        )
        self.assertEqual(source["repository"], "esengine/DeepSeek-Reasonix")
        self.assertEqual(source["ref"], "v1.20.0")

    def test_overlay_merges_agents_and_deduplicates_semantic_captures(self) -> None:
        overlay = self.root / "overlay"
        published_at = "2026-08-06T12:00:00Z"
        self._capture(
            "goose",
            "1.0.0",
            CLAUDE_OLD,
            "2026-08-06T12:01:00Z",
            root=self.phistory,
            published_at=published_at,
            trace_text='{"timestamp":"first","event":"request"}\n',
        )
        self._capture(
            "goose",
            "1.0.0",
            CLAUDE_OLD,
            "2026-08-06T12:02:00Z",
            root=overlay,
            published_at=published_at,
            trace_text='{"timestamp":"second","event":"request"}\n',
        )
        self._capture(
            "qwen-code",
            "1.0.0",
            CLAUDE_NEW,
            "2026-08-06T12:03:00Z",
            root=overlay,
        )

        manifest = self._build(capture_overlay_root=overlay)

        agents = {item["id"]: item for item in manifest["agents"]}
        self.assertEqual(agents["goose"]["releaseCount"], 1)
        self.assertEqual(agents["qwen-code"]["releaseCount"], 1)
        self.assertEqual(manifest["ingestion"]["acceptedCaptures"], 6)
        self.assertEqual(
            [root["kind"] for root in manifest["captureRoots"]],
            ["phistory", "local-overlay"],
        )
        history = self._json(self.public / "data/agents/goose/history.json")
        release = history["versions"][0]
        self.assertEqual(
            [origin["kind"] for origin in release["provenance"]],
            ["phistory", "local-overlay"],
        )
        self.assertNotEqual(
            release["provenance"][0]["traceSha256"],
            release["provenance"][1]["traceSha256"],
        )
        evidence = self._json(self.analysis / "evidence/goose/1.0.0.json")
        source_types = {source["sourceType"] for source in evidence["sources"]}
        self.assertIn("phistory-prompt-capture", source_types)
        self.assertIn("local-overlay-prompt-capture", source_types)
        self.assertNotIn(str(overlay), json.dumps(manifest))
        self.assertNotIn(str(overlay), json.dumps(release))

    def test_overlay_rejects_same_version_with_different_prompt(self) -> None:
        overlay = self.root / "overlay"
        self._capture(
            "codex",
            "0.10.0",
            CLAUDE_NEW,
            "2026-02-01T12:00:00Z",
            root=overlay,
        )

        with self.assertRaisesRegex(
            ValueError, "conflicting capture for codex 0.10.0"
        ):
            self._build(capture_overlay_root=overlay)

    def test_overlay_rejects_same_prompt_with_different_stable_metadata(self) -> None:
        overlay = self.root / "overlay"
        self._capture(
            "codex",
            "0.10.0",
            CODEX_SHARED,
            "2026-02-01T12:01:00Z",
            published_at="2026-02-02T12:00:00Z",
            root=overlay,
        )

        with self.assertRaisesRegex(
            ValueError, "conflicting capture for codex 0.10.0"
        ):
            self._build(capture_overlay_root=overlay)

    def test_removed_upstream_agent_is_pruned_from_public_and_evidence_outputs(self) -> None:
        self._capture("future-agent", "1.0.0", CLAUDE_OLD, "2026-08-01T12:00:00Z")
        self._build()
        self.assertTrue((self.public / "data/agents/future-agent").is_dir())
        self.assertTrue((self.analysis / "evidence/future-agent").is_dir())

        shutil.rmtree(self.phistory / "captures/future-agent")
        manifest = self._build()

        self.assertNotIn("future-agent", [item["id"] for item in manifest["agents"]])
        self.assertFalse((self.public / "data/agents/future-agent").exists())
        self.assertFalse((self.analysis / "evidence/future-agent").exists())

    def test_prompt_objects_are_content_addressed_and_deduplicated(self) -> None:
        self._build()
        claude = self._json(self.public / "data/agents/claude-code/history.json")
        codex = self._json(self.public / "data/agents/codex/history.json")
        shared_claude = claude["versions"][0]
        shared_codex = codex["versions"][0]
        self.assertEqual(shared_claude["sha256"], shared_codex["sha256"])
        self.assertEqual(shared_claude["promptUrl"], shared_codex["promptUrl"])
        objects = list((self.public / "data/objects").glob("*.md"))
        self.assertEqual(len(objects), 2)
        stored = self.public / shared_claude["promptUrl"].removeprefix("/")
        self.assertEqual(stored.read_text(encoding="utf-8"), CLAUDE_OLD)

    def test_fallback_is_replaced_by_matching_ai_analysis(self) -> None:
        self._build()
        evidence = self._json(self.analysis / "evidence/claude-code/1.10.0.json")
        ai_path = self.analysis / "changelogs/claude-code/1.10.0.json"
        ai_path.parent.mkdir(parents=True)
        ai_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "agent": "claude-code",
                    "version": "1.10.0",
                    "evidenceDigest": evidence["evidenceDigest"],
                    "title": "Codex 归纳标题",
                    "summary": "工具读写边界发生了可验证的调整。",
                    "highlights": ["新增 Write", "修改 Read"],
                    "categories": ["prompt", "tools"],
                    "importance": "high",
                    "implications": ["可据此调整自研 agent 的写入审批边界。"],
                    "analysisStatus": "reviewed",
                    "model": "fixture-codex",
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        self._build()
        changelog = self._json(self.public / "data/agents/claude-code/changelog.json")
        entry = changelog["entries"][-1]
        self.assertEqual(entry["title"], "Codex 归纳标题")
        self.assertEqual(entry["analysisStatus"], "reviewed")
        self.assertEqual(entry["model"], "fixture-codex")
        self.assertEqual(entry["importance"], "high")
        self.assertEqual(entry["implications"], ["可据此调整自研 Agent 的写入审批边界。"])
        self.assertEqual(entry["stats"]["toolsAdded"], ["Write"])

    def test_legacy_ai_analysis_falls_back_without_blocking_build(self) -> None:
        self._build()
        evidence = self._json(self.analysis / "evidence/claude-code/1.10.0.json")
        ai_path = self.analysis / "changelogs/claude-code/1.10.0.json"
        ai_path.parent.mkdir(parents=True)
        ai_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "agent": "claude-code",
                    "version": "1.10.0",
                    "evidenceDigest": evidence["evidenceDigest"],
                    "title": "旧格式标题",
                    "summary": "缺少新版情报字段。",
                    "highlights": ["旧格式"],
                    "categories": ["prompt"],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        self._build()
        changelog = self._json(self.public / "data/agents/claude-code/changelog.json")
        entry = changelog["entries"][-1]
        self.assertEqual(entry["analysisStatus"], "pending")
        self.assertNotEqual(entry["title"], "旧格式标题")

    def test_stale_ai_analysis_falls_back_without_blocking_build(self) -> None:
        self._build()
        ai_path = self.analysis / "changelogs/claude-code/1.10.0.json"
        ai_path.parent.mkdir(parents=True)
        ai_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "agent": "claude-code",
                    "version": "1.10.0",
                    "evidenceDigest": "0" * 64,
                    "title": "过期标题",
                    "summary": "这份分析不应进入产物。",
                    "highlights": ["过期"],
                    "categories": ["prompt"],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        self._build()
        changelog = self._json(self.public / "data/agents/claude-code/changelog.json")
        entry = changelog["entries"][-1]
        self.assertEqual(entry["analysisStatus"], "pending")
        self.assertNotEqual(entry["title"], "过期标题")

    def test_later_unrelated_capture_does_not_change_old_evidence_digest(self) -> None:
        subprocess.run(["git", "init", "-q", str(self.phistory)], check=True)
        subprocess.run(["git", "-C", str(self.phistory), "add", "."], check=True)
        subprocess.run(
            [
                "git",
                "-C",
                str(self.phistory),
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-qm",
                "initial captures",
            ],
            check=True,
        )
        self._build()
        path = self.analysis / "evidence/claude-code/1.10.0.json"
        before = self._json(path)

        self._capture("codex", "0.11.0", CLAUDE_NEW, "2026-03-01T12:00:00Z")
        subprocess.run(["git", "-C", str(self.phistory), "add", "."], check=True)
        subprocess.run(
            [
                "git",
                "-C",
                str(self.phistory),
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-qm",
                "later unrelated capture",
            ],
            check=True,
        )
        self._build()
        after = self._json(path)

        self.assertNotEqual(before["source"]["upstreamCommit"], after["source"]["upstreamCommit"])
        self.assertEqual(before["evidenceDigest"], after["evidenceDigest"])

    def test_identical_rerun_does_not_rewrite_outputs_or_leave_temp_files(self) -> None:
        self._build()
        files = sorted(
            path
            for root in (self.public, self.analysis / "evidence")
            for path in root.rglob("*")
            if path.is_file()
        )
        before = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in files}
        time.sleep(0.01)
        self._build()
        after_files = sorted(
            path
            for root in (self.public, self.analysis / "evidence")
            for path in root.rglob("*")
            if path.is_file()
        )
        self.assertEqual(files, after_files)
        for path, (content, modified) in before.items():
            self.assertEqual(path.read_bytes(), content)
            self.assertEqual(path.stat().st_mtime_ns, modified)
        self.assertEqual(list(self.root.rglob("*.tmp")), [])

    def test_quarantines_capture_symlink_that_escapes_source_root(self) -> None:
        outside = self.root / "outside"
        outside.mkdir()
        os.symlink(outside, self.phistory / "captures/claude-code/9.9.9")
        manifest = self._build()
        claude = next(item for item in manifest["agents"] if item["id"] == "claude-code")
        self.assertEqual(claude["ingestion"]["rejectedCaptures"], 1)
        self.assertEqual(claude["ingestion"]["warnings"][0]["version"], "9.9.9")

    def test_quarantines_bounded_and_malformed_releases_and_prunes_evidence(self) -> None:
        for index in range(11, 16):
            self._capture(
                "claude-code",
                f"1.{index}.0",
                CLAUDE_NEW,
                f"2026-03-{index:02d}T12:00:00Z",
                trace=index == 13,
            )
        (self.phistory / "captures/claude-code/1.11.0/prompt.md").write_bytes(
            b"x" * 513
        )
        (self.phistory / "captures/claude-code/1.12.0/meta.json").write_bytes(
            b" " * 257
        )
        (self.phistory / "captures/claude-code/1.13.0/trace.jsonl").write_bytes(
            b" " * 65
        )
        (self.phistory / "captures/claude-code/1.14.0/prompt.md").write_text(
            "# System Prompt\n" + "x" * 49 + "\n", encoding="utf-8"
        )
        (self.phistory / "captures/claude-code/1.15.0/meta.json").write_text(
            "{", encoding="utf-8"
        )
        stale_evidence = self.analysis / "evidence/claude-code/1.11.0.json"
        stale_evidence.parent.mkdir(parents=True)
        stale_evidence.write_text("{}\n", encoding="utf-8")

        with mock.patch.multiple(
            builder,
            MAX_PROMPT_BYTES=512,
            MAX_PROMPT_LINE_BYTES=48,
            MAX_CAPTURE_META_BYTES=256,
            MAX_TRACE_BYTES=64,
        ):
            manifest = self._build()

        claude = next(item for item in manifest["agents"] if item["id"] == "claude-code")
        self.assertEqual(claude["releaseCount"], 2)
        self.assertEqual(claude["ingestion"]["acceptedCaptures"], 2)
        self.assertEqual(claude["ingestion"]["rejectedCaptures"], 5)
        self.assertEqual(claude["ingestion"]["warningCount"], 5)
        self.assertFalse(claude["ingestion"]["warningsTruncated"])
        self.assertEqual(
            {warning["version"] for warning in claude["ingestion"]["warnings"]},
            {"1.11.0", "1.12.0", "1.13.0", "1.14.0", "1.15.0"},
        )
        history = self._json(self.public / "data/agents/claude-code/history.json")
        self.assertEqual(
            [release["version"] for release in history["versions"]],
            ["1.2.0", "1.10.0"],
        )
        self.assertFalse(stale_evidence.exists())

    def test_capture_count_limit_keeps_newest_semantic_versions(self) -> None:
        with mock.patch.object(builder, "MAX_CAPTURES_PER_AGENT", 1):
            manifest = self._build()

        agents = {item["id"]: item for item in manifest["agents"]}
        self.assertEqual(agents["claude-code"]["latestVersion"], "1.10.0")
        self.assertEqual(agents["codex"]["latestVersion"], "0.10.0")
        self.assertEqual(agents["claude-code"]["ingestion"]["rejectedCaptures"], 1)
        self.assertEqual(agents["codex"]["ingestion"]["rejectedCaptures"], 1)
        self.assertEqual(manifest["ingestion"]["rejectedCaptures"], 2)

    def test_merges_official_and_bounded_static_prompt_layers(self) -> None:
        self._static_prompts(
            "claude-code",
            "1.2.0",
            [("stable", "Stable", "old"), ("removed", "Removed", "gone")],
        )
        self._static_prompts(
            "claude-code",
            "1.10.0",
            [("stable", "Stable", "new"), ("added", "Added", "arrived")],
        )

        self._build(official_root=self._official_index())

        evidence = self._json(self.analysis / "evidence/claude-code/1.10.0.json")
        self.assertEqual(evidence["official"]["status"], "available")
        self.assertEqual(evidence["official"]["release"]["notes"]["sourceKind"], "official-changelog")
        changes = evidence["staticPrompt"]["changes"]
        self.assertEqual(changes["addedCount"], 1)
        self.assertEqual(changes["removedCount"], 1)
        self.assertEqual(changes["modifiedCount"], 1)
        self.assertEqual([item["change"] for item in changes["items"]], ["modified", "added", "removed"])
        source_types = {source["sourceType"] for source in evidence["sources"]}
        self.assertIn("phistory-static-prompt", source_types)
        self.assertIn("official-release", source_types)

        old = self._json(self.analysis / "evidence/claude-code/1.2.0.json")
        self.assertEqual(old["official"]["status"], "unavailable")
        self.assertEqual(old["staticPrompt"]["comparisonStatus"], "unavailable")
        public = self._json(self.public / "data/agents/claude-code/changelog.json")
        self.assertEqual(public["entries"][-1]["layers"]["official"]["status"], "available")

    def test_exposes_complete_source_code_coverage_only_for_adjacent_captures(self) -> None:
        official_root = self._official_index()
        index_path = official_root / "claude-code.json"
        index = self._json(index_path)
        release = index["releases"]["1.10.0"]
        release["commitSha"] = "b" * 40
        release["codeChange"] = {
            "status": "available",
            "analysisEligible": True,
            "baseVersion": "1.2.0",
            "headVersion": "1.10.0",
            "baseTag": "v1.2.0",
            "headTag": "v1.10.0",
            "baseCommitSha": "a" * 40,
            "headCommitSha": "b" * 40,
            "diffSha256": "c" * 64,
            "digestScope": "complete",
            "truncated": False,
            "bytesInspected": 120,
            "filesObserved": 2,
            "additionsObserved": 10,
            "deletionsObserved": 3,
            "keyFiles": [{"path": "src/agent.ts", "status": "modified"}],
            "sourceUrl": "https://github.com/anthropics/claude-code/compare/v1.2.0...v1.10.0",
        }
        index.pop("sourceDigest")
        index["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(index))
        index_path.write_text(json.dumps(index), encoding="utf-8")
        self._refresh_official_generation(official_root)

        manifest = self._build(official_root=official_root)

        claude = next(item for item in manifest["agents"] if item["id"] == "claude-code")
        self.assertEqual(claude["sourceCodeStatus"], "complete")
        self.assertEqual(claude["sourceCoverage"]["officialCodeExpected"], 1)
        self.assertEqual(claude["sourceCoverage"]["officialCodeComparisons"], 1)
        self.assertEqual(claude["sourceCoverage"]["officialCodeUnavailable"], 0)
        evidence = self._json(self.analysis / "evidence/claude-code/1.10.0.json")
        self.assertEqual(
            evidence["official"]["codeChange"]["baseCommitSha"], "a" * 40
        )

    def test_official_provenance_url_does_not_change_semantic_evidence_digest(self) -> None:
        official_root = self._official_index()
        self._build(official_root=official_root)
        path = self.analysis / "evidence/claude-code/1.10.0.json"
        before = self._json(path)

        index_path = official_root / "claude-code.json"
        index = self._json(index_path)
        release = index["releases"]["1.10.0"]
        release["sourceUrl"] = "https://github.com/anthropics/claude-code/releases/tag/redirected"
        release["notes"]["sourceUrl"] = "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#redirected"
        index.pop("sourceDigest")
        index["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(index))
        index_path.write_text(json.dumps(index), encoding="utf-8")
        self._refresh_official_generation(official_root)

        self._build(official_root=official_root)
        after = self._json(path)
        self.assertNotEqual(before["sources"], after["sources"])
        self.assertEqual(before["evidenceDigest"], after["evidenceDigest"])

    def test_stale_official_sync_health_is_exposed_without_changing_evidence_digest(self) -> None:
        official_root = self._official_index()
        self._build(official_root=official_root)
        evidence_path = self.analysis / "evidence/claude-code/1.10.0.json"
        before = self._json(evidence_path)
        warning = {
            "type": "stale-cache-used",
            "url": "https://example.test/changelog",
            "reason": "network-error",
            "cachedSha256": "a" * 64,
        }
        self._set_official_status(
            official_root,
            status="stale",
            warnings=[warning],
        )

        manifest = self._build(official_root=official_root)
        after = self._json(evidence_path)

        self.assertEqual(manifest["officialSources"]["status"], "stale")
        self.assertEqual(manifest["officialSources"]["warnings"], [warning])
        claude_manifest = next(
            item for item in manifest["agents"] if item["id"] == "claude-code"
        )
        self.assertEqual(claude_manifest["officialSourceStatus"], "stale")
        self.assertEqual(after["official"]["freshness"], "stale")
        self.assertEqual(before["evidenceDigest"], after["evidenceDigest"])
        public = self._json(self.public / "data/agents/claude-code/changelog.json")
        self.assertEqual(public["entries"][-1]["layers"]["official"]["freshness"], "stale")

    def test_mismatched_sync_status_manifest_is_explicitly_degraded(self) -> None:
        official_root = self._official_index()
        self._set_official_status(
            official_root,
            status="current",
            warnings=[],
            manifest_sha256="0" * 64,
        )

        manifest = self._build(official_root=official_root)

        health = manifest["officialSources"]
        self.assertEqual(health["status"], "degraded")
        self.assertEqual(
            health["warnings"][-1]["reason"],
            "sync-status-manifest-mismatch",
        )
        evidence = self._json(self.analysis / "evidence/claude-code/1.10.0.json")
        self.assertEqual(evidence["official"]["freshness"], "degraded")

    def test_rejects_mixed_official_manifest_and_agent_index_generations(self) -> None:
        official_root = self._official_index()
        index_path = official_root / "claude-code.json"
        index = self._json(index_path)
        index["documents"][0]["bytes"] = 999
        index.pop("sourceDigest")
        index["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(index))
        index_path.write_text(json.dumps(index), encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "manifest/index sourceDigest mismatch"):
            self._build(official_root=official_root)

    def test_rejects_uncommitted_official_index_without_manifest(self) -> None:
        official_root = self._official_index()
        (official_root / "manifest.json").unlink()

        with self.assertRaisesRegex(ValueError, "without a committed manifest"):
            self._build(official_root=official_root)

    def test_unavailable_code_compare_does_not_create_feed_signal(self) -> None:
        official_root = self._official_index()
        notes_text = "Bug fixes"
        notes = {
            "sourceKind": "official-release",
            "sourceUrl": "https://github.com/openai/codex/releases/tag/rust-v0.10.0",
            "text": notes_text,
            "truncated": False,
            "sha256": hashlib.sha256(notes_text.encode()).hexdigest(),
            "originalBytes": len(notes_text.encode()),
        }
        value: dict[str, object] = {
            "schemaVersion": 1,
            "agent": "codex",
            "repository": "openai/codex",
            "documents": [],
            "releases": {
                "0.10.0": {
                    "version": "0.10.0",
                    "tag": "rust-v0.10.0",
                    "title": "Codex 0.10.0",
                    "sourceUrl": "https://github.com/openai/codex/releases/tag/rust-v0.10.0",
                    "notes": notes,
                    "codeChange": {
                        "status": "unavailable",
                        "reason": "compare-fetch-failed",
                    },
                }
            },
        }
        value["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(value))
        (official_root / "codex.json").write_text(
            json.dumps(value, ensure_ascii=False), encoding="utf-8"
        )
        self._refresh_official_generation(official_root)

        self._build(official_root=official_root)
        changelog = self._json(self.public / "data/agents/codex/changelog.json")
        entry = changelog["entries"][-1]
        self.assertEqual(entry["importance"], "none")
        self.assertNotIn("code", entry["categories"])


if __name__ == "__main__":
    unittest.main()
