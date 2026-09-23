(function () {
  "use strict";
  const search = document.getElementById("tagToolSearch");
  const family = document.getElementById("tagToolFamily");
  const list = document.getElementById("tagToolList");
  const status = document.getElementById("tagToolStatus");
  const labels = { coordinator: "读取与协调", remote: "Claude Code Remote", slack: "Slack" };
  let tools = [];
  function render() {
    const query = search.value.trim().toLowerCase();
    const selected = tools.filter((t) => (family.value === "all" || family.value === t.family) && `${t.name} ${JSON.stringify(t.schema)}`.toLowerCase().includes(query));
    list.replaceChildren();
    status.textContent = selected.length ? `${selected.length} / ${tools.length} 项工具` : "没有匹配的工具。";
    for (const tool of selected) {
      const item = document.createElement("details");
      item.className = "tag-tool";
      const summary = document.createElement("summary");
      const name = document.createElement("code");
      name.textContent = tool.name.replace(/^mcp__(?:slackbot|claude-code-remote)__/, "");
      const group = document.createElement("small");
      group.textContent = `${labels[tool.family]} · L${tool.lineStart}–${tool.lineEnd}`;
      summary.append(name, group);
      item.append(summary);
      // Build the large schema only when opened; the index stays cheap to scan.
      item.addEventListener("toggle", () => {
        if (!item.open || item.childElementCount > 1) return;
        const required = document.createElement("p");
        required.textContent = `Schema 必填：${tool.schema.required?.join(", ") || "无"}。其他语义条件见原始描述。`;
        const link = document.createElement("a");
        link.textContent = "原始描述与 Schema";
        link.href = tool.source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = JSON.stringify(tool.schema, null, 2);
        pre.append(code);
        item.append(required, link, pre);
      });
      list.append(item);
    }
  }
  search.addEventListener("input", render);
  family.addEventListener("change", render);
  fetch("/capabilities/claude-tag-tools.json").then((response) => {
    if (!response.ok) throw new Error("tool index unavailable");
    return response.json();
  }).then((data) => { tools = data.tools; render(); }).catch(() => {
    status.textContent = "工具索引未能加载，请刷新页面重试；原始 Prompt 链接位于来源一节。";
  });
})();
