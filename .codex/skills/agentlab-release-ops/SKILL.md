---
name: agentlab-release-ops
description: 检查、恢复并验收 AgentLab 的每日 Agent 更新流水线。适用于核查 launchd/Codex 定时任务、上游与官方来源同步、AI 分析队列、测试构建、Wrangler 发布和线上 manifest 新鲜度，或在漏跑、失败、积压和线上落后时安全恢复发布。
---

# AgentLab 发布运维

这个 skill 操作 AgentLab 源码仓库，不是线上 feed 查询器。它负责回答四个问题：今天的流水线是否真的跑完、是否发现了全部新版本、必需的 AI 分析是否完成、线上数据是否与本地构建完全一致。

不要用 HTTP 200 代替这些检查，也不要用当前对话的概括代替 `analyze_changelogs.py`。发布成功而 AI 队列未清空时，状态仍是“AI 分析未完成”。

## 适用边界

- 默认仓库为当前 Git 工作区；无法从当前目录解析 AgentLab 根目录时，要求用户提供 checkout 路径。
- `launchd` 检查只适用于 macOS。其他系统仍可执行同步、分析、测试、构建、部署和线上验收，但必须明确写明“未检查 launchd”。
- 生产应用目录是 `apps/agent-history`。
- 生产 launchd label 是 `com.dairui.agentlab.agent-history`。
- 生产发布必须使用完整 Agent 集合，禁止用 focused run 部署 canonical data。

初始化路径：

```sh
REPO_ROOT="$(git rev-parse --show-toplevel)"
APP_ROOT="$REPO_ROOT/apps/agent-history"
cd "$REPO_ROOT"
```

## 不可破坏的规则

1. 不回滚或覆盖用户改动，不使用 `git reset --hard`、`git checkout --` 或 force push。
2. 不绕过测试、构建、部署数据验证或 AI 分析门禁。
3. 不提交缓存、研究 clone、构建产物、日志、凭据或临时文件。
4. 对明显属于本次发布或自动化修复的一组完整改动，可以补测试、修复、commit 并正常 push；来源不明且无关的改动保留不动。
5. 只有实际进程或文件锁被持有才算流水线运行中。遗留的 lock 文件本身不构成占锁证据。
6. 一次正常恢复后仍有异常积压时停止循环，保留 `--max-releases` 限流并报告具体版本。

## 第一阶段：仓库与并发检查

先记录状态，不要先 pull：

```sh
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count HEAD...origin/main
git ls-remote origin refs/heads/main
```

逐项审查 `git status`。受管文件存在来源不明的改动时，只做不会改写这些文件的检查；无关的 untracked 文件不应无限期阻断 `apps/agent-history` 流水线。

检查进程和真实锁占用：

```sh
ps -axo pid=,ppid=,command= | rg '[d]aily_update\.py|[a]nalyze_changelogs\.py' || true
lsof "$APP_ROOT/.cache/daily-update.lock" 2>/dev/null || true
```

若流水线或 analyzer 仍在运行，等待现有流水线完成，不启动第二条。

## 第二阶段：定时任务与日志

macOS 上执行：

```sh
launchctl print "gui/$(id -u)/com.dairui.agentlab.agent-history"
tail -n 160 "$HOME/Library/Logs/agentlab-agent-history.log"
tail -n 160 "$HOME/Library/Logs/agentlab-agent-history.error.log"
```

确认当天 08:37 的运行记录、`last exit code`、最终完成时间，以及真正的生产 analyzer 摘要。测试夹具会故意打印 `failed`、`deferred` 和 `deterministic fallback`，不要把单元测试中的模拟日志误判为生产流水线失败；以 `daily_update.py` 各阶段时间线和 analyzer 阶段前后的顶层日志为准。

需要核对本机安装内容时：

```sh
plutil -p "$HOME/Library/LaunchAgents/com.dairui.agentlab.agent-history.plist"
```

仓库内的安装入口是：

```sh
cd "$APP_ROOT"
python3 ops/install_launchd.py --dry-run
```

不要在普通验收中重新安装 launchd；仅在 plist 缺失、路径失效或配置明确漂移时修复安装。

## 第三阶段：上游、官方来源与线上状态

Phistory 不能作为有源码 Agent 的唯一来源。流水线还必须检查 Codex、Claude Code 以及每个已登记开源 Agent 的官方 release、tag、commit 和有界代码差异。

对比 Phistory：

```sh
git -C "$APP_ROOT/.cache/phistory/upstream" rev-parse HEAD
git ls-remote https://github.com/WEIFENG2333/phistory.git refs/heads/main
```

读取本地 manifest，重点检查：

```sh
jq '{generatedAt, upstream, officialSources, agents: [.agents[] | {id, latestVersion}]}' \
  "$APP_ROOT/dist/data/manifest.json"
```

`officialSources.status` 必须为 `fresh`、`syncStatus` 必须为 `current`、`warningCount` 必须为 `0`，且不能有 retained agent。任何 stale cache、抓取失败、normalize failure 或 code-compare degradation 都不能被 HTTP 200 掩盖。

使用 cache-busting 请求对比两个生产域与本地文件：

```sh
for url in \
  https://claude-code-history.lyclyc17.workers.dev/data/manifest.json \
  https://agentlab.dairui1.com/data/manifest.json
do
  curl -fsS "$url?cb=$(date +%s%N)" | shasum -a 256
done
shasum -a 256 "$APP_ROOT/dist/data/manifest.json"
```

三个 SHA-256 必须完全一致。还要比较 `generatedAt`、各 Agent 的 `latestVersion` 和官方来源健康状态，而不是只比较响应码。

## 第四阶段：只读 AI 队列门禁

始终运行这一条，不要自行简化参数：

```sh
cd "$APP_ROOT"
python3 scripts/analyze_changelogs.py \
  --analysis-root analysis \
  --agents all \
  --newest-first \
  --fair-agents \
  --max-releases 20 \
  --batch-size 1 \
  --dry-run
```

只有同时满足以下条件才可 no-op：

- `0 model-stale`
- `0 deterministic no-signal`
- `0 selected`
- 没有 failed 或 deferred
- Phistory、官方来源、本地 dist 和两个线上域均同步
- 当天 launchd 成功，或非 macOS 环境已有等价成功流水线凭据

## 第五阶段：恢复

出现以下任一情况就需要恢复：上游 SHA 变化、官方来源变化、新版本、`evidenceDigest` 变化、model-stale、deterministic no-signal、failed/deferred、线上 manifest 落后、当天 launchd 漏跑或失败。

先确认没有其他流水线持锁，再同步源码：

```sh
cd "$REPO_ROOT"
git fetch origin
git rev-list --left-right --count HEAD...origin/main
```

仅当当前分支是 `main`、本地没有独有提交、工作树相关文件可安全更新且本地落后时执行：

```sh
git pull --ff-only
```

随后运行唯一的完整恢复入口：

```sh
cd "$APP_ROOT"
python3 scripts/daily_update.py --deploy
```

生产 analyzer 默认使用 `gpt-5.6-luna`、每版本独立调用、严格 JSON schema、证据摘要、缓存键、重试和有界并发。不要重复分析 provenance 已匹配的版本，也不要从外层另起一套分析替代它。

## 第六阶段：恢复后验收

从顶层生产日志中记录：

- `inspected`
- `model-stale`
- `deterministic no-signal`
- `selected`
- `wrote`
- `failed`
- `deferred`
- 是否出现真正的 deterministic fallback

再次运行第四阶段的原样 `--dry-run`。仍有 model-stale、failed 或 deferred 时，结论必须是“AI 分析未完成”，列出 Agent 和版本。确定性 no-signal 是经过门禁的本地完成态，不等同于 analyzer 失败后的 fallback。

只有在以下条件全部满足后，才能确认发布成功：

1. 上游与官方来源同步且健康。
2. AI 队列为零，无 failed/deferred。
3. Python 与 Node 测试通过。
4. `npm run build` 成功。
5. `scripts/verify_deploy.py` 成功。
6. Wrangler 明确返回成功和 Version ID。
7. workers.dev、自定义域与本地 manifest 哈希一致。
8. 没有活跃流水线进程或锁。
9. 受管工作树干净，HEAD 与 `origin/main` 一致；无关用户文件单独注明。

## 代码修复与提交

如果阻断来自发布自动化、测试、配置或精确忽略规则，可以在当前 `main` 工作区直接修复。提交前必须检查：

```sh
git status --short
git diff --check
git diff --stat
git diff
```

确认无秘密、缓存、构建产物和用户无关改动后，运行完整测试，再创建范围明确的 commit 并正常 push。禁止 force push。提交后再次确认：

```sh
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

## 最终回执

回执保持简洁，但必须包含：

- 新发现的 Agent 与版本
- 每个版本是 Luna AI 分析、确定性 no-signal，还是未完成
- 是否使用 analyzer-failure fallback
- launchd 是否按时成功，是否触发恢复
- 自动化修复、commit 和 push（若有）
- 测试、构建、数据验证、Wrangler Version ID
- 两个线上域与本地 manifest 是否一致
- 剩余队列和保留的无关工作树改动

没有变化且所有门禁通过时才报告 no-op。任何一项无法确认，都要写成未知或降级，不能推断为成功。
