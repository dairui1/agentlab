from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_from_phistory as builder
import sync_claude_static as sync
import analyze_changelogs as analyzer


class ClaudeStaticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.static = self.root / "static"
        self.static.mkdir()
        self.manifest = {"repository": sync.REPOSITORY, "commit": "a" * 40,
                         "latestVersion": "2.1.2", "versions": {}, "sha256": {}}
        for version in ("2.1.1", "2.1.2"):
            path = self.root / "phistory" / "captures" / "claude-code" / version
            path.mkdir(parents=True)
            (path / "prompt.md").write_text("# System Prompt\nRuntime remains intact.\n")
            (path / "meta.json").write_text(json.dumps({
                "agent_id": "claude-code", "version": version,
                "captured_at": "2026-09-27T00:00:00Z"}))

    def prompt(self, content="Old rule.", name="System Reminder: Machine safety"):
        header = "\n".join(f"{k}: {json.dumps(v)}" for k, v in {
            "name": name, "description": "Conditional safety contract", "ccVersion": "2.0.0"}.items())
        return sync.parse_prompt("system-prompts/machine-safety.md", f"<!--\n{header}\n-->\n{content}\n", "a" * 40)

    def write_snapshot(self, version, content):
        value = {"agent_id": "claude-code", "version": version,
                 "source": {"sourceType": "third-party-static-prompt", "repository": sync.REPOSITORY,
                            "ref": "a" * 40, "url": f"{sync.URL}/tree/{'a' * 40}/system-prompts",
                            "runtimeVerified": False},
                 "summary": {"total": 1, "known": 1, "unknown": 0}, "prompts": [self.prompt(content)]}
        raw = json.dumps(value).encode()
        (self.static / f"{version}.json").write_bytes(raw)
        self.manifest["versions"][version] = "a" * 40
        self.manifest["sha256"][version] = hashlib.sha256(raw).hexdigest()
        (self.static / "manifest.json").write_text(json.dumps(self.manifest))

    def build(self):
        return builder.build(phistory_root=self.root / "phistory", public_root=self.root / "public",
                             analysis_root=self.root / "analysis", claude_static_root=self.static)

    def test_parser_preserves_template_and_last_changed_version(self):
        item = self.prompt("Do not retry ${MACHINE}.")
        self.assertEqual(item["content"], "Do not retry ${MACHINE}.")
        self.assertEqual(item["lastChangedVersion"], "2.0.0")
        self.assertIn("/blob/" + "a" * 40, item["sourceUrl"])
        self.assertEqual(item["content_hash"], hashlib.sha256(item["content"].encode()).hexdigest())

    def test_parser_rejects_missing_metadata_and_unknown_categories(self):
        with self.assertRaises(ValueError):
            sync.parse_prompt("bad.md", "not a prompt", "a" * 40)
        with self.assertRaises(ValueError):
            self.prompt(name="Mystery: Unknown")

    def test_static_enrichment_preserves_runtime_and_exposes_actual_diff(self):
        padding = "Existing rule.\n" * 300
        self.write_snapshot("2.1.1", padding + "Retry now.")
        self.write_snapshot("2.1.2", padding + "Never retry non-idempotent commands.")
        manifest = self.build()
        agent = manifest["agents"][0]
        self.assertEqual(agent["sourceCoverage"]["staticPromptSnapshots"], 2)
        self.assertEqual(agent["sourceCoverage"]["staticPromptComparisons"], 1)
        self.assertEqual(agent["staticSource"]["status"], "current")
        packet = json.loads((self.root / "analysis/evidence/claude-code/2.1.2.json").read_text())
        self.assertEqual(packet["stats"]["additions"], 0)
        self.assertEqual(packet["stats"]["deletions"], 0)
        static = packet["staticPrompt"]
        self.assertEqual(static["changes"]["modifiedCount"], 1)
        self.assertIn("+Never retry", static["changes"]["items"][0]["diff"])
        self.assertIn("\n-Retry now.\n+Never retry", static["changes"]["items"][0]["diff"])
        self.assertFalse(static["runtimeVerified"])
        self.assertEqual(packet["sources"][-1]["sourceType"], "third-party-static-prompt")
        self.assertEqual(builder.evidence_digest(packet), analyzer.evidence_digest(packet))
        history = json.loads((self.root / "public/data/agents/claude-code/history.json").read_text())
        for version in history["versions"]:
            self.assertEqual((self.root / "public" / version["promptUrl"].lstrip("/")).read_text(),
                             "# System Prompt\nRuntime remains intact.\n")

    def test_first_snapshot_is_not_a_release_wide_addition(self):
        self.write_snapshot("2.1.2", "Newly collected, not necessarily newly shipped.")
        self.build()
        packet = json.loads((self.root / "analysis/evidence/claude-code/2.1.2.json").read_text())
        self.assertTrue(packet["staticPrompt"]["baselineOnly"])
        self.assertEqual(packet["staticPrompt"]["changes"]["addedCount"], 0)

    def test_incomplete_generation_fails_closed(self):
        self.write_snapshot("2.1.2", "Rule.")
        path = self.static / "2.1.2.json"
        path.write_text(path.read_text() + " ")
        with self.assertRaisesRegex(ValueError, "incomplete Claude"):
            self.build()

    def test_missing_indexed_snapshot_fails_closed(self):
        self.write_snapshot("2.1.2", "Rule.")
        (self.static / "2.1.2.json").unlink()
        with self.assertRaisesRegex(ValueError, "missing Claude static"):
            self.build()

    def test_changed_source_url_is_rejected_even_with_valid_file_digest(self):
        self.write_snapshot("2.1.2", "Rule.")
        path = self.static / "2.1.2.json"
        value = json.loads(path.read_text())
        value["source"]["url"] = "https://example.com/not-piebald"
        path.write_text(json.dumps(value))
        self.manifest["sha256"]["2.1.2"] = hashlib.sha256(path.read_bytes()).hexdigest()
        (self.static / "manifest.json").write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, "invalid third-party"):
            self.build()

    def test_sync_fetch_failure_does_not_update_generation(self):
        root = self.root / "cache"
        (root / "upstream").mkdir(parents=True)
        (root / "normalized").mkdir()
        marker = root / "normalized/manifest.json"
        marker.write_text("{}")
        with mock.patch.object(sync, "git", side_effect=[(sync.URL + ".git\n").encode(), RuntimeError("offline")]):
            with self.assertRaisesRegex(RuntimeError, "offline"):
                sync.sync(root)
        self.assertEqual(marker.read_text(), "{}")

    def test_sync_retains_old_versions_and_is_repeatable(self):
        root = self.root / "cache"
        (root / "upstream").mkdir(parents=True)
        target = root / "normalized"
        target.mkdir()
        prior = {"versions": {"1.0.0": "b" * 40}, "sha256": {"1.0.0": "c" * 64},
                 "counts": {"1.0.0": 3}}
        (target / "manifest.json").write_text(json.dumps(prior))

        def fake_git(repo, *args):
            if args[0] == "remote":
                return (sync.URL + ".git\n").encode()
            if args[0] == "fetch":
                return b""
            if args[0] == "rev-parse":
                return ("a" * 40).encode()
            return (("a" * 40) + " v2.1.2 (+5 tokens)\n" + ("b" * 40) + " v2.1.1\n").encode()

        with mock.patch.object(sync, "git", side_effect=fake_git), mock.patch.object(
                sync, "snapshot", side_effect=lambda repo, version, commit: {
                    "version": version, "summary": {"total": 1}}):
            first = sync.sync(root, 2)
            before = (target / "manifest.json").read_bytes()
            self.assertEqual(sync.sync(root, 2), first)
            self.assertEqual((target / "manifest.json").read_bytes(), before)
            self.assertEqual(first["versions"]["1.0.0"], "b" * 40)
        with mock.patch.object(sync, "git", side_effect=fake_git), mock.patch.object(
                sync, "snapshot", side_effect=[{"summary": {"total": 1}}, ValueError("bad header")]):
            with self.assertRaisesRegex(ValueError, "bad header"):
                sync.sync(root, 2)
            self.assertEqual((target / "manifest.json").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
