(function () {
  "use strict";
  const destination = document.body.dataset.guideRedirect;
  if (!destination) return;
  const current = new URL(location.href);
  const target = new URL(destination, current.origin);
  if (target.origin !== current.origin || target.pathname.startsWith("/guides/")) return;
  if (current.searchParams.has("from")) target.searchParams.set("from", current.searchParams.get("from"));
  if (current.hash && !current.hash.startsWith("#rg-")) target.hash = current.hash;
  location.replace(target.pathname + target.search + target.hash);
})();
