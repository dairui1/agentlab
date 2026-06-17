from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REQUIRED_AGENT_FIELDS = {
    "slug",
    "display_name",
    "aliases",
    "owner",
    "category",
    "status",
    "priority",
    "architecture_path",
    "prompt_index_path",
    "official_sources",
    "research_questions",
}


class CatalogError(ValueError):
    """Raised when catalog data is missing or malformed."""


def find_repo_root(start: Path | None = None) -> Path:
    """Find the repository root from the current working directory."""

    current = (start or Path.cwd()).resolve()
    candidates = [current, *current.parents]
    for candidate in candidates:
        if (candidate / "pyproject.toml").exists() and (candidate / "data" / "agents.json").exists():
            return candidate

    package_root = Path(__file__).resolve().parents[2]
    if (package_root / "data" / "agents.json").exists():
        return package_root

    raise CatalogError("Could not find an AgentLab repository root.")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CatalogError(f"Missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CatalogError(f"Invalid JSON in {path}: {exc}") from exc


def load_agents(root: Path | None = None) -> list[dict[str, Any]]:
    repo_root = root or find_repo_root()
    data = load_json(repo_root / "data" / "agents.json")
    if not isinstance(data, list):
        raise CatalogError("data/agents.json must contain a list.")
    return data


def load_prompt_sources(root: Path | None = None) -> dict[str, Any]:
    repo_root = root or find_repo_root()
    data = load_json(repo_root / "data" / "prompt_sources.json")
    if not isinstance(data, dict):
        raise CatalogError("data/prompt_sources.json must contain an object.")
    return data


def get_agent(slug_or_alias: str, root: Path | None = None) -> dict[str, Any]:
    needle = slug_or_alias.lower()
    for agent in load_agents(root):
        aliases = [alias.lower() for alias in agent.get("aliases", [])]
        if agent.get("slug", "").lower() == needle or needle in aliases:
            return agent
    raise CatalogError(f"Unknown agent: {slug_or_alias}")


def validate_catalog(root: Path | None = None) -> list[str]:
    repo_root = root or find_repo_root()
    errors: list[str] = []

    try:
        agents = load_agents(repo_root)
    except CatalogError as exc:
        return [str(exc)]

    seen_slugs: set[str] = set()
    for index, agent in enumerate(agents):
        if not isinstance(agent, dict):
            errors.append(f"agents[{index}] must be an object.")
            continue

        missing = REQUIRED_AGENT_FIELDS - set(agent)
        if missing:
            errors.append(f"{agent.get('slug', f'agents[{index}]')} missing fields: {', '.join(sorted(missing))}")

        slug = agent.get("slug")
        if not isinstance(slug, str) or not slug:
            errors.append(f"agents[{index}] has an invalid slug.")
            continue
        if slug in seen_slugs:
            errors.append(f"Duplicate agent slug: {slug}")
        seen_slugs.add(slug)

        for list_field in ("aliases", "official_sources", "research_questions"):
            if list_field in agent and not isinstance(agent[list_field], list):
                errors.append(f"{slug}.{list_field} must be a list.")

        for path_field in ("architecture_path", "prompt_index_path"):
            value = agent.get(path_field)
            if isinstance(value, str):
                path = repo_root / value
                if not path.exists():
                    errors.append(f"{slug}.{path_field} does not exist: {value}")
            else:
                errors.append(f"{slug}.{path_field} must be a path string.")

    try:
        prompt_sources = load_prompt_sources(repo_root)
    except CatalogError as exc:
        errors.append(str(exc))
        return errors

    source_agents = prompt_sources.get("agents")
    if not isinstance(source_agents, dict):
        errors.append("prompt_sources.agents must be an object.")
        return errors

    for slug in seen_slugs:
        if slug not in source_agents:
            errors.append(f"Missing prompt source config for {slug}.")
            continue
        config = source_agents[slug]
        if not isinstance(config, dict):
            errors.append(f"prompt_sources.agents.{slug} must be an object.")
            continue
        for path_field in ("snapshot_dir", "changelog"):
            value = config.get(path_field)
            if not isinstance(value, str):
                errors.append(f"prompt_sources.agents.{slug}.{path_field} must be a path string.")
                continue
            if not (repo_root / value).exists():
                errors.append(f"prompt_sources.agents.{slug}.{path_field} does not exist: {value}")

    return errors
