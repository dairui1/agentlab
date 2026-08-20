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

  const pluginCapabilities = [
    {
      id: "workspace",
      icon: "panels-top-left",
      layer: "SURFACE",
      title: "工作台与交互界面",
      description: "扩展侧栏、终端、任务面板、移动端入口、主题和状态反馈，让 DSH 从聊天界面变成可操作的工程工作台。",
      forms: ["UI 增强", "主题与外观", "远程与移动端"],
      boundary: "浏览器宿主兼容、前端资源隔离与升级后的 UI API 稳定性。",
    },
    {
      id: "memory",
      icon: "brain-circuit",
      layer: "CONTEXT",
      title: "Memory 与 Context",
      description: "在回合前召回项目知识，在回合后保存经验，或把文档、会话和仓库信息组织成可检索的长期 Context。",
      forms: ["长期记忆", "项目上下文", "会话引用"],
      boundary: "注入内容的来源、作用域、过期策略、隐私和 Context 膨胀。",
    },
    {
      id: "multimodal",
      icon: "scan-eye",
      layer: "INPUT / OUTPUT",
      title: "视觉、语音与文档",
      description: "为文本模型补上看图、OCR、语音输入输出、截图理解、文档解析和结果渲染能力。",
      forms: ["视觉桥接", "语音与音频", "文档渲染"],
      boundary: "媒体是否离开本机、第三方服务配额、文件大小和多轮载荷。",
    },
    {
      id: "tools",
      icon: "wrench",
      layer: "TOOLS",
      title: "工具与外部系统",
      description: "把浏览器、搜索、Git、通知、企业通信和垂直 API 变成 Agent 可调用的 Tool，扩展可执行动作集合。",
      forms: ["Browser 与网页", "Git 与评审", "通知与集成"],
      boundary: "Tool Schema、授权粒度、网络出口、幂等性和外部副作用。",
    },
    {
      id: "workflow",
      icon: "workflow",
      layer: "ORCHESTRATION",
      title: "工作流与 Agent 编排",
      description: "提供任务 DAG、多 Agent 协作、审批门、交接、验证收据和领域流程，把单回合执行组织成长任务。",
      forms: ["Agent Teams", "任务工作流", "技能包"],
      boundary: "子任务权限继承、失败传播、取消、结算顺序和恢复语义。",
    },
    {
      id: "model",
      icon: "route",
      layer: "MODEL ACCESS",
      title: "模型、身份与用量",
      description: "接入不同模型和账号，提供路由、余额、Token、成本与配额视图，并处理身份和消息桥接。",
      forms: ["模型接入", "身份与通信", "用量与计费"],
      boundary: "凭据存放、请求代理、模型能力差异、计费口径与故障降级。",
    },
    {
      id: "runtime",
      icon: "shield-check",
      layer: "RUNTIME",
      title: "运行时、安全与管理",
      description: "增强沙箱、权限检查、Telemetry 脱敏、运行诊断、插件安装更新和开发调试能力。",
      forms: ["安全与权限", "开发与运行时", "插件市场"],
      boundary: "插件本身运行在什么信任域，以及启停、升级、卸载能否完整回收状态。",
    },
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

  return { domains, pluginCapabilities, classifyEntry, chineseReleaseSections, codeChange, domainCounts, officialNotes, searchableText };
});
