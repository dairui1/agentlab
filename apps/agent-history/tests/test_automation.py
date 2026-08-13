from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import plistlib
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock


APP_ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str, relative: str):
    spec = importlib.util.spec_from_file_location(name, APP_ROOT / relative)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {relative}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


analyze = load_script("agent_history_analyze", "scripts/analyze_changelogs.py")
builder = load_script("agent_history_builder", "scripts/build_from_phistory.py")
sync = load_script("agent_history_sync", "scripts/sync_phistory.py")
source_sync = load_script(
    "agent_history_source_sync", "scripts/sync_source_captures.py"
)
daily = load_script("agent_history_daily", "scripts/daily_update.py")
install = load_script("agent_history_install", "ops/install_launchd.py")


def evidence(
    version: str = "1.0.0",
    previous_version: str | None = None,
    *,
    agent: str = "codex",
    captured_at: str = "2026-07-31T00:00:00Z",
):
    snapshot = {
        "sha256": "1" * 64,
        "bytes": 120,
        "lineCount": 8,
        "sectionCount": 2,
        "toolCount": 1,
        "trace": {"sha256": "2" * 64, "bytes": 90, "records": 1},
    }
    packet = {
        "schemaVersion": 1,
        "agent": agent,
        "version": version,
        "previousVersion": previous_version,
        "generatedAt": "2026-08-01T00:00:00Z",
        "capturedAt": captured_at,
        "source": {
            "snapshotUrl": "https://example.test/snapshot",
            "promptUrl": "https://example.test/prompt",
            "metaUrl": "https://example.test/meta",
            "traceUrl": "https://example.test/trace",
            "upstreamCommit": "a" * 40,
        },
        "current": snapshot,
        "previous": copy.deepcopy(snapshot) if previous_version else None,
        "stats": {
            "additions": 2,
            "deletions": 1,
            "changedSections": ["Tools"],
            "sectionsAdded": [],
            "sectionsRemoved": [],
            "sectionsModified": ["Tools"],
            "toolsAdded": [],
            "toolsRemoved": [],
            "toolsModified": ["exec_command"],
        },
        "changes": {
            "sections": {"added": [], "removed": [], "modified": ["Tools"]},
            "tools": {
                "added": [],
                "removed": [],
                "modified": ["exec_command"],
            },
        },
        "diff": {
            "format": "unified",
            "truncated": False,
            "maxLines": 500,
            "totalLines": 5,
            "lines": ["-old", "+new"],
            "text": "-old\n+new",
        },
        "staticPrompt": {
            "status": "available",
            "current": {
                "sha256": "3" * 64,
                "bytes": 42,
                "total": 1,
                "known": 1,
                "unknown": 0,
            },
            "previous": None,
            "comparisonStatus": "complete",
            "changes": {
                "addedCount": 1,
                "removedCount": 0,
                "modifiedCount": 0,
                "items": [
                    {
                        "id": "review",
                        "name": "Review",
                        "category": "workflow",
                        "change": "added",
                        "beforeHash": None,
                        "afterHash": "4" * 64,
                        "excerpt": "静态提示证据",
                    }
                ],
                "truncated": False,
                "maxItems": 24,
            },
        },
        "official": {
            "status": "available",
            "repository": (
                "anthropics/claude-code" if agent == "claude-code" else "openai/codex"
            ),
            "version": version,
            "release": {
                "version": version,
                "tag": f"rust-v{version}",
                "title": f"Codex {version}",
                "notes": {
                    "sourceKind": "github-release",
                    "text": "官方发布说明证据",
                    "truncated": False,
                    "sha256": "5" * 64,
                    "originalBytes": 24,
                },
            },
        },
        "sources": [
            {
                "sourceType": "official-release",
                "url": "https://example.test/official",
            }
        ],
    }
    packet["evidenceDigest"] = analyze.evidence_digest(packet)
    return packet


def no_change_evidence(
    version: str = "1.0.0",
    previous_version: str = "0.9.9",
    *,
    captured_at: str = "2026-07-31T00:00:00Z",
):
    packet = evidence(
        version,
        previous_version,
        captured_at=captured_at,
    )
    packet["stats"]["additions"] = 0
    packet["stats"]["deletions"] = 0
    packet["stats"]["changedSections"] = []
    packet["stats"]["sectionsModified"] = []
    packet["stats"]["toolsModified"] = []
    packet["changes"] = {
        "sections": {"added": [], "removed": [], "modified": []},
        "tools": {"added": [], "removed": [], "modified": []},
    }
    packet["diff"] = {
        "format": "unified",
        "truncated": False,
        "maxLines": 500,
        "totalLines": 0,
        "lines": [],
        "text": "",
    }
    packet["staticPrompt"]["changes"] = {
        "addedCount": 0,
        "removedCount": 0,
        "modifiedCount": 0,
        "items": [],
        "truncated": False,
        "maxItems": 24,
    }
    packet["official"] = {
        "status": "unavailable",
        "repository": "openai/codex",
        "version": packet["version"],
        "reason": "version-not-listed-by-official-source",
    }
    packet["evidenceDigest"] = analyze.evidence_digest(packet)
    return packet


class AnalyzeChangelogsTests(unittest.TestCase):
    def test_digest_excludes_volatile_metadata_and_trace(self):
        packet = evidence()
        digest = packet["evidenceDigest"]
        changed = copy.deepcopy(packet)
        changed["generatedAt"] = "2030-01-01T00:00:00Z"
        changed["capturedAt"] = "2020-01-01T00:00:00Z"
        changed["source"]["upstreamCommit"] = "b" * 40
        changed["source"]["promptUrl"] = "https://elsewhere.test/prompt"
        changed["current"]["trace"] = {"sha256": "9" * 64}
        changed["sources"][0]["url"] = "https://elsewhere.test/official"
        self.assertEqual(analyze.evidence_digest(changed), digest)

        changed["stats"]["additions"] = 3
        self.assertNotEqual(analyze.evidence_digest(changed), digest)

        changed = copy.deepcopy(packet)
        changed["official"]["release"]["notes"]["text"] = "另一条官方说明"
        self.assertNotEqual(analyze.evidence_digest(changed), digest)

        changed = copy.deepcopy(packet)
        changed["official"]["freshness"] = "stale"
        self.assertEqual(analyze.evidence_digest(changed), digest)

        changed = copy.deepcopy(packet)
        changed["runtimeCapture"] = {
            "promptStatus": "unavailable",
            "toolSchemaStatus": "unavailable",
            "promptComparisonStatus": "unavailable",
            "toolSchemaComparisonStatus": "unavailable",
        }
        self.assertNotEqual(analyze.evidence_digest(changed), digest)

    def test_prompt_uses_the_same_semantic_projection_as_the_digest(self):
        packet = evidence()
        prompt = analyze.build_prompt([packet])
        self.assertIn(str(packet["evidenceDigest"]), prompt)
        self.assertIn('"toolsModified":["exec_command"]', prompt)
        self.assertIn("静态提示证据", prompt)
        self.assertIn("官方发布说明证据", prompt)
        self.assertIn("importance", prompt)
        self.assertIn("implications", prompt)
        self.assertIn("high 是稀缺等级", prompt)
        self.assertIn("拿不准 high 或 medium 时必须选 medium", prompt)
        self.assertIn("仅有官方说明", prompt)
        self.assertNotIn("upstreamCommit", prompt)
        self.assertNotIn("capturedAt", prompt)
        self.assertNotIn('"trace"', prompt)
        self.assertNotIn("https://example.test/official", prompt)
        self.assertNotIn('"freshness"', prompt)

    def test_fake_analyzer_writes_only_stale_outputs(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            evidence_root = root / "analysis" / "evidence" / "codex"
            output = root / "analysis" / "changelogs" / "codex" / "1.0.0.json"
            evidence_root.mkdir(parents=True)
            packet = evidence()
            packet_path = evidence_root / "1.0.0.json"
            packet_path.write_text(json.dumps(packet), encoding="utf-8")
            arguments = [
                "--analysis-root",
                str(root / "analysis"),
                "--agents",
                "codex",
                "--fake-analyzer",
            ]
            self.assertEqual(analyze.main(arguments), 0)
            first_bytes = output.read_bytes()
            first_mtime = output.stat().st_mtime_ns
            result = json.loads(first_bytes)
            self.assertEqual(result["evidenceDigest"], packet["evidenceDigest"])
            self.assertEqual(result["model"], "deterministic-fake")
            self.assertEqual(result["importance"], "medium")
            self.assertTrue(result["implications"])

            self.assertEqual(analyze.main(arguments), 0)
            self.assertEqual(output.read_bytes(), first_bytes)
            self.assertEqual(output.stat().st_mtime_ns, first_mtime)

            packet["generatedAt"] = "2028-08-01T00:00:00Z"
            packet_path.write_text(json.dumps(packet), encoding="utf-8")
            self.assertEqual(analyze.main(arguments), 0)
            self.assertEqual(output.stat().st_mtime_ns, first_mtime)

            packet["stats"]["additions"] = 7
            packet["evidenceDigest"] = analyze.evidence_digest(packet)
            packet_path.write_text(json.dumps(packet), encoding="utf-8")
            self.assertEqual(analyze.main(arguments + ["--dry-run"]), 0)
            self.assertEqual(output.stat().st_mtime_ns, first_mtime)
            self.assertEqual(analyze.main(arguments), 0)
            self.assertNotEqual(output.read_bytes(), first_bytes)

    def test_newest_first_cap_limits_fake_backfill(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            directory = root / "analysis" / "evidence" / "codex"
            directory.mkdir(parents=True)
            for version, previous in (("1.0.0", None), ("1.0.1", "1.0.0")):
                packet = evidence(version, previous)
                (directory / f"{version}.json").write_text(
                    json.dumps(packet), encoding="utf-8"
                )
            self.assertEqual(
                analyze.main(
                    [
                        "--analysis-root",
                        str(root / "analysis"),
                        "--agents",
                        "codex",
                        "--fake-analyzer",
                        "--newest-first",
                        "--max-releases",
                        "1",
                    ]
                ),
                0,
            )
            output = root / "analysis" / "changelogs" / "codex"
            self.assertFalse((output / "1.0.0.json").exists())
            self.assertTrue((output / "1.0.1.json").exists())

    def test_newest_first_cap_is_global_across_agents(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fixtures = (
                ("claude-code", "2.0.0", "2026-08-01T01:00:00Z"),
                ("claude-code", "1.9.0", "2026-07-29T01:00:00Z"),
                ("codex", "1.0.1", "2026-08-01T00:00:00Z"),
                ("codex", "1.0.0", "2026-07-28T01:00:00Z"),
            )
            for agent, version, captured_at in fixtures:
                directory = root / "analysis" / "evidence" / agent
                directory.mkdir(parents=True, exist_ok=True)
                packet = evidence(version, agent=agent, captured_at=captured_at)
                (directory / f"{version}.json").write_text(
                    json.dumps(packet), encoding="utf-8"
                )
            self.assertEqual(
                analyze.main(
                    [
                        "--analysis-root",
                        str(root / "analysis"),
                        "--agents",
                        "claude-code,codex",
                        "--fake-analyzer",
                        "--newest-first",
                        "--max-releases",
                        "2",
                    ]
                ),
                0,
            )
            output = root / "analysis" / "changelogs"
            self.assertTrue((output / "claude-code" / "2.0.0.json").exists())
            self.assertTrue((output / "codex" / "1.0.1.json").exists())
            self.assertFalse((output / "claude-code" / "1.9.0.json").exists())
            self.assertFalse((output / "codex" / "1.0.0.json").exists())

    def test_fair_cap_gives_each_agent_a_frontier_slot(self):
        packets = [
            evidence("3.0.0", agent="claude-code", captured_at="2026-08-03T00:00:00Z"),
            evidence("2.0.0", agent="claude-code", captured_at="2026-08-02T00:00:00Z"),
            evidence("1.0.0", agent="claude-code", captured_at="2026-08-01T00:00:00Z"),
            evidence("1.0.0", agent="codex", captured_at="2026-07-31T00:00:00Z"),
            evidence("1.0.0", agent="grok", captured_at="2026-07-30T00:00:00Z"),
        ]

        fair = analyze.select_pending_packets(
            packets, limit=3, newest_first=True, fair_agents=True
        )
        global_only = analyze.select_pending_packets(
            packets, limit=3, newest_first=True, fair_agents=False
        )

        self.assertEqual({packet["agent"] for packet in fair}, {"claude-code", "codex", "grok"})
        self.assertEqual([packet["agent"] for packet in global_only], ["claude-code"] * 3)

    def test_all_agent_selector_discovers_evidence_directories(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            for agent in ("opencode", "claude-code", "grok"):
                (root / agent).mkdir(parents=True)
            self.assertEqual(
                analyze.parse_agents("all", root),
                ("claude-code", "grok", "opencode"),
            )

    def test_codex_command_is_ephemeral_noninteractive_and_read_only(self):
        options = analyze.Options(
            evidence_root=Path("/evidence"),
            output_root=Path("/output"),
            agents=("codex",),
            batch_size=4,
            timeout=10,
            retries=1,
            model=None,
            codex_bin="codex",
            force=False,
            dry_run=False,
            fake_analyzer=False,
            batch_delay=0,
            reasoning_effort="medium",
        )
        command = analyze.build_codex_command(
            options, schema_path=Path("/schema.json"), response_path=Path("/response.json")
        )
        self.assertEqual(command[:4], ["codex", "-a", "never", "exec"])
        self.assertIn("--ephemeral", command)
        self.assertIn("read-only", command)
        self.assertIn("--ignore-user-config", command)
        self.assertIn("--ignore-rules", command)
        self.assertIn("shell_tool", command)
        self.assertIn("unified_exec", command)
        self.assertIn('shell_environment_policy.inherit="none"', command)
        self.assertIn('model_reasoning_effort="medium"', command)
        self.assertEqual(command[-1], "-")

    def test_output_schema_const_properties_also_declare_types(self):
        schema = analyze.batch_schema([evidence()])
        properties = schema["properties"]["results"]["items"]["properties"]
        self.assertEqual(properties["schemaVersion"]["type"], "integer")
        self.assertEqual(properties["schemaVersion"]["const"], 1)
        self.assertEqual(properties["analysisStatus"]["type"], "string")
        self.assertEqual(properties["analysisStatus"]["const"], "complete")
        self.assertEqual(
            properties["importance"]["enum"], ["high", "medium", "low", "none"]
        )
        self.assertEqual(properties["implications"]["maxItems"], 4)

    def test_no_change_evidence_requires_none_importance_and_no_implications(self):
        packet = no_change_evidence()
        result = analyze.fake_result(packet)
        self.assertEqual(result["importance"], "none")
        self.assertEqual(result["implications"], [])
        result["importance"] = "high"
        with self.assertRaisesRegex(analyze.AnalysisError, "importance=none"):
            analyze.validate_analysis(result, packet)

    def test_no_signal_release_is_completed_without_using_model_quota(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            directory = root / "analysis" / "evidence" / "codex"
            directory.mkdir(parents=True)
            packets = [
                no_change_evidence(
                    "1.0.2",
                    "1.0.1",
                    captured_at="2026-08-01T03:00:00Z",
                ),
                evidence(
                    "1.0.1",
                    "1.0.0",
                    captured_at="2026-08-01T02:00:00Z",
                ),
                evidence(
                    "1.0.0",
                    "0.9.9",
                    captured_at="2026-08-01T01:00:00Z",
                ),
            ]
            for packet in packets:
                (directory / f"{packet['version']}.json").write_text(
                    json.dumps(packet), encoding="utf-8"
                )
            result = analyze.main(
                [
                    "--analysis-root",
                    str(root / "analysis"),
                    "--agents",
                    "codex",
                    "--fake-analyzer",
                    "--newest-first",
                    "--max-releases",
                    "1",
                ]
            )
            output = root / "analysis" / "changelogs" / "codex"
            no_signal = json.loads((output / "1.0.2.json").read_text(encoding="utf-8"))
            selected = json.loads((output / "1.0.1.json").read_text(encoding="utf-8"))
            self.assertEqual(result, 0)
            self.assertEqual(no_signal["model"], "deterministic-no-change")
            self.assertEqual(no_signal["importance"], "none")
            self.assertEqual(no_signal["implications"], [])
            self.assertEqual(selected["model"], "deterministic-fake")
            self.assertFalse((output / "1.0.0.json").exists())

    def test_no_signal_release_never_starts_codex(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            directory = root / "analysis" / "evidence" / "codex"
            directory.mkdir(parents=True)
            packet = no_change_evidence()
            (directory / "1.0.0.json").write_text(
                json.dumps(packet), encoding="utf-8"
            )
            result = analyze.main(
                [
                    "--analysis-root",
                    str(root / "analysis"),
                    "--agents",
                    "codex",
                    "--codex-bin",
                    str(root / "does-not-exist"),
                ]
            )
            output = root / "analysis" / "changelogs" / "codex" / "1.0.0.json"
            self.assertEqual(result, 0)
            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8"))["model"],
                "deterministic-no-change",
            )

    def test_source_only_publication_never_claims_runtime_layers_are_equal(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            directory = root / "analysis" / "evidence" / "deepseek-harness"
            directory.mkdir(parents=True)
            packet = no_change_evidence(
                "0.1.0-rc.6",
                None,
                captured_at="2026-08-13T12:35:03.812Z",
            )
            packet["agent"] = "deepseek-harness"
            packet["runtimeCapture"] = {
                "promptStatus": "unavailable",
                "toolSchemaStatus": "unavailable",
                "promptComparisonStatus": "unavailable",
                "toolSchemaComparisonStatus": "unavailable",
            }
            packet["official"] = {
                "status": "available",
                "repository": "deepseek-ai/deepseek-harness",
                "version": packet["version"],
                "release": {
                    "version": packet["version"],
                    "sourceRef": "@deepseek-ai/dsh@0.1.0-rc.6",
                    "title": "DeepSeek Harness 0.1.0-rc.6",
                    "notes": {
                        "sourceKind": "npm-publication",
                        "text": "",
                        "truncated": False,
                        "sha256": hashlib.sha256(b"").hexdigest(),
                        "originalBytes": 0,
                    },
                },
            }
            packet["evidenceDigest"] = analyze.evidence_digest(packet)
            prompt = analyze.build_prompt([packet])
            self.assertIn("comparisonStatus 为 unavailable", prompt)
            (directory / "0.1.0-rc.6.json").write_text(
                json.dumps(packet), encoding="utf-8"
            )

            result = analyze.main(
                [
                    "--analysis-root",
                    str(root / "analysis"),
                    "--agents",
                    "deepseek-harness",
                    "--codex-bin",
                    str(root / "does-not-exist"),
                ]
            )

            output = json.loads(
                (
                    root
                    / "analysis/changelogs/deepseek-harness/0.1.0-rc.6.json"
                ).read_text(encoding="utf-8")
            )
            self.assertEqual(result, 0)
            self.assertEqual(output["model"], "deterministic-no-change")
            self.assertEqual(output["importance"], "none")
            self.assertIn("没有公开", output["summary"])
            self.assertNotIn("一致", output["summary"])

    def test_batch_retries_after_invalid_response(self):
        packet = evidence()
        options = analyze.Options(
            evidence_root=Path("/evidence"),
            output_root=Path("/output"),
            agents=("codex",),
            batch_size=4,
            timeout=10,
            retries=1,
            model="test-model",
            codex_bin="codex",
            force=False,
            dry_run=False,
            fake_analyzer=False,
            batch_delay=0,
            reasoning_effort="medium",
        )
        calls = []

        def runner(packets, _options, correction):
            calls.append(correction)
            return {} if len(calls) == 1 else analyze.fake_batch(packets)

        records = analyze.analyze_batch([packet], options, analyzer=runner)
        self.assertEqual(len(calls), 2)
        self.assertIn("results", calls[1])
        self.assertEqual(records[0]["model"], "test-model")
        self.assertEqual(
            records[0]["generator"],
            {
                "promptVersion": analyze.PROMPT_VERSION,
                "model": "test-model",
                "reasoningEffort": "medium",
            },
        )

    def test_timeout_batch_splits_recursively_to_single_releases(self):
        packets = [evidence(f"1.0.{index}") for index in range(4)]
        options = analyze.Options(
            evidence_root=Path("/evidence"),
            output_root=Path("/output"),
            agents=("codex",),
            batch_size=4,
            timeout=10,
            retries=2,
            model="test-model",
            codex_bin="codex",
            force=False,
            dry_run=False,
            fake_analyzer=False,
            batch_delay=0,
            reasoning_effort="medium",
        )
        calls = []

        def runner(batch, _options, _correction):
            calls.append(len(batch))
            if len(batch) > 1:
                raise analyze.AnalysisTimeout("simulated timeout")
            return analyze.fake_batch(batch)

        completed = list(
            analyze.analyze_with_splitting(packets, options, analyzer=runner)
        )
        self.assertEqual(calls, [4, 2, 1, 1, 2, 1, 1])
        self.assertEqual([len(batch) for batch, _records in completed], [1, 1, 1, 1])

    def test_failed_batch_splits_after_configured_retries(self):
        packets = [evidence("1.0.0"), evidence("1.0.1")]
        options = analyze.Options(
            evidence_root=Path("/evidence"),
            output_root=Path("/output"),
            agents=("codex",),
            batch_size=2,
            timeout=10,
            retries=1,
            model="test-model",
            codex_bin="codex",
            force=False,
            dry_run=False,
            fake_analyzer=False,
            batch_delay=0,
            reasoning_effort="medium",
        )
        calls = []

        def runner(batch, _options, _correction):
            calls.append(len(batch))
            if len(batch) > 1:
                raise analyze.AnalysisError("simulated invalid output")
            return analyze.fake_batch(batch)

        completed = list(
            analyze.analyze_with_splitting(packets, options, analyzer=runner)
        )
        self.assertEqual(calls, [2, 2, 1, 1])
        self.assertEqual(len(completed), 2)

    def test_failed_single_release_does_not_block_later_writes(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            directory = root / "analysis" / "evidence" / "codex"
            directory.mkdir(parents=True)
            for version in ("1.0.0", "1.0.1"):
                packet = evidence(version)
                (directory / f"{version}.json").write_text(
                    json.dumps(packet), encoding="utf-8"
                )
            calls = []
            original = analyze.analyze_batch

            def fake_analyze_batch(batch, options, analyzer=None):
                calls.append([packet["version"] for packet in batch])
                if len(batch) > 1:
                    raise analyze.AnalysisTimeout("split this batch")
                if batch[0]["version"] == "1.0.0":
                    raise analyze.AnalysisError("single release failed")
                return analyze.validate_batch_result(
                    analyze.fake_batch(batch),
                    batch,
                    model="test-model",
                    generator=analyze.generator_metadata(options),
                )

            analyze.analyze_batch = fake_analyze_batch
            try:
                result = analyze.main(
                    [
                        "--analysis-root",
                        str(root / "analysis"),
                        "--agents",
                        "codex",
                        "--batch-size",
                        "2",
                        "--retries",
                        "0",
                        "--model",
                        "test-model",
                    ]
                )
            finally:
                analyze.analyze_batch = original
            output = root / "analysis" / "changelogs" / "codex"
            self.assertEqual(result, 1)
            self.assertEqual(calls, [["1.0.0", "1.0.1"], ["1.0.0"], ["1.0.1"]])
            self.assertFalse((output / "1.0.0.json").exists())
            self.assertTrue((output / "1.0.1.json").exists())

    def test_parallel_jobs_run_independent_codex_batches_concurrently(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            directory = root / "analysis" / "evidence" / "codex"
            directory.mkdir(parents=True)
            for index in range(4):
                packet = evidence(f"1.0.{index}")
                (directory / f"1.0.{index}.json").write_text(
                    json.dumps(packet), encoding="utf-8"
                )

            lock = threading.Lock()
            active = 0
            max_active = 0
            original = analyze.analyze_batch

            def fake_analyze_batch(batch, options, analyzer=None):
                nonlocal active, max_active
                with lock:
                    active += 1
                    max_active = max(max_active, active)
                try:
                    time.sleep(0.05)
                    return analyze.validate_batch_result(
                        analyze.fake_batch(batch),
                        batch,
                        model="test-model",
                        generator=analyze.generator_metadata(options),
                    )
                finally:
                    with lock:
                        active -= 1

            analyze.analyze_batch = fake_analyze_batch
            try:
                result = analyze.main(
                    [
                        "--analysis-root",
                        str(root / "analysis"),
                        "--agents",
                        "codex",
                        "--batch-size",
                        "1",
                        "--jobs",
                        "3",
                        "--model",
                        "test-model",
                    ]
                )
            finally:
                analyze.analyze_batch = original

            self.assertEqual(result, 0)
            self.assertGreaterEqual(max_active, 2)
            self.assertEqual(
                len(list((root / "analysis" / "changelogs" / "codex").glob("*.json"))),
                4,
            )

    def test_cache_requires_prompt_model_and_reasoning_provenance(self):
        with tempfile.TemporaryDirectory() as raw:
            packet = evidence()
            path = Path(raw) / "1.0.0.json"
            options = analyze.Options(
                evidence_root=Path("/evidence"),
                output_root=Path(raw),
                agents=("codex",),
                batch_size=1,
                timeout=10,
                retries=0,
                model="model-a",
                codex_bin="codex",
                force=False,
                dry_run=False,
                fake_analyzer=False,
                batch_delay=0,
                reasoning_effort="medium",
            )
            record = analyze.validate_batch_result(
                analyze.fake_batch([packet]),
                [packet],
                model="model-a",
                generator=analyze.generator_metadata(options),
            )[0]
            path.write_text(json.dumps(record), encoding="utf-8")
            self.assertTrue(analyze.cache_status(path, packet, options)[0])

            record["generator"]["promptVersion"] = "old-prompt"
            path.write_text(json.dumps(record), encoding="utf-8")
            self.assertFalse(analyze.cache_status(path, packet, options)[0])

            record = analyze.validate_batch_result(
                analyze.fake_batch([packet]),
                [packet],
                model="model-a",
                generator=analyze.generator_metadata(options),
            )[0]
            record.pop("importance")
            path.write_text(json.dumps(record), encoding="utf-8")
            self.assertFalse(analyze.cache_status(path, packet, options)[0])

            record = analyze.validate_batch_result(
                analyze.fake_batch([packet]),
                [packet],
                model="model-a",
                generator=analyze.generator_metadata(options),
            )[0]
            path.write_text(json.dumps(record), encoding="utf-8")
            changed_model = analyze.Options(
                **{**options.__dict__, "model": "model-b"}
            )
            changed_reasoning = analyze.Options(
                **{**options.__dict__, "reasoning_effort": "high"}
            )
            self.assertFalse(analyze.cache_status(path, packet, changed_model)[0])
            self.assertFalse(analyze.cache_status(path, packet, changed_reasoning)[0])

    def test_codex_process_timeout_is_enforced(self):
        with self.assertRaisesRegex(analyze.AnalysisError, "timed out"):
            analyze.communicate_with_timeout(
                (sys.executable, "-c", "import time; time.sleep(5)"), "", 0.05
            )

    def test_codex_timeout_reports_partial_diagnostics(self):
        command = (
            sys.executable,
            "-c",
            "import sys,time; print('network route unavailable', file=sys.stderr, flush=True); time.sleep(5)",
        )
        with self.assertRaisesRegex(analyze.AnalysisError, "network route unavailable"):
            analyze.communicate_with_timeout(command, "", 0.5)

    def test_codex_timeout_kills_descendants_holding_output_pipes(self):
        child = (
            "import signal,time; "
            "signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(5)"
        )
        parent = (
            "import subprocess,sys,time; "
            f"subprocess.Popen([sys.executable, '-c', {child!r}]); time.sleep(5)"
        )
        started = time.monotonic()
        with self.assertRaisesRegex(analyze.AnalysisError, "timed out"):
            analyze.communicate_with_timeout((sys.executable, "-c", parent), "", 0.05)
        self.assertLess(time.monotonic() - started, 1.5)


class SyncPhistoryTests(unittest.TestCase):
    def git(self, repo: Path, *arguments: str) -> str:
        completed = subprocess.run(
            ("git", "-C", str(repo), *arguments),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return completed.stdout.strip()

    def test_sparse_clone_and_exact_sha_update(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            origin = root / "origin"
            origin.mkdir()
            subprocess.run(("git", "init", "-b", "main", str(origin)), check=True, stdout=subprocess.DEVNULL)
            self.git(origin, "config", "user.email", "test@example.test")
            self.git(origin, "config", "user.name", "Test")
            for agent in ("claude-code", "codex", "unused-agent"):
                capture = origin / "captures" / agent / "1.0.0"
                capture.mkdir(parents=True)
                (capture / "prompt.md").write_text(f"# {agent}\n", encoding="utf-8")
            docs = origin / "docs"
            docs.mkdir()
            (docs / "large.md").write_text("not needed", encoding="utf-8")
            (origin / "index.html").write_text("upstream app code", encoding="utf-8")
            self.git(origin, "add", ".")
            self.git(origin, "commit", "-m", "initial")
            first = self.git(origin, "rev-parse", "HEAD")

            checkout = root / "cache" / "upstream"
            result = sync.sync_repository(
                checkout,
                remote=str(origin),
                ref="main",
                agents=("claude-code", "codex"),
            )
            self.assertEqual(result.current_sha, first)
            self.assertFalse((checkout / "docs" / "large.md").exists())
            self.assertFalse((checkout / "index.html").exists())
            self.assertFalse((checkout / "captures" / "unused-agent").exists())

            all_checkout = root / "cache-all" / "upstream"
            all_result = sync.sync_repository(
                all_checkout,
                remote=str(origin),
                ref="main",
                agents=sync.parse_agents("all"),
            )
            self.assertEqual(all_result.sparse_paths, ("captures",))
            self.assertTrue((all_checkout / "captures" / "unused-agent").is_dir())
            self.assertFalse((all_checkout / "docs" / "large.md").exists())

            prompt = origin / "captures" / "codex" / "1.0.0" / "prompt.md"
            prompt.write_text("# codex\nchanged\n", encoding="utf-8")
            self.git(origin, "add", ".")
            self.git(origin, "commit", "-m", "update")
            second = self.git(origin, "rev-parse", "HEAD")
            updated = sync.sync_repository(
                checkout,
                remote=str(origin),
                ref="main",
                agents=("claude-code", "codex"),
            )
            self.assertEqual(updated.previous_sha, first)
            self.assertEqual(updated.fetched_sha, second)
            self.assertEqual(updated.current_sha, second)
            self.assertTrue(updated.changed)

    def test_metadata_only_sync_tracks_commit_without_capture_blobs(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            origin = root / "origin"
            origin.mkdir()
            subprocess.run(
                ("git", "init", "-b", "main", str(origin)),
                check=True,
                stdout=subprocess.DEVNULL,
            )
            self.git(origin, "config", "user.email", "test@example.test")
            self.git(origin, "config", "user.name", "Test")
            capture = origin / "captures" / "codex" / "1.0.0"
            capture.mkdir(parents=True)
            (capture / "prompt.md").write_text("# codex\n", encoding="utf-8")
            (origin / "README.md").write_text("upstream docs\n", encoding="utf-8")
            self.git(origin, "add", ".")
            self.git(origin, "commit", "-m", "initial")
            first = self.git(origin, "rev-parse", "HEAD")

            checkout = root / "cache" / "upstream"
            result = sync.sync_repository(
                checkout,
                remote=str(origin),
                ref="main",
                agents=(),
                metadata_only=True,
            )

            self.assertEqual(result.current_sha, first)
            self.assertEqual(result.sparse_paths, ())
            self.assertTrue((checkout / ".git").is_dir())
            self.assertTrue((checkout / "captures").is_dir())
            self.assertEqual(list((checkout / "captures").iterdir()), [])
            self.assertFalse((checkout / "README.md").exists())
            self.assertEqual(self.git(checkout, "status", "--porcelain"), "")

            (capture / "prompt.md").write_text("# codex\nchanged\n", encoding="utf-8")
            self.git(origin, "add", ".")
            self.git(origin, "commit", "-m", "update")
            second = self.git(origin, "rev-parse", "HEAD")
            updated = sync.sync_repository(
                checkout,
                remote=str(origin),
                ref="main",
                agents=(),
                metadata_only=True,
            )

            self.assertEqual(updated.previous_sha, first)
            self.assertEqual(updated.current_sha, second)
            self.assertEqual(list((checkout / "captures").iterdir()), [])
            self.assertEqual(self.git(checkout, "status", "--porcelain"), "")


class SourceCaptureSyncTests(unittest.TestCase):
    @staticmethod
    def write_official_index(root: Path, agent: str, value: dict[str, object]) -> None:
        value = {"schemaVersion": 1, "agent": agent, "documents": [], **value}
        value["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(value))
        digest = value["sourceDigest"]
        directory = root / "agents"
        directory.mkdir(exist_ok=True)
        (directory / f"{digest}.json").write_bytes(builder.pretty_json(value))
        descriptor = {
            "url": f"agents/{digest}.json",
            "releaseCount": len(value["releases"]),
            "sourceDigest": digest,
        }
        manifest = {"schemaVersion": 1, "agents": {agent: descriptor}}
        manifest["sourceDigest"] = builder.sha256_bytes(builder.canonical_json(manifest))
        (root / "manifest.json").write_bytes(builder.pretty_json(manifest))

    @staticmethod
    def cline_release(
        version: str = "1.0.1",
        *,
        source_ref: str | None = None,
        source_url: str | None = None,
    ) -> dict[str, str]:
        tag = source_ref or f"cli-v{version}"
        return {
            "version": version,
            "tag": tag,
            "sourceUrl": source_url
            or f"https://github.com/cline/cline/releases/tag/{tag}",
            "publishedAt": "2026-08-02T00:00:00Z",
        }

    def test_source_capture_registry_covers_every_release_history_source(self):
        self.assertEqual(
            set(source_sync.SOURCE_AGENTS),
            set(source_sync.SOURCE_CAPTURE_SOURCES),
        )
        self.assertIn("deepseek-harness", source_sync.SOURCE_AGENTS)

    def test_materializes_npm_release_with_artifact_provenance(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "0.1.0-rc.6"
            self.write_official_index(
                official,
                "deepseek-harness",
                {
                        "repository": "deepseek-ai/deepseek-harness",
                        "releases": {
                            version: {
                                "version": version,
                                "sourceRef": f"@deepseek-ai/dsh@{version}",
                                "sourceUrl": (
                                    "https://www.npmjs.com/package/@deepseek-ai/dsh/"
                                    f"v/{version}"
                                ),
                                "publishedAt": "2026-08-13T12:35:03.812Z",
                                "packageName": "@deepseek-ai/dsh",
                                "packageDirectory": "apps/cli",
                                "artifact": {
                                    "scope": "published-package-only",
                                    "url": (
                                        "https://registry.npmjs.org/@deepseek-ai/dsh/-/"
                                        f"dsh-{version}.tgz"
                                    ),
                                    "integrity": "sha512-" + "A" * 86 + "==",
                                    "shasum": "a" * 40,
                                },
                            }
                        },
                    },
            )

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("deepseek-harness",),
            )

            self.assertEqual(result, {"deepseek-harness": 1})
            capture = overlay / "captures/deepseek-harness" / version
            metadata = json.loads((capture / "meta.json").read_text())
            self.assertEqual(metadata["package"], "@deepseek-ai/dsh")
            self.assertEqual(metadata["package_directory"], "apps/cli")
            self.assertEqual(metadata["source_ref"], f"@deepseek-ai/dsh@{version}")
            self.assertEqual(metadata["tarball_integrity"], "sha512-" + "A" * 86 + "==")
            self.assertEqual(metadata["tarball_shasum"], "a" * 40)

            public = root / "public"
            analysis = root / "analysis"
            manifest = builder.build(
                phistory_root=phistory,
                capture_overlay_root=overlay,
                public_root=public,
                analysis_root=analysis,
                agents=("deepseek-harness",),
            )
            self.assertEqual(
                [agent["id"] for agent in manifest["agents"]],
                ["deepseek-harness"],
            )

    def test_materializes_only_missing_official_releases(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            (phistory / "captures/cline/1.0.0").mkdir(parents=True)
            official.mkdir()
            releases = {
                version: {
                    "version": version,
                    "tag": f"cli-v{version}",
                    "sourceUrl": f"https://github.com/cline/cline/releases/tag/cli-v{version}",
                    "publishedAt": f"2026-08-0{index}T00:00:00Z",
                }
                for index, version in enumerate(("1.0.0", "1.0.1"), start=1)
            }
            releases["0.9.9"] = {
                "version": "0.9.9",
                "tag": "cli-v0.9.9",
                "sourceUrl": "https://github.com/cline/cline/releases/tag/cli-v0.9.9",
                "publishedAt": "2026-06-08T23:59:59Z",
            }
            releases["0.8.0"] = {
                "version": "0.8.0",
                "tag": "cli-v0.8.0",
                "sourceUrl": "https://github.com/cline/cline/tree/cli-v0.8.0",
            }
            self.write_official_index(
                official,
                "cline",
                {
                        "repository": "cline/cline",
                        "releases": releases,
                    },
            )

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("cline",),
            )

            self.assertEqual(result, {"cline": 1})
            capture = overlay / "captures/cline/1.0.1"
            self.assertFalse((overlay / "captures/cline/0.9.9").exists())
            self.assertFalse((overlay / "captures/cline/0.8.0").exists())
            self.assertIn("runtime prompt", (capture / "prompt.md").read_text())
            metadata = json.loads((capture / "meta.json").read_text())
            self.assertEqual(metadata["capture_kind"], "official-source-history")
            self.assertEqual(metadata["source_ref"], "cli-v1.0.1")
            self.assertEqual(
                source_sync.sync(
                    official_root=official,
                    phistory_root=phistory,
                    overlay_root=overlay,
                    agents=("cline",),
                ),
                {"cline": 0},
            )

    def test_repairs_empty_source_capture_directory(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "1.0.1"
            self.write_official_index(
                official,
                "cline",
                {
                    "repository": "cline/cline",
                    "releases": {version: self.cline_release(version)},
                },
            )
            capture = overlay / "captures/cline" / version
            capture.mkdir(parents=True)

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("cline",),
            )

            self.assertEqual(result, {"cline": 1})
            self.assertEqual(
                {path.name for path in capture.iterdir()}, {"meta.json", "prompt.md"}
            )
            metadata = json.loads((capture / "meta.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["capture_kind"], "official-source-history")

    def test_repairs_damaged_owned_source_capture_metadata(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "1.0.1"
            self.write_official_index(
                official,
                "cline",
                {
                    "repository": "cline/cline",
                    "releases": {version: self.cline_release(version)},
                },
            )
            capture = overlay / "captures/cline" / version
            capture.mkdir(parents=True)
            (capture / "prompt.md").write_bytes(
                source_sync.render_placeholder("cline", "Cline")
            )
            (capture / "meta.json").write_text("{broken", encoding="utf-8")

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("cline",),
            )

            self.assertEqual(result, {"cline": 1})
            metadata = json.loads((capture / "meta.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["capture_kind"], "official-source-history")

    def test_reconciles_owned_source_capture_with_current_provenance(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "1.0.1"
            source_url = "https://github.com/cline/cline/releases/tag/cli-v1.0.1"
            self.write_official_index(
                official,
                "cline",
                {
                    "repository": "cline/cline",
                    "releases": {
                        version: self.cline_release(
                            version,
                            source_ref="cli-v1.0.1",
                            source_url=source_url,
                        )
                    },
                },
            )
            capture = overlay / "captures/cline" / version
            capture.mkdir(parents=True)
            (capture / "prompt.md").write_text("old placeholder\n", encoding="utf-8")
            (capture / "meta.json").write_text(
                json.dumps(
                    {
                        "capture_kind": "official-source-history",
                        "source_ref": "cli-v1.0.0",
                        "source_url": "https://example.test/old",
                        "version": version,
                    }
                ),
                encoding="utf-8",
            )

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("cline",),
            )

            self.assertEqual(result, {"cline": 1})
            metadata = json.loads((capture / "meta.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["source_ref"], "cli-v1.0.1")
            self.assertEqual(metadata["source_url"], source_url)
            self.assertIn("runtime prompt", (capture / "prompt.md").read_text())

    def test_failed_owned_capture_replacement_restores_previous_directory(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "1.0.1"
            self.write_official_index(
                official,
                "cline",
                {
                    "repository": "cline/cline",
                    "releases": {version: self.cline_release(version)},
                },
            )
            capture = overlay / "captures/cline" / version
            capture.mkdir(parents=True)
            prompt = b"old placeholder\n"
            metadata = builder.pretty_json(
                {
                    "capture_kind": "official-source-history",
                    "source_ref": "cli-v1.0.0",
                    "version": version,
                }
            )
            (capture / "prompt.md").write_bytes(prompt)
            (capture / "meta.json").write_bytes(metadata)
            real_replace = os.replace

            def fail_install(source: object, destination: object) -> None:
                source_path = Path(source)
                if (
                    Path(destination) == capture
                    and source_path.name.startswith(f".{version}.")
                    and not source_path.name.endswith(".previous")
                ):
                    raise OSError("simulated install failure")
                real_replace(source, destination)

            with mock.patch.object(source_sync.os, "replace", side_effect=fail_install):
                with self.assertRaisesRegex(
                    source_sync.SourceCaptureError, "cannot replace source capture"
                ):
                    source_sync.sync(
                        official_root=official,
                        phistory_root=phistory,
                        overlay_root=overlay,
                        agents=("cline",),
                    )

            self.assertEqual((capture / "prompt.md").read_bytes(), prompt)
            self.assertEqual((capture / "meta.json").read_bytes(), metadata)
            self.assertEqual(
                {path.name for path in capture.parent.iterdir()}, {version}
            )

    def test_preserves_non_owned_overlay_runtime_capture(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "1.0.1"
            self.write_official_index(
                official,
                "cline",
                {
                    "repository": "cline/cline",
                    "releases": {version: self.cline_release(version)},
                },
            )
            capture = overlay / "captures/cline" / version
            capture.mkdir(parents=True)
            prompt = b"# Real runtime capture\n"
            metadata = (
                b'{"agent_id":"cline","agent":"Cline","version":"1.0.1",'
                b'"captured_at":"2026-08-02T00:00:00Z"}\n'
            )
            (capture / "prompt.md").write_bytes(prompt)
            (capture / "meta.json").write_bytes(metadata)

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("cline",),
            )

            self.assertEqual(result, {"cline": 0})
            self.assertEqual((capture / "prompt.md").read_bytes(), prompt)
            self.assertEqual((capture / "meta.json").read_bytes(), metadata)

    def test_refuses_valid_json_with_invalid_non_owned_metadata(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "1.0.1"
            self.write_official_index(
                official,
                "cline",
                {
                    "repository": "cline/cline",
                    "releases": {version: self.cline_release(version)},
                },
            )
            capture = overlay / "captures/cline" / version
            capture.mkdir(parents=True)
            (capture / "prompt.md").write_text("# incomplete\n", encoding="utf-8")
            (capture / "meta.json").write_text("{}\n", encoding="utf-8")

            with self.assertRaisesRegex(
                source_sync.SourceCaptureError, "invalid non-owned source capture"
            ):
                source_sync.sync(
                    official_root=official,
                    phistory_root=phistory,
                    overlay_root=overlay,
                    agents=("cline",),
                )

    def test_matching_source_capture_is_idempotent_without_rewrite(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            official.mkdir()
            (phistory / "captures").mkdir(parents=True)
            version = "1.0.1"
            self.write_official_index(
                official,
                "cline",
                {
                    "repository": "cline/cline",
                    "releases": {version: self.cline_release(version)},
                },
            )
            capture = overlay / "captures/cline" / version
            self.assertEqual(
                source_sync.sync(
                    official_root=official,
                    phistory_root=phistory,
                    overlay_root=overlay,
                    agents=("cline",),
                ),
                {"cline": 1},
            )
            before = {
                name: ((capture / name).stat().st_ino, (capture / name).stat().st_mtime_ns)
                for name in ("meta.json", "prompt.md")
            }

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("cline",),
            )

            self.assertEqual(result, {"cline": 0})
            self.assertEqual(
                {
                    name: (
                        (capture / name).stat().st_ino,
                        (capture / name).stat().st_mtime_ns,
                    )
                    for name in ("meta.json", "prompt.md")
                },
                before,
            )

    def test_backfills_official_gaps_within_existing_capture_history(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            official = root / "official"
            phistory = root / "phistory"
            overlay = root / "overlay"
            capture = phistory / "captures/hermes/v2026.3.23"
            capture.mkdir(parents=True)
            (capture / "meta.json").write_text(
                json.dumps({"published_at": "2026-03-24T05:34:23Z"}),
                encoding="utf-8",
            )
            official.mkdir()
            releases = {
                "v2026.3.17": {
                    "version": "v2026.3.17",
                    "tag": "v2026.3.17",
                    "sourceUrl": "https://github.com/NousResearch/hermes-agent/releases/tag/v2026.3.17",
                    "publishedAt": "2026-03-17T07:56:07Z",
                },
                "v2026.3.28": {
                    "version": "v2026.3.28",
                    "tag": "v2026.3.28",
                    "sourceUrl": "https://github.com/NousResearch/hermes-agent/releases/tag/v2026.3.28",
                    "publishedAt": "2026-03-28T20:12:05Z",
                },
            }
            self.write_official_index(
                official,
                "hermes",
                {"repository": "NousResearch/hermes-agent", "releases": releases},
            )

            result = source_sync.sync(
                official_root=official,
                phistory_root=phistory,
                overlay_root=overlay,
                agents=("hermes",),
            )

            self.assertEqual(result, {"hermes": 1})
            self.assertFalse((overlay / "captures/hermes/v2026.3.17").exists())
            self.assertTrue((overlay / "captures/hermes/v2026.3.28").is_dir())

    def test_prunes_source_placeholder_when_phistory_later_captures_version(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            phistory = root / "phistory"
            overlay = root / "overlay"
            placeholder = overlay / "captures/mimo/0.1.11"
            placeholder.mkdir(parents=True)
            (placeholder / "prompt.md").write_text("placeholder", encoding="utf-8")
            (placeholder / "meta.json").write_text(
                json.dumps(
                    {
                        "version": "0.1.11",
                        "capture_kind": "official-source-history",
                    }
                ),
                encoding="utf-8",
            )
            upstream = phistory / "captures/mimo/0.1.11"
            upstream.mkdir(parents=True)
            (upstream / "prompt.md").write_text("real capture", encoding="utf-8")

            pruned = source_sync.prune_superseded_placeholders(
                phistory_root=phistory,
                overlay_root=overlay,
                agent="mimo",
            )

            self.assertEqual(pruned, 1)
            self.assertFalse(placeholder.exists())
            self.assertFalse(placeholder.parent.exists())
            self.assertEqual((upstream / "prompt.md").read_text(), "real capture")


class DailyUpdateTests(unittest.TestCase):
    def test_step_order_backfill_limit_and_optional_deploy(self):
        overlay = Path("/tmp/agentlab-test-overlay")
        args = daily.parse_args(
            [
                "--dry-run",
                "--max-releases",
                "12",
                "--deploy",
                "--capture-overlay-root",
                str(overlay),
            ]
        )
        steps = daily.build_steps(args)
        self.assertEqual(
            [step.name for step in steps],
            [
                "sync upstream",
                "sync official sources",
                "sync source-only captures",
                "build deterministic evidence",
                "analyze stale changelogs",
                "merge validated changelogs",
                "run tests",
                "build site",
                "verify deployment data",
                "deploy with Wrangler",
            ],
        )
        self.assertIn("--allow-stale-on-error", steps[1].command)
        self.assertIn(str(daily.DEFAULT_OFFICIAL_CACHE_ROOT), steps[1].command)
        resolved_overlay = str(overlay.resolve())
        official_command = steps[1].command
        capture_roots = [
            official_command[index + 1]
            for index, value in enumerate(official_command)
            if value == "--capture-root"
        ]
        self.assertEqual(
            capture_roots,
            [str(daily.DEFAULT_CACHE_ROOT.resolve() / "upstream"), resolved_overlay],
        )
        source_command = steps[2].command
        self.assertEqual(
            source_command[source_command.index("--overlay-root") + 1], resolved_overlay
        )
        for index in (3, 5):
            command = steps[index].command
            self.assertEqual(
                command[command.index("--capture-overlay-root") + 1], resolved_overlay
            )
        self.assertEqual(
            steps[7].environment,
            {
                "AGENT_HISTORY_CAPTURE_OVERLAY_ROOT": resolved_overlay,
                "PHISTORY_AGENTS": "all",
            },
        )
        self.assertFalse(steps[4].required)
        self.assertTrue(all(step.required for index, step in enumerate(steps) if index != 4))
        analyze_command = steps[4].command
        self.assertIn("--batch-size", analyze_command)
        self.assertEqual(analyze_command[analyze_command.index("--batch-size") + 1], "1")
        self.assertEqual(analyze_command[analyze_command.index("--jobs") + 1], "8")
        self.assertEqual(
            analyze_command[analyze_command.index("--model") + 1],
            "gpt-5.6-luna",
        )
        self.assertEqual(analyze_command[analyze_command.index("--timeout") + 1], "180.0")
        self.assertEqual(
            analyze_command[analyze_command.index("--reasoning-effort") + 1],
            "medium",
        )
        self.assertIn("--max-releases", analyze_command)
        self.assertIn("12", analyze_command)
        self.assertIn("--newest-first", analyze_command)
        self.assertIn("--fair-agents", analyze_command)
        self.assertEqual(args.agents, "all")
        self.assertEqual(steps[-2].command, (args.python_bin, "scripts/verify_deploy.py"))
        self.assertEqual(steps[-2].environment, steps[-3].environment)
        self.assertEqual(steps[-1].command[:3], ("npx", "--no-install", "wrangler"))

    def test_focused_local_run_requires_codex_and_skips_unrelated_sources(self):
        args = daily.parse_args(
            [
                "--require-codex",
                "--codex-bin",
                "/tmp/codex",
                "--agents",
                "codex",
                "--max-releases",
                "5",
            ]
        )

        steps = daily.build_steps(args)

        self.assertEqual(steps[0].name, "check Codex login")
        self.assertEqual(steps[0].command, ("/tmp/codex", "login", "status"))
        self.assertNotIn("sync source-only captures", [step.name for step in steps])
        official = next(step for step in steps if step.name == "sync official sources")
        self.assertEqual(
            official.command[official.command.index("--agents") + 1], "codex"
        )
        analyze = next(step for step in steps if step.name == "analyze stale changelogs")
        self.assertTrue(analyze.required)
        self.assertEqual(
            analyze.command[analyze.command.index("--codex-bin") + 1],
            "/tmp/codex",
        )
        site = next(step for step in steps if step.name == "build site")
        self.assertEqual(site.environment["PHISTORY_AGENTS"], "codex")

    def test_focused_deepseek_harness_run_includes_npm_source_history(self):
        args = daily.parse_args(["--agents", "deepseek-harness"])

        steps = daily.build_steps(args)

        upstream = next(step for step in steps if step.name == "sync upstream")
        self.assertIn("--metadata-only", upstream.command)
        self.assertNotIn("--agents", upstream.command)
        source = next(step for step in steps if step.name == "sync source-only captures")
        self.assertEqual(
            source.command[source.command.index("--agents") + 1],
            "deepseek-harness",
        )

    def test_focused_run_cannot_deploy_canonical_data(self):
        with self.assertRaises(SystemExit):
            daily.parse_args(["--agents", "deepseek-harness", "--deploy"])

    def test_package_build_data_uses_the_default_overlay_root(self):
        package = json.loads((APP_ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(
            package["scripts"]["sync"],
            "npm run sync:phistory && npm run sync:official && npm run sync:source-captures",
        )
        command = package["scripts"]["build:data"]
        self.assertIn("--capture-overlay-root", command)
        self.assertIn(".cache/agentlab-captures", command)
        self.assertIn("PHISTORY_AGENTS", command)

        official_command = package["scripts"]["sync:official"]
        self.assertEqual(official_command.count("--capture-root"), 2)
        self.assertIn(".cache/phistory/upstream", official_command)
        self.assertIn(".cache/agentlab-captures", official_command)

        source_command = package["scripts"]["sync:source-captures"]
        self.assertIn(".cache/official-sources/normalized", source_command)
        self.assertIn(".cache/phistory/upstream", source_command)
        self.assertIn(".cache/agentlab-captures", source_command)

    def test_optional_analyzer_failure_continues_pipeline(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            marker = root / "continued"
            steps = [
                daily.Step(
                    "analyze stale changelogs",
                    (sys.executable, "-c", "import sys; sys.exit(7)"),
                    APP_ROOT,
                    required=False,
                ),
                daily.Step(
                    "merge validated changelogs",
                    (
                        sys.executable,
                        "-c",
                        f"from pathlib import Path; Path({str(marker)!r}).write_text('ok')",
                    ),
                    APP_ROOT,
                ),
            ]
            original = daily.build_steps
            daily.build_steps = lambda _args: steps
            try:
                result = daily._main(["--lock-file", str(root / "daily.lock")])
            finally:
                daily.build_steps = original
            self.assertEqual(result, 0)
            self.assertEqual(marker.read_text(encoding="utf-8"), "ok")

    def test_step_timeout_terminates_the_process_group(self):
        child = (
            "import signal,time; "
            "signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(5)"
        )
        parent = (
            "import subprocess,sys,time; "
            f"subprocess.Popen([sys.executable, '-c', {child!r}]); time.sleep(5)"
        )
        step = daily.Step("slow", (sys.executable, "-c", parent), APP_ROOT)
        started = time.monotonic()
        with self.assertRaisesRegex(daily.PipelineError, "timed out"):
            daily.run_step(step, timeout=0.05, dry_run=False)
        self.assertLess(time.monotonic() - started, 1.5)

    def test_daily_sigterm_cleans_analyzer_and_independent_codex_session(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            evidence_dir = root / "analysis" / "evidence" / "codex"
            evidence_dir.mkdir(parents=True)
            packet = evidence()
            (evidence_dir / "1.0.0.json").write_text(
                json.dumps(packet), encoding="utf-8"
            )
            pid_file = root / "codex-pids.json"
            fake_codex = root / "fake-codex"
            fake_codex.write_text(
                f"#!{sys.executable}\n"
                "import json, os, signal, time\n"
                "with open(os.environ['FAKE_CODEX_PID_FILE'], 'w') as handle:\n"
                "    json.dump({'codex': os.getpid(), 'analyzer': os.getppid()}, handle)\n"
                "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "while True:\n"
                "    time.sleep(1)\n",
                encoding="utf-8",
            )
            fake_codex.chmod(0o755)
            analyzer_command = (
                sys.executable,
                str(APP_ROOT / "scripts" / "analyze_changelogs.py"),
                "--analysis-root",
                str(root / "analysis"),
                "--agents",
                "codex",
                "--codex-bin",
                str(fake_codex),
                "--batch-size",
                "1",
                "--timeout",
                "30",
                "--retries",
                "0",
            )
            daily_path = APP_ROOT / "scripts" / "daily_update.py"
            wrapper = f"""
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('signal_daily', {str(daily_path)!r})
module = importlib.util.module_from_spec(spec)
sys.modules['signal_daily'] = module
spec.loader.exec_module(module)
step = module.Step('analyze', {analyzer_command!r}, pathlib.Path({str(APP_ROOT)!r}))
try:
    with module.pipeline_signal_handlers():
        module.run_step(step, timeout=60, dry_run=False)
except module.PipelineInterrupted as error:
    raise SystemExit(128 + error.signum)
"""
            environment = dict(os.environ)
            environment["FAKE_CODEX_PID_FILE"] = str(pid_file)
            process = subprocess.Popen(
                (sys.executable, "-c", wrapper),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=environment,
            )
            deadline = time.monotonic() + 5
            while not pid_file.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.02)
            if not pid_file.exists():
                stdout, stderr = process.communicate(timeout=2)
                self.fail(f"fake Codex did not start: stdout={stdout!r} stderr={stderr!r}")
            pids = json.loads(pid_file.read_text(encoding="utf-8"))
            os.kill(process.pid, signal.SIGTERM)
            stdout, stderr = process.communicate(timeout=8)
            self.assertEqual(process.returncode, 128 + signal.SIGTERM, (stdout, stderr))

            def exists(pid):
                try:
                    os.kill(pid, 0)
                    return True
                except ProcessLookupError:
                    return False

            deadline = time.monotonic() + 2
            while any(exists(pid) for pid in pids.values()) and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertFalse(exists(pids["analyzer"]), (pids, stdout, stderr))
            self.assertFalse(exists(pids["codex"]), (pids, stdout, stderr))

    def test_launchd_template_is_valid_and_defaults_to_0837(self):
        rendered = install.render_plist(
            label="com.example.history",
            python=Path("/usr/bin/python3"),
            app_root=APP_ROOT,
            search_path="/usr/bin:/bin",
            hour=8,
            minute=37,
            deploy=False,
            stdout_log=Path("/tmp/history.log"),
            stderr_log=Path("/tmp/history.error.log"),
            network_environment={
                "HTTPS_PROXY": "http://127.0.0.1:7890?a=1&b=2",
                "NO_PROXY": "localhost,127.0.0.1",
            },
        )
        value = plistlib.loads(rendered.encode("utf-8"))
        self.assertEqual(value["StartCalendarInterval"], {"Hour": 8, "Minute": 37})
        self.assertEqual(value["EnvironmentVariables"]["TZ"], "Asia/Shanghai")
        self.assertEqual(
            value["EnvironmentVariables"]["HTTPS_PROXY"],
            "http://127.0.0.1:7890?a=1&b=2",
        )
        self.assertEqual(
            value["EnvironmentVariables"]["NO_PROXY"], "localhost,127.0.0.1"
        )
        self.assertNotIn("--deploy", value["ProgramArguments"])

    def test_failed_launchd_upgrade_restores_previous_job(self):
        with tempfile.TemporaryDirectory() as raw:
            destination = Path(raw) / "job.plist"
            destination.write_text("old plist\n", encoding="utf-8")
            calls = []
            original = install.launchctl

            def fake_launchctl(*arguments, check=True):
                calls.append(arguments)
                if arguments[0] == "bootstrap" and len(
                    [call for call in calls if call[0] == "bootstrap"]
                ) == 1:
                    raise install.InstallError("new plist rejected")
                return None

            install.launchctl = fake_launchctl
            try:
                with self.assertRaisesRegex(install.InstallError, "previous.*restored"):
                    install.install_and_load(
                        destination, "new plist\n", domain="gui/501"
                    )
            finally:
                install.launchctl = original
            self.assertEqual(destination.read_text(encoding="utf-8"), "old plist\n")
            self.assertEqual([call[0] for call in calls], ["bootout", "bootstrap", "bootstrap"])


if __name__ == "__main__":
    unittest.main()
