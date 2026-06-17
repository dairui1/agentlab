from pathlib import Path
import unittest

from agentlab.catalog import get_agent, load_agents, validate_catalog


ROOT = Path(__file__).resolve().parents[1]


class CatalogTests(unittest.TestCase):
    def test_catalog_is_valid(self) -> None:
        self.assertEqual(validate_catalog(ROOT), [])

    def test_agents_are_loadable(self) -> None:
        agents = load_agents(ROOT)
        self.assertGreaterEqual(len(agents), 4)

    def test_alias_lookup(self) -> None:
        agent = get_agent("cc", ROOT)
        self.assertEqual(agent["slug"], "claude-code")


if __name__ == "__main__":
    unittest.main()
