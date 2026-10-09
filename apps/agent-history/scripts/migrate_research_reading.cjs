const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../public");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const index = JSON.parse(read("research-index.json"));
index.studies = index.studies.filter((study) => study.id !== "pi-durable");
for (const study of index.studies) {
  if (study.id === "pi-durable-guide") continue;
  study.archiveHref ||= study.legacyHref;
  study.legacyHref = `/guides/${study.id}.html`;
  study.readingLabel = `打开交互专题：${study.title}`;
  study.guideData = `/research-guides/${study.id}.json`;
  const url = new URL(study.archiveHref, "https://agentlab.dairui1.com");
  const file = url.pathname.slice(1);
  const html = read(file);
  if (!html.includes('src="/research-reading.js"')) fs.writeFileSync(path.join(root, file), html.replace('<script src="/site-theme.js"></script>', '<script src="/research-reading.js"></script>\n  <script src="/site-theme.js"></script>'));
}
fs.writeFileSync(path.join(root, "research-index.json"), `${JSON.stringify(index, null, 2)}\n`);
const implementation = JSON.parse(read("capabilities/pi-durable.json"));
let guide = read("capabilities/pi-durable-guide.html");
guide = guide.replace('href="/capabilities/pi-durable.html">AgentLab 研究', 'href="#implementation-source">AgentLab 源码记录');
if (!guide.includes('id="implementation-source"')) {
  const records = implementation.evidence.map((record) => `<div class="guide-implementation-record" id="implementation-${record.id}"><h3>${esc(record.id)} · ${esc(record.title)}</h3><p>${esc(record.statement)}</p><p>${esc(record.boundary)}</p><a data-evidence="${record.id}" href="${esc(record.source.url)}" target="_blank" rel="noopener noreferrer">${esc(record.source.label)}</a><p><code>${esc(record.artifact)} · ${esc(record.locator)} · SHA-256 ${esc(record.sha256)}</code></p></div>`).join("\n");
  const supplement = `<details class="guide-implementation-records" id="implementation-source"><summary>AgentLab 源码记录 · Pi Durable 1.1.0</summary><p>实现固定于 earendil-works/pi ${implementation.source.revision}。本机运行了离线合同测试；没有调用真实模型，没有做断电、生产环境或性能复现。下列记录保留源码位置、原始哈希与各自范围。</p><p><a href="/capabilities/pi-durable.json">结构化来源与测试记录</a></p>${records}</details>\n`;
  guide = guide.replace('                    <footer class="foot">', `                    ${supplement}                    <footer class="foot">`);
  guide = guide.replace('<script src="/pi-durable-guide.js"></script>', '<script src="/pi-durable-guide.js"></script>\n        <script src="/pi-durable.js"></script>');
}
fs.writeFileSync(path.join(root, "capabilities/pi-durable-guide.html"), guide);
const data = JSON.parse(read("capabilities/pi-durable-guide.json"));
data.relatedImplementation = { data: "/capabilities/pi-durable.json", packageVersion: "1.1.0", revision: implementation.source.revision, presentation: "independent-source-records", runtimeExperiment: implementation.source.runtimeExperiment };
fs.writeFileSync(path.join(root, "capabilities/pi-durable-guide.json"), `${JSON.stringify(data, null, 2)}\n`);
