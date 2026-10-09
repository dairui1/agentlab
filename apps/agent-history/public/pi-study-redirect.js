(function () {
  "use strict";
  let hash = "";
  try { hash = decodeURIComponent(location.hash.slice(1)); } catch { /* Keep the default destination for malformed hashes. */ }
  const target = /^PD-\d+$/.test(hash) ? `#implementation-${hash}` : "";
  location.replace(`/capabilities/pi-durable-guide.html${target}`);
})();
