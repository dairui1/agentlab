from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "verify_deploy.py"
SPEC = importlib.util.spec_from_file_location("verify_deploy", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
deploy = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = deploy
SPEC.loader.exec_module(deploy)


class VerifyDeployTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.phistory = self.root / "phistory"
        self.overlay = self.root / "overlay"
        self.public = self.root / "public"
        self.dist = self.root / "dist"
        subprocess.run(["git", "init", "-q", str(self.phistory)], check=True)
        subprocess.run(
            ["git", "-C", str(self.phistory), "config", "user.email", "test@example.com"],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(self.phistory), "config", "user.name", "Test"],
            check=True,
        )
        capture = self.phistory / "captures/codex/1.0.0/meta.json"
        capture.parent.mkdir(parents=True)
        capture.write_text("{}\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.phistory), "add", "."], check=True)
        subprocess.run(
            ["git", "-C", str(self.phistory), "commit", "-qm", "fixture"],
            check=True,
        )
        (self.overlay / "captures/deepseek-harness/0.1.0-rc.6").mkdir(parents=True)
        self._write_manifest(["codex", "deepseek-harness"])

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_manifest(self, agents: list[str], *, status: str = "fresh") -> None:
        value = {
            "agents": [{"id": agent, "releaseCount": 1} for agent in agents],
            "officialSources": {
                "status": status,
                "selectedAgents": ["codex", "deepseek-harness"],
                "retainedAgents": [],
            },
        }
        for root in (self.public, self.dist):
            path = root / "data/manifest.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value), encoding="utf-8")

    def _verify(self) -> int:
        with (
            mock.patch.object(
                deploy,
                "REQUIRED_AGENT_IDS",
                frozenset({"codex", "deepseek-harness"}),
            ),
            mock.patch.object(
                deploy,
                "OFFICIAL_REPOSITORIES",
                {
                    "codex": "openai/codex",
                    "deepseek-harness": "deepseek-ai/deepseek-harness",
                },
            ),
        ):
            return deploy.verify(
                phistory_root=self.phistory,
                overlay_root=self.overlay,
                public_root=self.public,
                dist_root=self.dist,
            )

    def test_accepts_complete_catalog_from_git_tree_and_overlay(self) -> None:
        self.assertEqual(self._verify(), 2)

    def test_rejects_focused_build_even_when_process_environment_was_reset(self) -> None:
        self._write_manifest(["deepseek-harness"])
        with self.assertRaisesRegex(deploy.DeployDataError, "missing=codex"):
            self._verify()

    def test_rejects_explicit_focused_selection(self) -> None:
        with mock.patch.dict(os.environ, {"PHISTORY_AGENTS": "deepseek-harness"}):
            with self.assertRaisesRegex(deploy.DeployDataError, "PHISTORY_AGENTS"):
                self._verify()

    def test_rejects_degraded_official_generation(self) -> None:
        self._write_manifest(["codex", "deepseek-harness"], status="degraded")
        with self.assertRaisesRegex(deploy.DeployDataError, "not deployable"):
            self._verify()

    def test_rejects_retained_official_generation(self) -> None:
        self._write_manifest(["codex", "deepseek-harness"])
        for root in (self.public, self.dist):
            path = root / "data/manifest.json"
            value = json.loads(path.read_text(encoding="utf-8"))
            value["officialSources"]["selectedAgents"] = ["deepseek-harness"]
            value["officialSources"]["retainedAgents"] = ["codex"]
            path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(deploy.DeployDataError, "not a full refresh"):
            self._verify()


if __name__ == "__main__":
    unittest.main()
