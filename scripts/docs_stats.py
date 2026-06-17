from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "generated" / "site-index.json"


def load_index() -> dict:
    return json.loads(INDEX.read_text(encoding="utf-8"))


def group_for_slug(slug: str) -> str:
    parts = slug.strip("/").split("/")
    return parts[0] if parts and parts[0] else "home"


def agent_pages(pages: list[dict], slug: str) -> list[dict]:
    prefix = f"/agents/{slug}"
    return [page for page in pages if page["slug"].startswith(prefix)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Report AgentLab documentation volume and coverage.")
    parser.add_argument("--min-cjk", type=int, default=0, help="Fail if total CJK character count is below this value.")
    parser.add_argument(
        "--min-agent-pages",
        type=int,
        default=0,
        help="Fail if any tracked agent has fewer than this many documentation pages.",
    )
    args = parser.parse_args()

    data = load_index()
    pages = data["pages"]
    counts = data["counts"]

    group_cjk: dict[str, int] = defaultdict(int)
    group_pages: dict[str, int] = defaultdict(int)
    for page in pages:
        group = group_for_slug(page["slug"])
        group_cjk[group] += page["cjk_chars"]
        group_pages[group] += 1

    print("AgentLab docs stats")
    print(f"- Pages: {counts['pages']}")
    print(f"- Body chars: {counts['body_chars']}")
    print(f"- CJK chars: {counts['cjk_chars']}")
    print()

    print("Groups")
    for group, cjk in sorted(group_cjk.items(), key=lambda item: item[1], reverse=True):
        print(f"- {group}: {group_pages[group]} pages, {cjk} CJK chars")
    print()

    failures: list[str] = []
    if args.min_cjk and counts["cjk_chars"] < args.min_cjk:
        failures.append(f"total CJK chars {counts['cjk_chars']} < required {args.min_cjk}")

    print("Agent coverage")
    for agent in data["agents"]:
        pages_for_agent = agent_pages(pages, agent["slug"])
        total_cjk = sum(page["cjk_chars"] for page in pages_for_agent)
        print(f"- {agent['slug']}: {len(pages_for_agent)} pages, {total_cjk} CJK chars")
        if args.min_agent_pages and len(pages_for_agent) < args.min_agent_pages:
            failures.append(f"{agent['slug']} has {len(pages_for_agent)} pages < required {args.min_agent_pages}")

    if failures:
        print()
        print("Stats check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
