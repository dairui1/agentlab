# Claude Code Projects 复刻蓝图

这份文档面向准备实现类似 Projects 的工程师。目标不是复制界面上的项目分组，而是做出一套能接住新任务、把追问送回原线程、保留人类授权、在进程重启后继续工作的项目运行系统。

**研究边界：**只使用下列两个固定仓库快照建立机制索引。AgentLab 没有取得 Anthropic 服务端源码，也没有独立复现上游实验。本文的实体、状态机、数据库约束、事件协议、CAS 和模块划分均为 **AgentLab 原创实现建议**，不能反过来当作 Claude 的实际实现。

| 来源 | 固定快照 | 证据性质 |
| --- | --- | --- |
| Janriz 的 `claude-pstack` | `466ef2829b09739a2996b40256e13ccf23492180`，`spikes/project-coordinator/findings.md` | 2026-10-07 标记的作者实验报告；提交时间为 2026-10-06 UTC。包含工具调用、线程记录回读和 canary 实验，不是我们的实测。 |
| Trevor Prater 的 `dot-tool-reference` | `a7237d6a902a8bd59132883882e5dc5ca3f9e569`，`claude-projects.md` | 文档写于 2026-10-14，固定提交于 2026-10-15 UTC。模型整理的工具描述、JSON Schema 输入与少量返回值；明确区分 `observed` 和 `per description`。[来源说明][T-origin] |

阅读顺序建议是：先完成实体和事件，再实现路由与异步启动，随后接入运行环境和存储，最后做故障注入。工具目录中的 63 项是这个 coordinator 快照的 11 项内建工具、13 项 `claude-code-remote` 工具及 39 项 `hearthbot` 工具，不是所有角色和所有版本的固定总数。

## 1. 先把 Thread、Session 和 Worker 分开

用户在项目里说“修复登录问题”，产生的是项目消息；从它展开的 Thread 是可长期回来的讨论位置；Session 才是运行模型、调用工具的执行实体。Worker 是 Session 为短任务启动的助手，不应顺手变成第二个拥有项目发言权的 coordinator。这个分工同时见于作者实验与工具参考，但参考文档第 5 节是模型对自身规则的转述，不是原始 Prompt。[角色实验][P-roles]、[角色概述][T-roles]

| 实体 | 建议保存 | 必须避免的混淆 |
| --- | --- | --- |
| Project | 成员、设置版本、默认环境、仓库配置、当前 coordinator epoch | 一条长会话不等于一个项目。 |
| Message | 项目、作者、消息版本、根消息、创建时间、原始正文、附件 | 显示名不是身份；agent 转述不是用户原文。 |
| Thread | root message、标题、resolved、当前绑定 Session | 讨论关闭不等于 VM 已销毁。 |
| Session | 角色、运行代次、运行位置、运行状态、上下文快照、事件游标 | `working` 看板标签不证明进程仍活着。 |
| Worker | 父 Session、任务、工具能力、存活租约、结果 | 不隐式获得父 Session 的项目写权限。 |
| RepositoryAttachment | Project 默认配置或 Session 专属挂载、权限、clone/register 状态 | 加到本 Session 不等于保存到整个项目。 |
| Consent | 人类、设备、精确目录、操作范围、有效期、撤销版本 | “用户同意了”的普通文本不是授权记录。 |
| File / MemoryDocument | project、规范路径、内容版本、散列、作者、修改来源 | Library 文件和启动时注入的 memory 不是同一种东西。 |

以下是原创数据模型骨架；实际实现应为每个外键加项目一致性约束，所有读取都经过成员权限检查。

```ts
type Role = "coordinator" | "thread" | "worker";
type RuntimeKind = "cloud" | "device_folder" | "local_rc";
type RunState = "queued" | "provisioning" | "running" | "idle"
  | "blocked" | "disconnected" | "failed" | "terminated";
type BoardBucket = "working" | "blocked" | "review_ready" | "completed" | "failed";
interface Project {
  id: string; settingsVersion: number; coordinatorEpoch: number;
  coordinatorSessionId?: string; defaultEnvironmentId?: string;
}
interface Message {
  id: string; projectId: string; rootId: string; revision: number;
  authorKind: "user" | "agent"; authorId: string;
  body: string; createdAt: string; attachmentIds: string[];
}
interface Thread {
  id: string; projectId: string; rootMessageId: string;
  boundSessionId?: string; resolved: boolean; title: string;
}
interface Session {
  id: string; projectId: string; threadId?: string; parentId?: string;
  role: Role; generation: number; runtime: RuntimeKind; runState: RunState;
  boardBucket?: BoardBucket; workerLeaseUntil?: string;
  settingsVersion: number; contextManifestId: string; lastEventSeq: number;
}
interface SpawnOperation {
  id: string; projectId: string; threadId: string; idempotencyKey: string;
  requestHash: string; sessionId: string; attempt: number;
  state: "accepted" | "provisioning" | "ready" | "failed";
}
```

不要依赖 `cse_` 和 `session_` 前缀转换寻找 Session。pstack 在一个样本中观察到两种 ID 对应，但你的实现应保存显式映射；项目 Session 不出现在通用 Session 列表里，也不意味着不存在或无法读取。[线程 ID 样本][P-thread]、[Session 可见性实验][P-visibility]

## 2. 事件要有来源，授权要有独立记录

pstack 回读线程 transcript 看到：启动上下文、spawn wake 和 coordinator brief 是分层装配的；brief 被标为来自另一个 Claude Session，而不是来自人类，不能凭它提升权限。`message_thread` 描述则把用户原话的复制交给服务器，而不是要求模型模仿一段 XML。[上下文回读][P-envelope]、[原文转发合同][T-message]

建议用服务器生成的结构化事件作为唯一入口。模型只能提出动作，不得自己填可信作者、权限授予或路由身份。下面的字段是原创协议，不是抓到的 Anthropic wire format。

```ts
interface ProjectEvent {
  id: string; projectId: string; seq: number; receivedAt: string;
  origin: "human_ui" | "peer_session" | "scheduler" | "runtime" | "external";
  actor: { kind: "user" | "session" | "service"; id: string };
  kind: "message_created" | "message_updated" | "session_status"
    | "decision_answered" | "consent_changed" | "timer_fired";
  threadId?: string; sourceMessageId?: string; sourceMessageRevision?: number;
  correlationId: string; causationId?: string; payload: unknown;
  // Filled by the authenticated server, never by model-generated prose.
  authorizationRefs: string[];
}
interface CopiedMessage {
  messageId: string; revision: number; authorId: string;
  authorKind: "user" | "agent"; createdAt: string;
  originThreadId: string; body: string; bodySha256: string;
}
```

权限服务根据当前成员身份、动作、资源和有效 Consent 决定放行。即使一条用户消息被完整转发，它也只证明用户说过什么，不自动授予任意仓库、目录或生产权限。外部评论、仓库说明、线程报告和定时器正文都保留低信任来源。pstack 的 CLI 直达 Session 实验缺少项目作者与消息 envelope；复刻时不要把这条测试旁路做成可信授权入口。[外部直达样本][P-external]

## 3. Coordinator 路由：先定位已有工作，再决定是否新建

每个项目只允许一个持有有效 epoch 租约的 coordinator 消费队列。模型可判断意图，但线程绑定、消息归属、权限和幂等由普通代码检查。使用固定结构返回路由结果，禁止靠解析自然语言“我已经开好了”推断动作成功。

```ts
type Route =
  | { kind: "spawn"; rootMessageId: string; brief: string; title: string }
  | { kind: "forward"; threadId: string; note: string; sourceIds: string[] }
  | { kind: "answer"; text: string }
  | { kind: "ask"; question: string; options: string[] }
  | { kind: "react"; messageId: string; reaction: string }
  | { kind: "silent"; reason: string };
async function handle(event: ProjectEvent) {
  const snapshot = await readProjectSnapshot(event.projectId);
  const decision = await classify(event, snapshot); // model output, not authority
  const command = await validateRoute(decision, event, snapshot);
  await commitCommandAndOutbox(command, event.id, snapshot.coordinatorEpoch);
}
```

推荐顺序：明确回复已有 Thread 的消息直接续接；提及现有工作的追问先查绑定与最新结果；独立新任务创建 Thread；仅查询状态直接读数据回答；问候与确认使用短回复或 reaction；成员互相讨论可静默。多个独立请求可共用一条项目确认消息，但各自保持不同 root 与 Session。这个 UX 顺序来自参考文档的自述，分类策略和阈值需要你自己验证。[路由概述][T-routing]

项目聊天只展示成功落库的 `post_message`/卡片/状态事件，不把 coordinator 的内部模型文本直接渲染出来。对已有执行 Session 的 Thread，coordinator 用 `message_thread`，不冒充执行者直接往里面贴最终结果；工具参考明确描述 `post_message(thread_id)` 会拒绝这种绑定线程。[项目发言合同][T-post] pstack 也报告 coordinator 通过显式工具发言。[发言实验][P-roles]

## 4. 异步启动：回执丢了，也不能再造一个线程

`start_thread_session` 描述说调用立即返回、后台 provisioning，已有运行中 Session 时返回 `already_running`；该分支是工具描述，文档只记录普通创建返回值。复刻时需要补全超时、并发和崩溃场景，而不是把描述当成已经证明的 exactly-once 保证。[启动合同][T-spawn]

建议状态为 `accepted -> provisioning -> ready`，失败进入 `failed` 并记录原因。Session 自身再经历 `running/idle/blocked/disconnected/terminated`。Thread 的 `resolved` 是第三条独立状态轴；有最新待答问题时不自动 resolve。[状态与失联][T-status]、[关闭线程][T-resolve]

```sql
CREATE UNIQUE INDEX one_spawn_request
  ON spawn_operations(project_id, idempotency_key);
CREATE UNIQUE INDEX one_live_binding
  ON thread_bindings(project_id, thread_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX one_inbox_event
  ON session_inbox(session_id, event_id);
CREATE UNIQUE INDEX one_delivery_effect
  ON effect_receipts(project_id, task_id, action_generation, effect_key);
CREATE UNIQUE INDEX one_outbox_delivery
  ON outbox(destination, event_id);
```

以上 SQL 是所需唯一约束的示意，不是完整迁移文件。一次数据库事务里验证 root 与权限、锁定 Thread、复用现有绑定或创建新 Session、保存设置快照、写 ack、写启动 outbox。返回 `operation_id/session_id/thread_id` 后，由独立 provisioner 消费 outbox；同一 idempotency key 但不同 request hash 返回冲突，不能静默复用。

Provisioner 用 operation ID 作为运行环境幂等键；容器已建但回执丢失时先查询它，不盲目重建。消息送达使用 at-least-once 加 inbox 去重。故障恢复从 `accepted/provisioning` 扫描补投；达到重试上限后进入可见失败，保留原始任务，不宣称“已开始”。ack 和卡片同样走 outbox，避免重试时刷出两条欢迎消息。

外部副作用的 effect key 使用稳定的 `(project_id, task_id, action_generation, effect_key)`，coordinator 或 Session 更换不生成新 key；只有人类明确请求新的业务动作才推进 action generation。本地 receipt 与外部发布无法自动构成同一事务：外部已经成功、receipt 保存前崩溃时，状态进入 `outcome_unknown`。下游支持幂等 key 时用原 key 重试并核对结果；不支持时先按外部对象 ID、业务标识或审计日志对账，无法确认则等待人类决定，禁止盲目再次发布。租约和 outbox 能防重复派工，不能单独保证任意外部副作用只发生一次。

## 5. Context 装配和仓库注册

每次启动保存一份 `ContextManifest`：settingsVersion、用户原文 ID 与 revision、brief hash、memory revisions、repo revision/权限/注册路径、工具能力集、运行位置、hook 结果。恢复时才知道线程究竟读到哪一版设置，而不是只看到“当前项目设置”。

| 角色 / 时点 | 两份来源能支持的范围 | 复刻决策 |
| --- | --- | --- |
| Coordinator 初始 | 作者实验中没有仓库 CLAUDE.md、技能、agent、SessionStart hook，且无直接 shell 工具。[P 初始][P-roles] | 使用控制面工具；要读写文件则委派 Worker。 |
| Coordinator 注册仓库后 | `add_repo -> Worker clone -> register_repo_root` 后加载 CLAUDE.md、技能，最终看到 agent；SessionStart hook 未运行。[P 注册][P-register]、[P 最终][P-final] | 为 register 设计显式下一轮 context reload；不要误触发完整 session-start。 |
| Coordinator Worker | 样本在 coordinator VM 内运行 shell，没拿到项目 instructions/memory canary；后一个快照没有 hearthbot。[P Worker][P-worker]、[T Worker][T-worker] | 显式传任务所需最少上下文；后端能力检查禁止直接项目发言。 |
| Cloud Thread | 单仓库实验加载 CLAUDE.md、skills、agents、SessionStart、项目 instructions 和 memory，并有独立分支。[P Thread][P-thread] | 隔离工作目录与分支；保存初始化检查结果。 |
| Device Folder / Local RC | 工具合同区分两种执行位置，但没有给出等同 cloud 的完整 memory 注入清单。[T 本地][T-local] | 单独声明 capabilities；不要承诺自动获得 cloud 全套 memory、hooks 或环境。 |

仓库流程按 `requested -> authorized -> cloned -> registered` 推进；`add_repo` 成功才有仓库访问能力，clone 成功才允许 register，register 的路径要校验位于该 Session 允许的根目录。会话附件和项目默认仓库分别保存；`save_to_project` 扩大作用域时独立授权，不能因网页里出现一个仓库名就永久添加。[仓库合同][T-repo]、[注册合同][T-register]

设置采用不可变版本：新 Thread 读取创建时版本，已有 Session 保持原快照，显式 reload 另记事件。参考文档描述 `update_project_settings` 仅影响之后创建的子 Session，运行中 channel 不重新注入；早期 pstack 却收到手动改 instructions 的通知。这是不同日期、不同入口的观察，不能合并成“一改设置所有会话即时生效”。API 的 32 KiB 与早期 UI 的 16,000 字符也不是同一个限制。[设置合同][T-settings]、[UI 设置样本][P-setup]

## 6. 原话转发和附件：让服务器做校验

`message_thread` 的 `text` 是 coordinator 的话，最多 8000 字符；`context_message_ids` 最多 8 项，由服务器复制正文、作者、时间。目标 Thread 内或项目顶层的合格消息可复制，用户在其他 Thread 的消息要标注原线程，coordinator 自己在另一个 Thread 的帖子被拒绝。任一 ID 不合格则整次发送不发生。附件另受同项目、人类上传、私人项目等条件约束。[转发合同][T-message]

建议实现顺序：认证 caller -> 校验 target binding -> 批量读取原消息 -> 检查每项作者/项目/线程归属 -> 固定 revision 并复制 -> 校验附件 -> 单事务写 inbox 与 reopen 事件。对于已编辑消息，转发的是哪一版必须可审计；pstack 曾发生 coordinator 读取旧版、线程后来补全报告的情况，不能把一次读取等同于最终文本。[报告版本样本][P-thread]

`start_thread_session.instructions` 上限 8192 **字节**，ack/project_ack 各 1024 **字节**；中文输入必须按 UTF-8 计数，而不是 JavaScript `.length`。新 Session 自动拿到 root，额外 context IDs 不应再靠模型塞进 brief。拒绝伪造 relay 标记只是第一层，真正的作者与权限都从服务器字段取。[启动参数][T-spawn]

输出附件采用另一条管线：`file` 必须真实存在于项目文件域，`link` 检查 URL scheme，`frame` 检查项目所有权。路径应 realpath 后验证 containment，阻断 `..`、符号链接逃逸和跨项目对象引用；这些具体防护是原创实现要求，来源只描述了输出验证边界。[输出合同][T-post]

## 7. 三种运行适配器，不共用一个“本地模式”开关

```ts
interface RuntimeAdapter {
  capabilities(): { shell: boolean; deviceFiles: boolean; memoryPreload: boolean };
  provision(input: { operationId: string; manifestId: string; consentId?: string }): Promise<string>;
  inspect(runtimeId: string): Promise<{ alive: boolean; state: string }>;
  deliver(runtimeId: string, event: ProjectEvent): Promise<void>;
  terminate(runtimeId: string): Promise<void>;
}
```

Cloud 适配器负责 sandbox、仓库、分支和项目文件挂载。Folder 工具合同只明确受限目录文件访问，不提供用户本机 shell、账号和工具；两份材料没有直接确认它的全部执行宿主安排。本方案选择由云端 Thread 承载 Device Folder 适配器，经受限文件桥访问用户目录，这是原创部署选择。Local RC 的合同则明确在用户设备的指定目录运行，允许当地的 build/test/git，因此必须单独管理设备在线状态、同意与撤销。[Folder / RC 合同][T-local]

授权状态建议为 `pending -> approved | denied -> revoked`，与设备 `served/offline` 分开。RC 的 `folder` 与 `environment_id` 互斥；预授权必须匹配精确目录及运行类型。卡片被拒绝后不改用另一路径重试；撤销会终止能力和运行，并留下审计事件。参考工具返回 `pending_consent/started/running`，Folder 返回 `asked/asked_before/started`，不能把“卡片已经发出”渲染成“线程正在工作”。[设备状态][T-devices]、[RC 状态][T-rc-status]

## 8. Library 和 Memory：先解决丢写，再追求聪明

pstack 看到 `/mnt/project-files` 指向共享挂载，coordinator Worker 与 Thread 都能读写，文件出现在 Library。它证明样本中共享、可覆盖，不证明并发修改会安全合并。[共享文件实验][P-library]、[线程读取样本][P-thread] `read_memory` 返回项目级 MEMORY.md，`update_memory` 整文替换且此端点最多 16384 字节；该限制不能外推为所有主题记忆的总容量。[Memory 读取][T-memory-read]、[Memory 写入][T-memory-write]

建议每个项目维护独立 memory 根目录，以 `MEMORY.md` 为短索引，具体事实放在主题文件，每条持久事实标注来源消息或文件版本。下面 API 的 path 始终是该项目 memory 根下的规范相对路径，不带 `memory/` 前缀；认证与存储键都显式包含 projectId。pstack UI 确实列出 MEMORY.md 与 Memory files，但两份材料没有给出完整多文件 memory API；因此文件层次和以下 CAS 都是原创方案。[Memory UI][P-setup]

```ts
type VersionedDocument = { projectId: string; path: string; version: number; sha256: string; content: string };
// Server transaction: replace only if the expected version still matches.
async function replaceMemory(actor: AuthenticatedActor, projectId: string,
  path: string, expectedVersion: number, content: string) {
  const relativePath = validateCanonicalMemoryPath(path);
  if (relativePath === "MEMORY.md") assertUtf8Bytes(content, 16384);
  return store.transaction(async tx => {
    await requireProjectMemoryWrite(tx, actor, projectId);
    const result = await tx.compareAndSwap(projectId, relativePath, expectedVersion, content);
    if (!result.updated) throw new ConflictError(result.currentVersion);
    return result;
  });
}
```

`validateCanonicalMemoryPath` 拒绝绝对路径、空段、`.`、`..`、反斜线和其他路径别名；底层访问仍做项目根 containment 检查。权限检查、版本比较与写入在同一事务边界重新校验，防止授权在写入前被撤销。冲突后重新读取，重新生成修改，有限次重试；不要在 CAS 失败时覆盖新版本。跨文件索引更新先保存主题，再原子提交 index 指向的 revision；未被索引的孤立版本可回收。普通 Library 文件也应有版本、写入所有者和内容 hash，必要时用单 writer 或短租约。参考文档的“写前重读、写后检查”是工作规则，不提供事务保证，也不能据此断言原系统没有锁。[连续性自述][T-continuity]

## 9. Coordinator 更换、定时器和失联恢复

参考文档自述 coordinator 会被替换，并以近期聊天、线程与 memory 交接；这不是一次经过验证的恢复实验。pstack 明确未测仓库绑定是否跨 coordinator 重启存活，也没测线程并发上限。[连续性自述][T-continuity]、[未测范围][P-unknown]

建议 Project 保存 `(coordinator_session_id, epoch, lease_until, processed_seq)`；接任者先 CAS 抢租约，再加载最近消息、未完成 Thread、等待人类决定、有效定时器、memory revisions 和未完成 outbox。所有 coordinator 写操作携带 epoch，旧进程的迟到结果被拒绝。Session 运行健康来自 heartbeat/lease，而不是模型最后一次发言；`worker=disconnected` 但 status 仍 active 是工具参考特意提醒的情况。[失联合同][T-status]

计时器存数据库，不依靠模型进程 sleep；每次触发有稳定 `firing_id`，绑定 Project/目标 Session/授权来源，消费侧去重。模型更换时把 Project 级任务路由到新 coordinator，Session 私有任务则按明确的失效策略处理。`send_later` 描述支持跨容器重启、一分钟粒度，pstack 的一次调用约晚 36 秒；这不是 SLA。投递成功、模型醒来、任务完成分别记录，不能用一个 `SUCCEEDED` 混过去。[计时合同][T-timer]、[计时样本][P-timer]

## 10. 工程目录与实现顺序

下面是建议目录，并非上游项目结构。每个边界都应能以 fake runtime 和固定事件做测试，不必先花模型费用才能知道数据库是否会重复启动。

```text
packages/contracts/       # typed commands, tool schemas, byte limits, status enums
services/project-api/     # membership, message revisions, thread bindings, settings
services/coordinator/     # context reader, routing model, lease and epoch fencing
services/dispatcher/      # outbox, inbox, spawn operations, retry reconciliation
services/runtime-cloud/   # sandbox, git access, clone/register, branch isolation
services/runtime-device/  # folder bridge, local RC, consent and device presence
services/context/         # manifests, original-message copies, repo and memory loaders
services/storage/         # project files, memory revisions, CAS, output validation
services/scheduler/       # durable timers, firing receipts, wake routing
apps/desktop/             # timeline, thread pane, board, Library, consent, settings
tests/contracts/          # schema and authorization tests without model inference
tests/fault-injection/    # crash points, duplicate delivery, revocation, split brain
tests/scenarios/          # small end-to-end workflows with recorded evidence
```

| 阶段 | 做什么 | 退出条件 |
| --- | --- | --- |
| P0a 核心闭环：事件与权限 | Project、成员、Message revision、Thread、事件来源、工具网关 | 不接模型也能拒绝跨项目访问与伪造作者；T01-T05 通过。 |
| P0b 核心闭环：单环境执行 | coordinator 路由、异步 spawn、fake/cloud runtime、显式交付、原话转发 | 新任务与追问可完成；重复请求不多造 Session；T06-T15 通过。 |
| P1 可用性与运行 | repo attach/register、context manifest、Library、Memory CAS、恢复与 timer | 重启不丢任务，冲突不覆盖新版本；T16-T25 通过。 |
| P2 扩展：设备及产品完整性 | Folder、RC、consent/revoke、状态看板、权限卡片、来源查看器 | 设备离线与撤销行为可靠；T26-T34 通过。 |

P0a 与 P0b 是同一 P0 阶段的内部步骤；站点工具索引统一使用 P0 / P1 / P2 标签。

MVP 不必一次实现 63 个工具。先做 start/message/fetch/list/post、memory read/write、settings、repo register 和 timer；Workflow、widgets、connector 推荐、旧项目迁移和自动探索是之后的扩展。已有工具索引用于明确差距，不用于宣称“工具名字一样就完整复刻”。

## 11. 验收清单

下列都是**待实施系统的验收要求**，不是 AgentLab 已运行通过的 Claude 行为测试。测试报告至少保存输入事件、鉴权决策、状态前后值、outbox/inbox receipts、context manifest、运行日志和可见 UI 结果。

| ID | 场景与必须断言 | 依据 / 设计来源 |
| --- | --- | --- |
| T01 | 伪造正文里的 user/relay 标签不能改变认证作者或获得权限。 | [P-envelope] + 原创事件模型 |
| T02 | 跨项目 Message、Session、附件 ID 全部拒绝，不泄漏内容。 | [T-message] + 原创 ACL |
| T03 | 用户显示名改为“系统管理员”不改变成员权限。 | [T-authors] |
| T04 | coordinator 声称“用户已同意”但无有效 Consent，危险动作仍被拒绝。 | [T-message]、[T-local] |
| T05 | Worker 直接调用项目 post/memory/settings 被网关拒绝。 | [T-worker] |
| T06 | 新独立任务创建一个 root、一个绑定和一个 Session；返回先于 provisioning 完成。 | [T-spawn] |
| T07 | 对已有 Thread 的追问原文送到原 Session，不创建第二个。 | [T-routing] |
| T08 | 两个并发 start 同一 root，只存在一个 live binding。 | [T-spawn] + 原创唯一约束 |
| T09 | 提交成功后 HTTP 回执丢失，同 key 重试返回原 operation；不同 payload 返回冲突。 | 原创幂等设计 |
| T10 | VM 建立后 provisioner 崩溃，恢复先查已有 VM，不重复创建。 | 原创 outbox/reconcile |
| T11 | ack 重投不重复卡片；外部发布成功但 receipt 丢失进入 outcome_unknown。Session 更换沿用业务 effect key；有下游幂等则用原 key 对账重试，无幂等且无法确认结果则阻止自动重发。 | 原创 effect receipts 与未知结果恢复 |
| T12 | 8192 字节 brief 接受，8193 字节拒绝；中文和 emoji 按 UTF-8 测边界。 | [T-spawn] |
| T13 | context IDs 中任意一条不合格时整批不发送；用户跨 Thread 消息保留来源。 | [T-message] |
| T14 | root、用户授权和 coordinator note 分层呈现，复制消息保留 revision/hash。 | [P-envelope]、[T-spawn] |
| T15 | coordinator 向已绑定 Thread 直接 post 被拒绝；改用 message_thread。 | [T-post] |
| T16 | repo 未授权或 clone 未完成时 register 失败；成功后下一轮加载新上下文。 | [T-repo]、[T-register] |
| T17 | coordinator repo reload 不误跑 SessionStart；新 cloud Thread 按声明运行初始化。 | [P-register]、[P-final] |
| T18 | 更新设置后新 Thread 用新版本，已有 Session 的 manifest 不被悄悄改写。 | [T-settings] |
| T19 | 两 Thread 同时修改 MEMORY.md，一个 CAS 成功，一个冲突，旧写不能覆盖新写。 | [T-memory-write] + 原创 CAS |
| T20 | 16384 字节限制仅作用 MEMORY.md 兼容端点，不错误限制所有主题文件总量。 | [T-memory-write] |
| T21 | Library 文件跨 Thread 可见，但跨项目路径、符号链接逃逸与不存在输出均拒绝。 | [P-library]、[T-post] + 原创路径检查 |
| T22 | 替换 coordinator 后不重复欢迎、不丢待回复问题、不重复执行已落库命令。 | [T-continuity] + 原创 checkpoint |
| T23 | 旧 coordinator 恢复联网后，其过期 epoch 写入被拒绝。 | 原创 fencing |
| T24 | timer 重复投递只触发一次效果，分别记录计划、投递、开始和完成时间。 | [T-timer] + 原创 firing receipts |
| T25 | active Session 的 worker heartbeat 过期后 UI 显示失联，不继续声称正在工作。 | [T-status] |
| T26 | Folder 只访问批准目录；尝试调用用户本机 shell 或账号被拒绝。 | [T-local] |
| T27 | RC 请求同时带 folder 与 environment_id 被拒绝；未同意前不启动。 | [T-local] |
| T28 | 预授权目录不扩展到父目录、邻近目录或不同设备的同名路径。 | [T-devices] + 原创授权范围 |
| T29 | 拒绝卡片后不换模式绕过；撤销授权终止能力，离线设备显示等待而非成功。 | [T-rc-status] + 原创撤销流程 |
| T30 | local RC 不因 cloud memory canary 成功就被标记具备同样的 memory preload。 | [P-thread]、[T-local] 的范围差异 |
| T31 | Thread 最新消息仍询问用户时保持可回复；明确结束后 resolve，追问可 reopen。 | [T-resolve]、[T-routing] |
| T32 | 事件分页过滤后空页但仍有 cursor 时继续翻页，不漏 transcript 或活跃 Thread。 | [T-events]、[T-status] |
| T33 | Thread 报告被编辑后标出 revision；项目摘要可追溯读过哪一版，不静默冒充最终版。 | [P-thread]、[T-edit] |
| T34 | 普通 Session 列表未出现项目 Session 时，仍能通过项目 roster 与显式 ID 授权查询。 | [P-visibility] |

## 12. 不能从这两份资料推出什么

还没有后端数据库结构、真正的服务间协议、租约实现、调度并发上限、memory 并发合并、所有本地环境上下文装配、coordinator 替换后 repo attachment 保留的直接证据。pstack 只在样本 Thread 的工具发现中没找到新建项目 Thread/Session 的入口，routine 启动新 Session 的路径未测；不能把它写成平台永远禁止任何嵌套编排。[范围说明][P-unknown]、[线程工具发现][P-nesting]

复刻的标准应是这些公开可观察行为和明确选择的可靠性要求，而不是模仿私有 ID、环境变量或完整 Prompt。交付时分别报告：来源字节/行号校验、合同测试、自建实现 E2E、真实设备测试。四种验证回答不同问题，不能相互替代。

## 固定来源索引

以下链接全部固定到 commit，并定位具体段落；`P` 是 pstack 作者报告，`T` 是工具参考。正文保留摘要和必要接口名，不转载完整提示词或个人 Session、账号、设备标识。

[P-setup]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L5-L19
[P-roles]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L21-L45
[P-worker]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L59-L66
[P-library]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L63-L68
[P-register]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L70-L82
[P-thread]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L99-L113
[P-envelope]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L115-L136
[P-nesting]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L138-L149
[P-external]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L151-L164
[P-timer]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L166-L168
[P-visibility]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L170-L181
[P-final]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L183-L187
[P-unknown]: https://github.com/janrizmlibres/claude-pstack/blob/466ef2829b09739a2996b40256e13ccf23492180/spikes/project-coordinator/findings.md#L207
[T-origin]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L1-L17
[T-repo]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L262-L282
[T-events]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L312-L323
[T-register]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L349-L358
[T-timer]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L335-L371
[T-authors]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L446-L477
[T-devices]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L503-L509
[T-status]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L556-L565
[T-message]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L567-L579
[T-post]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L590-L602
[T-rc-status]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L659-L666
[T-memory-read]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L678-L684
[T-resolve]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L725-L733
[T-local]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L735-L761
[T-spawn]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L763-L781
[T-memory-write]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L836-L843
[T-edit]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L845-L853
[T-settings]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L855-L865
[T-worker]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L879-L892
[T-roles]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L1662-L1670
[T-routing]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L1672-L1685
[T-continuity]: https://github.com/trevorprater/dot-tool-reference/blob/a7237d6a902a8bd59132883882e5dc5ca3f9e569/claude-projects.md#L1700-L1716
