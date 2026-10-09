/*
 * Adapted and translated from Pi Pocket's durable guide.
 * Copyright (c) 2026 Tanner Middleton. MIT License.
 * Source: https://github.com/TannerMidd/pi-pocket/blob/d01f763b02f06ff6144d4366eb966a76dbb35577/site/durable.html
 * License: /assets/source-media/pi-pocket/LICENSE.txt
 */
(() => {
                "use strict";
                const $ = (s, r = document) => r.querySelector(s);
                const $$ = (s, r = document) => [...r.querySelectorAll(s)];
                const esc = (s) =>
                    String(s).replace(
                        /[&<>"]/g,
                        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
                    );
                const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
                const chip = (cls, text) => `<span class="k ${cls}">${esc(text)}</span>`;
                const statusText = (value) =>
                    ({ pending: "待运行", running: "运行中", waiting: "等待中", completed: "已完成", failed: "失败", aborted: "已取消", completing: "收尾中", sleeping: "休眠中", idle: "空闲", gone: "已退出", placed: "已放入", done: "已完成", prepare: "准备", request: "请求", tools: "工具", call: "调用", execute: "执行", charge: "扣款", decide: "判断", pay: "付款", terminal: "终态", orphaned: "孤立", faulted: "故障", "abort-marked": "已标记取消", yield: "给出回答", validate: "校验", intent: "意图", result: "结果", generation: "生成" })[value] || value;

                /* ================= TOC scrollspy ================= */
                (() => {
                    const links = $$("#toc a");
                    const secs = links.map((a) =>
                        document.getElementById(a.getAttribute("href").slice(1)),
                    );
                    const update = () => {
                        let cur = 0;
                        secs.forEach((s, i) => {
                            if (s && s.getBoundingClientRect().top < innerHeight * 0.35) cur = i;
                        });
                        links.forEach((a, i) =>
                            a.classList.toggle("on", i === cur && scrollY > 200),
                        );
                        const on = links[cur];
                        if (on && innerWidth < 1100 && scrollY > 200) {
                            const ol = $("#toc");
                            const l = on.offsetLeft - ol.clientWidth / 2 + on.clientWidth / 2;
                            if (Math.abs(ol.scrollLeft - l) > 40)
                                ol.scrollTo({ left: l, behavior: "smooth" });
                        }
                    };
                    addEventListener("scroll", update, { passive: true });
                    update();
                })();

                /* ================= HERO TAPE ================= */
                (() => {
                    const tape = $("#tape");
                    // One answered input with one tool call, commit by commit, then an app commit.
                    const KINDS = [
                        [
                            ["sub", "s1 已放入"],
                            ["entry", "pi.user"],
                            ["task", "+pi.generation"],
                        ],
                        [["task", "生成运行中"]],
                        [
                            ["entry", "pi.system"],
                            ["task", "生成：请求"],
                        ],
                        [["doc", "pi.live 请求"]],
                        [["doc", "pi.live 部分输出"]],
                        [
                            ["entry", "pi.assistant"],
                            ["doc", "pi.usage"],
                            ["task", "+pi.tool"],
                            ["task", "生成等待中"],
                        ],
                        [["task", "工具运行中"]],
                        [
                            ["task", "工具调用意图"],
                            ["doc", "pi.live 工具"],
                        ],
                        [["doc", "pi.live 输出"]],
                        [
                            ["entry", "pi.tool-result"],
                            ["task", "工具已完成"],
                        ],
                        [["task", "生成运行中"]],
                        [
                            ["task", "生成已完成"],
                            ["task", "+pi.generation"],
                        ],
                        [["task", "生成运行中"]],
                        [["task", "生成：请求"]],
                        [["doc", "pi.live 请求"]],
                        [["doc", "pi.live 部分输出"]],
                        [
                            ["entry", "pi.assistant"],
                            ["doc", "pi.usage"],
                            ["sub", "s1 已完成"],
                            ["task", "生成已完成"],
                        ],
                        [
                            ["doc", "app.todos"],
                            ["entry", "app.note"],
                        ],
                    ];
                    let seq = 1040,
                        i = 0;
                    const add = () => {
                        seq++;
                        const w = KINDS[i++ % KINDS.length];
                        const el = document.createElement("div");
                        el.className = "cell";
                        el.innerHTML =
                            `<span class="seq"><span>#${seq}</span><span>✓</span></span>` +
                            w
                                .map(
                                    ([c, t]) =>
                                        `<span class="w"><i class="dot" style="--c:var(--${c})"></i>${esc(t)}</span>`,
                                )
                                .join("");
                        tape.appendChild(el);
                        while (tape.children.length > 14) tape.firstChild.remove();
                    };
                    for (let n = 0; n < 9; n++) add();
                    if (!reduce) setInterval(add, 1300);
                })();

                /* ================= LAYERS ================= */
                (() => {
                    const L = [
                        {
                            n: "你的应用",
                            c: "var(--sub)",
                            s: "终端界面、网页应用、Slack 机器人、命令行程序",
                            tags: [
                                ["sub", "submit()"],
                                ["doc", "watch()"],
                            ],
                            h: "你的应用",
                            d: "Harness 没有用户界面。你的应用负责打开 Harness、发送输入，并显示已经提交的状态。",
                            li: [
                                "<code>Harness.open(storage, { models, registry, settings, env }, ctx)</code>",
                                "<code>harness.root()</code>, <code>createConversation()</code>, <code>fork()</code>",
                                "通过 <code>conversation.submit()</code> 提交，使用 <code>whenBusy</code> 与 <code>requestId</code>",
                                "<code>viewState()</code>, <code>watch()</code>, <code>watchEvents()</code>, <code>taskGraph()</code>",
                            ],
                        },
                        {
                            n: "扩展与注册表",
                            c: "var(--doc)",
                            s: "工具、提示段、钩子、包装器、任务",
                            tags: [["doc", "install()"]],
                            h: "扩展与注册表",
                            d: "工具、Prompt 段、钩子、包装器和你的任务都放在有名称的扩展里。进程把这些扩展安装到注册表中。",
                            li: [
                                "注册表不保存在存储中。对话保存的是扩展名称。",
                                "安装同名扩展时，会一步替换旧扩展。Harness 可以继续运行。",
                                "内置的 <code>CodingTools</code> 扩展提供 <code>read</code>、<code>write</code>、<code>edit</code> 和 <code>bash</code>。",
                                "Harness 在使用工具、提示段和钩子时，从注册表取得对应实现。",
                            ],
                        },
                        {
                            n: "Harness",
                            c: "var(--task)",
                            s: "在会话数据上运行 Agent",
                            tags: [
                                ["task", "pi.generation"],
                                ["task", "pi.tool"],
                            ],
                            h: "Harness 运行宿主",
                            d: "Harness 包含持久任务调度器，以及处理输入的内置任务。",
                            li: [
                                "<code>pi.generation</code> 调用模型。该轮工具调用对应的 <code>pi.tool</code> 任务归属于它。",
                                "还管理压缩任务、收件箱及其处理边界，以及重试。",
                                "根据各对话保存的 Agent 配置（<code>pi.agent</code>），从注册表查找对应代码。",
                                "每次调用工具或生成系统 Prompt 时，都会把对话及其 <code>cwd</code> 传给你的 <code>env</code> 函数。",
                            ],
                        },
                        {
                            n: "会话",
                            c: "var(--entry)",
                            s: "对话、条目、文档、分叉",
                            tags: [
                                ["entry", "条目"],
                                ["doc", "文档"],
                            ],
                            h: "Session 会话",
                            d: "Session 是存储之上的数据模型。它使用 Earendil Chord 库管理文档状态与观察。",
                            li: [
                                "所有变更都经过<b>同一条原子提交序列</b>。每次提交都有序号。",
                                "对话包含不可变条目。分叉展示父对话从开始到分叉点的条目。",
                                "文档是带类型和作用域的 JSON。对话文档另有历史设置与分叉策略。",
                                "订阅者会收到每次提交包含的操作。",
                            ],
                        },
                        {
                            n: "存储",
                            c: "var(--commit)",
                            s: "内存、SQLite、JSONL",
                            tags: [["commit", "commit(writes)"]],
                            h: "存储",
                            d: "存储接口很小：提交一组写入，以及读取和扫描记录。",
                            li: [
                                "有三种后端：内存、SQLite 和 JSONL。",
                                "SQLite 与 JSONL 的核心不使用 Node API。加上小型适配器，也能运行在 Bun 和 Cloudflare Durable Objects 中。",
                                "SQLite 只把工作集保留在内存里，旧消息留在磁盘上。JSONL 则把全部记录保留在内存中。",
                                "同一份存储同时只能由一个进程使用。存储自身不会阻止第二个进程访问。",
                            ],
                        },
                    ];
                    const box = $("#layers"),
                        det = $("#layer-detail");
                    let cur = 2;
                    const render = () => {
                        box.innerHTML = L.map(
                            (l, i) =>
                                `<button class="layer" style="--lc:${l.c}" aria-pressed="${i === cur}" data-i="${i}"><span class="ix" style="color:${l.c}">L${L.length - i}</span><span><span class="nm">${esc(l.n)}</span><span class="sub">${esc(l.s)}</span></span><span class="tags">${l.tags.map(([c, t]) => chip(c, t)).join("")}</span></button>`,
                        ).join("");
                        const l = L[cur];
                        det.innerHTML = `<div class="eyebrow" style="color:${l.c}">第 ${L.length - cur} 层</div><h3 style="margin-top:10px">${esc(l.h)}</h3><p style="margin:10px 0 0">${l.d}</p><ul>${l.li.map((x) => `<li>${x}</li>`).join("")}</ul>`;
                    };
                    box.addEventListener("click", (e) => {
                        const b = e.target.closest(".layer");
                        if (b) {
                            cur = +b.dataset.i;
                            render();
                        }
                    });
                    render();
                })();

                /* ================= NOUNS ================= */
                (() => {
                    const G = {
                        harness:
                            '<rect x="3" y="5" width="24" height="20" rx="2"/><path d="M3 11h24M3 18h24"/><circle cx="7" cy="8" r=".8" fill="currentColor"/>',
                        conv: '<path d="M5 7h20M5 12h14M5 17h18M5 22h10"/>',
                        entry: '<rect x="4" y="11" width="22" height="8" rx="1.5"/><path d="M8 15h8"/>',
                        commit: '<rect x="5" y="5" width="20" height="20" rx="2"/><path d="M10 15l4 4 7-8"/>',
                        doc: '<path d="M8 3h10l6 6v18H8z"/><path d="M18 3v6h6"/><path d="M13 14c-2 0-2 2-2 3s0 3-2 3c2 0 2 2 2 3s0 3 2 3M19 14c2 0 2 2 2 3s0 3 2 3c-2 0-2 2-2 3s0 3-2 3" transform="scale(.8) translate(3 2)"/>',
                        task: '<circle cx="9" cy="15" r="4"/><circle cx="22" cy="15" r="4"/><path d="M13 15h5M18 13l2 2-2 2"/>',
                        sub: '<path d="M4 20h22v6H4z"/><path d="M15 3v13M10 11l5 5 5-5"/>',
                        run: '<path d="M24 15a9 9 0 1 1-3-6.7"/><path d="M22 4v5h-5"/>',
                        agent: '<rect x="7" y="7" width="16" height="16" rx="2"/><path d="M11 3v4M19 3v4M11 23v4M19 23v4M3 11h4M3 19h4M23 11h4M23 19h4"/>',
                        ext: '<path d="M6 8h7a3 3 0 1 1 6 0h5v6a3 3 0 1 1 0 6v6H6z"/>',
                        reg: '<rect x="4" y="4" width="9" height="9"/><rect x="17" y="4" width="9" height="9"/><rect x="4" y="17" width="9" height="9"/><rect x="17" y="17" width="9" height="9" stroke-dasharray="2 2"/>',
                    };
                    const N = [
                        [
                            "harness",
                            "var(--ink)",
                            "Harness 运行宿主",
                            "一份已打开的存储，以及在其上运行 Agent 的代码。只有变更进入存储后，Harness 才会对外展示它。",
                            "Harness.open()",
                        ],
                        [
                            "conv",
                            "var(--entry)",
                            "对话",
                            "由不可变条目组成的记录。你可以创建多个对话，并行运行，也可以分叉。对话句柄本身不持有状态。",
                            "harness.root()",
                        ],
                        [
                            "entry",
                            "var(--entry)",
                            "条目",
                            "一条不可变记录：<code>pi.user</code>、<code>pi.assistant</code>、<code>pi.tool-result</code>、<code>pi.system</code>、<code>pi.reset</code>、<code>pi.compaction</code>，或你定义的类型。",
                            "tx.appendEntry(Kind, conversationId, { data })",
                        ],
                        [
                            "commit",
                            "var(--commit)",
                            "提交",
                            "一次原子写入。一份提交可以添加条目、修改文档并创建任务。存储要么保留整份提交，要么完全不保留。",
                            "conversation.commit(tx => …)",
                        ],
                        [
                            "doc",
                            "var(--doc)",
                            "文档",
                            "Harness 与对话记录一起保存的带类型 JSON 状态。提交会修改文档。内置文档包含 Agent 配置、收件箱、实时输出和用量。",
                            "defineDoc({ kind, fork })",
                        ],
                        [
                            "task",
                            "var(--task)",
                            "任务",
                            "每步结束后保存检查点的持久状态机。每个任务都有归属，归属于一个对话或另一个任务。",
                            "defineTask({ phases })",
                        ],
                        [
                            "sub",
                            "var(--sub)",
                            "提交项",
                            "交给对话的一个项目：发给模型的输入，或要写入的条目。你可以等待提交项完成，重启后也可以继续等待。",
                            "submit({ requestId })",
                        ],
                        [
                            "run",
                            "var(--task)",
                            "回合与一次运行",
                            "一个回合是一次模型响应及其工具调用。一次运行包含从输入到最终回答之间的全部回合。运行期间，对话处于忙碌状态。",
                            'whenBusy: "steer"',
                        ],
                        [
                            "agent",
                            "var(--doc)",
                            "Agent 配置",
                            "对话的配置：模型、思考档位、扩展、工具、指令与工作目录。<code>pi.agent</code> 保存扩展和工具的名称，不保存代码。",
                            "configure({ model })",
                        ],
                        [
                            "ext",
                            "var(--doc)",
                            "扩展",
                            "一组有名称的工具、Prompt 段、钩子、包装器和任务。你添加的大多数代码都放在扩展里。存储、模型和 <code>env</code> 函数则传给 <code>Harness.open()</code>。",
                            "defineExtension({ name })",
                        ],
                        [
                            "reg",
                            "var(--doc)",
                            "注册表",
                            "当前进程安装的扩展。注册表不在存储里，Harness 运行期间也可以改变它。新工作使用新的注册表状态。",
                            "registry.install(ext)",
                        ],
                    ];
                    $("#nouns-grid").innerHTML = N.map(
                        ([g, c, h, p, code]) =>
                            `<article class="noun"><div class="top"><svg class="glyph" viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:${c}" aria-hidden="true">${G[g]}</svg><h3>${h}</h3></div><p>${p}</p><code style="color:${c};margin-top:auto">${esc(code)}</code></article>`,
                    ).join("");
                })();

                /* ================= SIMULATOR ================= */
                // Each commit below matches a commit of Pi Durable 1.0.2 (generation.ts, tool.ts,
                // scheduler.ts, submissions.ts). Streams are shortened to a few chunks.
                (() => {
                    const GEN1 = ["我会运行测试，", "并读取 auth.ts，", "看看哪里失败了。"];
                    const OUT = [
                        "$ npm test\n",
                        "✗ 登录 › 跳转首页\n",
                        "  预期 302，实际收到 200\n",
                        "1 项失败 · 47 项通过\n",
                    ];
                    const READ =
                        '41  if (path === "/home/") {\n42    return redirect(302, "/home")';
                    const GEN2 = {
                        ok: [
                            "检查条件把 ",
                            '"/home/" 与 "/home" 比较，',
                            "因此重定向一直没有触发。",
                            "修复 auth.ts 的第 42 行。",
                        ],
                        bash: [
                            "测试运行被中断了。",
                            'auth.ts 把 "/home/" 与 "/home" 比较，',
                            "这可能阻止重定向。",
                            "需要重新运行测试吗？",
                        ],
                        read: [
                            "登录测试收到 200，而不是 302。",
                            "读取 auth.ts 时被中断，",
                            "所以还看不到检查条件。",
                            "需要重新读取吗？",
                        ],
                        both: [
                            "两次调用都被中断了。",
                            "还没有测试输出，",
                            "也没有文件内容。",
                            "需要重新执行吗？",
                        ],
                    };
                    const QUESTION = "登录测试为什么失败？";

                    let S,
                        M,
                        timer = null,
                        lastNarr = {
                            t: "点击“运行”或“单步”。Harness 已打开一份空的 session.sqlite 文件。",
                            api: 'Harness.open(await openNodeSqliteStorage("session.sqlite"), { models, registry }, ctx)',
                        };
                    const safe = $("#sim-safe");

                    // S is storage: it survives a kill. M is process memory: a kill loses it.
                    function fresh() {
                        S = {
                            seq: 0,
                            commits: [],
                            sub: null,
                            entries: [],
                            tasks: {},
                            order: [],
                            usage: { tokens: 0, cost: 0 },
                            system: false,
                        };
                        M = {
                            alive: true,
                            proc: 1,
                            pid: 48213,
                            buf: "",
                            bufTask: null,
                            lost: "",
                            sched: "idle",
                            started: {},
                        };
                    }
                    function commit(writes, narr) {
                        S.seq++;
                        S.commits.push({ seq: S.seq, writes });
                        say(narr.t, narr.api);
                    }
                    function say(t, api) {
                        lastNarr = { t, api };
                    }
                    const task = (id, kind, name, owner) => {
                        S.tasks[id] = {
                            id,
                            kind,
                            name,
                            owner,
                            status: "pending",
                            phase: kind === "pi.tool" ? "call" : "prepare",
                            progress: 0,
                            replay: null,
                        };
                        S.order.push(id);
                        return S.tasks[id];
                    };
                    const failedTool = (name) =>
                        S.entries.some(
                            (e) => e.kind === "pi.tool-result" && e.err && e.tool === name,
                        );
                    function scriptOf(t) {
                        if (t.id === "g1") return GEN1;
                        if (t.id === "t1") return OUT;
                        const b = failedTool("bash"),
                            r = failedTool("read");
                        return GEN2[b && r ? "both" : b ? "bash" : r ? "read" : "ok"];
                    }

                    // Buffer one chunk in memory, or commit the buffered chunk to pi.live.
                    function stream(t, done) {
                        if (M.buf && M.bufTask === t.id) {
                            M.buf = "";
                            M.bufTask = null;
                            t.progress++;
                            const tool = t.kind === "pi.tool";
                            return commit(
                                [
                                    [
                                        "doc",
                                        tool
                                            ? `pi.live: ${t.name} 输出`
                                            : `pi.live: ${t.id} 部分输出`,
                                    ],
                                ],
                                {
                                    t: `刷出缓冲：Harness 把缓冲中的${tool ? "输出" : "文本"}提交到 pi.live。提交后，即使进程崩溃，数据也会保留，所有客户端都能看到。`,
                                    api: tool
                                        ? "工具输出：两次提交至少间隔 100 ms"
                                        : "部分回答：每 100 ms 最多提交一次",
                                },
                            );
                        }
                        const sc = scriptOf(t);
                        if (t.progress < sc.length) {
                            M.buf = sc[t.progress];
                            M.bufTask = t.id;
                            say(
                                `${t.kind === "pi.tool" ? "bash 写出" : "模型发来"}一段内容。这一段只在进程内存里（虚线表示）。此时崩溃，就会丢失这一段。`,
                                "已收到片段，尚未提交",
                            );
                            return;
                        }
                        done();
                    }

                    function genStep(t) {
                        const rec = t.recovered;
                        delete t.recovered;
                        if (t.phase === "prepare") {
                            const sys = !S.system;
                            if (sys) {
                                S.system = true;
                                S.entries.push({
                                    kind: "pi.system",
                                    text: "提示段：前言 · cwd · 工具：read、bash",
                                });
                            }
                            t.phase = "request";
                            commit(
                                [
                                    ...(sys ? [["entry", "+pi.system"]] : []),
                                    ["task", `${t.id} 阶段：请求`],
                                ],
                                sys
                                    ? {
                                          t: "prepare 阶段根据选中扩展的提示段生成系统 Prompt。这是一份新 Prompt，因此一次提交把它保存为 pi.system 条目，并把任务推进到 request 阶段。此后，这次请求的模型、Prompt 和工具不再改变。",
                                          api: 'section("cwd", (input) => input.env?.cwd)',
                                      }
                                    : {
                                          t: "prepare 阶段重新生成系统 Prompt。Prompt 没有变化，因此 Harness 不添加 pi.system 条目，请求开头保持不变，使提供商的 Prompt 缓存继续有效。这次提交把任务推进到 request 阶段。",
                                          api: "只保存并重新发送发生变化的内容",
                                      },
                            );
                            return;
                        }
                        if (t.phase === "request") {
                            if (!M.started[t.id]) {
                                M.started[t.id] = true;
                                const partial = scriptOf(t).slice(0, t.progress).join("");
                                const writes = [];
                                if (partial) {
                                    S.entries.push({
                                        kind: "pi.assistant",
                                        text: partial,
                                        aborted: true,
                                    });
                                    S.usage.tokens += 1210;
                                    S.usage.cost += 0.006;
                                    writes.push(
                                        ["entry", "+pi.assistant（已取消）"],
                                        ["doc", "pi.usage"],
                                    );
                                }
                                t.progress = 0;
                                writes.push(["doc", `pi.live: ${t.id} 第 1 次尝试`]);
                                commit(
                                    writes,
                                    partial
                                        ? {
                                              t: '崩溃后重新开始 request 阶段。存储里已有部分回答，这次提交把它保存为带 "aborted" 标记的 pi.assistant 条目。部分回答留在对话记录中，但不会把已取消的条目发给模型。随后，Harness 重新发送同一个请求。',
                                              api: "已提交的部分输出转为已取消的 pi.assistant 条目",
                                          }
                                        : rec
                                          ? {
                                                t: "崩溃后重新开始 request 阶段。存储里没有任何部分回答，因此 Harness 只记录请求正在进行，然后重新发送请求。",
                                                api: "重新发送被中断的模型请求",
                                            }
                                          : {
                                                t: "request 阶段先向 pi.live 提交“请求正在进行”的状态，再把请求发给模型。",
                                                api: "models.streamSimple(model, { messages }, options)",
                                            },
                                );
                                return;
                            }
                            return stream(t, () => (t.id === "g1" ? toolRound(t) : answer(t)));
                        }
                        finishRound(t);
                    }

                    function toolRound(g) {
                        M.started[g.id] = false;
                        S.entries.push({
                            kind: "pi.assistant",
                            text: GEN1.join(""),
                            calls: ["bash npm test", "read src/auth.ts"],
                        });
                        task("t1", "pi.tool", "bash", g.id);
                        task("t2", "pi.tool", "read", g.id);
                        g.status = "waiting";
                        g.phase = "tools";
                        g.progress = 0; // the commit deletes the streamed answer from pi.live
                        S.usage.tokens += 1840;
                        S.usage.cost += 0.011;
                        commit(
                            [
                                ["entry", "+pi.assistant（2 次工具调用）"],
                                ["doc", "pi.usage"],
                                ["task", "+t1 bash, +t2 read"],
                                ["task", "g1 → 等待中"],
                            ],
                            {
                                t: "响应已经完成。一次提交保存 assistant 条目和用量，同时为每次工具调用创建一个 pi.tool 任务，并把 g1 设为等待中。这些工具任务归属于生成任务。",
                                api: "n 个 pi.tool 任务归属于 pi.generation；生成任务等待它们",
                            },
                        );
                    }

                    function finishRound(g) {
                        g.status = "completed";
                        task("g2", "pi.generation", "generation", null);
                        commit(
                            [
                                ["task", "+pi.generation g2"],
                                ["task", "g1 → 已完成"],
                            ],
                            {
                                t: "tools 阶段执行 afterTools 钩子。随后，一次提交在工具回合结束的边界检查收件箱，同时创建下一项生成任务 g2，并完成 g1。本次运行由 g2 接续。",
                                api: "先运行 afterTools 钩子，再处理 postTools 边界",
                            },
                        );
                    }

                    function answer(g) {
                        M.started[g.id] = false;
                        g.status = "completed";
                        S.sub.status = "done";
                        S.entries.push({ kind: "pi.assistant", text: scriptOf(g).join("") });
                        S.usage.tokens += 2310;
                        S.usage.cost += 0.014;
                        commit(
                            [
                                ["entry", "+pi.assistant（回答）"],
                                ["doc", "pi.usage"],
                                ["sub", "s1 → 已完成"],
                                ["task", "g2 → 已完成"],
                            ],
                            {
                                t: '一次提交保存最终回答和用量，同时在本次运行结束的边界检查收件箱，并把提交项设为 done、完成 g2。随后，submission.wait() 返回状态 "done"。',
                                api: 'const settled = await submission.wait(ctx) // { status: "done" }',
                            },
                        );
                        M.sched = "idle";
                    }

                    function toolStep(t) {
                        const rec = t.recovered;
                        delete t.recovered;
                        if (t.phase === "call") {
                            t.phase = "execute";
                            t.replay = t.name === "bash" && safe.checked ? "safe" : "unsafe";
                            M.started[t.id] = true;
                            commit(
                                [
                                    ["task", `${t.id} 意图：执行`],
                                    ["doc", `pi.live: ${t.name} 运行中`],
                                ],
                                {
                                    t: `${rec ? `${t.id} 在崩溃前没有提交调用意图，所以从头重新开始 call 阶段。工具尚未运行，这样做是安全的。` : ""}${t.name}：参数有效，也没有 beforeTool 钩子阻止调用。一次提交保存意图：最终参数与 replay: "${t.replay}"，随后才执行 execute()。`,
                                    api:
                                        t.replay === "safe"
                                            ? '{ ...createBashTool(), replay: "safe" }'
                                            : `${t.name}：replay "unsafe"，所有工具的默认值`,
                                },
                            );
                            return;
                        }
                        if (!M.started[t.id]) {
                            // Recovery after the intent: rerun only if the stored and the current policy are both "safe".
                            const now = t.name === "bash" && safe.checked;
                            if (t.replay === "safe" && now) {
                                M.started[t.id] = true;
                                t.progress = 0;
                                commit([["doc", `pi.live: ${t.name} 输出已清空`]], {
                                    t: '恢复：保存的意图中有 replay: "safe"，当前工具也仍有这一设置。Harness 清除已提交的输出，从头重新执行调用。',
                                    api: '{ ...createBashTool(), replay: "safe" }',
                                });
                                return;
                            }
                            const so = t.name === "bash" ? OUT.slice(0, t.progress).join("") : "";
                            S.entries.push({
                                kind: "pi.tool-result",
                                tool: t.name,
                                err: true,
                                text: `工具 ${t.name} 被中断，可能已经部分执行`,
                                out: so || "（没有已提交的输出）",
                            });
                            t.status = "failed";
                            const why =
                                t.replay === "safe"
                                    ? '意图中有 replay: "safe"，但当前工具没有。要重新执行，保存的意图和当前工具都必须具有 "safe" 设置。'
                                    : now
                                      ? '意图中有 replay: "unsafe"，因为调用开始时没有勾选此选项。要重新执行，保存的意图和当前工具都必须具有 "safe" 设置。'
                                      : `${t.name} 没有 replay: "safe" 设置。内置工具都没有这一设置。重新执行可能把同一项工作做两次，所以 Harness 不会重跑调用。`;
                            commit(
                                [
                                    ["entry", `+pi.tool-result ${t.name}（被中断）`],
                                    ["task", `${t.id} → 失败`],
                                ],
                                {
                                    t: `恢复：${why} 模型收到带有已提交输出的 interrupted 错误结果，然后决定下一步。`,
                                    api: '没有 replay: "safe" → 返回 interrupted 错误结果',
                                },
                            );
                            return;
                        }
                        if (t.name === "read") {
                            t.status = "completed";
                            M.started[t.id] = false;
                            S.entries.push({
                                kind: "pi.tool-result",
                                tool: "read",
                                text: "src/auth.ts（118 行）",
                                out: READ,
                            });
                            commit(
                                [
                                    ["entry", "+pi.tool-result read"],
                                    ["task", "t2 → 已完成"],
                                ],
                                {
                                    t: "read 先完成。一次提交保存它的结果条目与终态。",
                                    api: "execute() 返回 { content }",
                                },
                            );
                            return;
                        }
                        stream(t, () => {
                            t.status = "completed";
                            M.started[t.id] = false;
                            S.entries.push({
                                kind: "pi.tool-result",
                                tool: "bash",
                                text: "退出码 1",
                                out: OUT.join(""),
                            });
                            commit(
                                [
                                    ["entry", "+pi.tool-result bash"],
                                    ["task", "t1 → 已完成"],
                                ],
                                {
                                    t: "bash 停止运行，流式输出成为结果。一次提交保存结果条目与任务终态。",
                                    api: "api.output() 输出流；若 execute() 未返回内容，这些输出就成为结果",
                                },
                            );
                        });
                    }

                    function next() {
                        if (!M.alive) return false;
                        const T = S.tasks;
                        if (!S.sub) {
                            S.sub = { id: "s1", status: "placed" };
                            S.entries.push({ kind: "pi.user", text: QUESTION });
                            task("g1", "pi.generation", "generation", null);
                            commit(
                                [
                                    ["sub", "+s1 已放入"],
                                    ["entry", "+pi.user"],
                                    ["task", "+pi.generation g1"],
                                    ["doc", "pi.live: 运行 s1"],
                                ],
                                {
                                    t: "submit() 保存输入。对话处于空闲状态，因此一次提交保存状态为 placed 的提交项、pi.user 条目，以及一项 pending 生成任务。这项任务控制本次运行。",
                                    api: `root.submit({ type: "input", content: "${QUESTION}" }, ctx)`,
                                },
                            );
                            M.sched = "running";
                            return true;
                        }
                        // The scheduler reserves every task that can run, in one commit.
                        const all = S.order.map((id) => T[id]);
                        const ready = all.filter(
                            (t) =>
                                t.status === "pending" ||
                                (t.status === "waiting" &&
                                    all
                                        .filter((c) => c.owner === t.id)
                                        .every(
                                            (c) =>
                                                c.status === "completed" || c.status === "failed",
                                        )),
                        );
                        if (ready.length) {
                            const woken = ready.filter((t) => t.status === "waiting");
                            const rec = ready.filter((t) => t.recovered);
                            ready.forEach((t) => (t.status = "running"));
                            const ids = ready.map((t) => t.id).join(", ");
                            commit(
                                ready.map((t) => ["task", `${t.id} → 运行中`]),
                                rec.length
                                    ? {
                                          t: `调度器通过一次提交领取 ${ids}。每项任务从保存的检查点重新运行：${rec.map((t) => `${t.id} 的 ${statusText(t.phase)}阶段`).join("、")}。`,
                                          api: "harness.resume() 启动调度器",
                                      }
                                    : woken.length
                                      ? {
                                            t: `本回合的所有工具都已结束，所以调度器再次领取 ${ids}。${ids} 从 tools 阶段继续。`,
                                            api: '等待 [t1, t2] · 策略 "allSettled"',
                                        }
                                      : {
                                            t: `调度器通过一次提交领取 ${ids}。running 状态是一个检查点。如果进程此时停止，新进程会把${ready.length > 1 ? "这些任务" : "这项任务"}设回 pending，再重新运行。`,
                                            api: "harness.resume() 启动调度器",
                                        },
                            );
                            M.sched = "running";
                            return true;
                        }
                        // Run one step of a running task: intents first, then recovery, then read, then the rest.
                        const rank = (t) =>
                            t.kind === "pi.tool" && t.phase === "call"
                                ? 0
                                : t.kind === "pi.tool" && !M.started[t.id]
                                  ? 1
                                  : t.name === "read"
                                    ? 2
                                    : 3;
                        const t = all
                            .filter((x) => x.status === "running")
                            .sort((a, b) => rank(a) - rank(b))[0];
                        if (t) {
                            if (t.kind === "pi.generation") genStep(t);
                            else toolStep(t);
                            return true;
                        }
                        M.sched = "idle";
                        say(
                            "本次运行已经完成，所有步骤都在存储中。点击“重置”，试着在运行中模拟崩溃。",
                            "await harness.close(ctx)",
                        );
                        return false;
                    }

                    function kill() {
                        stop();
                        M.lost = M.buf;
                        M.alive = false;
                        M.buf = "";
                        M.bufTask = null;
                        M.sched = "gone";
                        say(
                            `SIGKILL。进程停止了。${M.lost ? `内存已经丢失，包括尚未提交的片段（"${M.lost.trim()}"）。` : "内存中没有未提交数据，因此没有丢失数据。"}存储中保留了 ${S.seq} 次提交。`,
                            "kill -9 " + M.pid,
                        );
                        render();
                    }
                    function reopen() {
                        const running = S.order.filter((id) => S.tasks[id].status === "running");
                        M = {
                            alive: true,
                            proc: M.proc + 1,
                            pid: M.pid + 1377,
                            buf: "",
                            bufTask: null,
                            lost: "",
                            sched: S.sub && S.sub.status !== "done" ? "running" : "idle",
                            started: {},
                        };
                        S.commits.push({ reopen: true, proc: M.proc });
                        const pending = S.sub && S.sub.status !== "done";
                        if (running.length) {
                            running.forEach((id) => {
                                S.tasks[id].status = "pending";
                                S.tasks[id].recovered = true;
                            });
                            S.seq++;
                            S.commits.push({
                                seq: S.seq,
                                writes: running.map((id) => ["task", `${id} → 待运行`]),
                            });
                        }
                        say(
                            !S.sub
                                ? "新进程打开同一份存储并调用 resume()。存储为空，没有工作可接续。点击“运行”发送输入。"
                                : !pending
                                  ? "新进程打开同一份存储并调用 resume()。本次运行已经完成，没有工作可接续。"
                                  : running.length
                                    ? `新进程打开同一份存储。一次提交把原先运行中的任务（${running.join("、")}）设回 pending。等待中的任务仍保持等待，不运行代码。resume() 启动调度器。`
                                    : "新进程打开同一份存储。之前没有任务正在运行。resume() 启动调度器，工作继续。",
                            "const harness = await Harness.open(storage, …, ctx); harness.resume();",
                        );
                        render();
                        // resume() starts the scheduler, so the work continues without a click.
                        if (pending) run(reduce ? 2600 : 2000);
                    }

                    function stop() {
                        if (timer) {
                            clearInterval(timer);
                            timer = null;
                        }
                        $("#sim-run-label").textContent = "运行";
                    }
                    // Step through the run on a timer. A delay lets the reader see the current message first.
                    function run(delay = 0) {
                        if (timer) return stop();
                        if (!M.alive) return;
                        $("#sim-run-label").textContent = "暂停";
                        const tick = () => {
                            if (!next() || (S.sub && S.sub.status === "done")) stop();
                            render();
                        };
                        const loop = () => {
                            tick();
                            if (timer) timer = setInterval(tick, reduce ? 1400 : 850);
                        };
                        if (delay) {
                            timer = setTimeout(loop, delay);
                        } else {
                            timer = -1;
                            loop();
                        }
                    }

                    const label = (t) =>
                        t.status === "failed"
                            ? "失败 · 被中断"
                            : t.status === "pending" && t.recovered
                              ? `待运行 ↺ · ${statusText(t.phase)}`
                              : t.status === "pending" || t.status === "running"
                                ? `${statusText(t.status)} · ${statusText(t.phase)}`
                                : statusText(t.status);
                    function render() {
                        const T = S.tasks;
                        const all = S.order.map((id) => T[id]);
                        // process pane
                        const proc = $("#sim-proc");
                        proc.classList.toggle("dead", !M.alive);
                        $("#sim-hb").innerHTML = M.alive
                            ? `<i></i><span>进程 ${M.proc} · PID ${M.pid}</span>`
                            : `<i></i><span>已强制终止</span>`;
                        const inflight = all.filter((t) => t.status === "running");
                        $("#sim-mem").innerHTML = M.alive
                            ? `
      <div class="mem-row"><span>调度器</span><span>${esc(statusText(M.sched))}</span></div>
      <div class="mem-row"><span>已领取</span><span>${inflight.length ? inflight.map((t) => chip("task", `${t.id} ${statusText(t.name)}`)).join(" ") : '<span class="muted">无</span>'}</span></div>
      <div class="mem-row"><span>流式缓冲</span><span class="buf ${M.buf ? "" : "empty"}">${M.buf ? esc(M.buf) : "空"}</span></div>
      <div class="mem-row"><span>注册表</span><span>${chip("doc", "coding")} ${chip("doc", "read")} ${chip("doc", "bash")}</span></div>`
                            : `<div style="font:700 26px var(--display);letter-spacing:-0.02em;color:var(--crash)">进程已强制终止</div>
      <div class="mem-row"><span>丢失</span><span>${M.lost ? `<span class="buf lost">${esc(M.lost)}</span>` : '<span class="muted">无：没有未提交的字节</span>'}</span></div>
      <div class="mem-row"><span>保留</span><span>存储中的全部 ${S.seq} 次提交</span></div>`;
                        // ledger
                        $("#sim-seq").textContent = "序号 " + S.seq;
                        const led = $("#sim-ledger");
                        led.innerHTML = S.commits.length
                            ? S.commits
                                  .map((c, i) =>
                                      c.reopen
                                          ? `<div class="lr reopen">进程 ${c.proc} 已打开 · resume()</div>`
                                          : `<div class="lr${i === S.commits.length - 1 ? " fresh" : ""}"><span class="sq">#${String(c.seq).padStart(2, "0")}</span><span class="ws">${c.writes.map(([k, t]) => chip(k, t)).join("")}</span></div>`,
                                  )
                                  .join("")
                            : `<div class="empty">尚无提交，存储为空。</div>`;
                        led.scrollTop = led.scrollHeight;
                        // transcript: committed entries, then the committed pi.live stream
                        const tx = $("#sim-tx");
                        let html = S.entries
                            .map((e) => {
                                if (e.kind === "pi.user")
                                    return `<div class="te"><span class="kk">pi.user</span>${esc(e.text)}</div>`;
                                if (e.kind === "pi.system")
                                    return `<div class="te sys"><span class="kk">pi.system</span><span class="small muted">${esc(e.text)}</span></div>`;
                                if (e.kind === "pi.assistant")
                                    return `<div class="te${e.aborted ? " err" : ""}"><span class="kk">pi.assistant${e.aborted ? " · 已取消 · 不发送给模型" : ""}</span>${esc(e.text)}${e.calls ? `<div class="row" style="margin-top:4px;gap:4px">${e.calls.map((c) => chip("task", c)).join("")}</div>` : ""}</div>`;
                                return `<div class="te ${e.err ? "err" : ""}"><span class="kk">pi.tool-result · ${esc(e.tool)}${e.err ? " · 被中断" : ""}</span>${esc(e.text)}<pre>${esc(e.out)}</pre></div>`;
                            })
                            .join("");
                        const liveT = all.find(
                            (t) =>
                                (t.status === "running" || t.status === "pending") &&
                                (t.kind === "pi.generation"
                                    ? t.phase === "request"
                                    : t.name === "bash") &&
                                (t.progress > 0 || (M.alive && M.bufTask === t.id)),
                        );
                        if (liveT) {
                            const committed = scriptOf(liveT).slice(0, liveT.progress).join("");
                            const pending = M.alive && M.bufTask === liveT.id ? M.buf : "";
                            const tool = liveT.kind === "pi.tool";
                            const lab = tool
                                ? `pi.live · ${liveT.name} 输出`
                                : "pi.live · 流式回答";
                            const unc = pending ? `<span class="unc">${esc(pending)}</span>` : "";
                            const body = tool
                                ? `<pre>${esc(committed)}${unc}</pre>`
                                : `${esc(committed)}${unc}`;
                            html += `<div class="te ghost"><span class="kk">${lab}</span>${body}</div>`;
                        }
                        tx.innerHTML = html || `<div class="tx-empty">对话记录为空。</div>`;
                        tx.scrollTop = tx.scrollHeight;
                        // tree
                        const node = (t, depth) =>
                            `<div class="tn ${depth ? "c" + depth : ""}">${chip("task", t.kind)}<span>${esc(t.id)}${t.kind === "pi.tool" ? " " + esc(t.name) : ""}</span><span class="st ${t.status === "pending" && t.recovered ? "recovered" : t.status}">${esc(label(t))}</span></div>`;
                        let tree = `<div class="tn">${chip("entry", "对话")}<span>root</span></div>`;
                        all.filter((t) => !t.owner).forEach((t) => {
                            tree += node(t, 1);
                            all.filter((c) => c.owner === t.id).forEach((c) => {
                                tree += node(c, 2);
                            });
                        });
                        $("#sim-tree").innerHTML = tree;
                        // documents and the submission
                        const gen = all.filter((t) => t.kind === "pi.generation").pop();
                        const tools = all.filter((t) => t.kind === "pi.tool" && t.owner === "g1");
                        const round =
                            T.g1 && T.g1.status !== "completed" && tools.length
                                ? " · 工具：" +
                                  tools
                                      .map(
                                          (t) =>
                                              `${t.name} ${t.status === "completed" || t.status === "failed" ? "已结束" : t.phase === "execute" ? "运行中" : "待运行"}`,
                                      )
                                      .join(", ")
                                : "";
                        const live = !S.sub
                            ? "—"
                            : S.sub.status === "done"
                              ? "无运行"
                              : `运行：s1 → ${gen.id}${round}`;
                        $("#sim-docs").innerHTML = `
      <div class="d"><b>提交项 s1</b><span>${S.sub ? statusText(S.sub.status) : "—"}</span></div>
      <div class="d"><b>pi.inbox</b><span>${S.sub ? "空：s1 已立即放入" : "空"}</span></div>
      <div class="d"><b>pi.live</b><span>${esc(live)}</span></div>
      <div class="d"><b>pi.usage</b><span>${S.usage.tokens.toLocaleString()} token · $${S.usage.cost.toFixed(3)}</span></div>
      <div class="d"><b>pi.agent</b><span>gpt-6-sol · high · [coding]</span></div>
      <div class="d"><b>pi.provider</b><span>0199c3e2-…-7a41</span></div>`;
                        // narration & buttons
                        $("#sim-narr").innerHTML =
                            `<p>${esc(lastNarr.t)}</p>${lastNarr.api ? `<div class="api">${esc(lastNarr.api)}</div>` : ""}`;
                        const finished =
                            S.sub &&
                            S.sub.status === "done" &&
                            !all.some((t) => t.status === "running");
                        $("#sim-run").disabled = !M.alive || (finished && !timer);
                        $("#sim-step").disabled = !M.alive || finished;
                        $("#sim-kill").disabled = !M.alive;
                        $("#sim-open").disabled = M.alive;
                    }

                    $("#sim-run").addEventListener("click", run);
                    $("#sim-step").addEventListener("click", () => {
                        stop();
                        next();
                        render();
                    });
                    $("#sim-kill").addEventListener("click", kill);
                    $("#sim-open").addEventListener("click", reopen);
                    $("#sim-reset").addEventListener("click", () => {
                        stop();
                        fresh();
                        say(
                            "已重置。存储换成一份新的空 session.sqlite 文件。",
                            'await openNodeSqliteStorage("session.sqlite")',
                        );
                        render();
                    });
                    fresh();
                    render();
                })();

                /* ================= REQUEST ID ================= */
                (() => {
                    const on = $("#rid-on"),
                        pkt = $("#rid-pkt"),
                        client = $("#rid-client"),
                        subs = $("#rid-subs");
                    let rows = [],
                        runs = 0,
                        busy = false,
                        log = [];
                    const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
                    const draw = () => {
                        subs.innerHTML = rows.length
                            ? rows
                                  .map(
                                      (r) =>
                                          `<div class="subrow ${r.dupe ? "dupe" : ""}">${chip("sub", r.id)}<span>${r.req ? "requestId " + esc(r.req) : "无 requestId"}</span>${r.dupe ? chip("crash", "第二次部署") : chip("task", "运行已开始")}</div>`,
                                  )
                                  .join("")
                            : `<span class="muted small">暂无提交项。</span>`;
                        client.innerHTML = log.length
                            ? log.map((l) => `<div>${l}</div>`).join("")
                            : `<span class="muted">已就绪。</span>`;
                        $("#rid-n-sub").textContent = rows.length;
                        $("#rid-n-run").textContent = runs;
                        $("#rid-n-run").style.color = runs > 1 ? "var(--crash)" : "";
                    };
                    const fly = async (cls, from, to) => {
                        pkt.className = "pkt " + cls;
                        pkt.style.transition = "none";
                        pkt.style.left = from;
                        pkt.style.opacity = 1;
                        pkt.getBoundingClientRect();
                        pkt.style.transition = "";
                        pkt.style.left = to;
                        await wait(750);
                    };
                    $("#rid-send").addEventListener("click", async () => {
                        if (busy) return;
                        busy = true;
                        $("#rid-send").disabled = true;
                        const key = on.checked
                            ? "deploy-" + Math.random().toString(16).slice(2, 6)
                            : null;
                        log.push(
                            `→ 提交“部署到预发布环境”${key ? ` <code>${key}</code>` : ""}`,
                        );
                        draw();
                        await fly("", "0%", "calc(100% - 16px)");
                        rows.push({ id: "s" + (rows.length + 1), req: key });
                        runs++;
                        draw();
                        await fly("ack", "calc(100% - 16px)", "45%");
                        pkt.className = "pkt drop";
                        log.push(
                            `<span style="color:var(--crash)">✗ 回执丢失（网络错误）</span>`,
                        );
                        draw();
                        await wait(700);
                        log.push(`↻ 重试同一条消息${key ? ` <code>${key}</code>` : ""}`);
                        draw();
                        await fly("", "0%", "calc(100% - 16px)");
                        if (key) {
                            log.push(
                                `<span style="color:var(--task)">✓ 得到 ${rows[rows.length - 1].id}：已有提交项</span>`,
                            );
                        } else {
                            rows.push({ id: "s" + (rows.length + 1), req: null, dupe: true });
                            runs++;
                            log.push(
                                `<span style="color:var(--crash)">✓ 得到 ${rows[rows.length - 1].id}：全新提交项</span>`,
                            );
                        }
                        draw();
                        await fly("ack", "calc(100% - 16px)", "0%");
                        pkt.style.opacity = 0;
                        busy = false;
                        $("#rid-send").disabled = false;
                    });
                    $("#rid-reset").addEventListener("click", () => {
                        if (busy) return;
                        rows = [];
                        runs = 0;
                        log = [];
                        draw();
                    });
                    draw();
                })();

                /* ================= INBOX ================= */
                // Boundary rules from inbox.ts and generation.ts in Pi Durable 1.0.2.
                (() => {
                    // A run: gen, tools, gen, tools, gen (answer). Position u is measured in segments.
                    // tools: the end of the segment is a postTools boundary. end: a final boundary.
                    const BASE = [
                        { k: "gen", l: "生成" },
                        { k: "tools", l: "工具回合", tools: true },
                        { k: "gen", l: "生成" },
                        { k: "tools", l: "工具回合", tools: true },
                        { k: "gen", l: "回答", end: true },
                        { k: "idle", l: "空闲" },
                    ];
                    let segs,
                        u = 0,
                        q = [],
                        placed = [],
                        marks = [],
                        runs = 1,
                        n = 0,
                        timerId;
                    const lane = $("#ib-lane");
                    // info: a normal event; otherwise an error, such as ConversationBusy.
                    const toast = (t, info = true) => {
                        $("#ib-toast").textContent = t;
                        $("#ib-toast").classList.toggle("info", info);
                    };
                    const reset = () => {
                        segs = BASE.map((s) => ({ ...s }));
                        u = 0;
                        q = [];
                        placed = [];
                        marks = [];
                        runs = 1;
                        n = 0;
                        toast("");
                        draw();
                    };
                    const idx = () => Math.min(segs.length - 1, Math.floor(u));
                    const busy = () => segs[idx()].k !== "idle";
                    // A new run (one tool round, then the answer) starts where the idle segment is.
                    const startRun = (at) => {
                        runs++;
                        segs.splice(
                            at,
                            0,
                            { k: "run2", l: `运行 ${runs}：工具`, tools: true },
                            { k: "run2", l: `运行 ${runs}：回答`, end: true },
                        );
                    };
                    const draw = () => {
                        $("#ib-segs").innerHTML = segs
                            .map((s) => `<div class="sg ${s.k}">${esc(s.l)}</div>`)
                            .join("");
                        $("#ib-head").style.left = (u / segs.length) * 100 + "%";
                        lane.querySelectorAll(".mark").forEach((m) => m.remove());
                        // Marks at the same boundary sit side by side: the first is centered on it.
                        const right = {};
                        marks.forEach((m) => {
                            const el = document.createElement("span");
                            el.className = "mark " + m.k;
                            el.style.left = (m.at / segs.length) * 100 + "%";
                            el.textContent = ({ steer: "当轮补充", write: "写入", "follow-up": "后续输入" })[m.label] || m.label;
                            lane.appendChild(el);
                            const w = el.offsetWidth;
                            const x = m.at in right ? right[m.at] + 3 : -w / 2;
                            el.style.transform = `translateX(${x}px)`;
                            right[m.at] = x + w;
                        });
                        $("#ib-q").innerHTML = q.length
                            ? q
                                  .map(
                                      (x) =>
                                          `<div class="qitem">${chip(x.cls, ({ steer: "当轮补充", write: "写入", "follow-up": "后续输入" })[x.k] || x.k)}<span>${esc(x.text)}</span></div>`,
                                  )
                                  .join("")
                            : `<span class="muted small">空。</span>`;
                        $("#ib-placed").innerHTML = placed.length
                            ? placed
                                  .map(
                                      (x) =>
                                          `<div class="qitem">${chip(x.cls, x.entry)}<span>${esc(x.text)}</span><span class="small muted">${esc(x.where)}</span></div>`,
                                  )
                                  .join("")
                            : `<span class="muted small">尚无内容。</span>`;
                    };
                    // A boundary places every write and the first steer; at "final" also the first
                    // follow-up. User items placed at "final" start the next run.
                    const place = (boundary, at) => {
                        // Writes first, then user items, each in submission order.
                        const users = [q.find((x) => x.k === "steer")];
                        if (boundary === "final") users.push(q.find((x) => x.k === "follow-up"));
                        const pick = [
                            ...q.filter((x) => x.k === "write"),
                            ...users.filter(Boolean).sort((a, b) => a.n - b.n),
                        ];
                        pick.forEach((x) => {
                            q.splice(q.indexOf(x), 1);
                            placed.push({
                                ...x,
                                entry: x.k === "write" ? "app.note" : "pi.user",
                                where: boundary === "final" ? "运行结束时" : "工具回合结束时",
                            });
                            marks.push({
                                k: x.k === "steer" ? "steer" : x.k === "write" ? "write" : "follow",
                                at,
                                label: x.k,
                            });
                        });
                        if (boundary === "final" && pick.some((x) => x.k !== "write")) {
                            startRun(at);
                            toast(
                                "本次运行结束，收件箱里还有用户输入。Harness 在一次提交中放入输入，并启动下一次运行。",
                            );
                        }
                    };
                    const tick = () => {
                        if (!busy()) return;
                        const before = idx();
                        u = Math.min(segs.length - 0.001, u + 0.02);
                        const after = idx();
                        if (after !== before) {
                            const prev = segs[before];
                            if (prev.tools) place("postTools", after);
                            else if (prev.end) place("final", after);
                        }
                        draw();
                    };
                    const TEXT = {
                        steer: ["使用 pnpm，不要用 npm", "sub"],
                        "follow-up": ["也运行一下 lint 检查", "entry"],
                        write: ["用户打开了 auth.ts", "doc"],
                    };
                    const add = (k) => {
                        toast("");
                        if (k === "reject" && busy()) {
                            toast(
                                'submit() 抛出 ConversationBusy。对话正忙，whenBusy: "reject" 不会把输入排队。',
                                false,
                            );
                            return;
                        }
                        n++;
                        const kind = k === "reject" ? "follow-up" : k;
                        const item = {
                            k: kind,
                            n,
                            cls: TEXT[kind][1],
                            text: TEXT[kind][0] + (n > 3 ? ` (${n})` : ""),
                        };
                        if (!busy()) {
                            placed.push({
                                ...item,
                                entry: kind === "write" ? "app.note" : "pi.user",
                                where: "空闲：立即放入",
                            });
                            if (kind === "write") {
                                toast(
                                    "对话处于空闲状态，所以 Harness 立即添加条目。写入不会启动一次运行。",
                                );
                            } else {
                                const at = idx();
                                startRun(at);
                                u = at;
                                toast(
                                    "对话处于空闲状态，所以 Harness 立即放入输入，并启动一次运行。",
                                );
                            }
                            return draw();
                        }
                        q.push(item);
                        draw();
                    };
                    $("#ib-steer").onclick = () => add("steer");
                    $("#ib-follow").onclick = () => add("follow-up");
                    $("#ib-write").onclick = () => add("write");
                    $("#ib-reject").onclick = () => add("reject");
                    $("#ib-restart").onclick = reset;
                    reset();
                    new IntersectionObserver((es) =>
                        es.forEach((e) => {
                            if (e.isIntersecting && !timerId)
                                timerId = setInterval(tick, reduce ? 300 : 70);
                            else if (!e.isIntersecting && timerId) {
                                clearInterval(timerId);
                                timerId = null;
                            }
                        }),
                    ).observe(lane);
                })();

                /* ================= CHECKOUT TASK TREE ================= */
                (() => {
                    const svg = $("#ck-svg"),
                        logEl = $("#ck-log");
                    const NS = "http://www.w3.org/2000/svg";
                    let st,
                        gen = 0,
                        logs = [];
                    const cards = ["visa-1", "visa-2", "visa-3", "visa-4"];
                    const init = () => ({
                        checkout: "idle",
                        pays: cards.map(() => "—"),
                        note: "",
                        proc: 1,
                        refunds: [],
                        names: cards.slice(),
                    });
                    st = init();
                    const color = (s) =>
                        ({
                            running: "var(--task)",
                            waiting: "var(--commit)",
                            completed: "var(--task)",
                            failed: "var(--crash)",
                            aborted: "var(--crash)",
                            completing: "var(--task)",
                            sleeping: "var(--task)",
                            pending: "var(--ink-2)",
                            decide: "var(--task)",
                        })[s.split(" ")[0]] || "var(--ink-2)";
                    const filled = (s) => /^(completed|failed|aborted)/.test(s);
                    const draw = () => {
                        const box = (x, y, w, h, title, s, sub) => {
                            const c = color(s),
                                f = filled(s);
                            return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${f ? c : "var(--sheet)"}" stroke="${c}" stroke-width="${s === "idle" || s === "—" ? 1 : 1.8}" ${/waiting|pending|completing/.test(s) ? 'stroke-dasharray="5 4"' : ""}/>
        <text x="${x + w / 2}" y="${y + 20}" text-anchor="middle" font-family="var(--mono)" font-size="12" font-weight="700" fill="${f ? "var(--on-ink)" : "var(--ink)"}">${esc(title)}</text>
        <text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" font-family="var(--mono)" font-size="11" fill="${f ? "var(--on-ink)" : c}" ${s === "aborted" ? 'text-decoration="line-through"' : ""}>${esc(s.split(" · ").map(statusText).join(" · "))}</text>
        ${sub ? `<text x="${x + w / 2}" y="${y + 54}" text-anchor="middle" font-family="var(--mono)" font-size="10" fill="${f ? "var(--on-ink)" : "var(--ink-2)"}">${esc(sub)}</text>` : ""}</g>`;
                        };
                        let h = `<text x="10" y="18" font-family="var(--mono)" font-size="11" fill="var(--ink-2)">对话 root · 进程 ${st.proc}</text>`;
                        h += `<line x1="280" y1="24" x2="280" y2="40" stroke="var(--rule)" stroke-width="1.5"/>`;
                        h += box(
                            180,
                            40,
                            200,
                            64,
                            "example.checkout",
                            st.checkout,
                            st.checkout.startsWith("waiting")
                                ? "等待：4 项付款 · failFast"
                                : st.note,
                        );
                        cards.forEach((c, i) => {
                            const x = 10 + i * 137;
                            h += `<path d="M280 104 C280 140, ${x + 62} 130, ${x + 62} 170" fill="none" stroke="var(--rule)" stroke-width="1.5"/>`;
                            h += box(
                                x,
                                170,
                                124,
                                64,
                                st.names[i],
                                st.pays[i],
                                st.refunds.includes(i) ? "已退款" : "",
                            );
                        });
                        h += `<text x="10" y="262" font-family="var(--mono)" font-size="10.5" fill="var(--ink-2)">连线表示归属 · 虚线：不运行代码 · 填色：终态</text>`;
                        svg.innerHTML = h;
                        logEl.innerHTML = logs.length
                            ? logs
                                  .map((l) => `<div><span class="t">${l[0]}</span>${l[1]}</div>`)
                                  .join("")
                            : `<div class="muted">点击按钮，运行一个场景。</div>`;
                        logEl.scrollTop = logEl.scrollHeight;
                        $("#ck-phase").textContent = st.checkout.split(" · ").map(statusText).join(" · ");
                    };
                    const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 60 : ms));
                    let clock = 0;
                    const L = (m) => {
                        clock++;
                        logs.push([`#${String(clock).padStart(2, "0")}`, m]);
                        draw();
                    };
                    async function scenario(kind) {
                        const my = ++gen;
                        logs = [];
                        clock = 0;
                        st = init();
                        draw();
                        const alive = () => my === gen;
                        st.checkout = "running · pay";
                        L("结账任务运行 <b>pay</b> 阶段。");
                        await sleep(600);
                        if (!alive()) return;
                        st.pays = cards.map(() => "pending");
                        st.checkout = "waiting";
                        L(
                            "一次提交创建 4 项归属于结账任务的 Payment 任务，同时把结账任务设为 <b>waiting</b>（failFast）。",
                        );
                        await sleep(700);
                        if (!alive()) return;
                        st.pays = cards.map(() => "running · charge");
                        L(
                            "调度器领取这些付款任务。它们并行运行 <b>charge</b> 阶段。",
                        );
                        await sleep(600);
                        if (!alive()) return;
                        if (kind === "decline") {
                            st.names[1] = "expired-2";
                            st.pays[1] = "failed";
                            L(
                                "银行拒绝了 <b>expired-2</b>。该付款任务提交失败结果。",
                            );
                            await sleep(700);
                            if (!alive()) return;
                            L(
                                "failFast：一项付款失败，因此 Harness 取消结账任务的其他付款任务。",
                            );
                            for (const i of [0, 2, 3]) {
                                st.pays[i] = "aborted";
                                st.refunds.push(i);
                                L(
                                    `付款任务 ${st.names[i]} 的取消处理器运行，扣款<b>已退款</b>。`,
                                );
                                await sleep(380);
                                if (!alive()) return;
                            }
                            st.checkout = "running · decide";
                            L(
                                "全部付款都已进入终态。结账任务不取消，而是继续运行 <b>decide</b> 阶段，读取各项结果。",
                            );
                            await sleep(700);
                            if (!alive()) return;
                            st.checkout = "failed";
                            st.note = "付款失败";
                            L("结账任务提交 <b>failed</b>：付款失败。");
                            return;
                        }
                        L(
                            "每项付款都已扣款。随后在 <code>runtime.sleep()</code> 中等待，直到检查点保存的时间。计时器在内存中，目标时间在存储中。",
                        );
                        await sleep(800);
                        if (!alive()) return;
                        if (kind === "cancel") {
                            st.checkout = "waiting · abort-marked";
                            L(
                                "<b>harness.abortTask(checkout)</b> 给结账任务及其子任务标记取消。取消从底部开始：先取消付款任务。",
                            );
                            await sleep(600);
                            if (!alive()) return;
                            for (const i of [0, 1, 2, 3]) {
                                st.pays[i] = "aborted";
                                st.refunds.push(i);
                                L(
                                    `付款任务 ${st.names[i]} 的取消处理器运行，扣款<b>已退款</b>。`,
                                );
                                await sleep(360);
                                if (!alive()) return;
                            }
                            st.checkout = "aborted";
                            L(
                                "全部付款都已进入终态。随后运行结账任务的取消处理器。结果：<b>aborted</b>。",
                            );
                            return;
                        }
                        if (kind === "restart") {
                            st.proc = 1;
                            L(
                                '<span style="color:var(--crash)">付款任务休眠时调用 <b>harness.close()</b>。</span>',
                            );
                            st.checkout = "waiting";
                            await sleep(800);
                            if (!alive()) return;
                            st.proc = 2;
                            st.pays = st.pays.map(() => "pending");
                            L(
                                "新进程打开同一份 SQLite 文件。付款任务此前是 running 状态，因此在最后的检查点处显示为 <b>pending</b>。结账任务继续等待。",
                            );
                            await sleep(800);
                            if (!alive()) return;
                            st.pays = st.pays.map(() => "running · charge");
                            L(
                                "每项付款从头重新运行 <b>charge</b> 阶段，再等到检查点保存的时间。扣款调用可能执行两次，因此请求银行时必须使用一个键，例如 <code>payment-${task.id}</code>。银行凭这个键去重，才会只向每张卡扣款一次。",
                            );
                            await sleep(700);
                            if (!alive()) return;
                        }
                        for (const i of [2, 0, 3, 1]) {
                            st.pays[i] = "completed";
                            L(`付款任务 ${st.names[i]} 已 <b>completed</b>。`);
                            await sleep(360);
                            if (!alive()) return;
                        }
                        st.checkout = "running · decide";
                        L("全部付款完成。结账任务从 <b>decide</b> 阶段继续。");
                        await sleep(600);
                        if (!alive()) return;
                        st.checkout = "completed";
                        st.note = "已下单";
                        L("结账任务提交 <b>completed</b>：已下单。");
                    }
                    $("#ck-ok").onclick = () => scenario("ok");
                    $("#ck-decline").onclick = () => scenario("decline");
                    $("#ck-cancel").onclick = () => scenario("cancel");
                    $("#ck-restart").onclick = () => scenario("restart");
                    draw();

                    // lifecycle diagram
                    const life = $("#life-svg");
                    const nodes = [
                        ["pending", 75, 90, "var(--ink-2)", "新建，或重启后"],
                        ["running", 230, 90, "var(--task)", "运行一个阶段"],
                        [
                            "waiting",
                            450,
                            40,
                            "var(--commit-ink)",
                            "等待 [tasks] · allSettled | failFast",
                        ],
                        [
                            "completing",
                            450,
                            145,
                            "var(--task)",
                            "结果已设定，归属工作仍在运行",
                        ],
                        [
                            "terminal",
                            680,
                            90,
                            "var(--ink)",
                            "完成 · 失败 · 取消",
                            "孤立 · 故障",
                        ],
                    ];
                    const pos = Object.fromEntries(nodes.map((n) => [n[0], n]));
                    // dx moves the label to the right.
                    const edge = (a, b, label, bend = 0, dx = 0) => {
                        const [, x1, y1] = pos[a],
                            [, x2, y2] = pos[b];
                        const sx = x1 + 58,
                            ex = x2 - 58;
                        const mx = (sx + ex) / 2,
                            my = (y1 + y2) / 2 + bend;
                        return `<path d="M${sx} ${y1} Q${mx} ${my} ${ex} ${y2}" fill="none" stroke="var(--ink-2)" stroke-width="1.3" marker-end="url(#ah)"/>${label ? `<text x="${mx + dx}" y="${bend > 0 ? my + 16 : my - 10}" text-anchor="middle" font-family="var(--mono)" font-size="10" fill="var(--ink-2)">${label}</text>` : ""}`;
                    };
                    let lh = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--ink-2)"/></marker></defs>`;
                    lh += edge("pending", "running", "调度器");
                    lh += edge("running", "waiting", "提交等待状态", -6);
                    lh += edge("running", "completing", "", 6);
                    lh += edge("running", "terminal", "提交结果", 0);
                    lh += edge("completing", "terminal", "归属工作完成", 10, 8);
                    lh += `<path d="M420 23 Q330 0 250 72" fill="none" stroke="var(--ink-2)" stroke-width="1.3" stroke-dasharray="3 3" marker-end="url(#ah)"/><text x="300" y="16" text-anchor="middle" font-family="var(--mono)" font-size="10" fill="var(--ink-2)">子任务完成 → 下一阶段</text>`;
                    nodes.forEach(([n, x, y, c, d, d2]) => {
                        lh += `<rect x="${x - 58}" y="${y - 17}" width="116" height="34" rx="17" fill="var(--sheet)" stroke="${c}" stroke-width="1.8" ${n === "waiting" || n === "completing" ? 'stroke-dasharray="5 4"' : ""}/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="var(--mono)" font-size="12" font-weight="700" fill="${c}"><title>${n}</title>${statusText(n)}</text>`;
                        lh +=
                            n === "waiting"
                                ? `<text x="${x + 64}" y="${y + 4}" font-family="var(--body)" font-size="10.5" fill="var(--ink-2)">${esc(d)}</text>`
                                : `<text x="${x}" y="${y + 32}" text-anchor="middle" font-family="var(--body)" font-size="10.5" fill="var(--ink-2)">${esc(d)}</text>` +
                                  (d2
                                      ? `<text x="${x}" y="${y + 46}" text-anchor="middle" font-family="var(--body)" font-size="10.5" fill="var(--ink-2)">${esc(d2)}</text>`
                                      : "");
                    });
                    life.innerHTML = lh;
                })();

                /* ================= FORKS ================= */
                (() => {
                    const E = [
                        ["pi.user", "规划文档网站", null],
                        ["pi.assistant", "这是大纲……", ["大纲"]],
                        ["pi.user", "添加 API 页面", null],
                        ["pi.assistant", "已添加。下一步：示例", ["大纲", "API 页面"]],
                        ["pi.user", "编写快速入门", null],
                        [
                            "pi.assistant",
                            "快速入门已起草",
                            ["大纲", "API 页面", "快速入门"],
                        ],
                        ["pi.user", "再加一份更新日志", null],
                        [
                            "pi.assistant",
                            "更新日志框架已添加",
                            ["大纲", "API 页面", "快速入门", "更新日志"],
                        ],
                    ];
                    let cut = 3,
                        policy = "asOf";
                    const valAt = (i) => {
                        for (let k = i; k >= 0; k--) if (E[k][2]) return E[k][2];
                        return [];
                    };
                    const current = valAt(E.length - 1);
                    const draw = () => {
                        $("#fk-entries").innerHTML = E.map(
                            ([k, t, d], i) =>
                                `<button class="fe ${i === cut ? "cut" : ""} ${i > cut ? "after" : ""}" data-i="${i}"><span class="i">e${i + 1}</span><span>${chip("entry", k)} ${esc(t)}</span><span class="td">${d ? "待办 +1" : ""}</span></button>`,
                        ).join("");
                        const show = (lab, items, extra = "") =>
                            `<span class="lab">${lab}</span>${items.length ? items.map((x) => `<span class="it">${esc(x)}</span>`).join("") : '<span class="muted">{ items: [] }</span>'}${extra}`;
                        $("#fk-parent").innerHTML = show(
                            "父对话 · app.todos 当前值",
                            current,
                        );
                        const child =
                            policy === "initial" ? [] : policy === "current" ? current : valAt(cut);
                        $("#fk-child").innerHTML = show(
                            `在 e${cut + 1} 分叉 · app.todos 初始值`,
                            child,
                        );
                        $("#fk-child").style.borderColor = "var(--sub)";
                        $("#fk-why").innerHTML =
                            {
                                initial:
                                    '<b>"initial"</b>：分叉从 <code>initial()</code> 返回的值开始。适用于只属于某一条路径的状态，例如临时笔记。',
                                asOf: `<b>"asOf"</b>：分叉取得父对话在分叉点 e${cut + 1} 的值，使待办列表与分叉的对话记录一致。适用于随对话变化的状态。这一策略要求 <code>history: "rewindable"</code>，该设置会保留旧值。`,
                                current:
                                    '<b>"current"</b>：分叉复制父对话的当前值，包括分叉点之后添加的项目。适用于共享设置。',
                            }[policy] +
                            " 分叉展示条目 e1–e" +
                            (cut + 1) +
                            "，然后以新的提供商身份独立继续。";
                        $("#fk-code").textContent = `"${policy}"`;
                        $("#fk-hist").textContent = policy === "asOf" ? '"rewindable"' : '"latest"';
                        $("#fk-hist-c").textContent =
                            policy === "asOf"
                                ? '// "asOf" 需要 "rewindable"：它会读取旧值'
                                : '// 或用 "rewindable"：通过 snapshotAsOf() 读取旧值';
                        $$("#fk-policy button").forEach((b) =>
                            b.setAttribute("aria-pressed", b.dataset.p === policy),
                        );
                    };
                    $("#fk-entries").addEventListener("click", (e) => {
                        const b = e.target.closest(".fe");
                        if (b) {
                            cut = +b.dataset.i;
                            draw();
                        }
                    });
                    $("#fk-policy").addEventListener("click", (e) => {
                        const b = e.target.closest("button");
                        if (b) {
                            policy = b.dataset.p;
                            draw();
                        }
                    });
                    draw();
                })();

                /* ================= HOOKS ================= */
                (() => {
                    const H = {
                        beforeRequest: [
                            "每次尝试请求前运行，恢复后也会运行。它只能替换当前请求的消息。",
                            "在模型收到工具输出前删去过长内容，或添加提醒。",
                            "hook(GenerationTask, { beforeRequest: (req) => ({ messages: trim(req.messages) }) })",
                        ],
                        afterResponse: [
                            "在 Harness 使用响应前，取得每个完整模型响应，包括错误响应。它不能修改响应。",
                            "记录响应、评分，或保存备忘以供后续使用。",
                            "hook(GenerationTask, { afterResponse: (message) => audit(message) })",
                        ],
                        afterTools: [
                            "本回合全部工具结束后、下一次请求前运行。它收到 assistant 条目的 ID 和结果条目的 ID。",
                            "一轮编辑结束后运行一次格式化工具。",
                            "hook(GenerationTask, { afterTools: (assistant, results) => … })",
                        ],
                        onYield: [
                            "模型给出最终回答时运行。它可以用一条新的用户消息接续本次运行。",
                            "继续工作，直到 npm test 通过。",
                            'hook(GenerationTask, { onYield: (answer) => needsMore(answer) ? { continue: "继续。" } : undefined })',
                        ],
                        beforeTool: [
                            "参数校验后、Harness 提交调用意图前运行。它可以阻止调用或修改参数。Harness 会重新校验修改后的参数。",
                            "实现计划模式，或阻止 rm -rf 的防护。",
                            'hook(ToolTask, { beforeTool: (call) => call.name === "bash" ? { block: "此处禁用 bash" } : undefined })',
                        ],
                        afterTool: [
                            "execute() 之后、Harness 保存结果条目之前运行。它可以替换结果。",
                            "从输出中移除秘密信息。",
                            "hook(ToolTask, { afterTool: (call, result) => redact(result) })",
                        ],
                    };
                    const gen = [
                        ["prepare", "生成提示段、选择工具", []],
                        ["request", "接收模型输出流", ["beforeRequest", "afterResponse"]],
                        ["工具回合", "pi.tool × n", ["afterTools"]],
                        ["yield", "最终回答", ["onYield"]],
                    ];
                    const tool = [
                        ["validate", "TypeBox 参数", ["beforeTool"]],
                        ["intent", "已提交", []],
                        ["execute", "env：文件、shell", ["afterTool"]],
                        ["result", "pi.tool-result", []],
                    ];
                    let sel = "beforeTool";
                    const stage = (s) =>
                        `<div class="stage"><b>${esc(statusText(s[0]))}</b><span class="muted">${esc(s[1])}</span><br>${s[2].map((h) => `<button class="hookbtn" data-h="${h}" aria-pressed="${h === sel}">${h}</button>`).join(" ")}</div>`;
                    const draw = () => {
                        $("#pipe-gen").innerHTML = gen
                            .map(stage)
                            .join('<span class="arrow"></span>');
                        $("#pipe-tool").innerHTML = tool
                            .map(stage)
                            .join('<span class="arrow"></span>');
                        const [a, b, c] = H[sel];
                        $("#hook-narr").innerHTML =
                            `<p><b class="mono" style="color:var(--doc)">${sel}</b>：${esc(a)} <span class="muted">示例：${esc(b)}</span></p><div class="api">${esc(c)}</div>`;
                    };
                    document.addEventListener("click", (e) => {
                        const b = e.target.closest(".hookbtn");
                        if (b) {
                            sel = b.dataset.h;
                            draw();
                        }
                    });
                    draw();
                })();

                /* ================= RELOAD ================= */
                (() => {
                    let ver = 1,
                        calls = [],
                        n = 0,
                        narr = "点击“调用 count”。调用运行期间，点击“安装 count v2”。";
                    const draw = () => {
                        $("#rl-reg").innerHTML =
                            `<div class="regx"><span>coding</span><span class="ver v1">v1</span></div><div class="regx"><span>count</span><span class="ver v${ver}">v${ver}</span></div><div class="small muted" style="margin-top:4px"><code>pi.agent</code> 保存扩展名称，例如 <code>["coding","count"]</code>，不保存代码。若 <code>pi.agent</code> 没有名称，对话就使用 Harness 设置中的默认列表；若没有默认列表，则使用全部已安装扩展。Harness 每次使用扩展时，都在注册表中查找其名称。</div>`;
                        $("#rl-calls").innerHTML = calls.length
                            ? calls
                                  .map(
                                      (c) =>
                                          `<div class="call"><span>调用 ${c.id}</span><span class="ver v${c.v}">v${c.v}</span><span class="bar"><i style="width:${c.p}%"></i></span><span class="small ${c.p >= 100 ? "" : "muted"}">${c.p >= 100 ? "已完成" : "运行中"}</span></div>`,
                                  )
                                  .join("")
                            : `<span class="muted small">尚无调用。</span>`;
                        $("#rl-narr").innerHTML = `<p>${narr}</p>`;
                    };
                    $("#rl-call").onclick = () => {
                        const c = { id: ++n, v: ver, p: 0 };
                        calls.push(c);
                        narr = `调用 ${c.id} 开始时，从注册表取得 <code>count</code>，并一直使用 <b>v${c.v}</b>，直到调用完成。`;
                        const iv = setInterval(() => {
                            c.p = Math.min(100, c.p + (reduce ? 50 : 4));
                            draw();
                            if (c.p >= 100) clearInterval(iv);
                        }, 120);
                        draw();
                    };
                    $("#rl-install").onclick = () => {
                        if (ver === 2) {
                            narr =
                                "v2 已安装。再次安装同名扩展，会再次替换它。";
                            return draw();
                        }
                        ver = 2;
                        const running = calls.filter((c) => c.p < 100);
                        narr = `<code>registry.install(countV2)</code> 一步替换了 <code>count</code>。${running.length ? `运行中的调用 ${running.map((c) => c.id).join("、")} 继续使用 <b>v1</b>。` : ""}下一次调用使用 <b>v2</b>。重启后需要重新安装扩展；安装对应扩展后，待运行任务才能继续。`;
                        draw();
                    };
                    $("#rl-reset").onclick = () => {
                        ver = 1;
                        calls = [];
                        n = 0;
                        narr = "点击“调用 count”。调用运行期间，点击“安装 count v2”。";
                        draw();
                    };
                    draw();
                })();

                /* ================= COMPACTION ================= */
                (() => {
                    const WIN = 200000,
                        RES = 16384,
                        BG = 32768,
                        KEEP = 20000;
                    const waitAt = WIN - RES,
                        bgAt = waitAt - BG;
                    const pct = (v) => (v / WIN) * 100;
                    const r = $("#cx-range");
                    let mode = null;
                    $("#cx-zbg").style.left = pct(bgAt) + "%";
                    $("#cx-zbg").style.width = pct(waitAt - bgAt) + "%";
                    $("#cx-zrs").style.left = pct(waitAt) + "%";
                    $("#cx-zrs").style.width = pct(RES) + "%";
                    $("#cx-labels").innerHTML = [
                        [0, "0"],
                        [bgAt, "150,848"],
                        [waitAt, "183,616"],
                    ]
                        .map(
                            ([v, l]) =>
                                `<span style="left:${Math.min(97, Math.max(3, pct(v)))}%">${l}</span>`,
                        )
                        .join("");
                    const draw = () => {
                        const v = +r.value;
                        $("#cx-fill").style.width = pct(v) + "%";
                        $("#cx-val").textContent = v.toLocaleString() + " token";
                        let state, color, text, ctx;
                        if (mode === "over") {
                            state = "上下文过长：先压缩，再重试一次";
                            color = "var(--crash)";
                            text =
                                "提供商因请求过长而拒绝请求。生成任务保存错误响应，但不把它发给模型，随后等待归属于它的压缩任务完成，再重新准备请求并发送一次。若压缩没有产生摘要，本次运行就以模型错误结束。";
                            ctx = [
                                ["sum", "摘要", 1],
                                ["keep", "保留 ~20k", 2],
                            ];
                        } else if (mode === "manual") {
                            state = "手动压缩";
                            color = "var(--doc)";
                            text =
                                'root.compact("保留失败的测试名称", ctx) 立即启动压缩，指令是可选的。这不是后台任务，因此 root.abort()（Esc）会取消它。对话空闲时，Harness 立即添加摘要；否则在下一处边界添加。';
                            ctx = [
                                ["sum", "摘要", 1],
                                ["keep", "保留 ~20k", 2],
                            ];
                        } else if (mode === "reset") {
                            state = "通过交接笔记重置";
                            color = "var(--entry)";
                            text =
                                'root.reset("我们在修复偶发失败的登录测试，请继续。", ctx) 根据一份笔记启动新上下文。模型不再收到旧条目，但它们仍保留在存储中，你的工具还可以读取。工具结果也可以请求通过交接笔记重置，把工作交给新上下文。';
                            ctx = [
                                ["old", "旧条目（保留在存储中，不发送）", 4],
                                ["sum", "pi.reset · 笔记", 1],
                            ];
                        } else if (v < bgAt) {
                            state = "正常";
                            color = "var(--task)";
                            text =
                                "上下文还有空间。Harness 发送上次重置或压缩之后的全部条目。";
                            ctx = [["keep", "发送全部条目", 1]];
                        } else if (v < waitAt) {
                            state = "后台压缩中";
                            color = "var(--commit-ink)";
                            text =
                                "token 数超过后台阈值。压缩任务为旧条目生成摘要，Agent 同时继续工作。摘要就绪后，Harness 在下一处边界添加 pi.compaction 条目；对话空闲时则立即添加。此后，模型接收摘要，而不是第一条保留条目之前的原文。若更新的重置或压缩让上下文起点越过了该保留条目，这份摘要就已过时，Harness 不会添加它。";
                            ctx = [
                                ["old", "正在生成摘要", 3],
                                ["keep", "近期 ~20k 保持不变", 1],
                            ];
                        } else {
                            state = "下一次请求等待中";
                            color = "var(--crash)";
                            text =
                                "token 数进入预留区间。下一次模型请求会等待压缩完成，给回答留出空间。";
                            ctx = [
                                ["sum", "摘要", 1],
                                ["keep", "近期 ~20k", 1],
                            ];
                        }
                        $("#cx-state").innerHTML =
                            `<i class="dot" style="--c:${color}"></i>${state}`;
                        $("#cx-state").style.color = color;
                        $("#cx-narr").innerHTML = `<p>${esc(text)}</p>`;
                        $("#cx-ctx").innerHTML = ctx
                            .map(
                                ([c, l, g]) =>
                                    `<div class="${c}" style="flex:${g} 1 0">${esc(l)}</div>`,
                            )
                            .join("");
                    };
                    r.addEventListener("input", () => {
                        mode = null;
                        draw();
                    });
                    $("#cx-over").onclick = () => {
                        mode = "over";
                        r.value = WIN;
                        draw();
                    };
                    $("#cx-manual").onclick = () => {
                        mode = "manual";
                        draw();
                    };
                    $("#cx-reset").onclick = () => {
                        mode = "reset";
                        draw();
                    };
                    draw();
                })();

                /* ================= WATCH ================= */
                // A watch queues one frame per commit and delivers them one at a time. At 100
                // undelivered frames, the next commit replaces them with one frame of the whole
                // newest view (observation.ts in Pi Durable 1.0.2). New frames queue behind it.
                (() => {
                    const MAX = 100;
                    let seq = 0,
                        lastSnap = -1000,
                        clients,
                        timerId = null;
                    const mk = (name, kind) => ({ name, kind, seen: 0, q: [], joinedAt: null });
                    const reset = () => {
                        seq = 0;
                        clients = [mk("TUI", "watch()"), mk("Laptop · web", "watch()")];
                    };
                    reset();
                    const slow = $("#w-slow");
                    const isSlow = (c) => slow.checked && c.name.startsWith("Laptop");
                    let narr =
                        "点击“持续产生提交”。每个客户端把每次提交中的操作应用到自己的视图。";
                    const draw = () => {
                        $("#w-clients").innerHTML =
                            clients
                                .map((c) => {
                                    const qs = c.q
                                        .map((f) =>
                                            f.snap
                                                ? `<i class="snap" title="包含完整视图的一帧"></i>`
                                                : "<i></i>",
                                        )
                                        .join("");
                                    const snaps = c.q.filter((f) => f.snap).length;
                                    return `<div class="client"><h5><span>${esc(c.name.replace("Laptop · web", "笔记本 · 网页").replace("Phone · web", "手机 · 网页").replace("TUI", "终端界面"))}</span>${chip(isSlow(c) ? "crash" : "task", isSlow(c) ? "缓慢" : "实时")}</h5>
        <div class="muted">${esc(c.kind)}${c.joinedAt != null ? ` · 在 #${c.joinedAt} 加入` : ""}</div>
        <div class="q" aria-label="尚未送达的帧">${qs}</div>
        <div><span class="seen">#${c.seen}</span> <span class="muted">${c.kind.startsWith("watch") ? `当前视图 · 队列中 ${c.q.length} 帧${snaps ? "，其中 1 帧包含完整视图" : ""}` : "实时只读视图"}</span></div></div>`;
                                })
                                .join("") +
                            `<div class="client" style="border-style:dashed"><h5><span>存储</span>${chip("commit", "最新位置")}</h5><div class="muted">同一条提交序列</div><div class="q"></div><div><span class="seen">#${seq}</span></div></div>`;
                        $("#w-narr").innerHTML = `<p>${narr}</p>`;
                    };
                    // Deliver the oldest queued frame.
                    const deliver = (c) => {
                        const f = c.q.shift();
                        if (f) c.seen = f.seq;
                    };
                    const tick = () => {
                        seq++;
                        clients.forEach((c) => {
                            if (!c.kind.startsWith("watch")) {
                                c.seen = seq; // viewState(): a live read-only view, no frame queue
                                return;
                            }
                            if (c.q.length >= MAX) {
                                c.q = [{ seq, snap: true }];
                                lastSnap = seq;
                                narr =
                                    "笔记本有 100 帧尚未收到。下一次提交把它们替换为<b>包含最新完整视图的一帧</b>，之后的新帧排在它后面。";
                            } else {
                                c.q.push({ seq });
                                if (isSlow(c) && c.q.length % 10 === 0 && seq - lastSnap > 40)
                                    narr = `笔记本落后 ${c.q.length} 帧。watch 按顺序逐帧递送。`;
                            }
                            if (!isSlow(c) || Math.random() < 0.12) deliver(c);
                        });
                        if (seq >= 160) {
                            clearInterval(timerId);
                            timerId = null;
                            $("#w-run").textContent = "持续产生提交";
                        }
                        draw();
                    };
                    $("#w-run").onclick = () => {
                        if (timerId) {
                            clearInterval(timerId);
                            timerId = null;
                            $("#w-run").textContent = "持续产生提交";
                            return;
                        }
                        if (seq >= 160) {
                            const joined = clients.length > 2;
                            reset();
                            if (joined) clients.push(mk("Phone · web", "viewState()"));
                        }
                        narr =
                            "Harness 发送提交。快速客户端在每次提交到达时立即应用它。";
                        $("#w-run").textContent = "暂停";
                        timerId = setInterval(tick, reduce ? 120 : 45);
                    };
                    $("#w-join").onclick = () => {
                        if (clients.some((c) => c.name.startsWith("Phone"))) {
                            narr = "手机已连接。";
                            return draw();
                        }
                        const c = mk("Phone · web", "viewState()");
                        c.seen = seq;
                        c.joinedAt = seq;
                        clients.push(c);
                        narr = `手机在提交 #${seq} 时连接，立即取得<b>当前视图</b>：对话记录、流式文本、运行中的工具、收件箱与用量。Harness 不会重放旧提交。`;
                        draw();
                    };
                    // The slow laptop works off its queue faster than commits arrive once it is fast again.
                    setInterval(() => {
                        const lap = clients[1];
                        if (!lap || isSlow(lap) || !lap.q.length) return;
                        for (let i = 0; i < 8; i++) deliver(lap);
                        if (!lap.q.length)
                            narr =
                                "连接恢复正常。笔记本收到了队列中的帧，并显示当前状态。";
                        draw();
                    }, 60);
                    slow.addEventListener("change", draw);
                    draw();
                })();
            })();
