"""Bounded, immutable source files for inspecting newly public harnesses."""

import hashlib
import re


SOURCE_PROFILES = {
    "gemini-cli": [
        ("License", "Apache-2.0 License", "LICENSE"),
        ("Prompt", "System Prompt 组装", "packages/core/src/prompts/promptProvider.ts"),
        ("Prompt", "现代模型 Prompt 片段", "packages/core/src/prompts/snippets.ts"),
        ("Prompt", "兼容模型 Prompt 片段", "packages/core/src/prompts/snippets.legacy.ts"),
        ("Tools", "工具接口与执行契约", "packages/core/src/tools/tools.ts"),
        ("Tools", "工具注册与模型声明", "packages/core/src/tools/tool-registry.ts"),
        ("Tools", "Shell 工具实现", "packages/core/src/tools/shell.ts"),
        ("Harness", "Turn 管理与模型交互", "packages/core/src/core/client.ts"),
        ("Harness", "工具调度", "packages/core/src/scheduler/scheduler.ts"),
        ("Harness", "权限策略引擎", "packages/core/src/policy/policy-engine.ts"),
        ("Harness", "Sandbox 策略管理", "packages/core/src/policy/sandboxPolicyManager.ts"),
        ("Harness", "Context 压缩", "packages/core/src/context/chatCompressionService.ts"),
    ],
    "swe-agent": [
        ("License", "MIT License", "LICENSE"),
        ("Prompt", "默认任务与复核 Prompt", "config/default.yaml"),
        ("Tools", "工具命令契约", "sweagent/tools/commands.py"),
        ("Tools", "工具配置与执行", "sweagent/tools/tools.py"),
        ("Tools", "Action 解析", "sweagent/tools/parsing.py"),
        ("Tools", "文件编辑工具声明", "tools/edit_anthropic/config.yaml"),
        ("Tools", "文件编辑工具实现", "tools/edit_anthropic/bin/str_replace_editor"),
        ("Harness", "Agent Loop 与轨迹", "sweagent/agent/agents.py"),
        ("Harness", "History 处理器", "sweagent/agent/history_processors.py"),
        ("Harness", "SWE 环境生命周期", "sweagent/environment/swe_env.py"),
    ],
    "mini-swe-agent": [
        ("License", "MIT License", "LICENSE.md"),
        ("Prompt", "默认任务 Prompt", "src/minisweagent/config/default.yaml"),
        ("Prompt", "交互 CLI Prompt", "src/minisweagent/config/mini.yaml"),
        ("Tools", "Bash Action 与 Observation 契约", "src/minisweagent/models/utils/actions_toolcall.py"),
        ("Tools", "独立本地命令执行", "src/minisweagent/environments/local.py"),
        ("Harness", "Agent Loop 与轨迹", "src/minisweagent/agents/default.py"),
        ("Harness", "交互确认与继续执行", "src/minisweagent/agents/interactive.py"),
        ("Harness", "模型调用与工具反馈", "src/minisweagent/models/litellm_model.py"),
        ("Harness", "Docker 环境生命周期", "src/minisweagent/environments/docker.py"),
    ],
    "raven": [
        ("License", "Apache-2.0 License", "LICENSE"),
        ("Prompt", "Raven-Code 工程纪律", "agents/raven-code/plugins/code-flow/prompts/CODE_DISCIPLINE.md"),
        ("Prompt", "Raven-Code 工具说明", "agents/raven-code/plugins/code-flow/prompts/TOOLS_CODE.md"),
        ("Tools", "工具注册与单轮可见性", "raven/agent/tools/registry.py"),
        ("Harness", "第三方 Agent 接入预设", "raven/agent/subagent/presets.py"),
        ("Harness", "ACP 权限应答", "raven/acp_client/permissions.py"),
        ("Harness", "DAG 执行与恢复", "raven/agent/subagent/dag_runner.py"),
        ("Harness", "Curator 候选生成与安装", "experimental/curator/workflow.py"),
        ("Harness", "Curator 校验与可选 probe", "experimental/curator/raven_adapter/validate.py"),
        ("Harness", "Curator 组合部署与回退", "experimental/curator/raven_adapter/deployment.py"),
    ],
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
