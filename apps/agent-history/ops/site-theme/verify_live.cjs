const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_BASES = [
  "https://claude-code-history.lyclyc17.workers.dev",
  "https://agentlab.dairui1.com",
];
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

async function filesIn(root, folder, recursive = false) {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, folder), { withFileTypes: true })) {
    const file = path.posix.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Verification asset is a symbolic link: ${file}`);
    if (entry.isDirectory() && recursive) files.push(...await filesIn(root, file, true));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

async function inventory(dist) {
  const top = await filesIn(dist, "");
  const articles = await filesIn(dist, "capabilities");
  const html = [...top, ...articles].filter((file) => file.endsWith(".html"));
  const publicRoot = path.join(APP_ROOT, "public");
  const sourceFiles = [...await filesIn(publicRoot, ""), ...await filesIn(publicRoot, "capabilities")];
  const expectedHtml = sourceFiles.filter((file) => file.endsWith(".html"));
  if (!expectedHtml.length || html.length !== expectedHtml.length || expectedHtml.some((file) => !html.includes(file))) {
    throw new Error("The distribution does not contain the complete site's HTML entry points");
  }
  const groups = {
    manifest: ["data/manifest.json"],
    html,
    behaviorAndStyles: top.filter((file) => /\.(?:js|css)$/.test(file)),
    icons: await filesIn(dist, "vendor/lucide", true),
    media: await filesIn(dist, "assets/source-media", true),
    fontsAndThemeProvenance: await filesIn(dist, "vendor/oink", true),
  };
  const entries = [];
  for (const [group, files] of Object.entries(groups)) {
    if (!files.length) throw new Error(`No distribution assets in required group: ${group}`);
    for (const file of files.sort()) {
      const bytes = await fs.readFile(path.join(dist, file));
      entries.push({ group, file, route: file === "index.html" ? "/" : `/${file}`, bytes, sha256: sha256(bytes) });
    }
  }
  return entries;
}

function normalizeBase(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Verification base must be an HTTP(S) origin without credentials");
  }
  return url.origin;
}

async function verifyAsset(base, entry, request = fetch) {
  const result = { file: entry.file, route: entry.route, group: entry.group, expectedBytes: entry.bytes.length, expectedSha256: entry.sha256 };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const url = new URL(entry.route, base);
    url.searchParams.set("agentlab_verify", `${Date.now()}-${crypto.randomUUID()}`);
    try {
      const response = await request(url, {
        headers: { "Cache-Control": "no-cache" },
        credentials: "omit",
        signal: AbortSignal.timeout(20000),
      });
      if (new URL(response.url).origin !== base) throw new Error(`Unexpected cross-origin redirect: ${response.url}`);
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      result.status = response.status;
      result.finalUrl = response.url;
      result.actualBytes = bytes.length;
      result.actualSha256 = sha256(bytes);
      if (!bytes.equals(entry.bytes)) throw new Error("Response bytes differ from the distribution");
      delete result.message;
      return { ...result, attempts: attempt, passed: true };
    } catch (error) {
      result.message = error.message;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  return { ...result, attempts: 3, passed: false };
}

async function verifyDomain(base, entries) {
  const assets = new Array(entries.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (next < entries.length) {
      const index = next++;
      assets[index] = await verifyAsset(base, entries[index]);
    }
  }));
  return {
    base, total: assets.length, passed: assets.filter((asset) => asset.passed).length,
    failed: assets.filter((asset) => !asset.passed).length, assets,
  };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    console.log("Usage: node --use-env-proxy ops/site-theme/verify_live.cjs [origin ...] [--dist=path] [--output=path] [--inventory]");
    console.log("Defaults to both production domains. Compares exact decoded HTTP bytes with dist, including all HTML, root JS/CSS, manifest, local icons, source media, OINK fonts and provenance.");
    return;
  }
  let dist = path.join(APP_ROOT, "dist");
  let output;
  const bases = [];
  for (const arg of argv) {
    if (arg.startsWith("--dist=")) dist = path.resolve(arg.slice(7));
    else if (arg.startsWith("--output=")) output = path.resolve(arg.slice(9));
    else if (arg !== "--inventory") {
      if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
      bases.push(normalizeBase(arg));
    }
  }
  const entries = await inventory(dist);
  const counts = entries.reduce((result, entry) => ({ ...result, [entry.group]: (result[entry.group] || 0) + 1 }), {});
  const report = {
    createdAt: new Date().toISOString(), dist, counts,
    inventory: entries.map(({ bytes, ...entry }) => ({ ...entry, bytes: bytes.length })),
  };
  if (!argv.includes("--inventory")) {
    report.domains = [];
    for (const base of [...new Set(bases.length ? bases : DEFAULT_BASES)]) {
      const result = await verifyDomain(base, entries);
      report.domains.push(result);
      console.log(`${base}: ${result.passed}/${result.total} exact-byte matches; ${result.failed} failures`);
      for (const failure of result.assets.filter((asset) => !asset.passed)) console.error(`${base}${failure.route}: ${failure.message}`);
    }
    report.passed = report.domains.every((domain) => domain.failed === 0);
    if (!report.passed) process.exitCode = 1;
  }
  if (output) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Receipt: ${output}`);
  } else console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { inventory, normalizeBase, verifyAsset, verifyDomain, main };
