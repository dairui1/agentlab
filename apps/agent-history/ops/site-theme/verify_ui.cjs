const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const STORAGE_KEY = "agentlab.theme.v1";
const PRESETS = ["paper", "slate", "ink", "terminal"];
const MODES = ["light", "dark", "system"];
const VIEWPORTS = [[1440, 1000], [390, 844], [320, 740]];
const ROUTES = [
  { id: "code-mode", url: "/capabilities/code-mode.html", ready: "#overview" },
  { id: "catalog", url: "/capabilities.html", ready: "#researchIndex" },
  { id: "main", url: "/", ready: "#intelligenceFeed > *" },
];
const PALETTES = {
  paper: { light: ["#f7f6f3", "#21201c"], dark: ["#161513", "#ece9e3"] },
  slate: { light: ["#f1f4f8", "#16222e"], dark: ["#0b1119", "#e8eef6"] },
  ink: { light: ["#ffffff", "#141414"], dark: ["#0b0b0b", "#ededed"] },
  terminal: { light: ["#f4f5f2", "#1d211f"], dark: ["#0c0f0e", "#d3dbd6"] },
};

const opposite = (mode) => mode === "dark" ? "light" : "dark";
const rgb = (hex) => `rgb(${hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16)).join(", ")})`;
const inputSelector = (setting, value) => `input[name="agentlab-theme-${setting}"][value="${value}"]`;

function watch(page, diagnostics, label, base) {
  page.on("pageerror", (error) => diagnostics.pageErrors.push({ label, url: page.url(), message: error.message }));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const item = { label, url: page.url(), message: message.text(), location: message.location() };
    // Browser resource errors are accounted for through response/requestfailed below.
    if (/^Failed to load resource:/.test(item.message)) diagnostics.resourceConsole.push(item);
    else diagnostics.consoleErrors.push(item);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const item = { label, url: response.url(), status: response.status(), resourceType: response.request().resourceType() };
    const list = new URL(item.url).origin === new URL(base).origin ? "localResourceErrors" : "externalResourceErrors";
    diagnostics[list].push(item);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown network failure";
    if (failure === "net::ERR_ABORTED") return;
    const item = { label, url: request.url(), failure, resourceType: request.resourceType() };
    const list = new URL(item.url).origin === new URL(base).origin ? "localResourceErrors" : "externalResourceErrors";
    diagnostics[list].push(item);
  });
}

async function observeThemeEvents(context) {
  await context.addInitScript(() => {
    window.__themeEvents = [];
    window.addEventListener("agentlab:themechange", (event) => {
      window.__themeEvents.push({ detail: event.detail, readyState: document.readyState });
    });
  });
}

async function noOverflow(page, label) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(geometry.content <= geometry.width, `${label}: horizontal overflow ${JSON.stringify(geometry)}`);
}

async function visit(page, base, route = ROUTES[0]) {
  await page.goto(`${base}${route.url}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.AgentLabTheme);
  await page.locator(".site-theme-trigger").waitFor({ state: "visible" });
  await page.locator(route.ready).first().waitFor({ state: "visible" });
  await page.locator(".brand img").evaluate((image) => image.decode());
  await page.evaluate(() => document.fonts.ready);
}

async function verifyState(page, settings, resolved, label, { persisted = true, early = false } = {}) {
  await page.waitForFunction(({ preset, mode, colorScheme }) => {
    const theme = window.AgentLabTheme;
    const html = document.documentElement;
    return theme?.getSettings().preset === preset && theme.getSettings().mode === mode
      && theme.getColorScheme() === colorScheme && html.dataset.theme === preset
      && html.dataset.colorScheme === colorScheme && html.dataset.themeMode === mode;
  }, { ...settings, colorScheme: resolved });
  const state = await page.evaluate((key) => ({
    settings: window.AgentLabTheme.getSettings(),
    resolved: window.AgentLabTheme.getColorScheme(),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    stored: (() => { try { return localStorage.getItem(key); } catch { return null; } })(),
    events: window.__themeEvents,
  }), STORAGE_KEY);
  assert.deepEqual(state.settings, settings, `${label}: settings`);
  assert.equal(state.resolved, resolved, `${label}: effective mode`);
  assert.equal(state.colorScheme, resolved, `${label}: native controls use effective mode`);
  const palette = PALETTES[settings.preset][resolved];
  assert.equal(state.background, rgb(palette[0]), `${label}: canvas palette`);
  assert.equal(state.text, rgb(palette[1]), `${label}: body text palette`);
  if (persisted) assert.deepEqual(JSON.parse(state.stored), settings, `${label}: saved preferences`);
  for (const [setting, value] of Object.entries(settings)) {
    assert.equal(await page.locator(inputSelector(setting, value)).isChecked(), true, `${label}: ${setting} selection`);
    assert.equal(await page.locator(`input[name="agentlab-theme-${setting}"]:checked`).count(), 1);
  }
  assert.ok(state.events.length > 0, `${label}: theme event emitted`);
  assert.deepEqual(state.events.at(-1).detail, { ...settings, colorScheme: resolved }, `${label}: theme event contract`);
  if (early) {
    assert.equal(state.events[0].readyState, "loading", `${label}: saved theme applied in head`);
    assert.deepEqual(state.events[0].detail, { ...settings, colorScheme: resolved }, `${label}: saved theme applied before DOM ready`);
  }
  await noOverflow(page, label);
  return { settings: state.settings, resolved: state.resolved, canvas: state.background, text: state.text };
}

async function openPanel(page) {
  const trigger = page.locator(".site-theme-trigger");
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await page.locator("#siteThemePanel").waitFor({ state: "visible" });
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  const box = await page.locator("#siteThemePanel").boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, "theme panel fits horizontally");
  assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, "theme panel fits vertically");
  await noOverflow(page, "open theme panel");
}

async function choose(page, setting, value) {
  await openPanel(page);
  await page.locator(inputSelector(setting, value)).locator("..").click();
  assert.equal(await page.locator(inputSelector(setting, value)).isChecked(), true, `native ${setting} label selects ${value}`);
}

async function chooseSettings(page, settings) {
  const current = await page.evaluate(() => window.AgentLabTheme.getSettings());
  // Force a native preference change even when this pair equals the default.
  if (current.preset === settings.preset && current.mode === settings.mode) {
    await choose(page, "preset", PRESETS.find((preset) => preset !== settings.preset));
  }
  await choose(page, "preset", settings.preset);
  await choose(page, "mode", settings.mode);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".site-theme-trigger").getAttribute("aria-expanded"), "false");
  assert.ok(await page.locator(".site-theme-trigger").evaluate((node) => node === document.activeElement));
}

async function verifyKeyboard(page, output, width) {
  const trigger = page.locator(".site-theme-trigger");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await openPanel(page);
  const before = await page.evaluate(() => window.AgentLabTheme.getSettings());
  assert.ok(await page.locator(inputSelector("preset", before.preset)).evaluate((node) => node === document.activeElement));
  await page.keyboard.press("ArrowRight");
  const preset = PRESETS[(PRESETS.indexOf(before.preset) + 1) % PRESETS.length];
  assert.equal(await page.locator(inputSelector("preset", preset)).isChecked(), true, "native preset radio arrow navigation");
  await page.keyboard.press("Tab");
  assert.ok(await page.locator(inputSelector("mode", before.mode)).evaluate((node) => node === document.activeElement), "Tab enters checked mode radio");
  await page.keyboard.press("ArrowRight");
  const order = ["system", "light", "dark"];
  const mode = order[(order.indexOf(before.mode) + 1) % order.length];
  assert.equal(await page.locator(inputSelector("mode", mode)).isChecked(), true, "native mode radio arrow navigation");
  await page.screenshot({ path: path.join(output, `${width}-theme-keyboard.png`), animations: "disabled" });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#siteThemePanel").isVisible(), false);
  assert.ok(await trigger.evaluate((node) => node === document.activeElement), "Escape restores trigger focus");
  await trigger.click();
  await page.keyboard.press("Tab");
  assert.ok(await page.locator(inputSelector("preset", preset)).evaluate((node) => node === document.activeElement), "Tab enters the theme popover");
  await page.locator("#directTab").click();
  assert.equal(await page.locator("#siteThemePanel").isVisible(), false, "outside click closes popover");
  assert.ok(await page.locator("#directTab").evaluate((node) => node === document.activeElement), "outside click preserves destination focus");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await page.locator("#directTab").focus();
  assert.equal(await page.locator("#siteThemePanel").isVisible(), false, "focus leaving closes popover");
  await noOverflow(page, "theme keyboard interactions");
}

async function verifyMatrix(browser, base, output, diagnostics) {
  const results = [];
  for (const [width, height] of VIEWPORTS) {
    for (const preset of PRESETS) {
      for (const mode of MODES) {
        const os = mode === "system" ? (width === 390 ? "dark" : "light") : opposite(mode);
        const resolved = mode === "system" ? os : mode;
        const settings = { preset, mode };
        const label = `${width}-${preset}-${mode}`;
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: os });
        await observeThemeEvents(context);
        const page = await context.newPage();
        watch(page, diagnostics, label, base);
        try {
          await visit(page, base);
          await chooseSettings(page, settings);
          const state = await verifyState(page, settings, resolved, label);
          await page.screenshot({ path: path.join(output, `${label}-code-mode.png`), animations: "disabled" });
          await openPanel(page);
          await page.screenshot({ path: path.join(output, `${label}-panel.png`), animations: "disabled" });
          await page.keyboard.press("Escape");
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.locator(".site-theme-trigger").waitFor();
          await verifyState(page, settings, resolved, `${label} reload`, { early: true });
          const alternateOs = opposite(os);
          await page.emulateMedia({ colorScheme: alternateOs });
          await verifyState(page, settings, mode === "system" ? alternateOs : resolved, `${label} OS change`);
          await page.emulateMedia({ colorScheme: os });
          await verifyState(page, settings, resolved, `${label} OS restore`);
          for (const route of ROUTES.slice(1)) {
            await visit(page, base, route);
            await verifyState(page, settings, resolved, `${label} ${route.id}`, { early: true });
            if (mode !== "system") await page.screenshot({ path: path.join(output, `${label}-${route.id}.png`), animations: "disabled" });
          }
          if (preset === "ink" && mode === "light") {
            await visit(page, base);
            await verifyKeyboard(page, output, width);
          }
          results.push({ width, preset, mode, os, ...state, persistence: "passed", routes: "passed", mediaChange: "passed" });
          console.log(`${label}: passed`);
        } catch (error) {
          await page.screenshot({ path: path.join(output, `${label}-failure.png`), animations: "disabled" }).catch(() => {});
          throw error;
        } finally { await context.close(); }
      }
    }
  }
  return results;
}

async function verifyStorageSync(browser, base, diagnostics) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  await observeThemeEvents(context);
  try {
    const first = await context.newPage();
    const second = await context.newPage();
    watch(first, diagnostics, "storage-first", base);
    watch(second, diagnostics, "storage-second", base);
    await visit(first, base);
    await visit(second, base, ROUTES[1]);
    await chooseSettings(first, { preset: "slate", mode: "dark" });
    await verifyState(second, { preset: "slate", mode: "dark" }, "dark", "other tab receives first native choice");
    await chooseSettings(second, { preset: "terminal", mode: "light" });
    await verifyState(first, { preset: "terminal", mode: "light" }, "light", "first tab receives second native choice");
    return "passed";
  } finally { await context.close(); }
}

async function verifyBlockedStorage(browser, base, output, diagnostics) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await observeThemeEvents(context);
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new DOMException("Storage blocked for verification", "SecurityError"); },
    });
  });
  try {
    const page = await context.newPage();
    watch(page, diagnostics, "storage-blocked", base);
    await visit(page, base);
    await verifyState(page, { preset: "ink", mode: "system" }, "dark", "blocked storage boot", { persisted: false, early: true });
    await chooseSettings(page, { preset: "terminal", mode: "light" });
    await verifyState(page, { preset: "terminal", mode: "light" }, "light", "blocked storage active choice", { persisted: false });
    await page.screenshot({ path: path.join(output, "390-storage-blocked.png"), animations: "disabled" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".site-theme-trigger").waitFor();
    await verifyState(page, { preset: "ink", mode: "system" }, "dark", "blocked storage reload fallback", { persisted: false, early: true });
    return "passed";
  } finally { await context.close(); }
}

async function verifyNoJs(browser, base, output, diagnostics) {
  const results = [];
  for (const [width, height] of VIEWPORTS) {
    for (const os of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: os, javaScriptEnabled: false });
      try {
        const page = await context.newPage();
        watch(page, diagnostics, `${width}-no-js-${os}`, base);
        await page.goto(`${base}${ROUTES[0].url}`, { waitUntil: "load" });
        assert.equal(await page.locator("[data-node]:visible").count(), 23, "no-JS article stays complete");
        assert.equal(await page.locator(".site-theme-trigger").count(), 0, "no-JS has no inoperative theme control");
        assert.equal(await page.locator("html").getAttribute("data-theme"), null, "no-JS uses base CSS fallback");
        const background = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
        assert.equal(background, rgb(os === "dark" ? "#18191b" : "#ffffff"), "no-JS honors base system palette");
        await noOverflow(page, `${width} no-JS ${os}`);
        await page.screenshot({ path: path.join(output, `${width}-no-js-${os}.png`), animations: "disabled" });
        results.push({ width, os, nodes: 23, fallback: "passed" });
      } finally { await context.close(); }
    }
  }
  return results;
}

async function main() {
  const base = (process.argv[2] || "http://127.0.0.1:8766").replace(/\/$/, "");
  const output = process.argv[3] || "/private/tmp/agentlab-theme-ui";
  await fs.mkdir(output, { recursive: true });
  const diagnostics = { pageErrors: [], consoleErrors: [], resourceConsole: [], localResourceErrors: [], externalResourceErrors: [] };
  const browser = await chromium.launch({ headless: true });
  const report = { base, diagnostics };
  try {
    report.matrix = await verifyMatrix(browser, base, output, diagnostics);
    report.storageSync = await verifyStorageSync(browser, base, diagnostics);
    report.blockedStorage = await verifyBlockedStorage(browser, base, output, diagnostics);
    report.noJs = await verifyNoJs(browser, base, output, diagnostics);
    assert.deepEqual(diagnostics.pageErrors, [], "no JavaScript runtime errors");
    assert.deepEqual(diagnostics.consoleErrors, [], "no application console errors");
    assert.deepEqual(diagnostics.localResourceErrors, [], "all same-origin site assets load");
    report.status = "passed";
    console.log(JSON.stringify({ status: report.status, cases: report.matrix.length, storageSync: report.storageSync, blockedStorage: report.blockedStorage, noJs: report.noJs.length, externalResourceErrors: diagnostics.externalResourceErrors }));
  } catch (error) {
    report.status = "failed";
    report.failure = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
