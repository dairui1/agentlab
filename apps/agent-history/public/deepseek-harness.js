(function initDeepSeekHarnessTracker() {
  "use strict";

  const core = window.deepSeekHarnessCore;
  const $ = (id) => document.getElementById(id);
  const importanceLabels = { high: "高影响", medium: "中影响", low: "低影响", none: "发布记录" };
  const state = { history: null, changelog: null, plugins: null, pluginMode: "top", selected: "" };
  const numberFormatter = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

  function dateLabel(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "时间未知";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function refreshIcons() {
    window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  function entryFor(version) {
    return state.changelog.entries.find((entry) => entry.version === version);
  }

  function releaseFor(version) {
    return state.history.versions.find((release) => release.version === version);
  }

  function domainById(id) {
    return core.domains.find((domain) => domain.id === id);
  }

  function renderOverview() {
    const entries = state.changelog.entries;
    const releases = state.history.versions;
    const latest = releases.at(-1);
    $("latestVersion").textContent = latest.version;
    $("latestDate").textContent = dateLabel(latest.publishedAt || latest.capturedAt);
    $("releaseCount").textContent = String(releases.length);
    $("notesCount").textContent = String(entries.filter((entry) => core.officialNotes(entry)).length);
    $("compareCount").textContent = String(entries.filter((entry) => core.codeChange(entry)).length);
    $("runtimeCount").textContent = String(releases.filter((release) => release.runtimeCapture?.promptStatus === "available").length);

    const counts = core.domainCounts(entries);
    $("domainGrid").replaceChildren(...core.domains.map((domain) => {
      const item = document.createElement("div");
      item.className = "dsh-domain";
      const icon = document.createElement("i");
      icon.dataset.lucide = domain.icon;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("strong");
      label.textContent = domain.label;
      const count = document.createElement("b");
      count.textContent = String(counts[domain.id]);
      const copy = document.createElement("span");
      copy.textContent = "个版本出现信号";
      item.append(icon, label, count, copy);
      return item;
    }));
  }

  function renderPluginLeaderboard() {
    const leaderboard = state.plugins?.leaderboards?.[state.pluginMode];
    if (!leaderboard) return;
    const catalog = state.plugins.catalog;
    const source = state.plugins.source;
    $("pluginCatalogCount").textContent = `${catalog.pluginCount.toLocaleString("zh-CN")} 个插件 · ${catalog.categoryCount} 类`;
    const checkedAt = state.pluginMode === "top" ? source.starsCheckedAt : source.downloadsCheckedAt;
    $("pluginSyncDate").textContent = `${state.pluginMode === "top" ? "Stars" : "Downloads"} 数据 ${checkedAt || source.catalogUpdated || "日期未知"}`;
    $("pluginMethod").textContent = leaderboard.method;
    document.querySelectorAll("[data-plugin-mode]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.pluginMode === state.pluginMode));
    });
    $("pluginList").replaceChildren(...leaderboard.items.map((plugin) => {
      const item = document.createElement("li");
      item.className = "dsh-plugin-row";
      const rank = document.createElement("span");
      rank.className = "dsh-plugin-rank";
      rank.textContent = String(plugin.rank).padStart(2, "0");
      const identity = document.createElement("div");
      identity.className = "dsh-plugin-identity";
      const link = document.createElement("a");
      link.href = plugin.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = plugin.name;
      const description = document.createElement("p");
      description.textContent = plugin.description?.zh || plugin.description?.en || "暂无简介";
      identity.append(link, description);
      const category = document.createElement("span");
      category.className = "dsh-plugin-category";
      category.textContent = catalog.categories[plugin.category] || plugin.category;
      const stars = document.createElement("span");
      stars.className = "dsh-plugin-stat";
      stars.innerHTML = `<i data-lucide="star" aria-hidden="true"></i><b>${numberFormatter.format(plugin.stars || 0)}</b><small>Stars</small>`;
      const downloads = document.createElement("span");
      downloads.className = "dsh-plugin-stat";
      downloads.innerHTML = plugin.downloads == null
        ? `<i data-lucide="download" aria-hidden="true"></i><b>—</b><small>30 天下载</small>`
        : `<i data-lucide="download" aria-hidden="true"></i><b>${numberFormatter.format(plugin.downloads)}</b><small>30 天下载</small>`;
      item.append(rank, identity, category, stars, downloads);
      return item;
    }));
    refreshIcons();
  }

  function renderPluginUnavailable(message) {
    $("pluginCatalogCount").textContent = "插件榜单暂不可用";
    $("pluginSyncDate").textContent = "Release 追踪不受影响";
    $("pluginMethod").textContent = message;
    $("pluginList").replaceChildren();
  }

  function renderReleaseList() {
    const entries = [...state.changelog.entries].reverse();
    $("releaseList").replaceChildren(...entries.map((entry) => {
      const release = releaseFor(entry.version);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dsh-release-button";
      button.dataset.version = entry.version;
      button.setAttribute("aria-current", String(entry.version === state.selected));
      const version = document.createElement("strong");
      version.textContent = entry.version;
      const time = document.createElement("time");
      time.dateTime = release?.publishedAt || release?.capturedAt || "";
      time.textContent = dateLabel(time.dateTime);
      const domains = document.createElement("span");
      domains.textContent = core.classifyEntry(entry).map((id) => domainById(id)?.label).filter(Boolean).slice(0, 3).join(" · ") || "仅确认发布";
      button.append(version, time, domains);
      return button;
    }));
  }

  function evidenceItem(label, stateValue, detail, href = "") {
    const node = document.createElement(href ? "a" : "div");
    node.className = "dsh-evidence-item";
    node.dataset.state = stateValue;
    if (href) {
      node.href = href;
      node.target = "_blank";
      node.rel = "noopener noreferrer";
    }
    const stateLabel = document.createElement("span");
    stateLabel.textContent = stateValue === "available" ? "AVAILABLE" : "UNAVAILABLE";
    const title = document.createElement("strong");
    title.textContent = label;
    const copy = document.createElement("small");
    copy.textContent = detail;
    node.append(stateLabel, title, copy);
    return node;
  }

  function renderOfficialFacts(entry) {
    const sections = core.chineseReleaseSections(entry);
    if (sections.length) {
      $("officialSections").replaceChildren(...sections.map((section) => {
        const group = document.createElement("section");
        group.className = "dsh-official-group";
        const title = document.createElement("h4");
        title.textContent = section.label;
        const list = document.createElement("ul");
        section.items.forEach((text) => {
          const item = document.createElement("li");
          item.textContent = text;
          list.appendChild(item);
        });
        group.append(title, list);
        return group;
      }));
      $("analysisHighlights").replaceChildren();
      return;
    }
    $("officialSections").replaceChildren(Object.assign(document.createElement("div"), {
      className: "dsh-empty",
      textContent: "该版本只确认了发布事实，当前没有可引用的官方 Release 正文。",
    }));
    $("analysisHighlights").replaceChildren(...(entry.highlights || []).slice(0, 5).map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }));
  }

  function renderInspector() {
    const entry = entryFor(state.selected);
    const release = releaseFor(state.selected);
    if (!entry || !release) return;
    $("selectedDate").textContent = `${entry.version} · ${dateLabel(release.publishedAt || release.capturedAt)}`;
    $("selectedTitle").textContent = entry.title;
    $("selectedSummary").textContent = entry.summary;
    $("selectedImportance").textContent = importanceLabels[entry.importance] || "已分析";
    $("selectedImportance").dataset.value = entry.importance || "none";

    const domainIds = core.classifyEntry(entry);
    $("selectedDomains").replaceChildren(...domainIds.map((id) => {
      const tag = document.createElement("span");
      tag.className = "dsh-domain-tag";
      tag.textContent = domainById(id)?.label || id;
      return tag;
    }));
    renderOfficialFacts(entry);

    const official = entry.layers?.official;
    const notes = official?.release?.notes;
    const code = core.codeChange(entry);
    const source = (entry.sources || []).find((item) => item.sourceType === "official-release");
    const compareSource = (entry.sources || []).find((item) => item.sourceType === "official-code-compare");
    const runtimeAvailable = release.runtimeCapture?.promptStatus === "available";
    const staticAvailable = entry.layers?.staticPrompt?.status === "changed" || entry.layers?.staticPrompt?.status === "unchanged";
    $("evidenceLedger").replaceChildren(
      evidenceItem("官方 Release", notes?.text ? "available" : "unavailable", notes?.text ? `${notes.originalBytes || 0} bytes · ${notes.sourceKind}` : "未收录正文", source?.url || ""),
      evidenceItem("代码比较", code ? "available" : "unavailable", code ? `${code.filesObserved} files · +${code.additionsObserved} / -${code.deletionsObserved}${code.truncated ? " · 截断" : ""}` : "无相邻 tag 比较", code?.sourceUrl || compareSource?.url || ""),
      evidenceItem("Runtime Request", runtimeAvailable ? "available" : "unavailable", runtimeAvailable ? "Prompt 与 Tool Schema 捕获可用" : "没有公开运行时捕获"),
      evidenceItem("Static Prompt", staticAvailable ? "available" : "unavailable", staticAvailable ? "静态资产比较可用" : "没有可比较静态资产"),
    );

    const boundaries = [];
    const text = core.searchableText(entry);
    if (/不兼容|incompatible/i.test(text)) boundaries.push(["DATA FORMAT", "官方说明标记存储格式不兼容；升级前必须验证迁移、回滚与旧 Session 读取。"]);
    if (/非交互权限|non-interactive permission/i.test(text)) boundaries.push(["AUTHORITY", "Codex Subagent 新增非交互权限模式；权限决策不能沿用交互 Session 的默认假设。"]);
    if (/持久 PowerShell|persistent PowerShell/i.test(text)) boundaries.push(["PROCESS STATE", "Windows PTY 开始跨命令保留 PowerShell 状态；取消、超时和资源回收需要按持久 Session 验证。"]);
    if (/图片|image/i.test(text)) boundaries.push(["PAYLOAD", "图片尺寸与历史累计载荷已有失败修复；需要继续监测单次与多轮 Context 上限。"]);
    if (!boundaries.length) boundaries.push(["EVIDENCE", "当前没有官方声明的破坏性边界；这不等于已验证向后兼容。"]);
    $("compatibilityList").replaceChildren(...boundaries.map(([label, copy]) => {
      const row = document.createElement("div");
      row.className = "dsh-boundary";
      const title = document.createElement("strong");
      title.textContent = label;
      const detail = document.createElement("span");
      detail.textContent = copy;
      row.append(title, detail);
      return row;
    }));

    document.querySelectorAll(".dsh-release-button").forEach((button) => {
      button.setAttribute("aria-current", String(button.dataset.version === state.selected));
    });
    const url = new URL(window.location.href);
    url.searchParams.set("version", state.selected);
    history.replaceState(null, "", url);
    refreshIcons();
  }

  async function boot() {
    try {
      const pluginRequest = fetch("/data/deepseek-harness/plugins.json")
        .then((response) => {
          if (!response.ok) throw new Error(`插件榜单 HTTP ${response.status}`);
          return response.json();
        });
      const [historyResponse, changelogResponse] = await Promise.all([
        fetch("/data/agents/deepseek-harness/history.json"),
        fetch("/data/agents/deepseek-harness/changelog.json"),
      ]);
      if (!historyResponse.ok || !changelogResponse.ok) throw new Error("DSH 数据读取失败");
      [state.history, state.changelog] = await Promise.all([historyResponse.json(), changelogResponse.json()]);
      const requested = new URL(window.location.href).searchParams.get("version");
      const versions = new Set(state.changelog.entries.map((entry) => entry.version));
      state.selected = versions.has(requested) ? requested : state.changelog.entries.at(-1).version;
      renderOverview();
      renderReleaseList();
      renderInspector();
      try {
        state.plugins = await pluginRequest;
        renderPluginLeaderboard();
      } catch (error) {
        renderPluginUnavailable(error.message);
      }
      $("pluginTopTab").parentElement.addEventListener("click", (event) => {
        const button = event.target.closest("[data-plugin-mode]");
        if (!button || !state.plugins) return;
        state.pluginMode = button.dataset.pluginMode;
        renderPluginLeaderboard();
      });
      $("releaseList").addEventListener("click", (event) => {
        const button = event.target.closest("[data-version]");
        if (!button) return;
        state.selected = button.dataset.version;
        renderInspector();
        $("releaseInspector").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      $("selectedTitle").textContent = "DeepSeek Harness 数据暂不可用";
      $("selectedSummary").textContent = error.message;
    }
    refreshIcons();
  }

  boot();
})();
