from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
from textwrap import dedent

from .catalog import CatalogError, find_repo_root, get_agent, load_agents, load_prompt_sources, validate_catalog


def _repo_root_arg(value: str | None) -> Path:
    return Path(value).resolve() if value else find_repo_root()


def command_list(args: argparse.Namespace) -> int:
    root = _repo_root_arg(args.root)
    agents = load_agents(root)
    width = max(len(agent["slug"]) for agent in agents)
    for agent in agents:
        print(f"{agent['slug']:<{width}}  {agent['display_name']}  [{agent['category']}]")
    return 0


def command_show(args: argparse.Namespace) -> int:
    root = _repo_root_arg(args.root)
    agent = get_agent(args.agent, root)
    print(f"{agent['display_name']} ({agent['slug']})")
    print(f"Owner: {agent['owner']}")
    print(f"Category: {agent['category']}")
    print(f"Status: {agent['status']}")
    print(f"Architecture: {agent['architecture_path']}")
    print(f"Prompts: {agent['prompt_index_path']}")
    if agent["research_questions"]:
        print("\nResearch questions:")
        for item in agent["research_questions"]:
            print(f"- {item}")
    return 0


def command_validate(args: argparse.Namespace) -> int:
    root = _repo_root_arg(args.root)
    errors = validate_catalog(root)
    if errors:
        print("Catalog validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Catalog validation passed.")
    return 0


def command_new_snapshot(args: argparse.Namespace) -> int:
    root = _repo_root_arg(args.root)
    agent = get_agent(args.agent, root)
    prompt_sources = load_prompt_sources(root)
    config = prompt_sources["agents"][agent["slug"]]
    snapshot_dir = root / config["snapshot_dir"]
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    safe_version = args.version.replace("/", "-").replace(" ", "-")
    target = snapshot_dir / f"{safe_version}.md"
    if target.exists() and not args.force:
        raise CatalogError(f"Snapshot already exists: {target}")

    today = date.today().isoformat()
    source_url = args.source_url or "todo"
    content = dedent(
        f"""\
        # {agent["display_name"]} Prompt Snapshot: {args.version}

        - Agent: {agent["display_name"]}
        - Version: {args.version}
        - Source URL: {source_url}
        - Access date: {today}
        - Evidence level: todo
        - Capture method: todo

        ## Scope

        Describe which prompt, tool instruction, or behavioral contract this snapshot covers.

        ## Snapshot

        ```text
        Paste allowed prompt content here.
        ```

        ## Notes

        - Omit secrets, credentials, private account data, and unauthorized leaked material.
        - Add a short summary to `{config["changelog"]}` after saving this snapshot.
        """
    )
    target.write_text(content, encoding="utf-8")
    print(f"Created {target.relative_to(root)}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AgentLab research tooling")
    parser.add_argument("--root", help="Path to the AgentLab repository root")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="List tracked agents")
    list_parser.set_defaults(func=command_list)

    show_parser = subparsers.add_parser("show", help="Show one agent")
    show_parser.add_argument("agent", help="Agent slug or alias")
    show_parser.set_defaults(func=command_show)

    validate_parser = subparsers.add_parser("validate", help="Validate research catalog")
    validate_parser.set_defaults(func=command_validate)

    snapshot_parser = subparsers.add_parser("new-snapshot", help="Create a prompt snapshot template")
    snapshot_parser.add_argument("agent", help="Agent slug or alias")
    snapshot_parser.add_argument("version", help="Version label or date")
    snapshot_parser.add_argument("--source-url", help="Source URL for the snapshot")
    snapshot_parser.add_argument("--force", action="store_true", help="Overwrite an existing snapshot")
    snapshot_parser.set_defaults(func=command_new_snapshot)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except CatalogError as exc:
        print(f"Error: {exc}")
        return 1
