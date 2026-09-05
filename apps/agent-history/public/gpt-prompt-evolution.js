(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.init(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const pairs = {
    "5.5-5.6": ["gpt-5.5", "gpt-5.6"],
    "5.6-6": ["gpt-5.6", "gpt-6-astra"],
  };
  const defaultPair = "5.5-5.6";
  const labels = { "gpt-5.5": "GPT-5.5", "gpt-5.6": "GPT-5.6", "gpt-6-astra": "GPT-6 Astra" };

  function sourceLines(text) {
    const lines = text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines;
  }

  function extract(text, ranges) {
    const source = sourceLines(text);
    const lines = [], numbers = [];
    for (const [start, end] of ranges) {
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > source.length) {
        throw new Error("原文行号超出固定文件范围");
      }
      if (lines.length) { lines.push(""); numbers.push(null); }
      for (let i = start; i <= end; i += 1) { lines.push(source[i - 1]); numbers.push(i); }
    }
    return { text: lines.join("\n"), numbers };
  }

  function selectGroups(study, corpus, pair) {
    pair = Object.hasOwn(pairs, pair) ? pair : defaultPair;
    const ids = pairs[pair];
    const versions = new Map(corpus.versions.map((version) => [version.id, version]));
    return study.comparisons.map((group) => {
      const sides = ids.map((id) => {
        const source = versions.get(id);
        if (!source) throw new Error(`缺少固定原文：${id}`);
        return { ...extract(source.text, group.ranges[id]), source, ranges: group.ranges[id] };
      });
      return { ...group, sides, explanation: group.explanations[pair] };
    }).filter((group) => group.sides.some((side) => side.text.trim()));
  }

  function init(root) {
    const document = root.document;
    const container = document.getElementById("promptDiffSections");
    if (!container) return;
    const status = document.getElementById("promptDiffStatus");
    const toc = document.getElementById("promptDiffToc");
    const pairControl = document.getElementById("promptPair");
    const wrapControl = document.getElementById("promptWrap");
    const unchangedControl = document.getElementById("promptUnchanged");
    const dark = root.matchMedia("(prefers-color-scheme: dark)");
    const url = new URL(root.location.href);
    pairControl.value = Object.hasOwn(pairs, url.searchParams.get("pair")) ? url.searchParams.get("pair") : defaultPair;
    let wrap = url.searchParams.get("wrap") !== "0";
    unchangedControl.checked = url.searchParams.get("unchanged") === "1";
    wrapControl.setAttribute("aria-pressed", String(wrap));
    let study, corpus, loader, epoch = 0, records = [], observer, tocObserver;

    function el(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function retryButton(action) {
      const button = el("button", "icon-button");
      button.type = "button";
      button.title = "重试";
      button.setAttribute("aria-label", "重试");
      const icon = el("i");
      icon.dataset.lucide = "refresh-cw";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", action);
      return button;
    }

    function icons() { root.lucide?.createIcons?.(); }

    function persist() {
      const next = new URL(root.location.href);
      next.searchParams.set("pair", pairControl.value);
      if (wrap) next.searchParams.delete("wrap"); else next.searchParams.set("wrap", "0");
      if (unchangedControl.checked) next.searchParams.set("unchanged", "1"); else next.searchParams.delete("unchanged");
      root.history.replaceState(root.history.state, "", next);
    }

    function loadMonaco() {
      if (root.monaco?.editor) return Promise.resolve(root.monaco);
      if (loader) return loader;
      loader = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          root.clearTimeout(timeout);
          if (error) reject(error); else resolve(root.monaco);
        };
        const timeout = root.setTimeout(() => finish(new Error("Diff 组件加载超时")), 15000);
        const script = el("script");
        script.src = "/vendor/monaco/vs/loader.js";
        script.async = true;
        script.onerror = () => finish(new Error("Diff 组件加载失败"));
        script.onload = () => {
          if (!root.require?.config) { finish(new Error("Diff 加载器不可用")); return; }
          root.require.config({ paths: { vs: "/vendor/monaco/vs" } });
          root.require(["vs/editor/editor.main"], () => {
            finish(root.monaco?.editor ? null : new Error("Diff 组件未初始化"));
          }, (error) => finish(new Error(error?.message || "Diff 组件初始化失败")));
        };
        document.head.append(script);
      }).catch((error) => { loader = null; throw error; });
      return loader;
    }

    function options() {
      return {
        wordWrap: wrap ? "on" : "off", diffWordWrap: "inherit",
        hideUnchangedRegions: { enabled: !unchangedControl.checked, contextLineCount: 2, minimumLineCount: 3, revealLineCount: 5 },
      };
    }

    async function mount(record) {
      if (record.loading || record.editor || record.epoch !== epoch) return;
      record.loading = true;
      record.host.dataset.state = "loading";
      record.host.replaceChildren(el("div", "prompt-editor-state", "正在计算差异…"));
      try {
        const monaco = await loadMonaco();
        if (record.epoch !== epoch || !record.host.isConnected) return;
        monaco.editor.setTheme(dark.matches ? "vs-dark" : "vs");
        record.host.replaceChildren();
        const editor = monaco.editor.createDiffEditor(record.host, {
          automaticLayout: true, readOnly: true, originalEditable: false,
          renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false,
          enableSplitViewResizing: false, renderIndicators: true,
          renderMarginRevertIcon: false, renderOverviewRuler: false,
          diffAlgorithm: "advanced", ignoreTrimWhitespace: false,
          fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace",
          fontSize: 12, lineHeight: 19, letterSpacing: 0,
          minimap: { enabled: false }, overviewRulerLanes: 0,
          lineNumbersMinChars: 3, glyphMargin: false, folding: false,
          scrollBeyondLastLine: false, smoothScrolling: false,
          stickyScroll: { enabled: false }, guides: { indentation: false },
          padding: { top: 8, bottom: 8 },
          scrollbar: { alwaysConsumeMouseWheel: false },
          ...options(),
        });
        record.editor = editor;
        record.models = record.group.sides.map((side, index) => monaco.editor.createModel(side.text, "markdown",
          monaco.Uri.parse(`inmemory://prompt-evolution/${record.epoch}/${record.group.id}/${index}.md`)));
        editor.setModel({ original: record.models[0], modified: record.models[1] });
        [editor.getOriginalEditor(), editor.getModifiedEditor()].forEach((pane, index) => pane.updateOptions({
          lineNumbers: (line) => String(record.group.sides[index].numbers[line - 1] ?? ""),
          ariaLabel: `${record.group.title} ${index ? "新版" : "旧版"}原文`,
        }));
        const resize = () => {
          root.cancelAnimationFrame(record.frame);
          record.frame = root.requestAnimationFrame(() => {
            if (record.epoch !== epoch) return;
            const height = Math.max(160, Math.min(420, Math.max(editor.getOriginalEditor().getContentHeight(), editor.getModifiedEditor().getContentHeight())));
            if (record.host.style.height !== `${height}px`) {
              record.host.style.height = `${height}px`;
              editor.layout();
            }
          });
        };
        const update = () => {
          const changes = editor.getLineChanges();
          if (!changes) return;
          const stats = root.PromptHistoryMonacoView.statsFromLineChanges(changes);
          if (!record.group.sides[0].text) stats.deletions = 0;
          if (!record.group.sides[1].text) stats.additions = 0;
          record.stats.replaceChildren(el("span", "prompt-deleted", `−${stats.deletions}`), el("span", "prompt-added", `+${stats.additions}`));
          record.host.dataset.state = "ready";
          record.host.dataset.hunks = stats.hunks;
          resize();
        };
        record.subscriptions = [editor.onDidUpdateDiff(update), editor.getOriginalEditor().onDidContentSizeChange(resize), editor.getModifiedEditor().onDidContentSizeChange(resize)];
        update();
        resize();
      } catch (error) {
        if (record.epoch !== epoch) return;
        record.subscriptions?.forEach((subscription) => subscription.dispose());
        record.editor?.dispose();
        record.editor = null;
        record.models?.forEach((model) => model.dispose());
        record.models = [];
        record.host.dataset.state = "error";
        const notice = el("div", "prompt-editor-state", error.message);
        notice.append(retryButton(() => mount(record)));
        record.host.replaceChildren(notice);
        icons();
      } finally { record.loading = false; }
    }

    function sourceLabel(side) {
      const node = el("div");
      node.append(el("strong", "", labels[side.source.id]));
      if (!side.ranges.length) node.append(el("small", "", "该模板未列出此段"));
      for (const [start, end] of side.ranges) {
        const link = el("a", "", `L${start}–${end}`);
        link.href = `${side.source.url}#L${start}-L${end}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        node.append(link);
      }
      return node;
    }

    function render() {
      epoch += 1;
      observer?.disconnect();
      tocObserver?.disconnect();
      for (const record of records) {
        root.cancelAnimationFrame(record.frame);
        record.subscriptions?.forEach((subscription) => subscription.dispose());
        record.editor?.dispose();
        record.models?.forEach((model) => model.dispose());
      }
      records = [];
      container.replaceChildren();
      toc.replaceChildren();
      const groups = selectGroups(study, corpus, pairControl.value);
      groups.forEach((group, i) => {
        const number = String(i + 1).padStart(2, "0");
        const section = el("section");
        section.id = group.id;
        section.dataset.articleSection = "";
        const heading = el("div", "prompt-group-title");
        const stats = el("span", "prompt-group-stats");
        stats.setAttribute("aria-label", "删除与新增行数");
        heading.append(el("span", "prompt-group-number", number), el("h2", "", group.title), stats);
        const scroll = el("div", "prompt-diff-scroll");
        scroll.tabIndex = 0;
        scroll.setAttribute("role", "region");
        scroll.setAttribute("aria-label", `${group.title} 左右原文差异`);
        const frame = el("div", "prompt-diff-frame");
        const labelsRow = el("div", "prompt-diff-labels");
        labelsRow.append(...group.sides.map(sourceLabel));
        const host = el("div", "prompt-editor");
        host.dataset.state = "pending";
        host.append(el("div", "prompt-editor-state", "等待载入差异…"));
        frame.append(labelsRow, host);
        scroll.append(frame);
        const explanation = el("p", "prompt-explanation", group.explanation);
        if (group.evidence.length) {
          const evidence = el("button", "evidence-ref", group.evidence.join(" / "));
          evidence.type = "button";
          evidence.dataset.evidence = group.evidence.join(" ");
          evidence.dataset.evidenceTrigger = "";
          evidence.setAttribute("aria-controls", "articleEvidence");
          explanation.append(document.createTextNode(" "), evidence);
        }
        section.append(heading, scroll, explanation);
        container.append(section);
        const link = el("a");
        link.href = `#${group.id}`;
        link.append(el("span", "", number), document.createTextNode(group.title));
        toc.append(link);
        records.push({ host, section, group, stats, link, epoch });
      });
      observer = new root.IntersectionObserver((entries) => {
        for (const entry of entries) if (entry.isIntersecting) {
          const record = records.find((item) => item.host === entry.target);
          if (record) mount(record);
          observer.unobserve(entry.target);
        }
      }, { rootMargin: "400px" });
      tocObserver = new root.IntersectionObserver(updateActiveSection, { rootMargin: "-15% 0px -65%" });
      records.forEach((record) => { observer.observe(record.host); tocObserver.observe(record.section); });
      if (root.location.hash) document.getElementById(root.location.hash.slice(1))?.scrollIntoView();
      status.hidden = true;
    }

    function updateActiveSection() {
      const top = document.querySelector(".prompt-diff-toolbar").getBoundingClientRect().bottom + 100;
      const current = records.filter((record) => record.section.getBoundingClientRect().top <= top).at(-1) || records[0];
      records.forEach((record) => {
        if (record === current) record.link.setAttribute("aria-current", "location");
        else record.link.removeAttribute("aria-current");
      });
    }

    async function load() {
      status.hidden = false;
      status.textContent = "正在载入 Prompt…";
      try {
        const values = await Promise.all(["gpt-prompt-evolution.json", "gpt-prompt-evolution-diff.json"].map(async (name) => {
          const response = await root.fetch(`/capabilities/${name}`);
          if (!response.ok) throw new Error(`Prompt 资料返回 HTTP ${response.status}`);
          return response.json();
        }));
        [study, corpus] = values;
        render();
      } catch (error) {
        status.replaceChildren(document.createTextNode(`${error.message} `), retryButton(load));
        icons();
      }
    }

    pairControl.addEventListener("change", () => { persist(); if (study && corpus) render(); });
    wrapControl.addEventListener("click", () => {
      wrap = !wrap;
      wrapControl.setAttribute("aria-pressed", String(wrap));
      persist();
      records.forEach((record) => record.editor?.updateOptions(options()));
    });
    unchangedControl.addEventListener("change", () => {
      persist();
      records.forEach((record) => record.editor?.updateOptions(options()));
    });
    dark.addEventListener("change", () => root.monaco?.editor.setTheme(dark.matches ? "vs-dark" : "vs"));
    root.addEventListener("scroll", updateActiveSection, { passive: true });
    persist();
    load();
  }

  return { pairs, sourceLines, extract, selectGroups, init };
});
