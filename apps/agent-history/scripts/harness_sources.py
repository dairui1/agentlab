"""Bounded, immutable source files for inspecting newly public harnesses."""

import hashlib
import re


SOURCE_PROFILES = {
    "minimax-code-cli": [
        ("License", "MIT License", "LICENSE"),
        ("Prompt", "Mavis System Prompt", "packages/local-runtime-v2/assets/agents/mavis/system-prompt.md.hbs"),
        ("Prompt", "Coding 模式", "packages/local-runtime-v2/assets/agents/mavis/modes/coding/online/SYSTEM.md.hbs"),
        ("Prompt", "子任务委派", "packages/local-runtime-v2/assets/agents/mavis/features/delegation.md.hbs"),
        ("Tools", "工具导出", "packages/agent-tools/src/index.ts"),
        ("Tools", "Task 工具实现", "packages/agent-tools/src/desktop/local-task.ts"),
        ("Harness", "Turn Runner", "packages/local-runtime-v2/src/service/turn-system/agent-host/runner/local-agent-turn-runner.ts"),
        ("Harness", "工具目录装配", "packages/local-runtime-v2/src/service/turn-system/agent-host/assembly/local-turn-tool-catalog.ts"),
        ("Harness", "权限引擎", "packages/agent-modules/permission/src/engine.ts"),
        ("Harness", "Context 压缩", "packages/local-runtime-v2/src/service/turn-system/agent-host/compaction/context-compaction.ts"),
    ],
    "zcode": [
        ("License", "Apache-2.0 License", "LICENSE"),
        ("Prompt", "Subagent System Prompt", "apps/zcode-cli/packages/core/src/subagent/system-prompt.ts"),
        ("Prompt", "Context 压缩 Prompt", "apps/zcode-cli/packages/core/src/compact/prompt.ts"),
        ("Tools", "Bash 工具契约", "apps/zcode-cli/packages/contracts/src/tools/bash.ts"),
        ("Tools", "ReadSession Context 契约", "apps/zcode-cli/packages/contracts/src/tools/read-session-context.ts"),
        ("Harness", "Turn State Machine", "apps/zcode-cli/packages/core/src/agent/turn-machine.ts"),
        ("Harness", "权限服务", "apps/zcode-cli/packages/core/src/permission/service.ts"),
    ],
}


def collect_source_snapshot(agent, index, cache, *, timeout, allow_stale_on_error):
    profile = SOURCE_PROFILES[agent]
    # Normalized releases preserve version order. Only refresh the newest tree;
    # this is a source baseline, never an invented release-to-release diff.
    release = list(index["releases"].values())[-1]
    commit = release.get("commitSha")
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError(f"source snapshot requires an immutable commit: {agent}")
    repository = index["repository"]
    files = []
    for group, label, path in profile:
        url = f"https://raw.githubusercontent.com/{repository}/{commit}/{path}"
        response = cache.fetch(
            url, accept="text/plain", max_bytes=256 * 1024,
            timeout=timeout, allow_stale_on_error=allow_stale_on_error,
        )
        content = response.body.decode("utf-8")
        files.append({
            "group": group, "label": label, "path": path,
            "url": f"https://github.com/{repository}/blob/{commit}/{path}",
            "sha256": hashlib.sha256(response.body).hexdigest(),
            "content": content,
        })
    return {
        "agent": agent, "version": release["version"], "commit": commit,
        "repository": repository, "kind": "static-source-baseline", "files": files,
    }
