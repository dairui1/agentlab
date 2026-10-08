const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const PRESETS = ["paper", "slate", "ink", "terminal"];
const SIZES = [[1440, 1000], [390, 844], [320, 740], [844, 390], [640, 240]];
const selectedPresets = process.env.GOOD_CSS_PRESETS?.split(",") || PRESETS;
const selectedSizes = process.env.GOOD_CSS_SIZES
  ? SIZES.filter(size => process.env.GOOD_CSS_SIZES.split(",").includes(size.join("x"))) : SIZES;
assert.ok(selectedPresets.length && selectedPresets.every(preset => PRESETS.includes(preset)));
assert.ok(selectedSizes.length);

async function bounds(page, selector, label) {
  const result = await page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: box.x, y: box.y, right: box.right, bottom: box.bottom,
      width: box.width, height: box.height, viewport: [innerWidth, innerHeight],
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      overscroll: style.overscrollBehaviorY, gutter: style.scrollbarGutter,
      topLayer: element.hasAttribute("popover") && element.matches(":popover-open"),
    };
  });
  assert.ok(result.x >= -1 && result.right <= result.viewport[0] + 1, `${label}: inline bounds ${JSON.stringify(result)}`);
  assert.ok(result.y >= -1 && result.bottom <= result.viewport[1] + 1, `${label}: block bounds ${JSON.stringify(result)}`);
  assert.ok(result.height > 0, `${label}: nonblank`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: document overflow`);
  return result;
}

async function containedWheel(page, selector, label) {
  const panel = page.locator(selector);
  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const before = await page.evaluate(() => scrollY);
  const box = await panel.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 450);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => scrollY);
  assert.equal(after, before, `${label}: wheel at panel end moved the document`);
  const end = await panel.evaluate(el => ({ position: el.scrollTop, maximum: el.scrollHeight - el.clientHeight, overscroll: getComputedStyle(el).overscrollBehaviorY }));
  assert.equal(end.overscroll, "contain", `${label}: exact-end scroll boundary`);
  return { before, after, end };
}

async function menus(browser, base, output, errors) {
  const results = [];
  for (const fallback of process.env.GOOD_CSS_NATIVE_ONLY ? [false] : [false, true]) {
    for (const [width, height] of selectedSizes) {
      for (const preset of selectedPresets) {
        for (const mode of ["light", "dark"]) {
          const label = `${fallback ? "fallback" : "native"}-${width}-${height}-${preset}-${mode}`;
          const context = await browser.newContext({ viewport: { width, height }, colorScheme: mode === "dark" ? "light" : "dark", reducedMotion: "reduce", hasTouch: width < 500, isMobile: width < 500 });
          await context.addInitScript(({ preset, mode, fallback }) => {
            localStorage.setItem("agentlab.theme.v1", JSON.stringify({ preset, mode }));
            if (fallback) {
              Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined, configurable: true });
              Object.defineProperty(HTMLElement.prototype, "hidePopover", { value: undefined, configurable: true });
            }
          }, { preset, mode, fallback });
          const page = await context.newPage();
          page.on("pageerror", error => errors.push({ label, message: error.message }));
          page.on("requestfailed", request => {
            if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push({ label, url: request.url(), message: request.failure()?.errorText });
          });
          page.on("response", response => {
            if (response.status() >= 400) errors.push({ label, url: response.url(), status: response.status() });
          });
          try {
            await page.goto(`${base}/`, { waitUntil: "networkidle" });
            await page.evaluate(() => document.fonts.ready);
            await page.locator(".mode-switch-menu-trigger").focus();
            await page.keyboard.press("ArrowDown");
            const menu = await bounds(page, "#researchMenu", label);
            assert.equal(menu.topLayer, !fallback);
            assert.equal(menu.overscroll, "contain");
            const count = await page.locator("#researchMenu a").count();
            for (let index = 0; index < count; index += 1) {
              const link = page.locator("#researchMenu a").nth(index);
              assert.ok(await link.evaluate(el => el === document.activeElement), `${label}: menu focus ${index}`);
              assert.ok(await link.evaluate(el => {
                const r = el.getBoundingClientRect(), panel = el.parentElement.getBoundingClientRect();
                return r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1;
              }), `${label}: focused destination ${index} is not reachable`);
              if (index + 1 < count) await page.keyboard.press("ArrowDown");
            }
            const wheel = await containedWheel(page, "#researchMenu", label);
            await page.screenshot({ path: path.join(output, `${label}-research.png`), animations: "disabled" });
            await page.keyboard.press("Escape");
            assert.equal(await page.locator("#researchMenu").isVisible(), false);
            assert.ok(await page.locator(".mode-switch-menu-trigger").evaluate(el => el === document.activeElement));
            await page.locator(".mode-switch-menu-trigger").click();
            await page.keyboard.press("Escape");
            assert.equal(await page.locator("#researchMenu").isVisible(), false, "Escape works without entering menu");

            await page.locator(".site-theme-trigger").focus();
            await page.keyboard.press("ArrowDown");
            const theme = await bounds(page, "#siteThemePanel", label);
            assert.equal(theme.topLayer, !fallback);
            await page.keyboard.press("Tab");
            for (const key of ["ArrowRight", "ArrowRight", "ArrowRight"]) await page.keyboard.press(key);
            assert.ok(await page.locator('#siteThemePanel input[name="agentlab-theme-mode"]:checked').evaluate(el => el === document.activeElement));
            await bounds(page, "#siteThemePanel", label);
            await page.screenshot({ path: path.join(output, `${label}-theme.png`), animations: "disabled" });
            await page.keyboard.press("Escape");
            assert.equal(await page.locator("#siteThemePanel").isVisible(), false);
            assert.ok(await page.locator(".site-theme-trigger").evaluate(el => el === document.activeElement));
            await page.locator(".site-theme-trigger").click();
            await page.mouse.click(5, 5);
            assert.equal(await page.locator("#siteThemePanel").isVisible(), false);
            results.push({ label, destinations: count, menu, theme, wheel });
          } finally {
            await context.close();
          }
        }
      }
    }
  }
  return results;
}

async function readers(browser, base, output) {
  const results = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, reducedMotion: "reduce" });
    await page.goto(`${base}/capabilities/code-mode.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => { location.hash = "codex"; });
    await page.locator("#codex").waitFor();
    if (width === 390) await page.locator("#cmTreeToggle").click();
    else await page.evaluate(() => scrollTo(0, 300));
    await bounds(page, "#cmTree", `tree ${width}`);
    const wheel = await containedWheel(page, "#cmTree", `tree ${width}`);
    await page.screenshot({ path: path.join(output, `reader-${width}-tree.png`), animations: "disabled" });
    if (width === 390) await page.keyboard.press("Escape");
    const trigger = page.locator("[data-evidence-trigger]:visible").first();
    await page.waitForFunction(() => !!document.querySelector('#codex [data-evidence-trigger][aria-controls="articleEvidence"]:not(:disabled)'));
    await trigger.scrollIntoViewIfNeeded();
    const before = await page.locator(".cm-content").boundingBox();
    await trigger.click();
    await page.waitForFunction(() => document.querySelector("#articleEvidence").classList.contains("is-open"));
    const drawer = await bounds(page, "#articleEvidence", `evidence ${width}`);
    assert.equal(drawer.overscroll, "contain");
    assert.equal(drawer.gutter, "stable");
    const after = await page.locator(".cm-content").boundingBox();
    assert.ok(Math.abs(before.x - after.x) < 1 && Math.abs(before.width - after.width) < 1, "evidence opening shifts article");
    await page.screenshot({ path: path.join(output, `reader-${width}-evidence.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    results.push({ width, wheel, drawer, articleBounds: { before, after } });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 700 } });
  await page.goto(`${base}/mechanisms.html`, { waitUntil: "networkidle" });
  for (const selector of [".operation-rail", "#evidenceInspector"]) {
    const styles = await page.locator(selector).evaluate(el => ({ overscroll: getComputedStyle(el).overscrollBehaviorY, gutter: getComputedStyle(el).scrollbarGutter, overflowing: el.scrollHeight > el.clientHeight + 1 }));
    assert.equal(styles.gutter, "stable");
    assert.equal(styles.overscroll, styles.overflowing ? "contain" : "auto");
    results.push({ selector, styles });
  }
  await page.close();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const noJs = await context.newPage();
  await noJs.goto(`${base}/capabilities/code-mode.html`);
  assert.equal(await noJs.locator(".cm-tree").evaluate(el => getComputedStyle(el).overscrollBehaviorY), "auto");
  assert.ok(await noJs.locator("#codex").isVisible());
  await context.close();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1400 }, javaScriptEnabled: false });
  const shortRail = await desktop.newPage();
  await shortRail.goto(`${base}/capabilities/code-mode.html`, { waitUntil: "networkidle" });
  const shortState = await shortRail.locator("#cmTree").evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight, overscroll: getComputedStyle(el).overscrollBehaviorY }));
  assert.equal(shortState.content, shortState.height, "tall viewport directory fits");
  assert.equal(shortState.overscroll, "auto", "fitting directory must not trap page scrolling");
  await shortRail.locator("#cmTree").hover();
  await shortRail.mouse.wheel(0, 300);
  await shortRail.waitForFunction(() => scrollY > 0);
  results.push({ shortRail: shortState, documentScroll: await shortRail.evaluate(() => scrollY) });
  await desktop.close();
  return results;
}

async function noAnchor(base) {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height] of SIZES) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${base}/`, { waitUntil: "networkidle" });
      // Remove only anchor enhancements to exercise the shipped centered fallback.
      await page.evaluate(() => {
        const stripAnchors = (sheet) => {
          for (let index = sheet.cssRules.length - 1; index >= 0; index -= 1) {
            const rule = sheet.cssRules[index];
            if (rule.conditionText?.includes("position-area")) sheet.deleteRule(index);
            else if (rule.cssRules) stripAnchors(rule);
          }
        };
        for (const sheet of document.styleSheets) stripAnchors(sheet);
      });
      await page.locator(".mode-switch-menu-trigger").click();
      results.push(await bounds(page, "#researchMenu", `no anchor ${width}`));
      await page.locator(".site-theme-trigger").click();
      results.push(await bounds(page, "#siteThemePanel", `no anchor ${width}`));
      await page.close();
    }
    return results;
  } finally {
    await browser.close();
  }
}

(async () => {
  const base = process.argv[2] || "http://127.0.0.1:8772";
  const output = process.argv[3] || "/private/tmp/agentlab-good-css-ui";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  const receipt = { base, errors: [] };
  try {
    receipt.menus = process.env.GOOD_CSS_READERS_ONLY ? [] : await menus(browser, base, output, receipt.errors);
    receipt.readers = await readers(browser, base, output);
    receipt.noAnchor = await noAnchor(base);
    assert.deepEqual(receipt.errors, []);
    receipt.passed = true;
    console.log(`Passed ${receipt.menus.length} menu cases, reader wheel isolation, evidence geometry, and no-JS fallback.`);
  } catch (error) {
    receipt.passed = false;
    receipt.failure = error.stack;
    throw error;
  } finally {
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify(receipt, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
