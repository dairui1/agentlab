(function initMonacoView(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptHistoryMonacoView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function manifestEntry(manifest, version) {
    if (!manifest || typeof manifest !== "object") return null;
    const versions = manifest.releases ?? manifest.versions ?? manifest;
    if (Array.isArray(versions)) {
      return versions.find((entry) => entry?.version === version) || null;
    }
    const entry = versions?.[version];
    return entry && typeof entry === "object" ? { version, ...entry } : null;
  }

  function runtimeAssetUrl(entry) {
    if (!entry || typeof entry !== "object") throw new Error("运行时请求清单缺少版本记录");
    const value = entry.url || entry.path;
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`v${entry.version || "?"} 缺少运行时请求地址`);
    }
    const clean = value.trim().replace(/^\.\//, "");
    if (/^(?:[a-z]+:)?\/\//i.test(clean) || clean.startsWith("data:")) {
      throw new Error("运行时请求必须使用同源静态资源");
    }
    return clean.startsWith("/") ? clean : `/${clean}`;
  }

  function lineSpan(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || end === 0) return 0;
    return Math.max(0, end - start + 1);
  }

  function statsFromLineChanges(changes) {
    const stats = { additions: 0, deletions: 0, hunks: 0 };
    for (const change of changes || []) {
      stats.hunks += 1;
      stats.deletions += lineSpan(
        change.originalStartLineNumber,
        change.originalEndLineNumber,
      );
      stats.additions += lineSpan(
        change.modifiedStartLineNumber,
        change.modifiedEndLineNumber,
      );
    }
    return stats;
  }

  function runtimeSize(entry) {
    const value = entry?.bytes ?? entry?.size;
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function createAsyncTextLru(limit = 6, protectedKeys = () => []) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("LRU limit must be positive");
    const values = new Map();
    const pending = new Map();

    const trim = () => {
      const protectedSet = new Set(protectedKeys() || []);
      while (values.size > limit) {
        const oldest = [...values.keys()].find((key) => !protectedSet.has(key));
        if (oldest == null) break;
        values.delete(oldest);
      }
    };

    const load = (key, loader) => {
      if (values.has(key)) {
        const value = values.get(key);
        values.delete(key);
        values.set(key, value);
        return Promise.resolve(value);
      }
      if (pending.has(key)) return pending.get(key);

      const request = Promise.resolve()
        .then(loader)
        .then(
          (value) => {
            pending.delete(key);
            values.set(key, value);
            trim();
            return value;
          },
          (error) => {
            pending.delete(key);
            throw error;
          },
        );
      pending.set(key, request);
      return request;
    };

    return {
      load,
      has: (key) => values.has(key),
      get size() {
        return values.size;
      },
      get pendingSize() {
        return pending.size;
      },
    };
  }

  return {
    createAsyncTextLru,
    manifestEntry,
    runtimeAssetUrl,
    runtimeSize,
    statsFromLineChanges,
  };
});
