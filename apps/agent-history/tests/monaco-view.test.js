const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const view = require("../public/monaco-view.js");

test("runtime manifests support array and version-map layouts", () => {
  assert.deepEqual(
    view.manifestEntry({ releases: [{ version: "2.1.1", url: "data/a.md" }] }, "2.1.1"),
    { version: "2.1.1", url: "data/a.md" },
  );
  assert.deepEqual(
    view.manifestEntry({ versions: { "2.1.2": { path: "data/b.md" } } }, "2.1.2"),
    { version: "2.1.2", path: "data/b.md" },
  );
  assert.equal(view.manifestEntry({ releases: [] }, "missing"), null);
});

test("runtime assets are same-origin and byte metadata remains compatible", () => {
  assert.equal(view.runtimeAssetUrl({ url: "data/runtime/objects/a.md" }), "/data/runtime/objects/a.md");
  assert.equal(view.runtimeAssetUrl({ path: "/data/runtime/objects/b.md" }), "/data/runtime/objects/b.md");
  assert.throws(() => view.runtimeAssetUrl({ url: "https://cdn.example/a.md" }), /同源/);
  assert.equal(view.runtimeSize({ bytes: 12 }), 12);
  assert.equal(view.runtimeSize({ size: 14 }), 14);
});

test("Monaco line changes produce actual aggregate line counts", () => {
  assert.deepEqual(view.statsFromLineChanges([
    {
      originalStartLineNumber: 4,
      originalEndLineNumber: 0,
      modifiedStartLineNumber: 4,
      modifiedEndLineNumber: 6,
    },
    {
      originalStartLineNumber: 10,
      originalEndLineNumber: 12,
      modifiedStartLineNumber: 13,
      modifiedEndLineNumber: 14,
    },
    {
      originalStartLineNumber: 20,
      originalEndLineNumber: 21,
      modifiedStartLineNumber: 20,
      modifiedEndLineNumber: 0,
    },
  ]), { additions: 5, deletions: 5, hunks: 3 });
});

test("runtime LRU reuses in-flight URLs and removes failed requests", async () => {
  const cache = view.createAsyncTextLru(2);
  let finish;
  let calls = 0;
  const loader = () => new Promise((resolve) => {
    calls += 1;
    finish = resolve;
  });
  const first = cache.load("same.md", loader);
  const second = cache.load("same.md", loader);
  assert.equal(first, second);
  await Promise.resolve();
  finish("request");
  assert.equal(await first, "request");
  assert.equal(calls, 1);

  let failures = 0;
  await assert.rejects(cache.load("broken.md", () => {
    failures += 1;
    throw new Error("offline");
  }), /offline/);
  assert.equal(cache.pendingSize, 0);
  assert.equal(await cache.load("broken.md", () => {
    failures += 1;
    return "recovered";
  }), "recovered");
  assert.equal(failures, 2);
});

test("runtime LRU bounds resolved text while retaining the active pair", async () => {
  let active = ["left.md", "right.md"];
  const cache = view.createAsyncTextLru(2, () => active);
  await cache.load("left.md", () => "left");
  await cache.load("old.md", () => "old");
  await cache.load("right.md", () => "right");
  assert.equal(cache.size, 2);
  assert.equal(cache.has("left.md"), true);
  assert.equal(cache.has("right.md"), true);
  assert.equal(cache.has("old.md"), false);

  active = ["new.md"];
  await cache.load("new.md", () => "new");
  assert.equal(cache.size, 2);
  assert.equal(cache.has("new.md"), true);
});

test("browser and build use staged local Monaco assets", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(app, /\/vendor\/monaco\/vs\/loader\.js/);
  assert.match(app, /\/data\/manifest\.json/);
  assert.match(app, /cache:\s*["']no-cache["']/);
  assert.match(html, /实际请求/);
  assert.match(html, /近期开发情报/);
  assert.match(html, /只看高价值/);
  assert.match(html, /Codex 推断/);
  assert.match(html, /事实证据/);
  assert.match(html, /对自研 Agent 的启示/);
  assert.match(html, /完整请求/);
  assert.match(html, /结构导航/);
  assert.match(html, /\/app-core\.js/);
  assert.match(app, /selectRangeEntries/);
  assert.doesNotMatch(`${html}\n${app}\n${styles}`, /timeline/i);
  assert.doesNotMatch(`${html}\n${app}`, /整版提示词|data\/messages/);
  assert.doesNotMatch(`${html}\n${app}`, /(?:unpkg|jsdelivr).*monaco/i);
  assert.match(packageJson.scripts.build, /stage:monaco/);
  assert.ok(fs.existsSync(path.join(root, "public/vendor/monaco/vs/base/worker/workerMain.js")));
});
