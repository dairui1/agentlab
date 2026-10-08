const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const PUBLIC_ROOT = path.resolve(__dirname, "../../public");
const VIEWPORTS = { 1440: 1000, 1024: 900, 390: 844, 320: 740 };
const MODES = ["light", "dark"];
const SOURCE_FILES = ["styles.css", "site-theme.css", "site-theme-compat.css", "site-theme.js", "index.html", "app.js", "research.css", "research.js", "mechanisms.css", "mechanisms.js", "research-index.json"];
const CRITICAL = new Set(["/index.html", "/index.html?mode=compare", "/capabilities.html", "/mechanisms.html"]);

function localRoute(href) {
  const url = new URL(href, "https://agentlab.invalid");
  if (url.origin !== "https://agentlab.invalid") throw new Error(`External audit route: ${href}`);
  if (url.pathname === "/") url.pathname = "/index.html";
  else if (!path.extname(url.pathname)) url.pathname += ".html";
  return `${url.pathname}${url.search}${url.hash}`;
}

async function enumerateRoutes() {
  const manifest = JSON.parse(await fs.readFile(path.join(PUBLIC_ROOT, "research-index.json"), "utf8"));
  const mechanisms = await fs.readFile(path.join(PUBLIC_ROOT, "mechanisms.js"), "utf8");
  const routes = new Map();
  const add = (href, family, title) => {
    const route = localRoute(href);
    if (!routes.has(route)) routes.set(route, { route, family, title });
  };
  const htmlFiles = (await fs.readdir(PUBLIC_ROOT, { recursive: true })).filter((file) => file.endsWith(".html")).sort();
  for (const file of htmlFiles) {
    const html = await fs.readFile(path.join(PUBLIC_ROOT, file), "utf8");
    add(`/${file}`, file.startsWith("capabilities/") ? "article" : "application", html.match(/<title>([^<]+)<\/title>/)?.[1] || file);
  }
  add("/?mode=compare", "comparison", "Version comparison");
  for (const study of manifest.studies) {
    add(`/capabilities.html?study=${encodeURIComponent(study.id)}`, "research", study.title);
    if (study.legacyHref) add(study.legacyHref, "legacy", study.title);
  }
  for (const [, href] of mechanisms.matchAll(/href: "(\/mechanisms[^\"]*)"/g)) add(href, "mechanism", href);
  return {
    htmlFiles,
    studyCount: manifest.studies.length,
    mechanismCount: [...mechanisms.matchAll(/href: "(\/mechanisms[^\"]*)"/g)].length,
    routes: [...routes.values()].sort((a, b) => Number(CRITICAL.has(b.route)) - Number(CRITICAL.has(a.route)) || a.route.localeCompare(b.route)),
  };
}

async function sourceHashes(htmlFiles) {
  const names = [...new Set([...SOURCE_FILES, ...htmlFiles])].sort();
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, crypto.createHash("sha256").update(await fs.readFile(path.join(PUBLIC_ROOT, name))).digest("hex")])));
}

function watch(page, result) {
  page.on("pageerror", (error) => result.issues.push({ kind: "runtime", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") result.issues.push({ kind: "console", message: message.text(), location: message.location() });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) result.issues.push({ kind: "resource-response", status: response.status(), url: response.url() });
  });
  page.on("requestfailed", (request) => result.issues.push({ kind: "resource-request", url: request.url(), message: request.failure()?.errorText }));
}

async function ready(page, route) {
  await page.locator(".site-theme-trigger").waitFor({ state: "visible" });
  const comparison = new URL(route, "https://agentlab.invalid").searchParams.get("mode") === "compare";
  if (comparison) {
    await page.locator("#compareView").waitFor({ state: "visible" });
    await page.locator('#diffEditor[data-state="ready"]').waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#leftVersion")?.options.length > 0 && document.querySelector("#rightVersion")?.options.length > 0);
  } else {
    await page.waitForFunction(() => {
      const main = [...document.querySelectorAll("main")].find((node) => node.getClientRects().length);
      const heading = main && [...main.querySelectorAll("h1")].find((node) => node.getClientRects().length && node.textContent.trim());
      const busy = [...document.querySelectorAll('[aria-busy="true"]')].some((node) => node.getClientRects().length);
      const failed = [...document.querySelectorAll('[data-state="error"]')].some((node) => node.getClientRects().length);
      return main && heading && main.innerText.trim().length > 100 && !busy && !failed;
    });
    if (route === "/index.html") await page.locator("#intelligenceFeed [data-intelligence-agent]").first().waitFor({ state: "visible" });
    if (route.startsWith("/capabilities.html?study=")) await page.locator("#researchDetail").waitFor({ state: "visible" });
    if (route.startsWith("/mechanisms.html")) await page.locator("#canvasContent > *").first().waitFor({ state: "visible" });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function integrity(page, result) {
  result.state = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    scheme: document.documentElement.dataset.colorScheme,
    settings: window.AgentLabTheme?.getSettings(),
    pointer: {
      coarse: matchMedia("(pointer: coarse)").matches,
      anyCoarse: matchMedia("(any-pointer: coarse)").matches,
      hover: matchMedia("(hover: hover)").matches,
      anyHover: matchMedia("(any-hover: hover)").matches,
      touchPoints: navigator.maxTouchPoints,
    },
    title: document.title,
    heading: [...document.querySelectorAll("h1")].filter((node) => node.getClientRects().length).map((node) => node.textContent.trim()),
    contentLength: [...document.querySelectorAll("main, #compareView")].filter((node) => node.getClientRects().length).reduce((length, node) => length + node.innerText.trim().length, 0),
    lucideLoaded: typeof window.lucide?.createIcons === "function",
    navigationIcons: document.querySelectorAll("agentlab-navigation svg").length,
  }));
  if (result.state.theme !== "ink" || result.state.scheme !== result.mode || result.state.settings?.mode !== result.mode) {
    result.issues.push({ kind: "theme", expected: { preset: "ink", mode: result.mode }, actual: result.state });
  }
  if (!result.state.lucideLoaded || result.state.navigationIcons < 3) result.issues.push({ kind: "icons", actual: result.state });
  if (result.width <= 390 && (!result.state.pointer.coarse || !result.state.pointer.touchPoints)) result.issues.push({ kind: "touch-context", actual: result.state.pointer });
  if (result.width === 1024 && (!result.state.pointer.anyCoarse || !result.state.pointer.touchPoints)) result.issues.push({ kind: "hybrid-context", actual: result.state.pointer });
  await decodeImages(page, result);
}

async function decodeImages(page, result) {
  result.images = await page.locator("img").evaluateAll(async (images) => Promise.all(images.map(async (image) => {
    image.loading = "eager";
    const src = image.currentSrc || image.src;
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error("Image decode timed out")), 12000))]);
      return { src, loaded: image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight };
    } catch (error) { return { src, loaded: false, message: error.message }; }
  })));
  for (const image of result.images.filter((image) => !image.loaded)) result.issues.push({ kind: "image", ...image });
}

async function inspectGeometry(page, label) {
  return page.evaluate((label) => {
    const root = document.documentElement;
    const width = innerWidth;
    const overflows = root.scrollWidth > width;
    const offenders = overflows ? [...document.body.querySelectorAll("*")].flatMap((node) => {
      if (!node.getClientRects().length) return [];
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (style.visibility !== "visible" || box.width === 0 || (box.left >= -1 && box.right <= width + 1)) return [];
      return [{ tag: node.tagName.toLowerCase(), id: node.id, class: node.className?.baseVal ?? node.className, left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) }];
    }).slice(0, 15) : [];
    return { label, width, contentWidth: root.scrollWidth, height: root.scrollHeight, scrollY, overflows, offenders };
  }, label);
}

async function verifyCase(browser, base, output, item, width, mode) {
  const result = { ...item, width, height: VIEWPORTS[width], preset: "ink", mode, issues: [], geometry: [], screenshots: [] };
  const slug = `${width}-ink-${mode}-${item.route.replace(/^\//, "").replaceAll(/[^a-z0-9.-]+/gi, "-")}`;
  const context = await browser.newContext({
    viewport: { width, height: VIEWPORTS[width] },
    colorScheme: mode === "light" ? "dark" : "light",
    reducedMotion: "reduce",
    hasTouch: width <= 1024,
    isMobile: width <= 390,
  });
  await context.addInitScript((mode) => localStorage.setItem("agentlab.theme.v1", JSON.stringify({ preset: "ink", mode })), mode);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  watch(page, result);
  try {
    await page.goto(`${base}${item.route}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await ready(page, item.route);
    await integrity(page, result);
    const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const positions = [["top", 0], ["middle", Math.max(0, Math.floor((documentHeight - result.height) / 2))], ["bottom", documentHeight]];
    for (const [label, top] of positions) {
      await page.evaluate((top) => scrollTo(0, top), top);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await inspectGeometry(page, label);
      result.geometry.push(geometry);
      if (geometry.overflows) result.issues.push({ kind: "overflow", ...geometry });
      if (!CRITICAL.has(item.route)) {
        const file = `${slug}-${label}.png`;
        await page.screenshot({ path: path.join(output, file), animations: "disabled" });
        result.screenshots.push(file);
      }
    }
    if (await page.locator("img").count() !== result.images.length) await decodeImages(page, result);
    if (CRITICAL.has(item.route)) {
      await page.evaluate(() => scrollTo(0, 0));
      const file = `${slug}-full.png`;
      await page.screenshot({ path: path.join(output, file), fullPage: true, animations: "disabled" });
      result.screenshots.push(file);
    }
  } catch (error) {
    result.issues.push({ kind: "verification", message: error.message });
    const file = `${slug}-failure.png`;
    await page.screenshot({ path: path.join(output, file), animations: "disabled" }).then(() => result.screenshots.push(file)).catch(() => {});
  } finally {
    page.removeAllListeners("requestfailed");
    await context.close();
  }
  result.status = result.issues.length ? "failed" : "passed";
  return result;
}

async function main() {
  const base = (process.argv[2] || "http://127.0.0.1:8771").replace(/\/$/, "");
  const output = process.argv[3] || "/private/tmp/agentlab-filter-routes";
  const catalog = await enumerateRoutes();
  const widths = (process.env.FILTER_ROUTE_WIDTHS || "1440,1024,390,320").split(",").map(Number);
  const modes = (process.env.FILTER_ROUTE_MODES || MODES.join(",")).split(",");
  const selected = process.env.FILTER_ROUTES ? new Set(process.env.FILTER_ROUTES.split(",").map(localRoute)) : null;
  const routes = catalog.routes.filter((item) => !selected || selected.has(item.route));
  const concurrency = Number(process.env.FILTER_ROUTE_CONCURRENCY || 3);
  assert.ok(concurrency >= 1 && concurrency <= 6, "Concurrency must be between 1 and 6");
  for (const width of widths) assert.ok(VIEWPORTS[width], `Unknown viewport width: ${width}`);
  for (const mode of modes) assert.ok(MODES.includes(mode), `Unknown theme mode: ${mode}`);
  if (selected) assert.equal(selected.size, routes.length, "One or more requested routes are missing from the route catalog");
  await fs.mkdir(output, { recursive: true });
  const tasks = widths.flatMap((width) => modes.flatMap((mode) => routes.map((item) => ({ item, width, mode }))));
  const report = {
    base, createdAt: new Date().toISOString(), output, widths, modes, concurrency,
    catalog: { htmlCount: catalog.htmlFiles.length, studyCount: catalog.studyCount, mechanismCount: catalog.mechanismCount, uniqueRoutes: catalog.routes.length },
    routes, plannedCases: tasks.length, sourcesBefore: await sourceHashes(catalog.htmlFiles), cases: [],
    limits: ["Chromium emulation, not physical touch hardware or Safari/WebKit", "1024px context enables touch and any-pointer coarse; it does not emulate simultaneous physical mouse and touchscreen", "Top/middle/bottom screenshots are captured for noncritical routes; four critical routes use full-page captures", "No filter interaction assertions; these are covered by verify_controls.cjs"],
  };
  const browser = await chromium.launch({ headless: true });
  let next = 0;
  const save = () => fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        const result = await verifyCase(browser, base, output, task.item, task.width, task.mode);
        report.cases.push(result);
        console.log(`${report.cases.length}/${tasks.length} ${result.status}: ${task.width} ink/${task.mode} ${task.item.route}${result.issues.length ? ` ${JSON.stringify(result.issues)}` : ""}`);
      }
    }));
    report.sourcesAfter = await sourceHashes(catalog.htmlFiles);
    report.summary = {
      total: report.cases.length,
      passed: report.cases.filter((item) => item.status === "passed").length,
      failed: report.cases.filter((item) => item.status === "failed").length,
      screenshots: report.cases.reduce((sum, item) => sum + item.screenshots.length, 0),
      imageChecks: report.cases.reduce((sum, item) => sum + (item.images?.length || 0), 0),
      geometryChecks: report.cases.reduce((sum, item) => sum + item.geometry.length, 0),
      issueCounts: report.cases.flatMap((item) => item.issues).reduce((counts, issue) => ({ ...counts, [issue.kind]: (counts[issue.kind] || 0) + 1 }), {}),
      stableSources: JSON.stringify(report.sourcesBefore) === JSON.stringify(report.sourcesAfter),
    };
    await save();
    console.log(JSON.stringify(report.summary));
    if (report.summary.failed || !report.summary.stableSources || report.summary.total !== report.plannedCases) process.exitCode = 1;
  } finally {
    await save();
    await browser.close();
  }
}

module.exports = { enumerateRoutes, localRoute };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
