(function () {
  "use strict";
  const url = new URL(location.href);
  if (url.searchParams.get("source") === "1") return;
  const route = url.pathname.replace(/\.html$/, "");
  const paths = {
    "/capabilities/code-mode": "code-mode",
    "/capabilities/oar": "oar",
    "/capabilities/raven": "raven",
    "/capabilities/mimoagent": "mimoagent",
    "/capabilities/autoresearch": "autoresearch",
    "/capabilities/raft-multi-agent": "raft-multi-agent",
    "/capabilities/raft-collaboration": "raft-collaboration",
    "/capabilities/claude-tag": "claude-tag",
    "/capabilities/goal-mode": "goal-mode",
    "/capabilities/gpt-prompt-evolution": "gpt-prompt-evolution",
    "/capabilities/exo-recursive-harness": "exo-recursive-harness",
    "/capabilities/deepseek-harness-architecture": "deepseek-harness-architecture",
    "/capabilities/token-budget-context": "token-budget-context",
    "/capabilities/browser-use": "browser-use",
    "/capabilities/computer-use": "computer-use",
  };
  const mechanisms = new Set(["subagent-orchestration", "session-resume", "context-compaction", "model-routing", "permission-sandbox", "tool-contract", "mcp-dynamic-tools"]);
  const requested = url.searchParams.get("mechanism");
  const study = route === "/mechanisms" ? (mechanisms.has(requested) ? requested : "subagent-orchestration") : paths[route];
  if (!study) return;
  const target = new URL(`/guides/${study}.html`, url);
  if (url.searchParams.has("from")) target.searchParams.set("from", url.searchParams.get("from"));
  location.replace(target.pathname + target.search);
})();
