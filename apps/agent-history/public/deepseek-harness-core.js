(function initDeepSeekHarnessCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.deepSeekHarnessCore = api;
})(typeof globalThis === "object" ? globalThis : this, function buildDeepSeekHarnessCore() {
  "use strict";

  const domains = [
    { id: "composition", label: "组合与 Plugin", icon: "blocks", pattern: /profile|bundle|plugin|preset|cordis|安装/i },
    { id: "orchestration", label: "Agent 编排", icon: "network", pattern: /subagent|子代理|agent team|job panel|reportdelivery|父任务/i },
    { id: "context", label: "Context 与多模态", icon: "images", pattern: /图片|图文|image|附件|attachment|context|会话引用|session reference/i },
    { id: "execution", label: "执行环境", icon: "square-terminal", pattern: /pty|powershell|bash|shell|terminal|sandbox|执行/i },
    { id: "state", label: "Session 与存储", icon: "database", pattern: /sqlite|存储|storage|session|会话|分叉|fork|历史/i },
    { id: "surface", label: "宿主与 SDK", icon: "panels-top-left", pattern: /sdk|web|mcp|acp|stdio|gateway|界面|侧栏|工作流/i },
    { id: "reliability", label: "可靠性与兼容", icon: "shield-check", pattern: /修复|fix|失败|兼容|incompatible|性能|载荷|取消|截断|retry/i },
  ];

  function officialNotes(entry) {
    return String(entry?.layers?.official?.release?.notes?.text || "");
  }

  function searchableText(entry) {
    return [entry?.title, entry?.summary, ...(entry?.highlights || []), officialNotes(entry)]
      .filter(Boolean)
      .join("\n");
  }

  function classifyEntry(entry) {
    const text = searchableText(entry);
    return domains.filter((domain) => domain.pattern.test(text)).map((domain) => domain.id);
  }

  function chineseReleaseSections(entry) {
    const notes = officialNotes(entry).split(/^---\s*$/m)[0];
    const sections = [];
    let current = null;
    notes.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      const heading = line.match(/^(?:###\s+|<h3[^>]*>)(.*?)(?:<\/h3>)?$/i);
      if (heading) {
        const label = heading[1].replace(/<[^>]+>/g, "").trim();
        if (label && !label.includes("中文")) {
          current = { label, items: [] };
          sections.push(current);
        }
        return;
      }
      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet && current) current.items.push(bullet[1]);
    });
    return sections.filter((section) => section.items.length);
  }

  function codeChange(entry) {
    const value = entry?.layers?.official?.codeChange;
    return value?.status === "available" ? value : null;
  }

  function domainCounts(entries) {
    return Object.fromEntries(domains.map((domain) => [
      domain.id,
      entries.filter((entry) => classifyEntry(entry).includes(domain.id)).length,
    ]));
  }

  return { domains, classifyEntry, chineseReleaseSections, codeChange, domainCounts, officialNotes, searchableText };
});
