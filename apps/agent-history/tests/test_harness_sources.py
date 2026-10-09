import hashlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from harness_sources import SOURCE_PROFILES, collect_source_snapshot


STABLE_SOURCE_CASES = [
    ("gemini-cli", "google-gemini/gemini-cli", "0.63.0",
     "573846625af9e93b3b968e0e0b86bb093a4c9b16", {
         "LICENSE",
         "packages/core/src/prompts/promptProvider.ts",
         "packages/core/src/prompts/snippets.ts",
         "packages/core/src/prompts/snippets.legacy.ts",
         "packages/core/src/tools/tools.ts",
         "packages/core/src/tools/tool-registry.ts",
         "packages/core/src/tools/shell.ts",
         "packages/core/src/core/client.ts",
         "packages/core/src/scheduler/scheduler.ts",
         "packages/core/src/policy/policy-engine.ts",
         "packages/core/src/policy/sandboxPolicyManager.ts",
         "packages/core/src/context/chatCompressionService.ts",
     }),
    ("swe-agent", "SWE-agent/SWE-agent", "1.1.0",
     "0f3acafacabc0def8cc76b4e48acb4b6cf302cb9", {
         "LICENSE",
         "config/default.yaml",
         "sweagent/tools/commands.py",
         "sweagent/tools/tools.py",
         "sweagent/tools/parsing.py",
         "tools/edit_anthropic/config.yaml",
         "tools/edit_anthropic/bin/str_replace_editor",
         "sweagent/agent/agents.py",
         "sweagent/agent/history_processors.py",
         "sweagent/environment/swe_env.py",
     }),
    ("mini-swe-agent", "SWE-agent/mini-swe-agent", "2.4.6",
     "a83fcae82d2a08f0ee0c688f9d137b3566c097f8", {
         "LICENSE.md",
         "src/minisweagent/config/default.yaml",
         "src/minisweagent/config/mini.yaml",
         "src/minisweagent/models/utils/actions_toolcall.py",
         "src/minisweagent/environments/local.py",
         "src/minisweagent/agents/default.py",
         "src/minisweagent/agents/interactive.py",
         "src/minisweagent/models/litellm_model.py",
         "src/minisweagent/environments/docker.py",
     }),
]


class HarnessSourceTests(unittest.TestCase):
    def test_new_profiles_fetch_only_the_newest_release_file_whitelist(self):
        for agent, repository, version, commit, paths in STABLE_SOURCE_CASES:
            with self.subTest(agent=agent):
                bodies = {
                    f"https://raw.githubusercontent.com/{repository}/{commit}/{path}":
                    f"source for {path}\n".encode("utf-8")
                    for path in paths
                }
                calls = []

                class Cache:
                    def fetch(self, url, **kwargs):
                        calls.append((url, kwargs))
                        return SimpleNamespace(body=bodies[url])

                snapshot = collect_source_snapshot(agent, {
                    "repository": repository,
                    "releases": {
                        "0.0.1": {"version": "0.0.1", "commitSha": "e" * 40},
                        version: {"version": version, "commitSha": commit},
                    },
                }, Cache(), timeout=7, allow_stale_on_error=False)

                self.assertEqual(snapshot["agent"], agent)
                self.assertEqual(snapshot["repository"], repository)
                self.assertEqual(snapshot["version"], version)
                self.assertEqual(snapshot["commit"], commit)
                self.assertEqual(snapshot["kind"], "static-source-baseline")
                self.assertEqual({item["path"] for item in snapshot["files"]}, paths)
                self.assertEqual({item["group"] for item in snapshot["files"]},
                                 {"Prompt", "Tools", "Harness", "License"})
                self.assertEqual(len(calls), len(paths))
                self.assertLessEqual(len(calls), 12)
                for item, (url, options) in zip(snapshot["files"], calls):
                    self.assertEqual(url, f"https://raw.githubusercontent.com/{repository}/{commit}/{item['path']}")
                    self.assertEqual(item["url"], f"https://github.com/{repository}/blob/{commit}/{item['path']}")
                    self.assertEqual(options, {
                        "accept": "text/plain", "max_bytes": 256 * 1024,
                        "timeout": 7, "allow_stale_on_error": False,
                    })
                    self.assertEqual(item["content"], bodies[url].decode("utf-8"))
                    self.assertEqual(item["sha256"], hashlib.sha256(bodies[url]).hexdigest())

    def test_new_profiles_reject_mutable_refs_before_fetching(self):
        class Cache:
            def fetch(self, url, **kwargs):
                raise AssertionError("mutable source must not be fetched")

        for agent, repository, version, _, _ in STABLE_SOURCE_CASES:
            with self.subTest(agent=agent):
                with self.assertRaisesRegex(ValueError, "immutable commit"):
                    collect_source_snapshot(agent, {
                        "repository": repository,
                        "releases": {version: {"version": version, "commitSha": "main"}},
                    }, Cache(), timeout=1, allow_stale_on_error=False)

    def test_raven_collects_static_harness_at_release_commit(self):
        class Cache:
            def __init__(self):
                self.urls = []

            def fetch(self, url, **kwargs):
                self.urls.append(url)
                return SimpleNamespace(body=b"pinned Raven source\n")

        cache = Cache()
        snapshot = collect_source_snapshot("raven", {
            "repository": "EverMind-AI/Raven", "releases": {
                "0.2.3": {"version": "0.2.3", "commitSha": "b" * 40}}},
            cache, timeout=1, allow_stale_on_error=False)
        self.assertEqual(snapshot["version"], "0.2.3")
        self.assertEqual(snapshot["kind"], "static-source-baseline")
        self.assertEqual(len(snapshot["files"]), 10)
        self.assertTrue(all("/" + "b" * 40 + "/" in url for url in cache.urls))
        paths = {file["path"] for file in snapshot["files"]}
        self.assertIn("experimental/curator/raven_adapter/validate.py", paths)
        self.assertIn("raven/acp_client/permissions.py", paths)

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
