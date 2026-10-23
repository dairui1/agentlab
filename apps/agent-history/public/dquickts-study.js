(function () {
  "use strict";
  const current = new URL(location.href);
  let target = "/capabilities.html";
  try {
    const candidate = new URL(current.searchParams.get("from") || target, current.origin);
    if (candidate.origin === current.origin && ["/capabilities", "/capabilities.html"].includes(candidate.pathname)) {
      for (const key of ["study", "evidence", "type", "q", "agent", "replay", "frame", "ax"]) candidate.searchParams.delete(key);
      target = `${candidate.pathname}${candidate.search}`;
    }
  } catch { /* Keep the local catalog fallback. */ }
  document.querySelectorAll("[data-catalog-back]").forEach(link => { link.href = target; });
}());
