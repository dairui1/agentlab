(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.mount(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const groupLabels = { builtin: "内建", "claude-code-remote": "Claude Code Remote", hearthbot: "hearthbot" };
  const outputLabels = { observed: "原作者观察", description: "按描述推定", mixed: "观察与描述分列" };

  function filterTools(tools, query = "", group = "all", stage = "all") {
    const needle = query.trim().toLowerCase();
    return tools.filter((tool) => (group === "all" || tool.group === group)
      && (stage === "all" || tool.stage === stage)
      && JSON.stringify(tool).toLowerCase().includes(needle));
  }

  function mount(root) {
    const document = root.document;
    const search = document.getElementById("projectsToolSearch");
    if (!search) return;
    const group = document.getElementById("projectsToolGroup");
    const stage = document.getElementById("projectsToolStage");
    const list = document.getElementById("projectsToolList");
    const status = document.getElementById("projectsToolStatus");
    let tools = [];
    let ready = false;
    search.closest(".projects-tool-controls").hidden = false;
    status.hidden = false;
    for (const control of [search, group, stage]) control.disabled = true;
    const element = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const updateUrl = (tool = null) => {
      const url = new URL(root.location.href);
      for (const [key, value, empty] of [["q", search.value.trim(), ""], ["group", group.value, "all"], ["stage", stage.value, "all"], ["tool", tool, null]]) {
        if (value !== empty) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      root.history.replaceState(root.history.state, "", url);
    };

    function toolItem(tool) {
      const item = element("details", "", "projects-tool");
      item.id = `tool-${tool.id}`;
      item.dataset.toolName = tool.name;
      const summary = element("summary");
      summary.append(element("code", tool.name), element("small", `${groupLabels[tool.group]} · ${tool.stage} · ${tool.module}`));
      item.append(summary);
      item.addEventListener("toggle", () => {
        if (!item.open || item.childElementCount > 1) return;
        const content = element("div");
        content.append(element("p", tool.summary));
        if (tool.inputFields?.length) content.append(element("p", `输入字段：${tool.inputFields.join("、")}`, "projects-tool-meta"));
        if (tool.constraints?.length) {
          const constraints = element("ul");
          for (const constraint of tool.constraints) constraints.append(element("li", constraint));
          content.append(constraints);
        }
        if (tool.outputFields?.length) content.append(element("p", `返回（${outputLabels[tool.outputEvidence]}）：${tool.outputFields.join("；")}`));
        for (const note of tool.notes || []) content.append(element("p", note));
        const link = element("a", `原仓库描述与 Schema · L${tool.lineStart}-L${tool.lineEnd}`);
        const url = new URL(tool.source);
        if (url.protocol === "https:" && url.hostname === "github.com") link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const permalink = element("a", "本工具永久入口");
        const local = new URL(root.location.pathname, root.location.origin);
        local.searchParams.set("tool", tool.name);
        local.hash = "tools";
        permalink.href = local.pathname + local.search + local.hash;
        content.append(link, document.createTextNode(" · "), permalink);
        item.append(content);
      });
      return item;
    }

    function render(sync = true) {
      if (!ready) return;
      const selected = filterTools(tools, search.value, group.value, stage.value);
      list.replaceChildren(...selected.map(toolItem));
      status.textContent = selected.length ? `${selected.length} / ${tools.length} 项工具` : "没有匹配的工具。";
      if (sync) updateUrl();
    }

    function openTool(name, focus = false) {
      if (!tools.length) return;
      const tool = tools.find((entry) => entry.name === name || entry.id === name);
      if (!tool) return;
      search.value = "";
      group.value = stage.value = "all";
      render(false);
      updateUrl(tool.name);
      const item = document.getElementById(`tool-${tool.id}`);
      item.open = true;
      item.scrollIntoView({ block: "center", behavior: "instant" });
      if (focus) item.querySelector("summary").focus({ preventScroll: true });
    }

    search.addEventListener("input", () => render());
    group.addEventListener("change", () => render());
    stage.addEventListener("change", () => render());
    for (const link of document.querySelectorAll("[data-tool-link]")) {
      link.addEventListener("click", (event) => {
        if (!tools.length || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openTool(link.dataset.toolLink, true);
      });
    }
    const restore = () => {
      const params = new URL(root.location.href).searchParams;
      search.value = params.get("q") || "";
      group.value = Object.hasOwn(groupLabels, params.get("group")) ? params.get("group") : "all";
      stage.value = ["P0", "P1", "P2"].includes(params.get("stage")) ? params.get("stage") : "all";
      render(false);
      if (params.has("tool")) openTool(params.get("tool"));
    };
    root.addEventListener("popstate", restore);
    root.fetch("/capabilities/claude-projects-tools.json").then((response) => {
      if (!response.ok) throw new Error("tool index unavailable");
      return response.json();
    }).then((data) => {
      if (!Array.isArray(data.tools) || data.tools.length !== 63) throw new Error("tool index incomplete");
      tools = data.tools;
      ready = true;
      for (const control of [search, group, stage]) control.disabled = false;
      restore();
    }).catch(() => {
      status.textContent = "工具索引暂不可用；可从上方 JSON 链接或下方原仓库读取。";
    });
  }
  return { filterTools, mount };
});
