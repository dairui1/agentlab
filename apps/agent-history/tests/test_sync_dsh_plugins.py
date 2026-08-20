from __future__ import annotations

import sys
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from sync_dsh_plugins import PluginSyncError, build_payload, ranked_plugins


class DshPluginSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.plugins = [
            {
                "name": f"owner/plugin-{index:02d}",
                "owner": "owner",
                "url": f"https://github.com/owner/plugin-{index:02d}",
                "category": "tools",
                "description": {"zh": f"插件 {index}", "en": f"Plugin {index}"},
                "stars": index,
                "downloads": 100 - index,
                "added": "2026-08-20",
            }
            for index in range(1, 26)
        ]

    def test_rankings_use_explicit_metrics(self) -> None:
        top = ranked_plugins(self.plugins, "stars", 20)
        trending = ranked_plugins(self.plugins, "downloads", 20)
        self.assertEqual(top[0]["name"], "owner/plugin-25")
        self.assertEqual(top[0]["metricValue"], 25)
        self.assertEqual(trending[0]["name"], "owner/plugin-01")
        self.assertEqual(trending[0]["metricValue"], 99)
        self.assertEqual([item["rank"] for item in top], list(range(1, 21)))

    def test_payload_records_provenance_and_probe_dates(self) -> None:
        registry = {
            "name": "awesome-dsh-plugin",
            "updated": "2026-08-20",
            "count": len(self.plugins),
            "categories": {"tools": {"en": "Tools", "zh": "工具"}},
            "plugins": self.plugins,
        }
        payload = build_payload(
            registry,
            {"a": {"stars": 1, "checkedAt": "2026-08-19"}},
            {"a": {"downloads": 1, "checkedAt": "2026-08-18"}},
            limit=20,
            generated_at="2026-08-20T00:00:00+00:00",
        )
        self.assertEqual(payload["catalog"]["pluginCount"], 25)
        self.assertEqual(payload["catalog"]["categories"]["tools"], "工具")
        self.assertEqual(payload["source"]["starsCheckedAt"], "2026-08-19")
        self.assertEqual(payload["source"]["downloadsCheckedAt"], "2026-08-18")

    def test_registry_count_mismatch_is_rejected(self) -> None:
        with self.assertRaises(PluginSyncError):
            build_payload(
                {
                    "count": 1,
                    "categories": {"tools": {"zh": "工具"}},
                    "plugins": self.plugins,
                },
                {},
                {},
                limit=20,
            )


if __name__ == "__main__":
    unittest.main()
