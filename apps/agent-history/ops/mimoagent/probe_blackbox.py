"""Exercise pinned adapters with synthetic events, never a real CLI or model."""

import argparse
import asyncio
import importlib.util
import json
import subprocess
import sys
import tempfile
import types
from pathlib import Path

REVISION = "467f0a19016f0ac4d63b8d17a1f0da9ba07f232c"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_tree", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    revision = subprocess.check_output(
        ["git", "-C", str(args.source_tree), "rev-parse", "HEAD"], text=True
    ).strip()
    assert revision == REVISION
    sys.path.insert(0, str(args.source_tree / "src"))
    from mimoagent.agents.blackbox.codex import CodexAgent
    from mimoagent.run.utils.save import save_traj

    class Model:
        config = types.SimpleNamespace(
            model_name="research-model",
            model_kwargs={"base_url": "https://example.invalid", "api_key": "synthetic-key"},
        )
        n_calls = 0
        token_stats = types.SimpleNamespace(
            input_tokens=0, output_tokens=0, cache_read_tokens=0,
            cache_creation_tokens=0, total_tokens=0,
        )
        query_calls = 0

        def query(self, *args, **kwargs):
            self.query_calls += 1
            raise AssertionError("Blackbox adapter must not call the native model loop")

        def get_template_vars(self):
            return {}

    events = [
        {"type": "item.completed", "item": {"type": "command_execution", "command": "echo fixture"}},
        {"type": "item.completed", "item": {"type": "agent_message", "text": "fixture reply"}},
        {"type": "turn.completed", "usage": {"input_tokens": 10, "output_tokens": 2}},
    ]
    raw = "\n".join(json.dumps(event) for event in events)

    class Environment:
        config = types.SimpleNamespace(cwd="/testbed")

        def __init__(self):
            self.commands = []
            self.files = {}

        def execute(self, command, **kwargs):
            self.commands.append(command)
            return {"returncode": 0, "output": raw if command.startswith("tail -c") else ""}

        def execute_detached(self, command, **kwargs):
            self.commands.append(command)
            return {"returncode": 0, "output": "", "reason": "ok"}

        def copy_to(self, source, target, **kwargs):
            self.files[target] = Path(source).read_text()

    model, env = Model(), Environment()
    agent = CodexAgent(model, env, skip_install=True)
    for task in ["synthetic first turn", "synthetic follow-up"]:
        assert agent.run(task) == ("Completed", "fixture reply")
    assert model.query_calls == 0
    assert any("exec resume --last" in command for command in env.commands)
    with tempfile.TemporaryDirectory() as directory:
        trajectory = Path(directory) / "traj.json"
        save_traj(agent, trajectory, print_path=False)
        saved = json.loads(trajectory.read_text())["trajs"]["main"]
    assert len(saved["messages"]) == 4
    assert "tools" not in saved
    assert not any(message.get("tool_calls") for message in saved["messages"])

    # Import the SDK runner with only its return-value type replaced.
    sdk_types = types.ModuleType("claude_agent_sdk.types")
    sdk_types.PermissionResultAllow = lambda **kwargs: types.SimpleNamespace(**kwargs)
    sys.modules["claude_agent_sdk.types"] = sdk_types
    runner_path = args.source_tree / "src/mimoagent/agents/blackbox/resources/run_claude_sdk.py"
    spec = importlib.util.spec_from_file_location("mimo_sdk_runner", runner_path)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    decision = asyncio.run(runner.auto_permission_handler(
        "AskUserQuestion",
        {"questions": [{"question": "Which approach?", "options": [{"label": "First"}, {"label": "Second"}]}]},
        None,
    ))
    assert decision.updated_input["answers"] == {"Which approach?": "First"}
    result = {
        "revision": revision,
        "evidenceClass": "local-synthetic-contract-probe",
        "realCliExecuted": False,
        "realModelCalled": False,
        "codex": {
            "turns": 2,
            "nativeModelQueryCalls": model.query_calls,
            "resumeCommandObserved": True,
            "syntheticCommandEventInInput": True,
            "unifiedTrajectoryMessageRoles": [message["role"] for message in saved["messages"]],
            "unifiedTrajectoryHasTools": "tools" in saved,
            "unifiedTrajectoryHasToolCalls": False,
        },
        "claudeQuestion": {"selected": decision.updated_input["answers"], "sdkTypeStubbed": True},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
