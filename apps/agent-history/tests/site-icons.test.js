const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "../public");

test("every entry page loads the pinned local icon bundle before its behavior scripts", () => {
  const files = fs.readdirSync(root).filter((file) => file.endsWith(".html"));
  files.push(...fs.readdirSync(path.join(root, "capabilities"))
    .filter((file) => file.endsWith(".html")).map((file) => `capabilities/${file}`));
  assert.equal(files.length, 24);
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal((html.match(/src="\/vendor\/lucide\/lucide.min.js"/g) || []).length, 1, file);
    assert.doesNotMatch(html, /https?:\/\/[^"\s]*lucide/, file);
    const script = html.indexOf('src="/vendor/lucide/lucide.min.js"');
    const tail = html.slice(script);
    assert.match(tail, /<\/script>[\s\S]*<script/, `${file}: behavior runs after icons`);
  }
});

test("local Lucide retains its license, pinned bytes, and browser UMD API", () => {
  const vendor = path.join(root, "vendor/lucide");
  const sources = JSON.parse(fs.readFileSync(path.join(vendor, "SOURCES.json"), "utf8"));
  assert.equal(sources.package, "lucide");
  assert.equal(sources.version, "0.468.0");
  const bytes = fs.readFileSync(path.join(vendor, sources.file));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sources.sha256);
  assert.match(fs.readFileSync(path.join(vendor, "LICENSE"), "utf8"), /ISC License/);
  const browser = vm.createContext({});
  vm.runInContext(bytes.toString("utf8"), browser);
  assert.equal(typeof browser.lucide.createIcons, "function");
  for (const icon of ["Palette", "Monitor", "Sun", "Moon", "ListTree", "FileText"]) {
    assert.ok(browser.lucide.icons[icon], icon);
  }
});
