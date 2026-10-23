const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const app = path.resolve(__dirname, "..");
const source = path.join(app, "content/dquickts-code-mode");
const root = path.join(app, "public");
const published = path.join(root, "studies/dquickts-code-mode");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const receipt = JSON.parse(fs.readFileSync(path.join(source, "receipts.json"), "utf8"));
const html = read("capabilities/dquickts-code-mode.html");
const data = JSON.parse(read("capabilities/dquickts-code-mode.json"));

test("dquickts article preserves the independent research and all original comparison sections", () => {
  assert.equal((html.match(/data-article-section/g) || []).length, 11);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /current="dquickts"/);
  assert.match(html, /src="\/capability-article\.js"/);
  assert.match(html, /不是更快的 eval/);
  for (const subject of ["Monty", "Cloudflare", "Temporal", "E2B", "QuickJS-WASM", "Deno", "isolated-vm"]) assert.ok(html.includes(subject), subject);
  assert.match(html, /未运行真实模型|没有运行.*真实外部工具/);
  assert.match(html, /snapshot.*不是|快照不保证|exactly-once/);
  assert.doesNotMatch(html, /class="rg-page"|data-guide-model|research-guide\.js/);
  assert.match(html, /class="dq-benchmark"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), id);
});

test("published receipts retain observed negative results and numeric benchmark provenance without local transcripts", () => {
  const all = [receipt.core, receipt.wasm, receipt.monty, receipt.repl].flatMap(r => r.checks);
  assert.equal(all.length, 28);
  assert.ok(all.every(c => c.passed));
  assert.equal(receipt.core.sources.dquickts.commit, "f9a3efaa4d7cadb9dcad7e80a03d2774eb95a406");
  assert.equal(receipt.monty.version, "1.3.0");
  assert.equal(receipt.wasm.version, "0.32.0");
  assert.equal(receipt.core.timings.length, 16);
  for (const timing of receipt.core.timings) {
    assert.equal(timing.rawMs.length, 15);
    assert.equal([...timing.rawMs].sort((a,b) => a-b)[7], timing.medianMs);
    assert.ok(html.includes(timing.medianMs.toFixed(2)), `${timing.engine}/${timing.workload}`);
  }
  assert.equal(receipt.core.checks.find(c => c.name === "native-count-change-is-rejected").status, 2);
  assert.equal(receipt.core.checks.find(c => c.name === "durable-call-inside-native-map-is-rejected").status, 1);
  assert.equal(receipt.sources.dquicktsCi[0].conclusion, "failure");
  assert.equal(receipt.sources.dquicktsCi[0].jobs.filter(j => j.conclusion === "failure").length, 1);
  assert.match(receipt.repl.initialProbe, /did not terminate/);
  assert.doesNotMatch(JSON.stringify(receipt), /\/Users\/|\/var\/folders\/|xcodebuild\[/);
});

test("every evidence record and attachment resolves to the published fixed receipt", () => {
  const catalog = JSON.parse(read("research-index.json")).studies.find(s => s.id === "dquickts-code-mode");
  assert.equal(catalog.articleHref, "/capabilities/dquickts-code-mode.html");
  assert.equal(catalog.evidenceCount, data.evidence.length);
  assert.equal(catalog.unknownCount, data.unknowns.length);
  for (const claim of data.evidence) {
    const file = fs.readFileSync(path.join(root, claim.artifact));
    assert.equal(createHash("sha256").update(file).digest("hex"), claim.sha256);
    assert.ok(claim.locator && claim.boundary);
  }
  for (const [, href] of html.matchAll(/href="(\/studies\/[^"#?]+)[^\"]*"/g)) assert.ok(fs.existsSync(path.join(root, href)), href);
  for (const file of ["host.c", "run.mjs", "wasm-check.mjs", "monty-check.mjs", "repl-check.mjs"]) assert.equal(fs.readFileSync(path.join(published, file), "utf8"), fs.readFileSync(path.join(source, file), "utf8"));
});

test("article generation is offline and deterministic", () => {
  const before = fs.readFileSync(path.join(root, "capabilities/dquickts-code-mode.html"), "utf8");
  execFileSync(process.execPath, [path.join(app, "scripts/build_dquickts_study.mjs")]);
  assert.equal(fs.readFileSync(path.join(root, "capabilities/dquickts-code-mode.html"), "utf8"), before);
  assert.equal(read("capabilities/dquickts-code-mode.json"), `${JSON.stringify(data, null, 2)}\n`);
});

test("independent article returns to catalog filters but rejects foreign return targets", () => {
  const script = read("dquickts-study.js");
  for (const [from, expected] of [["/capabilities?study=dquickts-code-mode&search=恢复&topic=架构与扩展", "/capabilities?search=%E6%81%A2%E5%A4%8D&topic=%E6%9E%B6%E6%9E%84%E4%B8%8E%E6%89%A9%E5%B1%95"], ["https://example.org/capabilities", "/capabilities.html"], ["/not-the-catalog", "/capabilities.html"]]) {
    const link = {};
    vm.runInNewContext(script, { URL, location: { href: `https://agentlab.test/capabilities/dquickts-code-mode?from=${encodeURIComponent(from)}` }, document: { querySelectorAll: () => [link] } });
    assert.equal(link.href, expected);
  }
});
