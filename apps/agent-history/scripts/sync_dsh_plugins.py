#!/usr/bin/env python3
"""Build reproducible DeepSeek Harness plugin leaderboards from awesome-dsh-plugin."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence


APP_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_URL = "https://awesome-dsh-plugin.com/plugins.json"
STARS_URL = "https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/data/stars.json"
DOWNLOADS_URL = "https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/data/downloads.json"
SOURCE_REPOSITORY = "https://github.com/awesome-dsh-plugin/awesome-dsh-plugin"
DEFAULT_OUTPUT = APP_ROOT / "public/data/deepseek-harness/plugins.json"


class PluginSyncError(RuntimeError):
    """Raised when an upstream payload cannot produce trustworthy rankings."""


def fetch_json(url: str, *, timeout: float = 30.0) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "AgentLab-DSH-plugin-tracker/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        raise PluginSyncError(f"cannot read {url}: {error}") from error


def checked_at(values: Mapping[str, Any]) -> str | None:
    dates = [
        item.get("checkedAt")
        for item in values.values()
        if isinstance(item, Mapping) and isinstance(item.get("checkedAt"), str)
    ]
    return max(dates) if dates else None


def compact_plugin(plugin: Mapping[str, Any], *, metric: str, rank: int) -> dict[str, Any]:
    description = plugin.get("description")
    if not isinstance(description, Mapping):
        description = {}
    return {
        "rank": rank,
        "name": plugin["name"],
        "owner": plugin.get("owner"),
        "url": plugin["url"],
        "page": plugin.get("page"),
        "category": plugin["category"],
        "description": {
            "zh": description.get("zh") or description.get("en") or "",
            "en": description.get("en") or "",
        },
        "stars": plugin.get("stars"),
        "downloads": plugin.get("downloads"),
        "added": plugin.get("added"),
        "install": plugin.get("install"),
        "metric": metric,
        "metricValue": plugin[metric],
    }


def ranked_plugins(plugins: Sequence[Mapping[str, Any]], metric: str, limit: int) -> list[dict[str, Any]]:
    eligible = [
        plugin
        for plugin in plugins
        if isinstance(plugin.get(metric), int)
        and not isinstance(plugin.get(metric), bool)
        and isinstance(plugin.get("name"), str)
        and isinstance(plugin.get("url"), str)
        and isinstance(plugin.get("category"), str)
    ]
    eligible.sort(
        key=lambda plugin: (
            -plugin[metric],
            -int(plugin.get("stars") or 0),
            plugin["name"].casefold(),
        )
    )
    return [
        compact_plugin(plugin, metric=metric, rank=index)
        for index, plugin in enumerate(eligible[:limit], start=1)
    ]


def build_payload(
    registry: Mapping[str, Any],
    stars: Mapping[str, Any],
    downloads: Mapping[str, Any],
    *,
    limit: int = 20,
    generated_at: str | None = None,
) -> dict[str, Any]:
    plugins = registry.get("plugins")
    categories = registry.get("categories")
    if not isinstance(plugins, list) or not plugins:
        raise PluginSyncError("awesome-dsh-plugin registry has no plugins")
    if not isinstance(categories, Mapping):
        raise PluginSyncError("awesome-dsh-plugin registry has no category map")
    declared_count = registry.get("count")
    if declared_count != len(plugins):
        raise PluginSyncError(
            f"registry count mismatch: declared {declared_count!r}, received {len(plugins)}"
        )
    top = ranked_plugins(plugins, "stars", limit)
    trending = ranked_plugins(plugins, "downloads", limit)
    if len(top) != limit or len(trending) != limit:
        raise PluginSyncError(f"registry cannot fill both {limit}-item leaderboards")
    category_labels = {
        key: (value.get("zh") or value.get("en") or key)
        for key, value in categories.items()
        if isinstance(key, str) and isinstance(value, Mapping)
    }
    return {
        "schemaVersion": 1,
        "generatedAt": generated_at or datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": registry.get("name") or "awesome-dsh-plugin",
            "repository": SOURCE_REPOSITORY,
            "registry": REGISTRY_URL,
            "catalogUpdated": registry.get("updated"),
            "starsCheckedAt": checked_at(stars),
            "downloadsCheckedAt": checked_at(downloads),
        },
        "catalog": {
            "pluginCount": len(plugins),
            "categoryCount": len(categories),
            "categories": category_labels,
        },
        "leaderboards": {
            "top": {
                "label": "Top 20",
                "method": "awesome-dsh-plugin 收录项按 GitHub 仓库 Stars 降序；子目录插件继承所在仓库 Stars。",
                "metric": "stars",
                "items": top,
            },
            "trending": {
                "label": "Trending",
                "method": "按上游探针记录的 npm 最近 30 天下载量降序；没有 npm 下载数据的插件不参与。",
                "metric": "downloads",
                "windowDays": 30,
                "items": trending,
            },
        },
    }


def write_json_atomic(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def sync(output: Path, *, timeout: float, limit: int, allow_stale_on_error: bool) -> bool:
    try:
        registry = fetch_json(REGISTRY_URL, timeout=timeout)
        stars = fetch_json(STARS_URL, timeout=timeout)
        downloads = fetch_json(DOWNLOADS_URL, timeout=timeout)
        if not all(isinstance(value, Mapping) for value in (registry, stars, downloads)):
            raise PluginSyncError("one or more upstream payloads are not JSON objects")
        payload = build_payload(registry, stars, downloads, limit=limit)
        write_json_atomic(output, payload)
        return True
    except PluginSyncError:
        if allow_stale_on_error and output.is_file():
            return False
        raise


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--allow-stale-on-error", action="store_true")
    args = parser.parse_args(argv)
    if args.limit < 1 or args.timeout <= 0:
        parser.error("--limit and --timeout must be positive")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    fresh = sync(
        args.output.expanduser().resolve(),
        timeout=args.timeout,
        limit=args.limit,
        allow_stale_on_error=args.allow_stale_on_error,
    )
    status = "refreshed" if fresh else "retained stale snapshot"
    print(f"DSH plugin leaderboards {status}: {args.output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PluginSyncError as error:
        raise SystemExit(f"DSH plugin sync failed: {error}") from error
