const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const PRESETS = ["paper", "slate", "ink", "terminal"];
const MODES = ["light", "dark"];
const SIZES = { 1440: 1000, 390: 844, 320: 740 };
const PALETTES = {
  paper: { light: ["#f7f6f3", "#21201c"], dark: ["#161513", "#ece9e3"] },
  slate: { light: ["#f1f4f8", "#16222e"], dark: ["#0b1119", "#e8eef6"] },
  ink: { light: ["#ffffff", "#141414"], dark: ["#0b0b0b", "#ededed"] },
  terminal: { light: ["#f4f5f2", "#1d211f"], dark: ["#0c0f0e", "#d3dbd6"] },
};
const REPRESENTATIVE = new Set([
  "/", "/capabilities.html", "/mechanisms.html", "/grok-bot.html", "/deepseek-harness.html",
  "/capabilities/code-mode.html", "/capabilities/autoresearch.html", "/capabilities/raft-multi-agent.html",
  "/capabilities/computer-use.html", "/capabilities/gpt-prompt-evolution.html",
]);

const opposite = (mode) => mode === "light" ? "dark" : "light";
const rgb = (hex) => `rgb(${hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16)).join(", ")})`;
const selected = (name, fallback) => process.env[name] ? process.env[name].split(",") : fallback;

async function routes() {
  const root = path.join(__dirname, "../../public");
  const list = [];
  for (const folder of ["", "capabilities"]) {
    for (const name of (await fs.readdir(path.join(root, folder))).filter((name) => name.endsWith(".html"))) {
      list.push(name === "index.html" ? "/" : `/${folder ? `${folder}/` : ""}${name}`);
    }
  }
  return list.sort((a, b) => Number(REPRESENTATIVE.has(b)) - Number(REPRESENTATIVE.has(a)) || a.localeCompare(b));
}

async function sourceHashes(allRoutes) {
  const root = path.join(__dirname, "../../public");
  const files = [...allRoutes.map((route) => route === "/" ? "index.html" : route.slice(1)), "site-theme.js", "site-theme.css", "site-theme-compat.css", "styles.css", "app.js", "gpt-prompt-evolution.js", "vendor/lucide/lucide.min.js"];
  return Object.fromEntries(await Promise.all(files.map(async (file) => {
    try { return [file, crypto.createHash("sha256").update(await fs.readFile(path.join(root, file))).digest("hex")]; }
    catch (error) { if (error.code === "ENOENT") return [file, null]; throw error; }
  })));
}

function watch(page, caseResult, base) {
  const local = (url) => new URL(url).origin === new URL(base).origin;
  page.on("pageerror", (error) => caseResult.issues.push({ kind: "runtime", message: error.message }));
  page.on("console", (message) => {
    if (message.type() !== "error" || /^Failed to load resource:/.test(message.text())) return;
    caseResult.issues.push({ kind: "console", message: message.text(), location: message.location() });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    caseResult.issues.push({ kind: local(response.url()) ? "local-resource" : "external-resource", url: response.url(), status: response.status() });
  });
  page.on("requestfailed", (request) => {
    const message = request.failure()?.errorText;
    if (message === "net::ERR_ABORTED") return;
    caseResult.issues.push({ kind: local(request.url()) ? "local-resource" : "external-resource", url: request.url(), message });
  });
}

// Sample actual rendered text, compositing translucent ancestor backgrounds.
// Image/gradient backgrounds are retained as uncertainty, not silently excluded.
async function scan(page, label, scope = "body") {
  return page.evaluate(({ label, scope }) => {
    const root = document.querySelector(scope);
    if (!root) return { label, failures: [{ kind: "missing-scope", scope }], checked: 0, uncertain: [] };
    const scratch = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const colors = new Map();
    function rgba(value) {
      if (!colors.has(value)) {
        scratch.clearRect(0, 0, 1, 1);
        scratch.fillStyle = value;
        scratch.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = scratch.getImageData(0, 0, 1, 1).data;
        colors.set(value, [r / 255, g / 255, b / 255, a / 255]);
      }
      return colors.get(value);
    }
    function over(front, back) {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map((i) => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha).concat(alpha);
    }
    const luminance = (color) => color.slice(0, 3).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    function selector(element) {
      if (element.id) return `#${element.id}`;
      const classes = [...element.classList].filter((name) => !["is-active", "is-open", "selected"].includes(name)).slice(0, 3);
      return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join("")}`;
    }
    const seen = new Set();
    const failures = [];
    const uncertain = [];
    let checked = 0;
    let disabled = 0;
    const decorative = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      const element = text.parentElement;
      if (!text.textContent.trim() || !element || seen.has(element) || element.closest("script, style, noscript")) continue;
      seen.add(element);
      const style = getComputedStyle(element);
      if (style.visibility !== "visible" || style.display === "none") continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      const boxes = [...range.getClientRects()].filter((box) => box.width && box.height && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth);
      if (!boxes.length || !element.getClientRects().length) continue;
      if (element.closest(":disabled, [aria-disabled='true']")) { disabled += 1; continue; }
      if (element.matches("[aria-hidden='true']") && /^[\s/|\u00b7\u2014\u2192]+$/.test(element.textContent)) {
        decorative.push({ selector: selector(element), text: element.textContent.trim(), reason: "Explicitly hidden decorative separator" });
        continue;
      }
      let cursor = element;
      const chain = [];
      let opacity = 1;
      while (cursor) {
        const current = getComputedStyle(cursor);
        opacity *= Number(current.opacity);
        chain.unshift({ element: cursor, style: current });
        cursor = cursor.parentElement;
      }
      if (!opacity) continue;
      let background = [1, 1, 1, 1];
      const images = [];
      for (const item of chain) {
        background = over(rgba(item.style.backgroundColor), background);
        if (item.style.backgroundImage !== "none") images.push({ selector: selector(item.element), image: item.style.backgroundImage });
      }
      const foreground = rgba(style.color).slice();
      foreground[3] *= opacity;
      const rendered = over(foreground, background);
      const a = luminance(rendered);
      const b = luminance(background);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      const sample = {
        selector: selector(element), text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 140),
        color: style.color, background: background.slice(0, 3).map((v) => Math.round(v * 255)),
        ratio: Number(ratio.toFixed(2)), required, fontSize: size, backgroundImages: images,
      };
      if (images.length) uncertain.push(sample);
      if (ratio + 0.01 < required) failures.push({ kind: "contrast", ...sample });
      checked += 1;
    }
    return { label, checked, disabled, decorative, failures, uncertain };
  }, { label, scope });
}

async function ready(page, route) {
  await page.locator(".site-theme-trigger").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    const heading = [...document.querySelectorAll("main h1")].find((node) => node.getClientRects().length && node.textContent.trim());
    return main && main.getAttribute("aria-busy") !== "true" && heading && main.innerText.trim().length > 100;
  }, null, { timeout: 20000 });
  if (route === "/") await page.locator("#intelligenceFeed > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function integrity(page, settings, result) {
  const state = await page.evaluate(() => ({
    settings: window.AgentLabTheme?.getSettings(), resolved: window.AgentLabTheme?.getColorScheme(),
    preset: document.documentElement.dataset.theme, scheme: document.documentElement.dataset.colorScheme,
    nativeScheme: getComputedStyle(document.documentElement).colorScheme,
    canvas: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color,
    width: innerWidth, contentWidth: document.documentElement.scrollWidth,
    title: [...document.querySelectorAll("main h1")].find((node) => node.getClientRects().length)?.textContent.trim(),
    lucideLoaded: typeof window.lucide?.createIcons === "function",
    navigationIcons: document.querySelectorAll("agentlab-navigation svg").length,
    localIconSource: [...document.scripts].some((script) => new URL(script.src || location.href).pathname === "/vendor/lucide/lucide.min.js"),
  }));
  result.state = state;
  if (JSON.stringify(state.settings) !== JSON.stringify(settings) || state.resolved !== settings.mode || state.preset !== settings.preset || state.scheme !== settings.mode || state.nativeScheme !== settings.mode) {
    result.issues.push({ kind: "theme-contract", expected: settings, actual: state });
  }
  const palette = PALETTES[settings.preset][settings.mode];
  if (state.canvas !== rgb(palette[0]) || state.text !== rgb(palette[1])) result.issues.push({ kind: "palette", expected: palette.map(rgb), actual: [state.canvas, state.text] });
  if (state.contentWidth > state.width) result.issues.push({ kind: "overflow", width: state.width, contentWidth: state.contentWidth });
  if (!state.lucideLoaded || !state.localIconSource || state.navigationIcons < 3) result.issues.push({ kind: "icon-runtime", lucideLoaded: state.lucideLoaded, localIconSource: state.localIconSource, navigationIcons: state.navigationIcons });
  const trigger = page.locator(".site-theme-trigger");
  if (!(await trigger.getAttribute("aria-label"))) result.issues.push({ kind: "accessibility", message: "Theme trigger lacks an accessible name" });
  const icon = trigger.locator("svg");
  if (!(await icon.count()) || !(await icon.first().isVisible())) result.issues.push({ kind: "missing-theme-icon", message: "Icon-only theme control renders blank" });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const panel = page.locator("#siteThemePanel");
  await panel.waitFor({ state: "visible" });
  const box = await panel.boundingBox();
  if (box.x < -1 || box.x + box.width > state.width + 1) result.issues.push({ kind: "popover-overflow", box });
  const active = await page.evaluate(() => ({ name: document.activeElement.name, value: document.activeElement.value }));
  if (active.name !== "agentlab-theme-preset" || active.value !== settings.preset) result.issues.push({ kind: "accessibility", message: "ArrowDown does not focus selected preset", active });
  result.samples.push(await scan(page, "theme-panel", "#siteThemePanel"));
  await page.keyboard.press("Escape");
  if (await panel.isVisible() || !(await trigger.evaluate((node) => node === document.activeElement))) result.issues.push({ kind: "accessibility", message: "Escape does not close panel and restore trigger focus" });
  await trigger.evaluate((node) => node.blur());

  result.images = await page.locator("img").evaluateAll(async (images) => Promise.all(images.map(async (image) => {
    image.loading = "eager";
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error("image decode timeout")), 12000))]);
      return { src: image.currentSrc || image.src, loaded: image.naturalWidth > 0, width: image.naturalWidth };
    } catch (error) { return { src: image.currentSrc || image.src, loaded: false, message: error.message }; }
  })));
  for (const image of result.images.filter((image) => !image.loaded)) result.issues.push({ kind: "image", ...image });
  result.canvases = await page.locator("canvas:visible").evaluateAll((canvases) => canvases.map((canvas) => {
    try {
      const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      return { width: canvas.width, height: canvas.height, nonblank: !!pixels && pixels.some((value, index) => index % 4 === 3 && value > 0) };
    } catch (error) { return { width: canvas.width, height: canvas.height, unknown: error.message }; }
  }));
  for (const canvas of result.canvases.filter((canvas) => canvas.nonblank === false)) result.issues.push({ kind: "blank-canvas", ...canvas });
}

async function dialogs(page, result, output, slug) {
  let trigger;
  let scope;
  if (await page.locator("#articleEvidence").count()) {
    if (result.route === "/capabilities/code-mode.html") {
      await page.evaluate(() => { location.hash = "codex"; });
      await page.locator("#codex").waitFor({ state: "visible" });
    }
    trigger = page.locator("[data-evidence-trigger]:visible").first();
    scope = "#articleEvidence";
  } else if (result.route === "/") {
    trigger = page.locator("#feedAgentFilter");
    scope = "#feedAgentFilterPanel";
  } else if (result.route === "/mechanisms.html") {
    trigger = page.locator(".inspect-evidence:visible").first();
    scope = "#evidenceInspector";
  }
  if (!trigger || !(await trigger.count())) return;
  if (scope === "#articleEvidence") {
    await page.waitForFunction((element) => element.getAttribute("aria-controls") === "articleEvidence" && !element.disabled, await trigger.elementHandle());
  }
  await trigger.click();
  const panel = page.locator(scope);
  await panel.waitFor({ state: "visible" });
  if (scope === "#articleEvidence") {
    await page.waitForFunction((selector) => {
      const dialog = document.querySelector(selector);
      return dialog && dialog.getAttribute("aria-hidden") !== "true" && !dialog.inert && dialog.classList.contains("is-open");
    }, scope);
  }
  await page.waitForFunction((selector) => {
    const dialog = document.querySelector(selector);
    if (!dialog) return false;
    const box = dialog.getBoundingClientRect();
    return box.width > 0 && box.x >= -1 && box.x + box.width <= innerWidth + 1
      && !dialog.getAnimations().some((animation) => animation.playState === "running" || animation.pending);
  }, scope);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  result.samples.push(await scan(page, "dialog", scope));
  const size = await panel.boundingBox();
  const width = page.viewportSize().width;
  if (size.x < -1 || size.x + size.width > width + 1) result.issues.push({ kind: "dialog-overflow", scope, size });
  await page.screenshot({ path: path.join(output, `${slug}-dialog.png`), animations: "disabled" });
  await page.keyboard.press("Escape");
  if (scope === "#articleEvidence" && !(await trigger.evaluate((node) => node === document.activeElement))) result.issues.push({ kind: "accessibility", message: "Evidence Escape does not restore focus" });
  result.dialog = scope;
}

async function verifyCase(browser, base, output, route, preset, mode, width, attempt = 1) {
  const settings = { preset, mode };
  const result = { route, preset, mode, width, attempt, os: opposite(mode), issues: [], samples: [] };
  const slug = `${width}-${preset}-${mode}-${route === "/" ? "main" : route.replace(/^\//, "").replace(/\.html$/, "").replaceAll("/", "-")}${attempt > 1 ? `-attempt-${attempt}` : ""}`;
  const context = await browser.newContext({ viewport: { width, height: SIZES[width] }, colorScheme: opposite(mode), reducedMotion: "reduce" });
  await context.addInitScript((settings) => {
    try { localStorage.setItem("agentlab.theme.v1", JSON.stringify(settings)); }
    catch { /* about:blank has no storage; the real page contract is checked below. */ }
  }, settings);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  watch(page, result, base);
  try {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await ready(page, route);
    await integrity(page, settings, result);
    await page.evaluate(() => scrollTo(0, 0));
    result.samples.push(await scan(page, "top"));
    await page.screenshot({ path: path.join(output, `${slug}-top.png`), animations: "disabled" });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (const [label, target] of [["middle", Math.floor((height - SIZES[width]) / 2)], ["bottom", height]]) {
      await page.evaluate((top) => scrollTo(0, top), target);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      result.samples.push(await scan(page, label));
      if (REPRESENTATIVE.has(route)) await page.screenshot({ path: path.join(output, `${slug}-${label}.png`), animations: "disabled" });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow && !result.issues.some((issue) => issue.kind === "overflow")) result.issues.push({ kind: "overflow", message: "Deep content overflows viewport" });
    if (REPRESENTATIVE.has(route)) await dialogs(page, result, output, slug);
  } catch (error) {
    result.issues.push({ kind: "verification", message: error.message });
    await page.screenshot({ path: path.join(output, `${slug}-failure.png`), animations: "disabled" }).catch(() => {});
  } finally { await context.close(); }
  for (const sample of result.samples) result.issues.push(...sample.failures.map((failure) => ({ ...failure, sample: sample.label })));
  result.checkedText = result.samples.reduce((count, sample) => count + sample.checked, 0);
  result.status = result.issues.length ? "failed" : "passed";
  return result;
}

function onlyConnectionClosed(result) {
  const closed = result.issues.filter((issue) => ["local-resource", "external-resource"].includes(issue.kind)
    && issue.message === "net::ERR_CONNECTION_CLOSED");
  if (!closed.length) return false;
  return result.issues.every((issue) => closed.includes(issue)
    || (issue.kind === "verification" && /page\.goto: net::ERR_CONNECTION_CLOSED/.test(issue.message))
    || (issue.kind === "image" && closed.some((failure) => failure.url === issue.src)));
}

async function verifyCaseWithRetries(browser, base, output, route, preset, mode, width, sources) {
  const failedAttempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await verifyCase(browser, base, output, route, preset, mode, width, attempt);
    if (onlyConnectionClosed(result) && attempt < 3) {
      failedAttempts.push({ ...result, sourceHashes: sources });
      console.log(`network retry ${attempt}/2: ${width} ${preset}/${mode} ${route}`);
      continue;
    }
    if (failedAttempts.length) result.failedNetworkAttempts = failedAttempts;
    return result;
  }
}

async function nativeSettings(page, settings) {
  const trigger = page.locator(".site-theme-trigger");
  await trigger.click();
  await page.locator("#siteThemePanel").waitFor({ state: "visible" });
  for (const [key, value] of Object.entries(settings)) {
    await page.locator(`input[name="agentlab-theme-${key}"][value="${value}"]`).locator("..").click();
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(({ preset, mode }) => document.documentElement.dataset.theme === preset && document.documentElement.dataset.colorScheme === mode, settings);
}

async function verifyEditors(browser, base, output, presets, modes, widths) {
  const results = [];
  const sources = [
    { route: "/?mode=compare", host: "#diffEditor", ready: '#diffEditor[data-state="ready"]' },
    { route: "/capabilities/gpt-prompt-evolution.html", host: ".prompt-editor", ready: '.prompt-editor[data-state="ready"]' },
  ];
  for (const width of widths.filter((width) => width === 1440 || width === 390)) {
    for (const source of sources) {
      const context = await browser.newContext({ viewport: { width, height: SIZES[width] }, colorScheme: "dark", reducedMotion: "reduce" });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      const issues = [];
      watch(page, { issues }, base);
      try {
        await page.goto(`${base}${source.route}`, { waitUntil: "domcontentloaded" });
        await page.locator(source.host).first().scrollIntoViewIfNeeded();
        await page.locator(source.ready).first().waitFor({ state: "visible" });
        for (const preset of presets) {
          for (const mode of modes) {
            const result = { route: source.route, width, preset, mode, issues: [], nativeSwitch: true };
            try {
              await page.emulateMedia({ colorScheme: opposite(mode) });
              await nativeSettings(page, { preset, mode });
              await page.locator(source.ready).first().scrollIntoViewIfNeeded();
              await page.waitForFunction(() => {
                const rootStyle = getComputedStyle(document.documentElement);
                const expected = rootStyle.getPropertyValue("--theme-code-font").trim();
                return window.monaco?.editor.getEditors().length > 0 && window.monaco.editor.getEditors().every((editor) => editor.getOption(window.monaco.editor.EditorOption.fontFamily) === expected);
              });
              await page.evaluate(() => { document.body.offsetWidth; return document.fonts.ready; });
              result.editor = await page.evaluate(() => {
                const rootStyle = getComputedStyle(document.documentElement);
                const editor = document.querySelector(".monaco-editor");
                const colors = ["editor-background", "editor-foreground", "diffEditor-insertedLineBackground", "diffEditor-removedLineBackground", "editor-selectionBackground", ...Array.from({ length: 6 }, (_, i) => `editorBracketHighlight-foreground${i + 1}`)];
                const expected = ["pre-bg", "text", "add-soft", "delete-soft", "left-soft", ...Array(6).fill("text")];
                const computed = getComputedStyle(editor);
                return {
                  colors: Object.fromEntries(colors.map((color, i) => [color, { expected: rootStyle.getPropertyValue(`--theme-${expected[i]}`).trim(), actual: computed.getPropertyValue(`--vscode-${color}`).trim() }])),
                  backgrounds: [...document.querySelectorAll(".monaco-editor-background")].filter((node) => node.getClientRects().length).map((node) => getComputedStyle(node).backgroundColor),
                  font: rootStyle.getPropertyValue("--theme-code-font").trim(),
                  fonts: window.monaco.editor.getEditors().map((editor) => editor.getOption(window.monaco.editor.EditorOption.fontFamily)),
                  resolved: window.AgentLabTheme.getColorScheme(),
                  sourceIcons: [...document.querySelectorAll(".source-layer-icon")].map((holder) => !!holder.querySelector("svg")),
                };
              });
              for (const [token, values] of Object.entries(result.editor.colors)) {
                if (values.actual.toLowerCase() !== values.expected.toLowerCase()) result.issues.push({ kind: "editor-palette", token, ...values });
              }
              for (const actual of result.editor.backgrounds) {
                if (actual !== rgb(result.editor.colors["editor-background"].expected)) result.issues.push({ kind: "editor-background", actual, expected: result.editor.colors["editor-background"].expected });
              }
              if (!result.editor.font.includes("IBM Plex Mono") || result.editor.fonts.some((font) => font !== result.editor.font)) result.issues.push({ kind: "editor-font", expected: result.editor.font, actual: result.editor.fonts });
              if (result.editor.resolved !== mode) result.issues.push({ kind: "editor-mode", actual: result.editor.resolved, expected: mode });
              if (result.editor.sourceIcons.some((loaded) => !loaded)) result.issues.push({ kind: "source-icon", message: "Source evidence icon renders blank" });
              const geometry = await page.evaluate(() => ({ width: innerWidth, contentWidth: document.documentElement.scrollWidth, lines: [...document.querySelectorAll(".view-line")].filter((line) => line.getClientRects().length).length }));
              if (geometry.contentWidth > geometry.width) result.issues.push({ kind: "editor-overflow", ...geometry });
              if (!geometry.lines) result.issues.push({ kind: "blank-editor", ...geometry });
              const slug = `${width}-${preset}-${mode}-${source.route.startsWith("/?") ? "main-compare" : "gpt-prompt-editor"}`;
              await page.screenshot({ path: path.join(output, `${slug}.png`), animations: "disabled" });
              result.sample = await scan(page, "editor");
              result.issues.push(...result.sample.failures);
            } catch (error) { result.issues.push({ kind: "editor-verification", message: error.message }); }
            results.push(result);
            console.log(`editor ${result.issues.length ? "failed" : "passed"}: ${width} ${preset}/${mode} ${source.route}`);
          }
        }
      } catch (error) { results.push({ route: source.route, width, issues: [{ kind: "editor-verification", message: error.message }] }); }
      finally {
        if (issues.length) results.push({ route: source.route, width, issues });
        await context.close();
      }
    }
  }
  return results;
}

async function main() {
  const base = (process.argv[2] || "http://127.0.0.1:8766").replace(/\/$/, "");
  const output = process.argv[3] || "/private/tmp/agentlab-site-theme-ui";
  const allRoutes = await routes();
  const routeFilter = selected("SITE_THEME_ROUTES", allRoutes);
  const presets = selected("SITE_THEME_PRESETS", PRESETS);
  const modes = selected("SITE_THEME_MODES", MODES);
  const widths = selected("SITE_THEME_WIDTHS", [1440, 320, 390]).map(Number);
  for (const preset of presets) assert.ok(PRESETS.includes(preset), `unknown preset ${preset}`);
  for (const mode of modes) assert.ok(MODES.includes(mode), `unknown mode ${mode}`);
  for (const width of widths) assert.ok(SIZES[width], `unknown width ${width}`);
  await fs.mkdir(output, { recursive: true });
  const report = { base, createdAt: new Date().toISOString(), routes: routeFilter, presets, modes, widths, sourcesBefore: await sourceHashes(allRoutes), cases: [] };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of widths) {
      for (const preset of presets) {
        for (const mode of modes) {
          for (const route of routeFilter) {
            if (width === 390 && !REPRESENTATIVE.has(route) && !process.env.SITE_THEME_ROUTES) continue;
            const result = await verifyCaseWithRetries(browser, base, output, route, preset, mode, width, report.sourcesBefore);
            report.cases.push(result);
            const uniqueKinds = [...new Set(result.issues.map((issue) => issue.kind))];
            console.log(`${result.status}: ${width} ${preset}/${mode} ${route}${uniqueKinds.length ? ` (${uniqueKinds.join(", ")})` : ""}`);
          }
          await fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
        }
      }
    }
    if (process.env.SITE_THEME_EDITORS !== "0") report.editors = await verifyEditors(browser, base, output, presets, modes, widths);
    const editorIssues = (report.editors || []).flatMap((item) => item.issues);
    report.sourcesAfter = await sourceHashes(allRoutes);
    report.summary = {
      total: report.cases.length, passed: report.cases.filter((item) => item.status === "passed").length,
      failed: report.cases.filter((item) => item.status === "failed").length,
      editorCases: report.editors?.length || 0, editorFailures: (report.editors || []).filter((item) => item.issues.length).length,
      checkedText: report.cases.reduce((sum, item) => sum + item.checkedText, 0),
      networkRetriedCases: report.cases.filter((item) => item.failedNetworkAttempts?.length).length,
      failedNetworkAttempts: report.cases.reduce((sum, item) => sum + (item.failedNetworkAttempts?.length || 0), 0),
      priorAttemptIssueCounts: report.cases.flatMap((item) => item.failedNetworkAttempts || []).flatMap((item) => item.issues).reduce((counts, issue) => ({ ...counts, [issue.kind]: (counts[issue.kind] || 0) + 1 }), {}),
      issueCounts: [...report.cases.flatMap((item) => item.issues), ...editorIssues].reduce((counts, issue) => ({ ...counts, [issue.kind]: (counts[issue.kind] || 0) + 1 }), {}),
      stableSources: JSON.stringify(report.sourcesBefore) === JSON.stringify(report.sourcesAfter),
    };
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary));
    if (report.summary.failed || report.summary.editorFailures || !report.summary.stableSources) process.exitCode = 1;
  } finally { await browser.close(); }
}

module.exports = { onlyConnectionClosed };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
