(function () {
  "use strict";
  const url = new URL(location.href);
  if (url.searchParams.get("source") === "1") return;
  const route = url.pathname.replace(/\.html$/, "");
  const paths = {
    "/capabilities/code-mode": "code-mode",
    "/capabilities/oar": "oar",
    "/capabilities/goal-mode": "goal-mode",
    "/capabilities/token-budget-context": "token-budget-context",
  };
  const mechanisms = new Set(["subagent-orchestration", "session-resume", "context-compaction", "permission-sandbox", "tool-contract", "mcp-dynamic-tools"]);
  const requested = url.searchParams.get("mechanism");
  if (route === "/mechanisms" && requested === "model-routing") return;
  const study = route === "/mechanisms" ? (mechanisms.has(requested) ? requested : "subagent-orchestration") : paths[route];
  if (!study) return;
  const target = new URL(`/guides/${study}.html`, url);
  if (url.searchParams.has("from")) target.searchParams.set("from", url.searchParams.get("from"));
  location.replace(target.pathname + target.search);
})();
