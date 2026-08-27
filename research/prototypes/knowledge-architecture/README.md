# AgentLab knowledge architecture prototype

This rough prototype supports the Wayfinder decision in:

- https://github.com/dairui1/agentlab/issues/36

## What it tests

- A mechanism, rather than a project or article, is the primary retrieval entry.
- The first screen explains the mechanism in a few sentences and one concrete example.
- A single example carries the reader from round 1 through round N.
- Cross-product comparison uses the same task and completion conditions.
- Architecture, source evidence, experiments, and research history sit behind the explanation instead of competing with it.
- The default view shows a small set of keyframes; readers can drill down from a keyframe to step details and then to the complete raw trajectory.

## Evidence boundary

The trajectory text in this prototype is illustrative UI copy. It is not an observed Claude Code or Codex run and must not be published as research evidence.

The implementation prototype for the explanation layer must replace it with matched real trajectories captured from:

- the same prompt;
- the same repository revision and initial worktree;
- the same completion conditions;
- recorded product, model, configuration, permission, and environment versions.

Every visual transition must link back to the underlying trajectory event, tool call, file change, test result, or state checkpoint. The full trajectory remains available on demand but is not exposed by default.

## Files

- `goal-mode-example-fragment.html`: interactive conversation prototype source.
- `goal-mode-example-desktop.png`: desktop initial state.
- `goal-mode-example-mobile.png`: mobile initial state.
