(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ResearchNavigation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function studyHref(currentHref, studyId, filters) {
    const url = new URL(currentHref);
    for (const key of ["evidence", "type", "q", "agent", "replay", "frame", "ax"]) url.searchParams.delete(key);
    for (const [key, value] of [["topic", filters.topic], ["product", filters.product]]) {
      if (!value || value === "all") url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    const query = String(filters.search || "").trim();
    if (query) url.searchParams.set("search", query);
    else url.searchParams.delete("search");
    url.searchParams.set("study", studyId);
    return `${url.pathname}${url.search}`;
  }

  function detailRequest(currentHref, recordIds) {
    const url = new URL(currentHref);
    const types = new Set(["all", "fact", "inference", "unknown"]);
    let type = types.has(url.searchParams.get("type")) ? url.searchParams.get("type") : "all";
    let query = url.searchParams.get("q") || "";
    const requestedEvidence = url.searchParams.get("evidence");
    const validEvidence = requestedEvidence && recordIds.has(requestedEvidence);
    const invalidEvidence = requestedEvidence && !validEvidence ? requestedEvidence : null;

    if (validEvidence) {
      type = "all";
      query = "";
      url.searchParams.delete("type");
      url.searchParams.delete("q");
    } else if (invalidEvidence) {
      type = "all";
      query = "";
      url.searchParams.delete("evidence");
      url.searchParams.delete("type");
      url.searchParams.delete("q");
    }
    url.searchParams.delete("agent");

    return {
      href: url.href,
      type,
      query,
      requestedEvidence: validEvidence ? requestedEvidence : null,
      invalidEvidence,
    };
  }

  return { detailRequest, studyHref };
});
