#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "pyproject.toml").exists() and (candidate / "site").exists():
            return candidate
    raise SystemExit("Could not find AgentLab repository root.")


def normalize_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return re.sub(r"-+", "-", slug)


def write_new(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        raise SystemExit(f"Refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an AgentLab research topic skeleton.")
    parser.add_argument("title", help="Human-readable research topic title.")
    parser.add_argument("--slug", help="URL/file slug, for example pi-extension-api.")
    parser.add_argument("--summary", default="todo", help="One-sentence topic summary.")
    parser.add_argument("--root", help="Repository root. Defaults to auto-detection.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing skeleton files.")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else find_repo_root()
    slug = normalize_slug(args.slug or args.title)
    if not slug:
        raise SystemExit("Slug is empty. Provide --slug with ASCII words.")

    today = date.today().isoformat()
    run_dir = root / "research" / "runs" / slug
    topic_path = root / "research" / "topics" / f"{slug}.md"
    site_path = root / "site" / "src" / "content" / "docs" / "research" / f"{slug}.md"

    state = f"""# {args.title} Research State

- Slug: `{slug}`
- Created: {today}
- Status: scoping
- Summary: {args.summary}

## Research Question

todo

## Scope

- In scope:
- Out of scope:

## Decisions

- {today}: Skeleton created.

## Current Next Step

Collect sources and update `sources.md`.
"""

    sources = f"""# {args.title} Sources

Record every source that supports the research.

## Source Log

- URL/path: todo
  - Type: official-doc | repo | package | source-code | blog | paper | observation
  - Access date: {today}
  - What it supports: todo
  - Volatility: low | medium | high
"""

    topic = f"""# {args.title}

- Slug: `{slug}`
- Created: {today}
- Summary: {args.summary}
- Site page: `site/src/content/docs/research/{slug}.md`
- Run state: `research/runs/{slug}/state.md`

## 问题定义

todo

## 来源摘要

todo

## 已确认事实

todo

## 工程推断

todo

## 设计启发

todo

## 对 AgentLab 的影响

todo

## 待验证问题

todo
"""

    site = f"""---
title: {args.title}
description: {args.summary}
---

## 研究问题

todo

## 结论摘要

todo

## 背景和来源

todo

## 机制拆解

todo

## 设计启发

todo

## 可复查清单

- 来源是否足够支撑核心结论：todo
- 是否区分事实和推断：todo
- 是否需要更新其他章节：todo

## 待验证问题

todo

## 来源

- todo
"""

    write_new(run_dir / "state.md", state, args.force)
    write_new(run_dir / "sources.md", sources, args.force)
    write_new(topic_path, topic, args.force)
    write_new(site_path, site, args.force)

    print(f"Created research skeleton for {slug}")
    print(f"- {topic_path.relative_to(root)}")
    print(f"- {site_path.relative_to(root)}")
    print(f"- {(run_dir / 'state.md').relative_to(root)}")
    print(f"- {(run_dir / 'sources.md').relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
