const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "../public");

test("article image snapshots retain exact bytes, source attribution, and original image order", () => {
  const base = path.join(root, "assets/source-media");
  const sources = JSON.parse(fs.readFileSync(path.join(base, "SOURCES.json"), "utf8"));
  assert.equal(sources.images.length, 6);
  for (const item of sources.images) {
    const bytes = fs.readFileSync(path.join(base, item.file));
    assert.equal(bytes.length, item.bytes);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), item.sha256);
    assert.equal(new URL(item.source).protocol, "https:");
    const article = fs.readFileSync(path.join(root, item.file.startsWith("raft/") ? "capabilities/raft-multi-agent.html" : "capabilities/autoresearch.html"), "utf8");
    assert.ok(article.includes(`src="/assets/source-media/${item.file}"`));
    assert.ok(article.includes(item.sourcePage), "source credit remains visible");
  }
});

test("the transparent source cover retains its readable original backing in every theme", () => {
  const compat = fs.readFileSync(path.join(root, "site-theme-compat.css"), "utf8");
  const original = fs.readFileSync(path.join(root, "autoresearch.css"), "utf8");
  assert.match(original, /\.aar-cover-art \{ background: #7e8d61;/);
  assert.match(compat, /:root\[data-theme\] \.aar-cover-art \{ background: #7e8d61; \}/);
});
