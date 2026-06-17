from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS_ROOT = ROOT / "site" / "src" / "content" / "docs"
OUTPUT = ROOT / "generated" / "site-index.json"


FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
HTML_TAG_RE = re.compile(r"<[^>]+>")
CODE_BLOCK_RE = re.compile(r"```.*?```", re.DOTALL)


def parse_frontmatter(markdown: str) -> dict[str, str]:
    match = FRONTMATTER_RE.match(markdown)
    if not match:
        return {}

    result: dict[str, str] = {}
    for raw_line in match.group(1).splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        result[key.strip()] = value.strip().strip("\"'")
    return result


def body_text(markdown: str) -> str:
    without_frontmatter = FRONTMATTER_RE.sub("", markdown, count=1)
    without_code = CODE_BLOCK_RE.sub("", without_frontmatter)
    without_tags = HTML_TAG_RE.sub("", without_code)
    return without_tags


def count_cjk(text: str) -> int:
    return sum(1 for char in text if "\u4e00" <= char <= "\u9fff")


def page_slug(path: Path) -> str:
    relative = path.relative_to(DOCS_ROOT)
    if relative.name.startswith("index."):
        parent = relative.parent.as_posix()
        return "/" if parent == "." else f"/{parent}/"
    return f"/{relative.with_suffix('').as_posix()}/"


def collect_pages() -> list[dict[str, str]]:
    pages: list[dict[str, str]] = []
    for path in sorted(DOCS_ROOT.rglob("*")):
        if path.suffix not in {".md", ".mdx"}:
            continue
        text = path.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(text)
        body = body_text(text)
        pages.append(
            {
                "slug": page_slug(path),
                "title": frontmatter.get("title", path.stem),
                "description": frontmatter.get("description", ""),
                "source": path.relative_to(ROOT).as_posix(),
                "body_chars": len(body.strip()),
                "cjk_chars": count_cjk(body),
            }
        )
    return pages


def main() -> int:
    agents = json.loads((ROOT / "data" / "agents.json").read_text(encoding="utf-8"))
    pages = collect_pages()
    payload = {
        "schema_version": 1,
        "site": {
            "framework": "Astro Starlight",
            "base": "/agentlab",
        },
        "counts": {
            "agents": len(agents),
            "pages": len(pages),
            "body_chars": sum(page["body_chars"] for page in pages),
            "cjk_chars": sum(page["cjk_chars"] for page in pages),
        },
        "agents": [
            {
                "slug": agent["slug"],
                "display_name": agent["display_name"],
                "category": agent["category"],
                "priority": agent["priority"],
            }
            for agent in agents
        ],
        "pages": pages,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
