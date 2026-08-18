const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const skillPath = path.resolve(
  __dirname,
  "../../../.codex/skills/agentlab-release-ops/SKILL.md",
);
const skill = fs.readFileSync(skillPath, "utf8");

test("release ops skill preserves the production analysis and deploy gates", () => {
  for (const required of [
    "com.dairui.agentlab.agent-history",
    "lsof",
    "git pull --ff-only",
    "scripts/daily_update.py --deploy",
    "scripts/analyze_changelogs.py",
    "--fair-agents",
    "--max-releases 20",
    "--batch-size 1",
    "--dry-run",
    "0 model-stale",
    "0 deterministic no-signal",
    "0 selected",
    "gpt-5.6-luna",
    "scripts/verify_deploy.py",
    "claude-code-history.lyclyc17.workers.dev",
    "agentlab.dairui1.com",
  ]) {
    assert.match(skill, new RegExp(required.replaceAll(".", "\\.")));
  }
});

test("release ops skill forbids destructive or incomplete success claims", () => {
  assert.match(skill, /不回滚或覆盖用户改动/);
  assert.match(skill, /禁止 force push/);
  assert.match(skill, /不能被 HTTP 200 掩盖/);
  assert.match(skill, /AI 分析未完成/);
  assert.match(skill, /确定性 no-signal.*不等同于.*fallback/);
});
