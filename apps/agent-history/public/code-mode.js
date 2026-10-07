(function initCodeMode(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.mount(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function createCodeMode() {
  "use strict";
  const diagrams = {
    execution: {
      title: "三份数据，什么时候回到模型？",
      note: "教学推演 · A=1.2，B=1.2，C=1.3",
      lanes: ["模型", "程序", "宿主工具"],
      edges: [["forward", "none"], ["none", "back"], ["none", "none"], ["back", "none"]],
      steps: [
        { label: "写程序", values: ["查询 + 比较", "收到代码", "尚未调用"], active: [0], text: "模型把“查三个版本，再找出与 A 不同的项”写成程序。到这里，版本数据还没有被读取。" },
        { label: "读版本", values: ["等待输出", "发起三次查询", "返回三个版本"], active: [1, 2], text: "程序调用工具，宿主负责真正读取仓库。三份结果先回到程序；模型暂时不需要读它们。" },
        { label: "做比较", values: ["仍在等待", "筛出 C=1.3", "查询已完成"], active: [1], text: "程序按事先写好的规则比较，留下 C。这里只是找差异，以 A 为基准并不表示 A 的版本正确。" },
        { label: "交回结果", values: ["收到 C=1.3", "输出差异", "共查询三次"], active: [0, 1], text: "模型看到筛选后的结果，再向用户解释。查询次数仍然是三次，省掉的是让模型阅读和搬运中间数据的过程。" }
      ]
    },
    codex: {
      title: "一次长任务，从提交到结束",
      note: "时序示意 · 非实测记录",
      lanes: ["模型", "运行单元 cell", "宿主工具"],
      edges: [["forward", "forward"], ["back", "none"], ["forward", "back"], ["back", "none"]],
      steps: [
        { label: "exec", values: ["提交代码", "开始执行", "处理请求"], active: [0, 1, 2], text: "模型提交一段含 await 的程序，Codex 启动新的 V8 执行环境。工具还没做完时，程序会在 await 处等待。" },
        { label: "先返回", values: ["收到 cell ID", "继续等待", "仍在执行"], active: [1, 2], text: "等到 yield_time_ms，宿主可以先把已有输出和 running cell ID 交给模型。这里只结束了本轮等待，程序和工具并没有因此被取消。" },
        { label: "wait", values: ["凭 ID 等待", "仍是同一段程序", "返回工具结果"], active: [0, 1, 2], text: "模型用 wait 接着收结果，而不是重新提交一次 exec。再次等到时间但还没完成时，返回的仍是这个 cell ID。" },
        { label: "完成", values: ["收到最终输出", "执行结束", "请求已返回"], active: [0], text: "程序完成，最后一批输出交回模型，cell 关闭。脚本里没有 await 的后台 Promise 不能靠这一机制续命；执行环境结束时，它们会被丢弃。" }
      ]
    },
    sandbox: {
      title: "同样是读文件，走的是不同的路",
      note: "边界示意 · 非安全测试",
      lanes: ["沙盒中的程序", "宿主工具入口", "文件"],
      edges: [["none", "none"], ["forward", "forward"], ["back", "none"]],
      steps: [
        { label: "直接读取", values: ["没有文件 API", "未收到请求", "未访问"], active: [0], warning: [0], text: "这里以 Pi 的 QuickJS 环境为例：代码没有现成的 fs 模块，不能因为会写 JavaScript，就直接读取宿主文件。" },
        { label: "通过工具", values: ["请求读取", "检查后执行", "返回内容"], active: [1, 2], text: "若宿主暴露了读取工具，并允许这次请求，真正接触文件的是宿主里的工具实现。虚拟机隔离与工具授权在这里分工。" },
        { label: "拒绝请求", values: ["收到拒绝结果", "权限检查拒绝", "未访问"], active: [1], warning: [1], text: "假设宿主检查拒绝了路径，程序只能拿到拒绝结果。图里展示的是应有的权限路径；某个具体集成是否完整执行这些检查，还得追它的派发代码。" }
      ]
    },
    state: {
      title: "文件改了，store 却还停在上一步",
      note: "Pi 失败场景推演 · 非实测记录",
      lanes: ["普通变量", "会话 store", "外部文件"],
      steps: [
        { label: "执行前", values: ["新环境", "step = 0", "旧内容"], active: [], text: "上一次成功执行留下 step=0。这次脚本开始时，普通变量重新创建；store 和文件各自保留先前的内容。" },
        { label: "完成写入", values: ["step = 1", "新值尚未提交", "已写入新内容"], active: [0, 2], text: "脚本先成功修改文件，再调用 store 保存 step=1。文件已经改变，Pi 的会话状态则要等整段脚本成功后才提交。" },
        { label: "随后报错", values: ["随环境销毁", "仍是 step = 0", "新内容仍在"], active: [1, 2], warning: [1], text: "后面的语句抛出异常，Pi 不提交这次 store 修改。但写文件已经发生，脚本失败不会把文件改回去。" },
        { label: "再次执行", values: ["再次创建", "load 得到 0", "需要重新核对"], active: [1, 2], text: "下一段程序只看 store，会误以为写入还没发生。恢复前要读取文件或检查回执，再决定从哪一步继续，不能把整段代码直接重跑。" }
      ]
    }
  };
  function resolveNode(hash, ids, evidenceNode) {
    let id;
    try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { id = ""; }
    return ids.includes(id) ? id : (ids.includes(evidenceNode) ? evidenceNode : "overview");
  }
  function adjacentNodes(id, ids) {
    const index = ids.indexOf(id);
    return { previous: ids[index - 1] || null, next: ids[index + 1] || null };
  }
  function mount(root) {
    const doc = root.document;
    const nodes = [...doc.querySelectorAll("[data-node]")];
    if (!nodes.length) return;
    const ids = nodes.map((node) => node.id);
    const tree = doc.querySelector(".cm-tree");
    const content = doc.getElementById("cmContent");
    const mobile = root.matchMedia("(max-width: 680px)");
    const treeLinks = [...tree.querySelectorAll("nav a[href^='#']")];
    const parentLink = doc.getElementById("cmParentLink");
    const tabGroups = [];
    const el = (tag, className, text) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const icon = (name) => {
      const node = el("i");
      node.dataset.lucide = name;
      node.setAttribute("aria-hidden", "true");
      return node;
    };
    const iconButton = (name, label) => {
      const node = el("button");
      node.type = "button";
      node.title = label;
      node.setAttribute("aria-label", label);
      node.append(icon(name));
      return node;
    };

    const mobileBar = el("div", "cm-mobile-bar");
    const toggle = iconButton("list-tree", "打开 Code Mode 目录");
    toggle.id = "cmTreeToggle";
    toggle.setAttribute("aria-controls", "cmTree");
    toggle.setAttribute("aria-expanded", "false");
    const mobileTitle = el("div");
    const mobileCurrent = el("span");
    mobileTitle.append(el("strong", "", "Code Mode"), mobileCurrent);
    mobileBar.append(toggle, mobileTitle);
    doc.querySelector(".cm-workspace").before(mobileBar);
    const closeTree = iconButton("x", "关闭目录");
    closeTree.id = "cmTreeClose";
    closeTree.className = "cm-tree-close";
    tree.querySelector(".cm-tree-heading").append(closeTree);
    const backdrop = el("div", "cm-tree-backdrop");
    backdrop.id = "cmTreeBackdrop";
    backdrop.hidden = true;
    doc.body.append(backdrop);
    const background = [content, mobileBar, doc.querySelector(".article-shell > header")];
    let previousOverflow = "";
    function setTree(open, restoreFocus = false) {
      const wasOpen = tree.hasAttribute("data-open");
      if (open && !wasOpen) previousOverflow = doc.body.style.overflow;
      tree.toggleAttribute("data-open", open);
      backdrop.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      tree.inert = mobile.matches && !open;
      background.forEach((node) => { node.inert = open; });
      if (open) {
        tree.setAttribute("role", "dialog");
        tree.setAttribute("aria-modal", "true");
        tree.setAttribute("aria-label", "Code Mode 目录");
        doc.body.style.overflow = "hidden";
        closeTree.focus();
      } else {
        tree.removeAttribute("role");
        tree.removeAttribute("aria-modal");
        tree.removeAttribute("aria-label");
        if (wasOpen) doc.body.style.overflow = previousOverflow;
        if (restoreFocus) toggle.focus();
      }
    }
    toggle.addEventListener("click", () => setTree(true));
    closeTree.addEventListener("click", () => setTree(false, true));
    backdrop.addEventListener("click", () => setTree(false, true));
    tree.addEventListener("keydown", (event) => {
      if (!tree.hasAttribute("data-open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setTree(false, true);
      } else if (event.key === "Tab") {
        const focusable = [...tree.querySelectorAll("a, button")].filter((node) => node.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    });
    tree.addEventListener("click", (event) => {
      if (event.target.closest("a[href^='#']") && mobile.matches) setTree(false, true);
    });
    mobile.addEventListener("change", () => setTree(false));
    setTree(false);

    const readingNav = el("nav", "cm-reading-nav");
    readingNav.setAttribute("aria-label", "顺序阅读");
    function readingLink(id, rel, label, arrow) {
      const link = el("a");
      link.id = id;
      link.rel = rel;
      const words = el("span");
      words.append(el("small", "", label), el("span", "cm-reading-title"));
      link.append(...(rel === "next" ? [words, icon(arrow)] : [icon(arrow), words]));
      readingNav.append(link);
      return link;
    }
    const previous = readingLink("cmPrevLink", "prev", "上一节", "arrow-left");
    const next = readingLink("cmNextLink", "next", "接着讲", "arrow-right");
    parentLink.parentElement.before(readingNav);
    doc.querySelectorAll(".cm-child-links a").forEach((link) => link.append(icon(link.host === root.location.host ? "arrow-right" : "arrow-up-right")));

    // Each example is a local illustration; no source code or tool is executed here.
    Object.entries(diagrams).forEach(([name, data]) => {
      const target = doc.querySelector('[data-diagram="' + name + '"]');
      if (!target) return;
      const figure = el("figure", "cm-diagram");
      figure.dataset.kind = name;
      const heading = el("div", "cm-diagram-heading");
      heading.append(el("h3", "", data.title), el("span", "", data.note));
      const tabs = el("div", "cm-diagram-tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", data.title);
      figure.append(heading, tabs);
      data.steps.forEach((step, index) => {
        const tab = el("button", "", step.label);
        tab.type = "button";
        tab.id = name + "-step-" + index;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", name + "-panel-" + index);
        tabs.append(tab);
        const panel = el("div", "cm-diagram-panel");
        panel.id = name + "-panel-" + index;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        const lanes = el("div", "cm-lanes");
        data.lanes.forEach((label, laneIndex) => {
          const lane = el("div", "cm-lane");
          lane.dataset.edge = data.edges?.[index]?.[laneIndex] || "none";
          lane.toggleAttribute("data-active", step.active.includes(laneIndex));
          lane.toggleAttribute("data-warning", (step.warning || []).includes(laneIndex));
          lane.append(el("span", "", label), el("strong", "", step.values[laneIndex]));
          lanes.append(lane);
        });
        panel.append(lanes, el("p", "", step.text));
        figure.append(panel);
      });
      const footer = el("div", "cm-diagram-counter");
      const count = el("span");
      count.setAttribute("aria-live", "polite");
      const advance = iconButton("arrow-right", "下一步");
      advance.dataset.diagramNext = "";
      footer.append(count, advance);
      figure.append(footer);
      target.replaceChildren(figure);
      const group = initTabs(tabs, (index) => {
        count.textContent = String(index + 1).padStart(2, "0") + " / " + String(data.steps.length).padStart(2, "0");
        const label = index === data.steps.length - 1 ? "回到第一步" : "下一步";
        advance.title = label;
        advance.setAttribute("aria-label", label);
      });
      advance.addEventListener("click", () => group.select((group.index() + 1) % data.steps.length));
    });

    function initTabs(tablist, onChange = () => {}) {
      const tabs = [...tablist.querySelectorAll("[role='tab']")];
      const panels = tabs.map((tab) => doc.getElementById(tab.getAttribute("aria-controls")));
      let selected = 0;
      function select(index, focus = false) {
        selected = index;
        tabs.forEach((tab, at) => {
          tab.setAttribute("aria-selected", String(at === index));
          tab.tabIndex = at === index ? 0 : -1;
          panels[at].hidden = at !== index;
        });
        onChange(index);
        if (focus) tabs[index].focus();
      }
      tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => select(index));
        tab.addEventListener("keydown", (event) => {
          const to = event.key === "ArrowRight" ? (index + 1) % tabs.length
            : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
              : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (to < 0) return;
          event.preventDefault();
          select(to, true);
        });
      });
      function measure() {
        if (!tablist.getClientRects().length) return;
        // Reserve the tallest state, including wrapped mobile text, before toggling.
        panels.forEach((panel) => { panel.hidden = false; panel.style.minHeight = ""; });
        const height = Math.ceil(Math.max(...panels.map((panel) => panel.getBoundingClientRect().height)));
        panels.forEach((panel) => { panel.style.minHeight = height + "px"; });
        select(selected);
      }
      select(0);
      tabGroups.push({ measure });
      return { select, index: () => selected };
    }
    doc.querySelectorAll(".cm-example-tabs").forEach((tablist) => initTabs(tablist));

    const evidence = new URL(root.location.href).searchParams.get("evidence");
    const evidenceNode = nodes.find((node) => [...node.querySelectorAll("[data-evidence]")].some((trigger) => trigger.dataset.evidence.split(" ").includes(evidence)))?.id;
    let current;
    function show(focus = false) {
      const id = resolveNode(root.location.hash, ids, evidenceNode);
      const node = nodes.find((item) => item.id === id);
      nodes.forEach((item) => { item.hidden = item !== node; });
      treeLinks.forEach((link) => {
        if (link.hash === "#" + id) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      tree.querySelectorAll(".cm-branches > li").forEach((branch) => branch.toggleAttribute("data-active", !!branch.querySelector('[aria-current="page"]')));
      const parent = nodes.find((item) => item.id === node.dataset.parent);
      parentLink.href = "#" + (parent?.id || "overview");
      parentLink.querySelector("span").textContent = parent ? parent.querySelector("h1, h2").textContent : "Code Mode 全貌";
      parentLink.parentElement.hidden = id === "overview";
      const adjacent = adjacentNodes(id, ids);
      [[previous, adjacent.previous], [next, adjacent.next]].forEach(([link, target]) => {
        link.hidden = !target;
        if (target) {
          link.href = "#" + target;
          link.querySelector(".cm-reading-title").textContent = nodes.find((item) => item.id === target).querySelector("h1, h2").textContent;
        }
      });
      const title = node.querySelector("h1, h2").textContent;
      mobileCurrent.textContent = id === "overview" ? "全貌" : title;
      doc.title = id === "overview" ? "Code Mode · AgentLab" : title + " · Code Mode · AgentLab";
      tabGroups.forEach((group) => group.measure());
      if (current !== id && focus) {
        if (mobile.matches) setTree(false);
        node.querySelector("h1, h2").focus({ preventScroll: true });
        content.scrollIntoView({ block: "start" });
      }
      current = id;
    }
    doc.body.classList.add("cm-enhanced");
    show();
    // Initial fragment scrolling must account for the sticky mobile navigation.
    root.addEventListener("load", () => root.requestAnimationFrame(() => {
      if (!root.location.hash) return;
      if (current === "overview") root.scrollTo(0, 0);
      else content.scrollIntoView({ block: "start" });
    }), { once: true });
    root.addEventListener("hashchange", () => show(true));
    let resize;
    root.addEventListener("resize", () => {
      root.cancelAnimationFrame(resize);
      resize = root.requestAnimationFrame(() => tabGroups.forEach((group) => group.measure()));
    });
    doc.fonts?.ready.then(() => tabGroups.forEach((group) => group.measure()));
    root.lucide?.createIcons?.();
  }
  return { resolveNode, adjacentNodes, diagrams, mount };
});
