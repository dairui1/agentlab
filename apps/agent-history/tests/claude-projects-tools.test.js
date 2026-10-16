const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { filterTools, mount } = require("../public/claude-projects.js");

const publicRoot = path.join(__dirname, "..", "public");
const inventory = JSON.parse(fs.readFileSync(path.join(publicRoot, "capabilities/claude-projects-tools.json"), "utf8"));
const html = fs.readFileSync(path.join(publicRoot, "capabilities/claude-projects.html"), "utf8");
const get = (name) => inventory.tools.find((tool) => tool.name === name);

test("Projects inventory pins one reference and separates all 63 coordinator tools", () => {
  assert.equal(inventory.source.repository, "trevorprater/dot-tool-reference");
  assert.equal(inventory.source.revision, "a7237d6a902a8bd59132883882e5dc5ca3f9e569");
  assert.equal(inventory.source.sha256, "e5df37dadfd6835d9abe93ee75e761034b95073616f3537df376193a2c8ef0dc");
  assert.equal(inventory.source.kind, "model-authored-tool-reference");
  assert.equal(inventory.tools.length, 63);
  assert.equal(new Set(inventory.tools.map((tool) => tool.id)).size, 63);
  assert.equal(new Set(inventory.tools.map((tool) => tool.name)).size, 63);
  assert.deepEqual(Object.fromEntries(inventory.groups.map((group) => [group.id, inventory.tools.filter((tool) => tool.group === group.id).length])), {
    builtin: 11,
    "claude-code-remote": 13,
    hearthbot: 39,
  });
  for (const group of inventory.groups) assert.equal(group.count, inventory.tools.filter((tool) => tool.group === group.id).length);
});

test("Projects tool rendering fields have consistent types and safe pinned source URLs", () => {
  for (const tool of inventory.tools) {
    for (const key of ["id", "name", "fullName", "group", "role", "summary", "stage", "module", "source"]) {
      assert.equal(typeof tool[key], "string", `${tool.name}.${key}`);
      assert.ok(tool[key].length > 0, `${tool.name}.${key}`);
    }
    assert.match(tool.id, /^[a-z0-9-]+$/);
    assert.equal(tool.role, "coordinator");
    assert.ok(["P0", "P1", "P2"].includes(tool.stage));
    assert.ok(["observed", "description", "mixed"].includes(tool.outputEvidence));
    for (const key of ["inputFields", "constraints", "outputFields"]) {
      assert.ok(Array.isArray(tool[key]), `${tool.name}.${key}`);
      assert.ok(tool[key].every((value) => typeof value === "string" && value.length > 0), `${tool.name}.${key}`);
    }
    if (Object.hasOwn(tool, "notes")) {
      assert.ok(Array.isArray(tool.notes), `${tool.name}.notes must not become a string rendered character-by-character`);
      assert.ok(tool.notes.every((value) => typeof value === "string" && value.length > 0));
    }
    assert.ok(Number.isInteger(tool.lineStart) && Number.isInteger(tool.lineEnd));
    assert.ok(tool.lineStart >= 23 && tool.lineEnd >= tool.lineStart && tool.lineEnd <= 875);
    assert.equal(tool.source, `${inventory.source.url}#L${tool.lineStart}-L${tool.lineEnd}`);
    const source = new URL(tool.source);
    assert.equal(source.origin, "https://github.com");
    assert.equal(source.pathname, `/${inventory.source.repository}/blob/${inventory.source.revision}/${inventory.source.path}`);
    assert.equal(tool.fullName, tool.group === "builtin" ? tool.name : `mcp__${tool.group}__${tool.name}`);
  }
});

test("Projects reference distinguishes observed outputs from described contracts", () => {
  assert.equal(get("add_repo").outputEvidence, "mixed");
  assert.equal(get("start_thread_session").outputEvidence, "mixed");
  assert.equal(get("message_thread").outputEvidence, "description");
  assert.equal(get("post_message").outputEvidence, "observed");
  assert.match(get("start_thread_session").outputFields.join(" "), /already_running:true（description）/);
  assert.match(get("list_devices").notes.join(" "), /为空/);
  assert.match(get("update_project_settings").constraints.join(" "), /proactivity_level.*没有/);
  assert.match(inventory.evidenceBoundary, /不是.*后端源代码/);
  assert.match(inventory.evidenceBoundary, /不是 AgentLab 的运行复现/);
});

test("Projects key limits preserve bytes versus characters and implementation stages", () => {
  assert.match(get("message_thread").constraints.join(" "), /8000 字符/);
  assert.match(get("start_thread_session").constraints.join(" "), /8192 字节/);
  assert.match(get("update_memory").constraints.join(" "), /16384 字节/);
  assert.match(get("update_memory").constraints.join(" "), /不等于.*总容量/);
  assert.match(get("message_thread").constraints.join(" "), /任何一个.*整次不发送/);
  assert.match(get("list_events").constraints.join(" "), /空 data 不表示到底/);
  assert.match(get("list_thread_sessions").constraints.join(" "), /disconnected/);
  for (const tool of inventory.tools) {
    if (["memory", "scheduler"].includes(tool.module)) assert.equal(tool.stage, "P1", tool.name);
    if (tool.module === "device") assert.equal(tool.stage, "P2", tool.name);
  }
});

test("Projects worker scope does not enlarge the coordinator inventory or imply thread parity", () => {
  assert.equal(inventory.workerScope.extraBuiltinTools.length, 21);
  assert.equal(inventory.workerScope.extraRemoteTools.length, 13);
  for (const name of ["Bash", "Read", "Write", "Artifact", "ToolSearch", "create_trigger"]) assert.equal(get(name), undefined);
  assert.ok(inventory.workerScope.absent.includes("所有 hearthbot 工具"));
  assert.ok(inventory.workerScope.absent.includes("Agent"));
  assert.ok(inventory.workerScope.absent.includes("reply"));
  assert.match(inventory.workerScope.provenance, /不能直接.*所有 thread/);
  for (const entry of [...inventory.workerScope.extraBuiltinTools, ...inventory.workerScope.extraRemoteTools, ...inventory.knownGaps]) {
    assert.ok(entry.lineStart > 0 && entry.lineEnd >= entry.lineStart && entry.lineEnd <= 1719);
    assert.equal(entry.source, `${inventory.source.url}#L${entry.lineStart}-L${entry.lineEnd}`);
  }
});

test("Projects empty search preserves order without mutating the source inventory", () => {
  const before = JSON.stringify(inventory.tools);
  const selected = filterTools(inventory.tools);
  assert.deepEqual(selected, inventory.tools);
  assert.notEqual(selected, inventory.tools);
  assert.deepEqual(filterTools(inventory.tools, " \n\t "), inventory.tools);
  assert.equal(JSON.stringify(inventory.tools), before);
});

test("Projects search matches names, fields and Chinese descriptions case-insensitively", () => {
  const names = (query) => filterTools(inventory.tools, query).map((tool) => tool.name);
  assert.deepEqual(names("  START_THREAD_SESSION  "), names("start_thread_session"));
  assert.ok(names("context_message_ids").includes("message_thread"));
  assert.ok(names("context_message_ids").includes("start_thread_session"));
  assert.ok(names("整体替换").includes("update_memory"));
  assert.ok(names("Remote Control").includes("start_rc_session"));
  assert.deepEqual(filterTools(inventory.tools, "missing-tool-name-456789"), []);
});

test("Projects query, group and stage filters compose rather than replace each other", () => {
  const remote = filterTools(inventory.tools, "", "claude-code-remote");
  assert.equal(remote.length, 13);
  assert.ok(remote.every((tool) => tool.group === "claude-code-remote"));
  const memory = filterTools(inventory.tools, "update_memory", "hearthbot", "P1");
  assert.deepEqual(memory.map((tool) => tool.name), ["update_memory"]);
  assert.deepEqual(filterTools(inventory.tools, "update_memory", "hearthbot", "P0"), []);
  assert.deepEqual(filterTools(inventory.tools, "update_memory", "builtin", "P1"), []);
  assert.deepEqual(filterTools(inventory.tools, "", "unknown-group"), []);
  assert.deepEqual(filterTools(inventory.tools, "", "all", "unknown-stage"), []);
  assert.deepEqual(filterTools([], "memory", "hearthbot", "P1"), []);
});

test("Projects article tool entry links resolve and retain a no-JavaScript reference path", () => {
  const names = new Set(inventory.tools.map((tool) => tool.name));
  const links = [...html.matchAll(/data-tool-link="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(links.length >= 8);
  for (const name of links) assert.ok(names.has(name), name);
  assert.match(html, /<noscript>[\s\S]*?claude-projects-tools\.json[\s\S]*?claude-projects\.md[\s\S]*?<\/noscript>/);
  for (const id of ["projectsToolSearch", "projectsToolGroup", "projectsToolStage", "projectsToolStatus", "projectsToolList"]) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, "g"))].length, 1, id);
  }
});

test("Projects failed index load keeps controls disabled and does not become an empty-search result", async () => {
  const controls = { hidden: true };
  const nodes = Object.fromEntries(["projectsToolSearch", "projectsToolGroup", "projectsToolStage", "projectsToolStatus", "projectsToolList"].map((id) => [id, {
    value: id === "projectsToolSearch" ? "" : "all",
    hidden: true,
    disabled: false,
    textContent: "",
    listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    closest() { return controls; },
  }]));
  mount({
    document: {
      getElementById: (id) => nodes[id],
      querySelectorAll: () => [],
    },
    location: { href: "https://example.test/capabilities/claude-projects.html" },
    addEventListener() {},
    fetch: async () => ({ ok: false }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const status = nodes.projectsToolStatus;
  assert.match(status.textContent, /工具索引暂不可用/);
  const failedStatus = status.textContent;
  for (const id of ["projectsToolSearch", "projectsToolGroup", "projectsToolStage"]) assert.equal(nodes[id].disabled, true);
  nodes.projectsToolSearch.value = "memory";
  nodes.projectsToolSearch.listeners.input();
  nodes.projectsToolGroup.listeners.change();
  nodes.projectsToolStage.listeners.change();
  assert.equal(status.textContent, failedStatus);
  assert.equal(controls.hidden, false);
  assert.equal(status.hidden, false);
});
