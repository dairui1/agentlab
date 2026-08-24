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
  assert.equal(data.schemaVersion, 2);
  assert.ok(data.evidence.length >= 70);
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
    for (const source of core.evidenceSourceLinks(item)) {
      assert.match(source.url, new RegExp("/blob/" + data.sourceRevision.commit + "/"), item.id + " " + source.label);
    }
  }
  const deepDiveItems = Object.values(core.deepDiveCollections(data)).flat();
  for (const item of [...data.mechanisms, ...deepDiveItems, ...data.evidence, ...data.xSignals]) {
    assert.ok(item.attributions.length >= 1, item.id);
    assert.equal(core.attributionLabels(data, item.attributions).length, item.attributions.length, item.id);
  }
  assert.match(data.layers[2].boundary, /不能写成 Grok Bot 上游原生机制/);
});

test("source archaeology maps both turn engines and the real process boundaries", () => {
  const collections = core.deepDiveCollections(data);
  assert.deepEqual(Object.fromEntries(Object.entries(collections).map(([key, items]) => [key, items.length])), {
    architecture: 8,
    harness: 10,
    features: 12,
    curiosities: 17,
  });
  const coordinator = collections.architecture.find((item) => item.id === "coordinator");
  const router = collections.architecture.find((item) => item.id === "shadow-router");
  const persistence = collections.architecture.find((item) => item.id === "persistence");
  assert.match(coordinator.summary, /两套状态机/);
  assert.equal(router.status, "author-extension");
  assert.match(router.failureBoundary, /绕过 Host AgentStore、checkpoint、SendMessage obligation/);
  assert.match(persistence.summary, /store\.db 并不能完整恢复/);
});

test("harness archaeology separates active contracts from dormant recovery design", () => {
  const harness = core.deepDiveCollections(data).harness;
  assert.match(harness.find((item) => item.id === "capability-projection").mechanism, /Browser\/Computer 工具只给专用 child/);
  assert.match(harness.find((item) => item.id === "delivery-obligation").summary, /只有真实 SendMessage/);
  assert.match(harness.find((item) => item.id === "delivery-obligation").mechanism, /第 2 次.*超过 6 次/);
  const retry = harness.find((item) => item.id === "checkpoint-retry");
  assert.equal(retry.status, "dormant");
  assert.match(retry.summary, /dormant/);
  assert.match(retry.mechanism, /productionTurnRunShell/);
  assert.match(harness.find((item) => item.id === "soft-exclusive").boundary, /late step checkpoint|迟到 checkpoint/);
  assert.match(harness.find((item) => item.id === "memory-engine").mechanism, /independent verifier|独立 verifier/);
  const compaction = harness.find((item) => item.id === "compaction-view");
  assert.equal(compaction.status, "live-path");
  assert.match(compaction.summary, /10%.*10k.*5%.*5k/);
  assert.match(compaction.mechanism, /没开启 deterministic fallback/);
  assert.match(harness.find((item) => item.id === "loop-antispin").summary, /超时直接 fail open.*检测到循环/);
});

test("gated features and curiosities never masquerade as verified production defaults", () => {
  const collections = core.deepDiveCollections(data);
  for (const item of [...collections.features, ...collections.curiosities]) {
    assert.ok(core.deepDiveStatuses.has(item.status), item.id);
    assert.ok(item.boundary, item.id);
    assert.ok(item.evidence.length >= 1, item.id);
  }
  assert.equal(collections.features.find((item) => item.id === "teach-demo").status, "gated");
  assert.equal(collections.features.find((item) => item.id === "channels").status, "partial");
  assert.equal(collections.features.find((item) => item.id === "browser-computer-deep").status, "partial");
  assert.match(collections.features.find((item) => item.id === "browser-computer-deep").summary, /desktop.*available/);
  assert.match(collections.features.find((item) => item.id === "routines").summary, /external event.*untrusted.*trusted automation marker/);
  assert.match(collections.features.find((item) => item.id === "shell-surfaces").mechanism, /preflight.*未注入/);
  assert.equal(collections.curiosities.find((item) => item.id === "character-moods").status, "reconstructed-ui");
  assert.equal(collections.curiosities.find((item) => item.id === "wallpaper-clock").status, "partial");
  assert.match(collections.curiosities.find((item) => item.id === "flag-drift").boundary, /不能据此判定上游生产配置/);
  assert.match(collections.curiosities.find((item) => item.id === "router-pulse").boundary, /作者扩展/);
  assert.match(collections.curiosities.find((item) => item.id === "memory-half-life").mechanism, /log-space.*指数衰减/);
});

test("compound implementation claims expose every critical source anchor", () => {
  const evidence = core.evidenceById(data);
  for (const item of data.evidence.filter((entry) => core.repositoryKinds.has(entry.kind) && entry.locator.includes(";"))) {
    const sources = core.evidenceSourceLinks(item);
    assert.ok(sources.length >= item.locator.split(";").length, item.id);
    assert.equal(new Set(sources.map((source) => source.url)).size, sources.length, item.id);
  }
  assert.ok(core.evidenceSourceLinks(evidence.get("GB-45")).some((source) => /host-runner-composition/.test(source.url)));
  assert.ok(core.evidenceSourceLinks(evidence.get("GB-78")).some((source) => /turn-run-shell/.test(source.url)));
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
  const deepDiveIndex = html.indexOf('class="grok-deep-dive-section"');
  const providerIndex = html.indexOf('class="grok-provider-section"');
  const xIndex = html.indexOf('class="grok-x-section"');
  const evidenceIndex = html.indexOf('id="evidenceLedger"');
  assert.ok(mechanismIndex > 0);
  assert.ok(mechanismIndex < deepDiveIndex);
  assert.ok(deepDiveIndex < providerIndex);
  assert.ok(providerIndex < xIndex);
  assert.ok(xIndex < evidenceIndex);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
  assert.match(script, /validateDossier/);
  assert.match(script, /filterEvidence/);
  assert.match(script, /ArrowDown/);
  assert.match(html, /id="deepDiveTabs"[^>]*role="tablist"/);
  assert.match(html, /id="deepDivePanel"[^>]*role="tabpanel"/);
  assert.match(script, /ArrowRight/);
  assert.match(script, /selectDeepDiveView/);
  assert.match(script, /aria-labelledby/);
  assert.match(script, /tabIndex = selected \? 0 : -1/);
  assert.match(script, /setAttribute\("role", "group"\)/);
  assert.match(script, /evidenceSourceLinks/);
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
