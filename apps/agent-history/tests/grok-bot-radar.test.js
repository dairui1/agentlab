const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const core = require(path.join(publicRoot, "grok-bot-core.js"));
const data = JSON.parse(fs.readFileSync(path.join(publicRoot, "dossiers/grok-bot-reconstruction.json"), "utf8"));
const html = fs.readFileSync(path.join(publicRoot, "grok-bot.html"), "utf8");
const script = fs.readFileSync(path.join(publicRoot, "grok-bot.js"), "utf8");
const app = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");
const receiptPath = path.join(publicRoot, data.verification.receipt.url);
const receiptBytes = fs.readFileSync(receiptPath);
const receipt = JSON.parse(receiptBytes.toString("utf8"));

test("Grok Bot dossier fixes the source revision and research model", () => {
  assert.deepEqual(core.validateDossier(data), []);
  assert.equal(data.sourceRevision.commit, "a9f633e09d49a85829b8236331b9e21f7e612634");
  assert.equal(data.researchModel, "gpt-5.6-sol");
  assert.equal(data.verifiedAt, "2026-08-24");
  assert.equal(data.mechanisms.length, 10);
  assert.ok(data.evidence.length >= 30);
  assert.equal(receipt.sourceRevision.commit, data.sourceRevision.commit);
  assert.equal(crypto.createHash("sha256").update(receiptBytes).digest("hex"), data.verification.receipt.sha256);
});

test("repository evidence is pinned while official product, reconstruction, and extensions stay separate", () => {
  assert.deepEqual(data.layers.map((layer) => layer.id), [
    "official-product",
    "reconstructed-runtime",
    "author-extensions",
  ]);
  for (const item of data.evidence.filter((entry) => core.repositoryKinds.has(entry.kind))) {
    assert.match(item.url, new RegExp("/blob/" + data.sourceRevision.commit + "/"), item.id);
  }
  for (const item of [...data.mechanisms, ...data.evidence, ...data.xSignals]) {
    assert.ok(item.attributions.length >= 1, item.id);
    assert.equal(core.attributionLabels(data, item.attributions).length, item.attributions.length, item.id);
  }
  assert.match(data.layers[2].boundary, /不能写成 Grok Bot 上游原生机制/);
});

test("mechanism radar makes the non-Cursor context and safety divergence explicit", () => {
  const router = core.mechanismById(data, "router-divergence");
  assert.match(router.verdict, /不进入完整 host Agent runner/);
  assert.match(router.verdict, /界面连续/);
  assert.ok(router.facts.some((fact) => /上下文发生分叉/.test(fact)));
  assert.ok(router.facts.some((fact) => /Spotlight/.test(fact)));

  const codex = data.providers.find((provider) => provider.id === "codex");
  assert.match(codex.context, /四行 generic prompt/);
  assert.match(codex.tools, /最多 8/);
  assert.match(codex.auth, /~\/\.codex\/auth\.json/);
});

test("credential risks and incomplete reconstruction remain visible before use", () => {
  const docker = core.mechanismById(data, "local-docker");
  assert.match(docker.verdict, /~\/\.codex/);
  assert.match(docker.verdict, /网络外传/);
  assert.ok(data.risks.some((risk) => risk.severity === "critical" && /真实凭据/.test(risk.title)));
  assert.ok(data.verification.checks.some((check) => /17 \/ 18/.test(check.result)));
  assert.ok(data.verification.checks.some((check) => /5 high/.test(check.result)));
});

test("Spotlight and Browser Auto Review are described as configurable gates", () => {
  const approval = core.mechanismById(data, "approval");
  assert.match(approval.verdict, /可配置/);
  assert.match(approval.verdict, /off/);
  assert.match(approval.verdict, /shadow/);
  assert.match(approval.verdict, /enforce/);
  assert.ok(approval.unknowns.some((item) => /生产 gate、默认 mode/.test(item)));
});

test("local verification claims resolve to a content-addressed AgentLab receipt", () => {
  assert.match(data.verification.receipt.url, new RegExp(data.verification.receipt.sha256));
  assert.equal(receipt.checks.find((check) => check.id === "tests").exitCode, 1);
  assert.match(receipt.checks.find((check) => check.id === "tests").result, /17 of 18/);
  for (const item of data.evidence.filter((entry) => entry.kind === "local-verification")) {
    assert.match(item.url, new RegExp("^" + data.verification.receipt.url + "#"));
  }
});

test("X discussion is classified as discourse rather than implementation evidence", () => {
  assert.ok(data.xSignals.length >= 8);
  assert.ok(data.xSignals.some((signal) => signal.claimKind === "correction"));
  assert.ok(data.xSignals.some((signal) => signal.claimKind === "author-claim"));
  for (const signal of data.xSignals) {
    assert.ok(core.claimKinds.has(signal.claimKind), signal.id);
    assert.notEqual(signal.claimKind, "implementation-fact");
    assert.ok(signal.boundary);
  }
  assert.match(core.mechanismById(data, "browser-computer").verdict, /不存在仓库自带的 X connector/);
});

test("Router screenshot is local, integrity-tagged, and attributed as an author extension", () => {
  const imagePath = path.join(publicRoot, data.hero.src);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(imagePath)).digest("hex");
  assert.equal(digest, data.hero.sha256);
  assert.match(data.hero.caption, /作者添加的实验/);
  assert.match(html, /id="heroCaption"/);
});

test("mechanism conclusions lead while the evidence ledger stays collapsed", () => {
  const mechanismIndex = html.indexOf('class="grok-mechanism-section"');
  const providerIndex = html.indexOf('class="grok-provider-section"');
  const xIndex = html.indexOf('class="grok-x-section"');
  const evidenceIndex = html.indexOf('id="evidenceLedger"');
  assert.ok(mechanismIndex > 0);
  assert.ok(mechanismIndex < providerIndex);
  assert.ok(providerIndex < xIndex);
  assert.ok(xIndex < evidenceIndex);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
  assert.match(script, /validateDossier/);
  assert.match(script, /filterEvidence/);
  assert.match(script, /ArrowDown/);
  assert.match(script, /aria-labelledby/);
  assert.match(script, /tabIndex = selected \? 0 : -1/);
});

test("Grok Bot is a dedicated shared tab without hijacking the canonical Grok feed identity", () => {
  const navigation = require(path.join(publicRoot, "site-navigation.js"));
  assert.ok(navigation.items.some((item) => item.id === "grok" && item.href === "/grok-bot.html"));
  const navigationFiles = fs.readdirSync(publicRoot, { recursive: true })
    .filter((relativePath) => relativePath.endsWith(".html"))
    .filter((relativePath) => fs.readFileSync(path.join(publicRoot, relativePath), "utf8").includes("<agentlab-navigation"));
  assert.ok(navigationFiles.length >= 9);
  navigationFiles.forEach((relativePath) => {
    const navigationHtml = fs.readFileSync(path.join(publicRoot, relativePath), "utf8");
    assert.match(navigationHtml, /src="\/site-navigation\.js"/, relativePath);
  });
  assert.doesNotMatch(app, /\/grok-bot\.html/);
  assert.match(app, /grok:\s*"\/agent-icons\/grok\.png"/);
  assert.match(app, /item\.agent\.id === "deepseek-harness"/);
});
