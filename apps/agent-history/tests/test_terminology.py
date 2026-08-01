from __future__ import annotations

import json
import unittest
from pathlib import Path

from terminology import normalize_changelog_record, normalize_terminology


class TerminologyTests(unittest.TestCase):
    def test_normalizes_fixed_agent_terms(self) -> None:
        value = "Edit 工具发起工具调用，子 Agent 读取技能、插件和运行时 System Prompt，检查工具Schema。"
        self.assertEqual(
            normalize_terminology(value),
            "Edit Tool 发起 Tool Call，Subagent 读取 Skill、Plugin 和 Runtime Prompt，检查 Tool Schema。",
        )

    def test_distinguishes_agent_proxy_thread_and_session_terms(self) -> None:
        value = "网络代理绕过影响代理网络；子代理恢复会话后启动 Bash 会话。"
        self.assertEqual(
            normalize_terminology(value),
            "Network Proxy Bypass 影响 Proxy Network；Subagent 恢复 Thread 后启动 Bash Session。",
        )

    def test_only_normalizes_user_facing_changelog_fields(self) -> None:
        value = {
            "agent": "subagent-proxy",
            "model": "模型-1",
            "summary": "工作区与上下文变化",
            "highlights": ["新增沙箱钩子"],
        }
        self.assertEqual(
            normalize_changelog_record(value),
            {
                "agent": "subagent-proxy",
                "model": "模型-1",
                "summary": "Workspace 与 Context 变化",
                "highlights": ["新增 Sandbox Hook"],
            },
        )

    def test_existing_changelog_archive_is_normalized(self) -> None:
        root = Path(__file__).resolve().parents[1] / "analysis" / "changelogs"
        for path in root.rglob("*.json"):
            value = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(value, normalize_changelog_record(value), str(path))


if __name__ == "__main__":
    unittest.main()
