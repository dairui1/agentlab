(function attachComputerUseLabCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComputerUseLabCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createComputerUseLabCore() {
  "use strict";

  const layers = [
    { id: "target", label: "找准 App", source: ["loop", "loop-bind"] },
    { id: "policy", label: "过策略门", source: ["loop", "loop-authorize"] },
    { id: "permission", label: "等系统放行", source: ["guardrails", "guard-os-permissions"] },
    { id: "observe", label: "看清界面", source: ["loop", "loop-observe"] },
    { id: "act", label: "只动一下", source: ["loop", "loop-act"] },
    { id: "verify", label: "回头确认", source: ["loop", "loop-verify"] },
  ];

  const scenarios = [
    {
      id: "transport-timeout",
      label: "发送后没回音",
      title: "“发送”点下去了，回执却没回来",
      summary: "先别急着补点第二下。timeout 只说明我们没收到答复，不等于第一下没生效。",
      verdict: "结果悬着，不能猜",
      retry: "先别重试",
      invariant: "读回界面，再决定下一手",
      failureId: "failure-transport",
      focus: "act",
      statuses: { target: "pass", policy: "pass", permission: "pass", observe: "pass", act: "unknown", verify: "next" },
      notes: {
        target: {
          title: "App 没找错，问题不在这里",
          description: "这条推演已经把目标 App 绑定好了。timeout 出现在动作发出之后，没必要倒回去重新猜 App。",
          known: "题设里，动作已经针对确定的 App 进入调用链。",
          unknown: "超时之后窗口有没有切走、App 有没有自己刷新，现有证据没说。",
          next: "保留这个 App 作为目标，重新读取它此刻的状态。",
          avoid: "别把 transport 超时误诊成 App 没找到，更别靠反复 list_apps 拖延真正的核对。",
        },
        policy: {
          title: "策略门已经过了，但它不负责签收",
          description: "App access 能走到动作层，只说明这条路径获准执行；它不会告诉我们“发送”最终落没落地。",
          known: "在这个场景里，策略层没有拦住目标 App。",
          unknown: "批准状态不包含动作结果，也不是业务侧的 exactly-once 回执。",
          next: "沿用已有的访问结论，把注意力放到动作后的界面状态。",
          avoid: "不要重新申请权限来碰运气。多一次批准，也补不回丢失的动作回执。",
        },
        permission: {
          title: "macOS 这道门也不是故障点",
          description: "系统权限足以让链路走到动作阶段。现在回头折腾 TCC，只会制造新的变量。",
          known: "推演把 Screen Recording 与 Accessibility 视为已经可用。",
          unknown: "权限可用不代表动作完成，更不代表目标系统已经处理了发送。",
          next: "保持权限现场不动，直接读回当前窗口。",
          avoid: "别关权限、重开权限或重启整套环境。眼下缺的是结果，不是更多初始化。",
        },
        observe: {
          title: "动作前看清了，动作后还没看",
          description: "旧 AppState 足够让我们定位“发送”，但它拍下的是动作之前，不是现在。",
          known: "动作依据来自当时最新的一轮截图与 AX 文本。",
          unknown: "发送之后按钮、消息列表或状态提示变成什么样，目前没有新观察。",
          next: "把动作前的状态留作上下文，马上再取一份新的 get_app_state。",
          avoid: "不要拿动作前截图证明动作没发生。那张图回答不了动作后的事。",
        },
        act: {
          title: "最麻烦的点：第一下可能已经生效",
          description: "client 等到 deadline 只等来 timeout。请求可能没执行，也可能执行完才丢了答复，这两种情况在这里长得一模一样。",
          known: "typed action 进入了 transport；对应的 pending request 最后因 timeout 被拒绝。",
          unknown: "服务究竟在执行前、执行中，还是执行后断了回执，静态实现分不出来。",
          next: "连接恢复后先调用 get_app_state，读回按钮、消息列表或目标状态有没有变化。",
          avoid: "不要把 timeout 翻译成“肯定没执行”。自动重放或顺手再点一次，都可能造成重复发送。",
        },
        verify: {
          title: "别问 transport，去问界面现在是什么样",
          description: "这里真正有用的是 readback：发送结果若已经出现在按钮、列表或状态栏里，就没理由再点。",
          known: "新截图与 AX 文本能确认已经可见的副作用。",
          unknown: "目标系统若更新得慢，一次 readback 仍可能看不出最终结果。",
          next: "看见目标结果就收手；确认没发生再重新规划；还是说不准，就把“不确定”原样保留下来。",
          avoid: "别把 action response 当成 exactly-once 业务回执，也别为了给流程画句号硬选成功或失败。",
        },
      },
    },
    {
      id: "stale-element",
      label: "还拿旧编号点",
      title: "页面已经刷新，手里还是旧的 element 42",
      summary: "element 42 只属于上一帧。页面一变，它就不再是可靠的定位依据。",
      verdict: "定位依据过期了",
      retry: "先重新找控件",
      invariant: "编号只认最新 AppState",
      failureId: "failure-observation",
      focus: "observe",
      statuses: { target: "pass", policy: "pass", permission: "pass", observe: "blocked", act: "skipped", verify: "next" },
      notes: {
        target: {
          title: "App 还是那个 App，坏的是里面的地址",
          description: "目标 App 没有歧义。真正过期的是页面里的 element index，别把两个问题混成一个。",
          known: "题设仍指向同一个 App。",
          unknown: "刷新后目标控件还在不在、挪到哪里、换成了什么编号，都要重新看。",
          next: "继续留在当前 App，把定位工作交给新一轮观察。",
          avoid: "别因为一个旧编号失效，就换 App 名称或重新枚举整个桌面。",
        },
        policy: {
          title: "访问仍然允许，旧编号却不会因此续命",
          description: "策略层只管能不能接触这个 App，不会替 AX 树里的临时编号保鲜。",
          known: "这个分支里，App policy 已经放行。",
          unknown: "policy 对刷新后的控件结构没有任何保证。",
          next: "保留访问结论，回到 get_app_state 拿新树。",
          avoid: "别把“App 可以操作”理解成“上一次拿到的 selector 永远可用”。",
        },
        permission: {
          title: "系统权限没掉，观察本身旧了",
          description: "能读到上一棵 AX 树，说明这条推演不是卡在 macOS 授权；问题是那棵树已经过时。",
          known: "Screen Recording 与 Accessibility 在场景里都算可用。",
          unknown: "刷新后的新树长什么样，旧权限状态不会替我们回答。",
          next: "不动系统设置，直接请求新的界面状态。",
          avoid: "别重置权限。它既修不好旧 index，还可能把原本可观察的现场弄丢。",
        },
        observe: {
          title: "页面一刷新，42 就失效了",
          description: "element index 只在产生它的那轮 AppState 里有意义。刷新之后继续用它，点中什么都只是运气。",
          known: "合同把 element index 明确定义为最新 get_app_state 文本里的引用。",
          unknown: "服务端会不会拒绝每一种陈旧 index，现有发行包证据没有给出完整答案。",
          next: "重新 get_app_state；如果返回的只是孤立 diff，就加 disableDiff=true，把完整树拉回来。",
          avoid: "不要复用 42，也别顺手猜 41 或 43。编号相邻，不代表控件也相邻。",
        },
        act: {
          title: "这一步先按住，不点",
          description: "定位依据已经失效，所以动作层没有一个足够可靠的目标可以执行。",
          known: "按照这条分支，旧 element index 不应进入新的 action request。",
          unknown: "目标控件的新 index 或可用坐标还没拿到。",
          next: "等完整的新状态回来，重新定位后再组装一次局部动作。",
          avoid: "不要用旧编号试点一次看看。写操作不是探针，点错了也会留下副作用。",
        },
        verify: {
          title: "拿到新画面，整步重算",
          description: "这里的“确认”不是检查旧点击，而是确认新的定位依据够不够新、够不够完整。",
          known: "完整新树会给出一组新 index；同一轮截图还能提供坐标 fallback。",
          unknown: "如果是 AX 看不见的自定义控件，最后仍可能只能靠视觉定位。",
          next: "优先用新 AX index；AX 里确实没有，再取同一窗口、同一轮截图里的坐标。",
          avoid: "别把窗口内坐标当成全桌面坐标，也别把新截图和旧 AX 文本拼成一份状态。",
        },
      },
    },
    {
      id: "policy-forbidden",
      label: "App 明确不让碰",
      title: "还没看到界面，策略层先说了 forbidden",
      summary: "这不是“再试一次也许能行”的技术故障。边界已经说得很清楚：到这里停。",
      verdict: "明确拒绝，流程结束",
      retry: "不能换路硬闯",
      invariant: "策略拒绝高于操作技巧",
      failureId: "failure-safety",
      focus: "policy",
      statuses: { target: "pass", policy: "blocked", permission: "skipped", observe: "skipped", act: "skipped", verify: "skipped" },
      notes: {
        target: {
          title: "目标够明确，策略才能明确拒绝它",
          description: "这里不是 App 名称解析失败。wrapper 已经拿着目标去问 policy，并收到了 forbidden。",
          known: "推演里的目标 App 已经明确到足以得到一条 policy decision。",
          unknown: "现有本地证据没有展开组织规则或安全判定为何命中。",
          next: "保留原目标和原始拒绝结论，别用模糊命名稀释它。",
          avoid: "不要把 forbidden 改写成“可能选错 App”，那会把安全边界伪装成定位故障。",
        },
        policy: {
          title: "forbidden 不是报错建议，是终止线",
          description: "wrapper 收到这条决定后就该收手。后面的截图、点击和键盘输入都不应该发生。",
          known: "可见实现会在 forbidden 后停止，不再发送 AppState 或 action 请求。",
          unknown: "具体命中了哪条组织规则或安全判定，本地证据没有暴露。",
          next: "把限制讲清楚；有被允许的专用接口就改走它，否则把必须由用户完成的步骤交还用户。",
          avoid: "不要改 App 别名、换坐标、开新 session，或降到更底层输入来绕过。",
        },
        permission: {
          title: "没轮到 macOS 权限出场",
          description: "策略层已经截停，系统是否授予 Screen Recording 或 Accessibility 对这次调用都不再重要。",
          known: "按照调用顺序，forbidden 发生在原生观察和动作之前。",
          unknown: "这一分支没有触发系统权限检查，所以没有运行时结果可读。",
          next: "先处理 policy 给出的边界；只有合法路径改变后，系统权限才值得再看。",
          avoid: "别让用户去系统设置里反复开权限。TCC 解决不了 policy forbidden。",
        },
        observe: {
          title: "界面没有被读，也不该偷读",
          description: "既然 App access 被拒绝，观察层就不是备用入口。截图和 AX 读取同样应该停在门外。",
          known: "这个分支不会继续请求目标 App 的 skyshot 或 AX 文本。",
          unknown: "没有观察请求，就没有当前窗口状态可以描述。",
          next: "若有合法的专用接口，按它自己的授权边界重新开始；否则就停。",
          avoid: "不要把“只看一眼”当成无害绕过。读取也在 App policy 的边界里。",
        },
        act: {
          title: "动作层保持空白，这才是正确结果",
          description: "没有 action request 不是流程没跑完，而是拒绝被真正执行了。",
          known: "forbidden 之后，点击、输入、滚动都不应进入 transport。",
          unknown: "未执行的动作没有成功或失败可言。",
          next: "把任务收束为可解释的限制，或者切换到明确获准的接口。",
          avoid: "别用坐标点击、快捷键或另一层输入机制补做同一件事。换工具不等于换权限。",
        },
        verify: {
          title: "这里要确认的是停住了，不是任务完成了",
          description: "policy 分支的终态很朴素：没有继续接触目标 App，并把边界如实交代出去。",
          known: "后续 Computer Use 调用在这条推演里都被跳过。",
          unknown: "用户是否会选择专用接口或亲自接管，要等新的明确意图。",
          next: "说明哪些事没做、为什么没做，再等待合法的新路径。",
          avoid: "不要把 policy 拒绝包装成“操作失败后可重试”，也不要暗示任务已经完成。",
        },
      },
    },
    {
      id: "permissions-pending",
      label: "权限还卡在设置里",
      title: "App 这边放行了，macOS 那扇门还没开",
      summary: "两道门不是一回事。App approval 过了，Screen Recording 和 Accessibility 仍得等用户在系统里点完。",
      verdict: "卡在系统权限",
      retry: "等用户处理完再来",
      invariant: "看不见，就不盲点",
      failureId: "failure-permissions",
      focus: "permission",
      statuses: { target: "pass", policy: "pass", permission: "blocked", observe: "skipped", act: "skipped", verify: "skipped" },
      notes: {
        target: {
          title: "目标 App 已经对上了",
          description: "当前阻断不在名称、bundle id 或运行实例。再选一遍 App，不会让系统权限自己变绿。",
          known: "题设已经把调用绑定到目标 App。",
          unknown: "用户在系统权限面板里做到哪一步，App 绑定本身看不出来。",
          next: "留住当前目标，等权限状态真正变化后从这里继续。",
          avoid: "别换一个近似 App 试运气。那既绕不开 TCC，也可能碰错窗口。",
        },
        policy: {
          title: "App approval 过了，只过了第一道门",
          description: "policy 允许接触目标 App，但 macOS 仍单独掌管录屏和辅助功能。两层不能互相代签。",
          known: "在这条推演里，App access 已获允许。",
          unknown: "这个允许不会告诉我们系统弹窗是否确认、权限是否已经生效。",
          next: "保留 App approval，转而等待原生权限状态。",
          avoid: "别重复申请 App access。它不会替用户完成系统设置里的那一下。",
        },
        permission: {
          title: "现在该等人，不该让机器多试几次",
          description: "服务把 permissionsPending 和 permissionsNotGranted 分开报。前者尤其说明用户可能还在系统界面里处理。",
          known: "这两类状态都来自原生执行层；App approval 不能替代它们。",
          unknown: "用户有没有点完、系统有没有刷新授权，只能等实际状态变化。",
          next: "保留当前任务，等用户完成系统权限，再从 get_app_state 重新开始。",
          avoid: "不要因为 App 已批准，就拿猜测坐标继续输入；也别用紧密重试催系统弹窗。",
        },
        observe: {
          title: "截图和 AX 都还没拿到",
          description: "权限挡在前面，观察层没有可靠输入。此时描述按钮位置，只能是在猜。",
          known: "这个分支在 get_app_state 产生可用 skyshot/AX 结果之前就停了。",
          unknown: "当前窗口、焦点和控件布局都没有新证据。",
          next: "等权限完成后重新观察，拿一整份当下状态，而不是续用旧图。",
          avoid: "不要拿历史截图顶上，更不要假定权限等待期间窗口一直没动。",
        },
        act: {
          title: "现在先不要发送任何动作",
          description: "没有可靠观察，动作层就没有安全落点。等待不是卡死，而是这条分支唯一诚实的动作。",
          known: "权限未完成时，不应发送 click、type 或其他原生输入。",
          unknown: "因为动作根本没执行，所以不存在可汇报的动作结果。",
          next: "等用户完成系统设置，再基于新 AppState 重新规划。",
          avoid: "不要用坐标盲点，也别把键盘快捷键当成不需要 Accessibility 的后门。",
        },
        verify: {
          title: "先验证权限活了，再谈任务有没有进展",
          description: "下一次有效核对不是看业务结果，而是看服务能否重新产出当前 AppState。",
          known: "这次推演没有执行业务动作，因此没有副作用需要验收。",
          unknown: "系统权限何时生效，以及生效后窗口是否仍在原位置，都还未知。",
          next: "用户确认完成后调用 get_app_state；能正常读到界面，再恢复原任务。",
          avoid: "别把“用户点完了”直接当成“权限已生效”。让一次真实观察来确认。",
        },
      },
    },
    {
      id: "ax-gap",
      label: "画面有，AX 没有",
      title: "截图里看得到按钮，AX 树里却没有它",
      summary: "观察还没有完全中断。同一轮截图可以兜底，但坐标只用这一次，用完立刻回头看。",
      verdict: "观察降级，还能谨慎走",
      retry: "可以做一次受限 fallback",
      invariant: "坐标、窗口、截图必须同一轮",
      failureId: "failure-observation",
      focus: "observe",
      statuses: { target: "pass", policy: "pass", permission: "unknown", observe: "unknown", act: "next", verify: "skipped" },
      notes: {
        target: {
          title: "先确认还是同一个窗口，别让坐标漂到别处",
          description: "视觉 fallback 最怕目标窗口换了。App 绑定虽然成立，动作前仍要确认眼前就是那一个窗口。",
          known: "题设已经识别出目标 App，并拿到了它的窗口截图。",
          unknown: "截图之后焦点有没有切换、窗口有没有移动，目前还没有第二份状态确认。",
          next: "继续使用这个 App，但在取坐标前确认截图仍对应当前活动窗口。",
          avoid: "别把 App 名称正确当成窗口位置永远正确。坐标不会跟着窗口自己搬家。",
        },
        policy: {
          title: "策略允许操作，不等于允许闭眼操作",
          description: "App access 已放行，所以可以讨论 fallback；但 policy 通过不会替不完整的观察补出控件语义。",
          known: "在这个场景里，目标 App 没有被 policy 拒绝。",
          unknown: "策略结论不回答截图里的图形到底是不是可点击按钮。",
          next: "把批准当作前提，把命中精度交给同轮截图和动作后验证。",
          avoid: "别用“已经批准”给一串无观察的坐标宏背书。授权和看准是两件事。",
        },
        permission: {
          title: "能截图，说明不是整套权限都断了",
          description: "这里有可用截图，只是 AX 文本缺了控件。更像观察能力局部退化，不是简单的 TCC 全阻断。",
          known: "场景保留了窗口截图，系统权限足以产出至少一部分观察结果。",
          unknown: "Accessibility 是否已单独放行还没有证据；AX 缺口也可能来自自定义控件、瞬时状态或其他读取异常。",
          next: "不急着重置权限，先重新观察一次，看缺口是否稳定复现。",
          avoid: "别一看到 AX 缺项就要求用户重开所有系统权限。那会把局部问题扩大成全局中断。",
        },
        observe: {
          title: "树里没它，截图里还有最后一条线索",
          description: "AX 没给可用 element index，但截图保留了形状和布局。可以继续，不过得承认我们少了一层结构化保证。",
          known: "截图里能看到非标准控件；AX 文本没有为它提供可用 element index。",
          unknown: "它是否真能点、会不会移动，以及截图之后界面有没有变化，都还没确认。",
          next: "先确认截图属于当前窗口；必要时重看一轮，再从窗口 viewport 内取坐标。",
          avoid: "不要从旧截图抄坐标，也别把全桌面位置混进窗口坐标。差几十像素，点到的可能就是另一件事。",
        },
        act: {
          title: "坐标只用于这一次，不能当 selector",
          description: "typed click 接受窗口坐标，也会校验参数。但它只知道位置，不知道那个位置为什么值得点。",
          known: "当前接口允许发送窗口内坐标，参数会先经过 typed client 校验。",
          unknown: "这一点究竟命中了按钮、空白还是已经移动的控件，只能看动作后的界面。",
          next: "只做一个小动作，随后立刻重新 get_app_state。",
          avoid: "不要把这串坐标录成免观察宏，更别顺手连点第二、第三个位置。",
        },
        verify: {
          title: "点击还没发生，验证先在门口等着",
          description: "这一格暂时跳过，不是说验证不重要，而是要先完成那一个受限动作。",
          known: "当前场景只走到“准备坐标 fallback”，还没有动作后的新状态。",
          unknown: "控件是否命中、界面是否变化，全都要等下一轮观察。",
          next: "动作一落地就重新读取；结果不清楚时，不继续串联别的坐标动作。",
          avoid: "别把“视觉上像是点中了”当验证。没有新 AppState，就还没闭环。",
        },
      },
    },
  ];

  const unique = (values) => [...new Set((values || []).filter(Boolean))];

  function itemById(study, collection, id) {
    return (study?.[collection] || []).find((item) => item.id === id) || null;
  }

  function genericState(status, source, failure) {
    if (status === "pass") return {
      known: `题设先把这一关算作已通过：${source.title}。`,
      unknown: "注意，这只是推演前提，不是某次真实会话留下的成功回执，更替不了后面的判断。",
      next: "先带着这条结论往下走；到了下一关，再看它自己的证据。",
      avoid: "别因为这一格是绿的，就顺手宣布整件事都获准了。",
    };
    if (status === "skipped") return {
      known: "前面已经把流程停住，这一层根本没有执行。",
      unknown: "既然没跑，就没有运行时结果。成功、失败，都不能替它填。",
      next: "先把真正的阻断点处理掉；状态重建之后，才轮得到这里。",
      avoid: "别替一段没发生的调用补运行结果。空白就是这一步最准确的结果。",
    };
    if (status === "next") return {
      known: "眼下做这一步，最有机会把悬着的问题说清楚。",
      unknown: failure?.signal || "得等下一份可见状态回来，才知道结果往哪边落。",
      next: failure?.recovery || "重新看一眼界面，再按新事实决定。",
      avoid: "别跳过核对就收工，也别在答案出来前重放动作。",
    };
    return {
      known: source.summary,
      unknown: failure?.signal || "手头这些证据，还不够替这一层下结论。",
      next: failure?.recovery || "先拿到一份新的可见状态再说。",
      avoid: "别为了让表格看起来完整，硬把“不知道”改成成功或没执行。",
    };
  }

  function resolveScenario(study, requestedId) {
    const scenario = scenarios.find((item) => item.id === requestedId) || scenarios[0];
    const failure = itemById(study, "failures", scenario.failureId);
    const resolvedLayers = layers.map((layer) => {
      const source = itemById(study, layer.source[0], layer.source[1]);
      if (!source) throw new Error(`这份 Computer Use 资料里找不到 ${layer.source[1]}，推演没法继续`);
      const status = scenario.statuses[layer.id] || "skipped";
      const fallback = genericState(status, source, failure);
      const note = scenario.notes?.[layer.id] || {};
      return {
        id: layer.id,
        label: layer.label,
        status,
        title: note.title || source.title,
        description: note.description || source.summary,
        interface: source.primitive || source.enforcement || "",
        known: note.known || fallback.known,
        unknown: note.unknown || fallback.unknown,
        next: note.next || fallback.next,
        avoid: note.avoid || fallback.avoid,
        evidence: unique([...(source.claims || []), ...(layer.id === scenario.focus ? failure?.claims || [] : [])]),
      };
    });
    return { ...scenario, failure, layers: resolvedLayers };
  }

  function focusIndex(scenarioId) {
    const scenario = scenarios.find((item) => item.id === scenarioId) || scenarios[0];
    return Math.max(0, layers.findIndex((layer) => layer.id === scenario.focus));
  }

  function resolveSelection(href, scenarioId, stepIndex) {
    const url = new URL(href, "https://agentlab.local");
    const requestedScenario = scenarioId || url.searchParams.get("trace");
    const scenario = scenarios.find((item) => item.id === requestedScenario) || scenarios[0];
    const requestedStep = stepIndex === undefined
      ? url.searchParams.has("traceStep")
        ? Number.parseInt(url.searchParams.get("traceStep"), 10)
        : focusIndex(scenario.id)
      : stepIndex;
    const step = Number.isFinite(requestedStep) ? Math.min(layers.length - 1, Math.max(0, requestedStep)) : 0;
    return { scenarioId: scenario.id, step };
  }

  return Object.freeze({ layers, scenarios, focusIndex, resolveScenario, resolveSelection });
});
