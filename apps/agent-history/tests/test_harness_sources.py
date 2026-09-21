import hashlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from harness_sources import SOURCE_PROFILES, collect_source_snapshot


class HarnessSourceTests(unittest.TestCase):
    def test_snapshot_is_bounded_pinned_and_preserves_full_text(self):
        calls = []

        class Cache:
            def fetch(self, url, **kwargs):
                calls.append((url, kwargs))
                return SimpleNamespace(body=b"source content\n")

        snapshot = collect_source_snapshot(
            "minimax-code-cli",
            {"repository": "MiniMax-AI/minimax-code", "releases": {
                "0.5.0": {"version": "0.5.0", "commitSha": "a" * 40}}},
            Cache(), timeout=1, allow_stale_on_error=False,
        )
        self.assertEqual(len(calls), len(SOURCE_PROFILES["minimax-code-cli"]))
        self.assertEqual(snapshot["kind"], "static-source-baseline")
        self.assertEqual({item["group"] for item in snapshot["files"]}, {"Prompt", "Tools", "Harness", "License"})
        for item, (url, options) in zip(snapshot["files"], calls):
            self.assertIn("/" + "a" * 40 + "/", url)
            self.assertEqual(options["max_bytes"], 256 * 1024)
            self.assertEqual(item["content"], "source content\n")
            self.assertEqual(item["sha256"], hashlib.sha256(b"source content\n").hexdigest())

    def test_mutable_ref_cannot_be_presented_as_pinned_source(self):
        with self.assertRaisesRegex(ValueError, "immutable commit"):
            collect_source_snapshot("zcode", {
                "repository": "zai-org/ZCode",
                "releases": {"0.1.0": {"version": "0.1.0", "commitSha": "main"}},
            }, None, timeout=1, allow_stale_on_error=False)
