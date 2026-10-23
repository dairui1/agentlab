# dquickts 为什么适合 Code Mode：一次关于执行状态、恢复语义与沙箱边界的对比研究

研究日期：2026-10-23。主研究版本：`stencil-hq/dquickts@f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406`。

## 先说判断

Tobi 对 dquickts 的评价是：“Excellent code mode env”。原帖只有这句评价和仓库链接，没有给出论证。下面解释的是根据实现和实验得出的工程判断，不替他补写动机。[Tobi 原帖](https://x.com/tobi/status/2113596638899974567)

**dquickts 的吸引力，不是它比所有执行器都快，而是它能让一段模型生成的 JavaScript 成为可以保存、释放、迁移、继续运行的程序。** 普通沙箱主要回答“这段代码能做什么”；它进一步回答“这段代码停在这里，明天还能不能接着做”。

这对需要跨轮保留数据、等待人工批准、挂起外部工具调用的 Code Mode 很有价值。但三个限定同样重要：

- 它提供的是执行状态机制，不是一套完整的工具权限、审批、调度和重试系统。
- 它保存 JavaScript 世界，不自动保存网络连接、宿主配置或外部业务事务。
- 这条路线并非独有。Monty 已经在 Python/Rust 路线上提供相近能力；Cloudflare 则用调用日志重放解决另一部分恢复问题。

本文实际编译 dquickts 和匹配的上游 QuickJS，运行原生 C 宿主、持久 REPL、QuickJS-WASM 与 Monty 的定向实验；另对 Node、Deno 做同负载计时。Cloudflare、isolated-vm、Temporal 和 E2B 的部分是官方文档与源码比较，不冒充同场性能实测。

## Code Mode 要的，不只是一个 eval

假设 Agent 要读取客户记录，筛出异常账单，逐条处理，遇到大额调整先请人批准。

传统工具调用把循环交给模型：调用工具、读返回值、决定下一次调用。Code Mode 则让模型写程序，循环、过滤和中间结果留在执行环境，只把有用结果交回模型。下面是普通异步工具绑定下的示意，不是 dquickts 自带 SDK：

```js
const customers = await tools.listCustomers();
const anomalies = [];
for (const customer of customers) {
  const bill = await tools.getBill(customer.id);
  if (bill.amount > customer.limit) {
    anomalies.push({ id: customer.id, amount: bill.amount });
  }
}
return anomalies;
```

这样做可能减少模型往返和上下文中的原始数据，但收益来自“用程序组织工具”，不是某个引擎自动节省 token。工具发现、错误处理和输出裁剪仍要另做。Cloudflare 对 Code Mode 的原始说明也是这一分工：把工具暴露成程序可调用的接口，让模型生成组合这些接口的代码。[Code Mode 的原始设计说明](https://blog.cloudflare.com/code-mode/)

真正困难的问题出现在下一步：这次调用还没结束，批准要等两个小时。怎么办？

| 保留什么 | 可以解决什么 | 仍然缺什么 |
| --- | --- | --- |
| 源码、编译缓存 | 减少下一次编译成本 | 数据与执行位置 |
| JSON 数据 | 重建显式业务状态 | 闭包、对象身份、调用栈 |
| 活着的 JS context | 下一轮继续访问变量和函数 | 进程退出后的恢复 |
| 堆与 continuation 快照 | 换进程继续程序 | 外部工具回执与业务一致性 |
| 调用日志、幂等记录、调度状态 | 失败恢复与副作用管理 | 仍要明确每一类故障的保证 |

dquickts 的主要贡献在第四层。不要因为它跨过了第三层，就默认第五层也已经做好。

## 它究竟保存了什么

### 不是对象序列化，而是解释器状态序列化

dquickts 基于 QuickJS `2026-06-04`。它扩展的快照覆盖 context、全局对象、编译后的函数、闭包、共享引用、待执行 Promise jobs、生成器、等待中的 async 函数和模块状态。同步栈在满足挂起条件后也可保存。[固定版本 API](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/quickjs.h#L1425)

区别可以用一个闭包看清楚：

```js
const next = (() => {
  let n = 0;
  return () => ++n;
})();
next();
const result = tool();
next();
```

保存 `n = 1` 不难。难的是同时保存：`next` 指向哪个函数、它捕获哪个变量、`tool()` 的结果将放到哪里、之后从哪个字节码位置继续。

快照通过编号而非原始地址连接堆中的对象，因此新进程不必分配在原来的内存地址。它保留程序中的引用关系，不要求应用自己把闭包拆成 JSON。恢复目标仍必须满足相同引擎构建及宿主契约；本文没有验证不同机器、不同架构之间的迁移。[快照格式与恢复实现](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/quickjs-snapshot.c)

对 Agent 的意义是：中间结果可以变成程序状态，而不是每轮都交回模型重新解释。持久化的是执行环境，不是模型上下文窗口。

### 同步调用可以等一个很晚才来的结果

宿主函数可以返回 `JS_SuspendCall()`，将它的 JS 调用者挂起。宿主保存快照并退出；新进程恢复后，用 `JS_ResumeWith()` 提供返回值或抛出异常。从脚本看，这仍可表现为一次普通同步调用。[Durable host call API](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/quickjs.h#L1304)

这里有一个适合 Code Mode 的分工：

```text
生成代码调用工具
  -> 引擎停住，宿主拿到控制权
  -> 宿主保存 JS 状态和待处理调用
  -> 释放运行时，等待批准或外部结果
  -> 新 worker 读取快照，重新配置运行环境
  -> 宿主注入结果，程序继续
```

这是可以构建的架构，不是项目已经附送的后台服务。工具请求的参数、调用 ID、审批记录、超时和回执持久化仍由宿主负责。

### 挂起有条件，不是随时冻结 C 栈

QuickJS 的 JS 执行会借用 C 调用栈。dquickts 没有把任意 C 栈搬进快照，而是在允许的 safepoint 把 JS 帧移到堆上，再退出 C 栈。

同步挂起要求可挂起的普通 JS 调用链。由 native 执行路径进入的 getter、Proxy trap、`Array.map/forEach` 回调、转换函数、Promise job 等不能简单照搬；挂起请求可能一直等待后面的合法位置。async 函数在 `await` 后已经交还控制权时，其等待状态又可以作为堆对象保存。这两件事不矛盾。[挂起检查实现](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/quickjs.c#L19265)

所以，不能直接把一个现成 async Code Mode 执行器里的所有工具绑定换成 `JS_SuspendCall()`，就宣称完成适配。同步挂起式绑定与 Promise 式绑定的可用调用位置不同，必须分别验证。

本文的两个反例很直接：在 `[1].map(() => gate())` 中使用挂起式宿主函数，返回 `TypeError: this call cannot be suspended`；在 `map` 回调的死循环里反复请求挂起，直到硬中断触发，也没有成为可保存的 suspended 状态。[本地回执：对应两项检查](results.json)

工程后果是：**合作式挂起不能替代硬超时。** 需要引擎中断，也需要能够终止失控进程的外部边界；宿主函数自身卡住更不能指望 JS safepoint 来救场。

### TypeScript 是便利，不是验证器

它在解析时擦除类型，并把 enum、namespace、parameter property 等运行时构造直接编译为字节码。这省掉一层转译，适合给模型展示 TypeScript 工具签名后直接接收带类型的代码。但它不做类型检查，也不意味着支持 Node/npm 的整个运行环境；JSX/TSX 等语法仍有明确限制。[TypeScript 支持范围](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/README.md#typescript)

实测这段代码成功执行，输出 `string`：

```ts
const n: number = "not a number";
print(typeof n);
```

工具参数校验、返回值校验、权限检查仍要在宿主执行。类型注解不会替它们兜底。[本地回执：`typescript-does-not-typecheck`](results.json)

## 把“能恢复”拆成几件可以验证的事

### 闭包、共享引用与调用位置：通过

本文编写了一个独立 C 宿主。进程 A 创建共享对象、别名和闭包，在 `gate()` 处挂起，写下快照后结束。进程 B 读取同一文件，给 `gate()` 注入模拟工具结果，再继续执行。

得到：

```json
[true, 42, 2, "TOOL_RESULT", "ALPHA", "BETA"]
```

`true` 表示对象与别名仍指向同一对象；`42` 是共享数据；`2` 表示闭包接着第一次调用继续递增；后面是注入结果及恢复后的两个宿主调用。这份快照为 **13,806 字节**。[原创宿主](host.c) · [执行器与断言](run.mjs) · [完整回执](results.json)

上游的 `make test-snapshot` 也在本机通过。它不只重建同进程 runtime，还把脚本分片交给新进程执行并比较输出：同步循环样例经历 365 个进程，async 样例 92 个，生成器样例 82 个。[本地上游测试回执](results.json)

这些是执行机制的正面证据。它们不是支付接口、真实模型任务或生产故障恢复的验收。

### 内存上限：不会随快照回来

进程 A 设置了 8 MiB 内存上限。进程 B 用默认 runtime 恢复后，读取的 `malloc_limit` 为默认无限值，按测试中的有符号格式打印为 `-1`。宿主随后重新设置限制，再继续 JS。

这是文档声明的行为，不是发现了一个与文档相反的漏洞。内存和栈限制、中断回调、模块加载器、rejection tracker 等都属于宿主配置，不在快照里。[宿主恢复契约](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/README.md#the-hosts-side-of-the-contract)

真正容易出错的是只实现 `read snapshot -> resume`。生产实现应在反序列化前就配置适当的资源边界，并在恢复执行前核对完整策略。否则重启前受限的会话，重启后可能变成另一套运行条件。[本地回执：恢复后的 limit](results.json)

### 宿主函数顺序：数量相同，语义仍可能改变

快照中的 C 函数指针以 registry 索引存储。实验保留函数数量，把 `alpha` 和 `beta` 的注册位置互换，然后恢复同一份快照。加载没有失败，输出变成：

```json
[true, 42, 2, "TOOL_RESULT", "BETA", "ALPHA"]
```

相反，改变 registry 数量会被拒绝。源码的签名包含宿主 native 数量，但不会识别两个同数量 native 的对调；README 也明确要求宿主保持相同顺序。[registry 签名实现](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/quickjs-snapshot.c#L467) · [本地对调与数量变化回执](results.json)

因此，应用必须另外绑定工具 ABI 版本或有序工具清单摘要。引擎接受了快照，不代表这份快照仍绑定原来的业务语义。不能把“same build”理解成一个自动验证所有应用行为的密码学证明。

### 同一份快照恢复两次：可以

第二个新进程再次加载原文件，得到完全相同的续跑结果。这个性质支持分支执行，也说明它本身不是一个全局单次消费系统。Monty 的相近实验同样可以重复加载 dump；单个 API 对象的 single-use 限制与持久化字节的全局单次消费是两回事。[dquickts 回执](results.json) · [Monty 回执](monty-results.json)

如果两个 worker 都恢复同一份“等待扣款”的状态，防止重复扣款的责任不在解释器。

## 与其他方案比较，真正的分界在哪里

### 总览：比较状态模型，不给虚假的总分

| 方案 | 主要边界 | 状态继续的办法 | 对 Code Mode 最有价值的地方 | 主要代价 |
| --- | --- | --- | --- | --- |
| dquickts | 可嵌入 JS 引擎，权限取决于宿主 | 堆与合条件 continuation 快照 | JS/TS 状态休眠与跨进程继续 | 自建控制面、快照兼容和安全加固 |
| 上游 QuickJS / QuickJS-WASM | 小型解释器；WASM 再提供线性内存边界 | 活 context；WASM 可用 Promise/Asyncify | 短工具组合、浏览器/JS 宿主集成 | 本文核验接口未提供同等完整的持久续跑能力 |
| Monty | Rust Python 子集解释器；Node 包默认进程池 | 外部调用处暂停，dump/load | Python Code Mode，快照、可选类型检查 | 不是完整 CPython 包生态，工具边界仍需设计 |
| isolated-vm | V8 isolate | 常驻 isolate；启动快照不是任意运行栈持久化 | V8 执行能力和 Node 集成 | native/ABI 运维、进程风险、快照限制 |
| Node `vm` | V8 context，不是安全沙箱 | 常驻 context 或应用自行存储 | 可信代码的低摩擦集成 | 官方明确不应用来隔离不可信代码 |
| Deno CLI | 进程内权限模型，可叠加 OS 边界 | 应用自己持久化业务状态 | JS/TS 与较完整运行时、显式 I/O 授权 | 普通 CLI 不是 continuation 持久化系统 |
| Cloudflare Code Mode | Dynamic Worker + 宿主 connector | 当前 durable runtime 主要按调用日志 abort/replay | 工具发现、审批、审计与托管执行 | 重放约束、平台绑定与控制面成本 |
| E2B 完整内存暂停 | 整个 sandbox 环境 | 保存文件系统及内存 | 需要 Python/Node/原生程序与进程状态 | 比嵌入式解释器更大一层的基础设施 |

各行事实依据在下文；只有明确标注的部分做了本地动态验证。Deno CLI 不等于 Deno Sandbox 产品，Dynamic Worker isolate 也不等于整台 microVM。

### 对 QuickJS-WASM：核心差异是持久化，不是会不会 await

QuickJS-WASM 已经可以保存活 context 中的变量，暴露宿主函数，使用 Promise 并推进 job queue；Asyncify 还能让同步外观的 JS 调用等待异步宿主函数。本文在 `quickjs-emscripten@0.32.0` 中分别验证了这些路径，返回结果均符合断言。[WASM 实验](wasm-check.mjs) · [回执](wasm-results.json)

不能据此说 Asyncify 已经具备 dquickts 的跨进程快照。它解决的是当前 WASM 实例中暂停和继续，文档还限制一个 asyncified module 同时只能等待一条此类异步调用。本文核验的公开接口没有完整运行时序列化/恢复契约；也没有把 WASM 内存拷贝误当作已经可恢复宿主 imports、Promise 和资源的方案。[QuickJS-WASM 固定文档](https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/README.md#asyncify)

如果需求只是“在 JS 服务或浏览器里安全地组织几次工具调用”，WASM 路线已经很有吸引力，而且多一层内存隔离。若需求是“等待期间销毁实例，明天在新 worker 继续闭包和执行栈”，dquickts 才显示出明显差异。本文没有审计或认证任一方案的逃逸抵抗能力。

### 对 Monty：这是最接近的竞争者，不能只作脚注

Monty 同样把“调用宿主工具”当作可以交还控制权的边界，提供 snapshot dump 和新会话加载。它不是把完整 CPython 塞进容器，而是自己的 Rust 解释器和 Python 子集；宿主可从 Python、JS/TS 或 Rust 使用它。[固定版本核心说明](https://github.com/pydantic/monty/blob/82a9abde5484665a9d1d79c8691eb9b5974d22b6/crates/monty/README.md)

本文用 `@pydantic/monty@1.3.0` 完成同类实验：在工具调用处暂停，保存共享对象和闭包，结束进程，再由新进程恢复，得到 `[true, 42, 2, 41]`。这个样例最终复跑的 dump 是 3,869 字节。**不能拿它除以 dquickts 的 13,806 字节宣称压缩率胜负**：两段程序、标准对象和宿主绑定不同，序列化范围也不同。[Monty 实验与断言](monty-check.mjs) · [回执](monty-results.json)

还验证了两项与 Agent 有关的差异：启用 `typeCheck: true` 后，`x: int = "wrong"` 在执行前被拒绝，随后同会话仍能计算 `41 + 1`；没有 mount 的文件读取被拒绝。dquickts 的原生 TS 解析则不包含这种类型检查。[Monty 本地回执](monty-results.json)

Monty 的 Node 包默认把解释器放在可替换的子进程池里，提供进程级硬超时；这比只交付嵌入式引擎多包了一层运行管理。但子进程不是 OS 安全沙箱，更不等于 microVM。Rust 核心直接嵌入时也可能把崩溃带到宿主；dump 同样只接受可信、兼容生产者输出的字节。[Monty 安全模型](https://github.com/pydantic/monty/blob/82a9abde5484665a9d1d79c8691eb9b5974d22b6/docs/security.md)

选择并不复杂：工具接口、应用和模型代码以 JS/TS 为中心时，dquickts 更顺手；以 Python 工具组合为中心，且接受其语言子集时，Monty 是必须认真试的方案。不要因为叫 Python，就默认能运行任意 NumPy/pandas 或 CPython 扩展；本文没有做包兼容性测试。

### 对 V8、Node 与 Deno：性能、生态和恢复不是同一题

Node `vm` 可以跨 eval 保留状态，但官方明确说明它不是安全机制。本文的小实验也展示：一个能正常运行的闭包，经 `JSON.stringify(context)` 后只剩 `{}`。这说明“给 context 做 JSON 存档”不等于保存执行环境，不是声称 Node 所有自建持久化方案都不可能。[Node 24.14.0 的 VM 文档](https://nodejs.org/download/release/v24.14.0/docs/api/vm.html) · [本地反例](results.json)

isolated-vm 提供真正独立的 V8 isolate，但它的 `createSnapshot()` 是用于初始化 isolate 的机制，文档明确警告其稳定性和保护边界，并建议不要使用；它不能直接替代保存任意活动 JS 调用栈的持久快照。`memoryLimit` 也是近似限制，文档建议与重要基础设施分进程部署。项目目前标注为 maintenance mode。[固定 README 的 isolate API 与安全说明](https://github.com/laverdet/isolated-vm/blob/6f9fa6cf22dbe55f56d1a788b4e82065542ac50f/README.md)

这里还要区分另两个常被叫作 snapshot 的东西：Node 的 heap snapshot 是给 DevTools 做内存分析的；startup snapshot 是启动状态优化。看到 API 名里有 snapshot，不能直接推论可以从某个等待中的工具调用继续。[Node 24.14.0 的 V8 API](https://nodejs.org/download/release/v24.14.0/docs/api/v8.html)

Deno 的优势则是显式的 I/O 权限和现成运行时。本文验证了默认权限下读取环境变量会被拒绝；官方对任意不可信代码仍建议叠加 worker、OS 沙箱或 VM，而不是只依赖 `--allow-*`。它适合需要正常 JS/TS 环境的受控任务，不是一个开箱即用的堆与 continuation 持久化替代品。[Deno 权限与不可信代码指南](https://docs.deno.com/runtime/fundamentals/security/)

### 对 Cloudflare：更强的上层系统，另一种恢复算法

Cloudflare 当前的 Code Mode 不应只被概括为“把代码放进 Worker”。它已有 runtime、connector、工具发现、审批、调用日志和补偿接口。Dynamic Worker 默认用 `globalOutbound: null` 阻断直接外连，只通过给定能力访问宿主。[固定源码包说明](https://github.com/cloudflare/agents/blob/15e9b625edeb83fa6b470f7b67a6643cd7d178f9/packages/codemode/README.md) · [官方外连控制](https://developers.cloudflare.com/dynamic-workers/usage/egress-control/)

关键差异是：其当前 durable runtime 在审批处 abort，获批后重新执行生成的程序，把先前记录的 connector 结果喂给重放，而非声称保存活动 V8 heap。它会核对 connector、method、参数和调用序列，遇到不一致则报告 divergence。[Cloudflare 的审批与重放机制](https://developers.cloudflare.com/agents/tools/codemode/how-it-works/)

这带来不同取舍：

- dquickts 恢复程序已有状态，通常不必为了重建状态重新执行之前的 JS 计算；但要管理快照版本、体积、ABI 和存储。
- 日志重放把恢复围绕工具边界组织，审计更直观；但重放前的本地计算会重做，非确定性值需要记录，控制流要保持兼容。
- Cloudflare 文档要求可能暂停的 connector 调用按序进行；并发调用抵达顺序变化可能导致重放分歧。大结果也受持久重放值限制。

这些是不同成本，不是某一方全面领先。已有 Cloudflare 基础设施、需要审批审计和 connector 的团队，可能更应该先用完整系统；自己构建可迁移 JS 会话运行时，才更接近 dquickts 的目标。它不是该 SDK 的直接替换包。[durable runtime 的使用契约](https://developers.cloudflare.com/agents/tools/codemode/durable-runtime/)

### 对 Temporal 与 E2B：不要拿引擎和系统互相否定

Temporal 用事件历史和确定性重放恢复 workflow。它提供的是工作流系统，不是让任意模型生成的 JS 天然成为安全工作流。较合理的组合是：外层系统管理任务、审批、重试和工具回执，内层 dquickts/Monty 管理生成程序的执行状态。[Temporal 的恢复模型](https://docs.temporal.io/workflow-execution)

E2B 的完整内存 pause/resume 则保存整个 sandbox 的文件系统和内存，覆盖的范围比语言解释器大。需要完整 Python/Node、原生依赖、多个进程时，这可能正是需要的边界；客户端网络连接仍需恢复，文件系统-only 模式也不能算内存续跑。[E2B persistence 文档](https://docs.e2b.dev/sandbox/persistence)

dquickts 的优势是可以只保存一个程序，不必因此保存整套运行环境；代价是外部资源要重新建立。E2B 的价值是环境完整。本文没有运行 E2B，也没有把官方恢复耗时与本机引擎毫秒数拼成排行榜。

## 性能实测：短任务受启动影响，长计算会反转

测试机器为 Apple M5 Pro，macOS/Darwin arm64；Node `24.14.0`，Deno `2.7.5`。dquickts 与上游 QuickJS `2026-06-04` 均按各自默认 Makefile 构建，优化级别 `-O2`。fork 含额外功能和构建配置，差异不能全部归因于 snapshot 改动。

每个样本创建新进程，执行相同代码并校验 stdout 一致。每组合 3 次预热、15 次计时，轮换引擎顺序，下面是端到端中位数，单位 ms。这里的“启动”不是冷 OS 缓存，也不是 `JS_NewRuntime()` 耗时；没有包含网络、模型或快照读写。[完整工作负载、原始样本与环境](results.json)

| 相同负载 | dquickts | 上游 QuickJS | Node | Deno |
| --- | ---: | ---: | ---: | ---: |
| 启动并输出 `42` | 1.89 | 1.56 | 17.34 | 17.65 |
| 50,000 条对象构造、JSON 往返与筛选 | 33.56 | 33.03 | 27.64 | 26.32 |
| 1,000,000 次带取模的数值循环 | 16.96 | 16.97 | 21.94 | 21.92 |
| 10,000,000 次同类循环 | 152.53 | 153.42 | 54.47 | 54.71 |

能得出的结论很有限，也很明确：

**第一，小程序的低启动成本是真优势。** 每次都新建进程时，Node/Deno 的固定成本在短负载中占比更大。但生产 Code Mode 可能复用 worker 或 isolate，不能将此表换算为每次工具调用的速度比。

**第二，计算增加后不能把 QuickJS 当 V8 的吞吐替代品。** 在千万次循环上，Node/Deno 连启动成本一起算也更快；真实 JSON 负载也并非 dquickts 最快。

**第三，这四项不能给 snapshot 性能下结论。** 普通执行阶段没有写快照，所能看到的是 fork 在这些样例上没有出现明显吞吐回退。等待成本、快照 CPU、持久存储延迟和会话并发容量要另外测试。单机少量样本也不足以支持尾延迟或跨平台承诺。

## 增量快照：文件很小，不代表写入很便宜

dquickts 支持一个 base 加一份相对 base 的 delta；delta 不是必须逐个回放的链。同构建、同初始化的 runtime 可以重建一致 base，这适合大量会话共享初始化代码和工具定义。[增量快照设计](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/README.md#incremental-snapshots)

但这里不是操作系统 dirty-page tracking。写 delta 时仍会编码可达 cell 和 base cell，并与保存的 base body 比较；不同才写入，必要时用前后缀 patch 缩小变化内容。base 对象还会被保活，直到显式丢弃 base。[delta 写入策略](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/README.md#how-it-works)

所以需要分别估算三笔账：存储和传输字节、写快照 CPU、base 保活带来的驻留内存。一个只有几百字节的 delta，可能来自遍历很大的会话堆。只展示“小快照”不能证明高频 checkpoint 很便宜；本文尚未做堆规模与写入时间的扫描实验。

持久 REPL 也值得准确理解。`qjs --drepl` 将编辑器与会话放在不同 runtime，命令后保存 delta。本文用带 parameter property 的 TS class 创建实例，显式退出再启动，计数从 41 继续到 42；会话中 `os` 不存在。[REPL 实验](repl-check.mjs) · [回执](repl-results.json)

第一版自动化只向管道发送 EOF，10 秒内没有结束；改用文档中的 `\q` 后通过，也补做了 PTY 重启检查。这是测试驱动方式的限制，不能据此断言持久 REPL 失效。实验只覆盖正常退出，不是断电恢复。源码的临时文件加 rename 也不能自动推出已经满足文件与目录 fsync、并发写入互斥和跨平台崩溃一致性。[REPL 保存实现](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/qjs.c#L576)

## 最大的边界：恢复程序，不等于恢复业务事务

考虑这段程序：

```js
const receipt = chargeCustomer(orderId);
markOrderPaid(orderId, receipt);
```

付款成功，回执尚未可靠写入，机器就停了。恢复的是上一次快照，那么下一步到底该不该重新扣款？解释器看不到支付系统已经做了什么。

即使在调用前暂停，也仍有“请求已提交，但结果还没记录”的故障窗口。只有保存 JS 堆，无法把本地快照和远程付款合成一个原子提交。对一次成功挂起/恢复的演示，不应使用端到端 exactly-once 的措辞。

宿主至少要具备：稳定的逻辑调用 ID；参数与回执的持久记录；外部服务支持的幂等键或查账办法；单一恢复者的租约/并发控制；以及明确的待核对状态。它们属于建议架构，不是本文已经实现的事务系统。

还有两个容易漏掉的地方：

- **快照也是敏感数据。** 如果把 token、用户资料或工具结果放进堆，它们可能进入快照。应控制保留范围、存储权限和加密，不能因为没把数据回传模型就忽略它。
- **快照必须来自可信生产者。** dquickts 只承诺检测截断、不匹配等情况，不承诺安全接受恶意快照。本文的截断拒绝实验不是恶意快照安全测试。Monty 也明确要求校验 dump 来源与完整性。[dquickts 的可信输入契约](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/quickjs.h#L1472) · [Monty 的快照信任边界](https://github.com/pydantic/monty/blob/82a9abde5484665a9d1d79c8691eb9b5974d22b6/docs/security.md#deserializing-snapshots)

运行时同样不能想当然：普通 `qjs` CLI 可以导入 `os`，本文验证了其 `os.exec` 为函数；受限的 `--drepl` 会话与普通 CLI 是不同入口。不能把“QuickJS 不自带 Node 全局”写成“执行任何 qjs 文件都已沙箱化”。[本地入口差异检查](results.json)

## 成熟度：值得试用，不适合省略验收就上线

核验时 GitHub 仓库创建于 2026-10-19，没有 tags；固定提交的 Rust bindings 通过 git 使用，README 表明尚未发布到 crates.io。许可证正文是 MIT 许可文本，GitHub API 的 `NOASSERTION` 只是识别结果，不能替代阅读许可证。仓库的几百条历史提交也不能当作该 fork 已经长期维护的证据。[仓库与版本清单](sources.json) · [固定许可证](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/LICENSE)

同提交的远端 CI 为 failure：20 个 jobs 中 19 个 success，`linux/s390x` 的测试步骤失败，本文未继续定位根因。更重要的是，核验到的 workflow 没有调用独立 `test-snapshot` target；它的绿灯项不能自动当作新增持久化机制的跨平台覆盖。[固定 CI 运行](https://github.com/stencil-hq/dquickts/actions/runs/39482258719) · [workflow 源码](https://github.com/stencil-hq/dquickts/blob/f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406/.github/workflows/ci.yml)

本地则有不同的一组证据：默认构建、`make test`、`make test-snapshot` 及本文定向断言通过。没有运行 Rust bindings 测试、完整 test262、sanitizer/fuzzing、跨架构恢复、SIGKILL/断电实验、真实外部工具故障注入或模型任务基准。远端 CI 与本地结果应一起看，而不是挑有利的一边。[本地测试记录](results.json)

## 最后的选择：你到底要哪一种执行环境

如果只需要执行一段很短的代码，把若干工具结果整理后返回，不需要进程退出后续跑，QuickJS-WASM 或平台现有执行器通常已经能解决问题。持久化增加的是版本、存储和恢复负担，不是免费能力。

如果你要的是跨轮、跨 worker 的 JS/TS 程序状态，并愿意掌握工具绑定和调度，**dquickts 是有独特价值的原型基础**。最值得保留的不是“又一个 JS sandbox”，而是可序列化执行状态和宿主可接管的调用边界。

如果语言可以是 Python，**把 Monty 放在同一轮验证里**。它已经具备相近的暂停/恢复能力，还包了可选类型检查和 worker 管理；dquickts 不应在忽略这个竞争者后获得“唯一”的结论。

如果更需要开箱即用的 connector、审批审计和托管部署，Cloudflare 的系统层更完整；如果必须运行真实的 Python/Node 包和原生程序，完整 sandbox/VM 的范围更合适。它们解决的需求比嵌入解释器多，也因此承担不同成本。

所以，我认可“很好的 Code Mode 执行环境”这个方向判断，但会把它精确地写成：

**dquickts 把 JS/TS Code Mode 从一次性执行，推进到可保存的程序执行状态。这个机制值得认真采用；它还不是可以免去业务一致性、安全隔离与运维设计的完整 Agent runtime。**

## 复现与材料

本文附有原创实验代码、机器可读回执与固定来源清单。公开回执省略原始终端转录、本机路径和编译器诊断，保留断言、输出、计时原始样本与来源哈希；上游测试集保留退出状态及本地完整日志的摘要，不把摘要冒充日志全文。第三方文档缓存不公开。实验使用模拟工具，不发送真实业务请求；临时依赖安装禁用了 npm lifecycle scripts，复跑脚本中的子程序使用隔离 HOME 和最小环境。

源版本与动态测试版本分别记录：dquickts 固定上述 commit，上游 QuickJS 固定 `2026-06-04` 官方源码包；QuickJS-WASM 动态测试为 `0.32.0`，Monty 动态测试为 `1.3.0`。`sources.json` 中的比较文档可能是另一固定 main 提交，不把 main 文档冒充 npm 包的运行结果。

将本节链接的 [C 宿主](host.c)、[核心实验](run.mjs)、[WASM 实验](wasm-check.mjs)、[Monty 实验](monty-check.mjs) 和 [REPL 实验](repl-check.mjs) 放在同一目录。按下面流程获取和构建公开依赖后，从该目录复跑：

```sh
git clone https://github.com/stencil-hq/dquickts.git /private/tmp/dquickts-study-20261023
git -C /private/tmp/dquickts-study-20261023 checkout --detach f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406
make -C /private/tmp/dquickts-study-20261023 -j2 qjs libquickjs.a
curl -fL https://bellard.org/quickjs/quickjs-2026-06-04.tar.xz -o /private/tmp/quickjs-2026-06-04.tar.xz
tar -xJf /private/tmp/quickjs-2026-06-04.tar.xz -C /private/tmp
make -C /private/tmp/quickjs-2026-06-04 -j2 qjs
npm install --prefix /private/tmp/dquickts-wasm-baseline-20261023 --ignore-scripts --no-audit --no-fund quickjs-emscripten@0.32.0
npm install --prefix /private/tmp/dquickts-monty-baseline-20261023 --ignore-scripts --no-audit --no-fund @pydantic/monty@1.3.0
node run.mjs
node wasm-check.mjs
node monty-check.mjs
node repl-check.mjs
```

上述临时目录用于全新实验；已有同名目录时应改用新目录并向脚本传入路径，不要覆盖已有工作。核心计时脚本要求预先安装 Node 与 Deno，断言环境与输出，不自动安装系统运行时。复跑会在实验目录生成新回执；不同机器和不同版本不保证复现相同毫秒数。公开来源清单是本次固定取证，不会随仓库 main 或官方文档更新而自动变更。

材料索引：[源码与文档版本/哈希](sources.json)、[核心回执与计时原始样本](results.json)、[QuickJS-WASM 回执](wasm-results.json)、[Monty 回执](monty-results.json)、[REPL 回执](repl-results.json)。材料共含 28 条验收记录和 16 组计时，其中两条是上游测试集命令的回执，不是另跑 28 个上游单元测试，也不是产品安全认证。
