const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const base = process.argv[2] || "http://127.0.0.1:8771";
const output = process.argv[3] || "/private/tmp/agentlab-filter-controls";
const sizes = [[1440, 1000, false], [1024, 768, true], [390, 844, true], [320, 740, true], [390, 360, true], [320, 300, true]];
const report = { base, cases: [], errors: [] };

async function geometry(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: parseFloat(style.fontSize), outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) };
  });
}

async function fits(page, selector) {
  const box = await geometry(page, selector);
  const viewport = page.viewportSize();
  assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, `${selector}: horizontal bounds ${JSON.stringify(box)}`);
  assert.ok(box.y >= -1 && box.y + box.height <= viewport.height + 1, `${selector}: vertical bounds ${JSON.stringify(box)}`);
  return box;
}

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${page.url()}: horizontal overflow`);
}

async function feed(page, label, touch, api) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.locator("#feedAgentFilterOptions input").first().waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${label}-entry.png`) });
  const trigger = page.locator("#feedAgentFilter");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("#feedAgentFilterPanel");
  await panel.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement.id === "feedAgentFilterSearch");
  assert.equal(await panel.evaluate((el) => el.hasAttribute("popover")), api !== "fallback");
  const box = await fits(page, "#feedAgentFilterPanel");
  const search = await geometry(page, "#feedAgentFilterSearch");
  if (touch) assert.ok(search.font >= 16, "touch search font must prevent focus zoom");
  const list = await fits(page, "#feedAgentFilterOptions");
  assert.ok(list.y >= box.y && list.y + list.height <= box.y + box.height - 1, "list must fit inside its panel");
  if (touch) {
    for (const selector of [".feed-filter-option:visible", "#feedAgentFilterPanel .feed-filter-panel-close", "#feedAgentFilterPanel .feed-filter-panel-clear"]) {
      const target = await geometry(page, selector + (selector.includes("option") ? ":first-of-type" : ""));
      assert.ok(target.height >= 44, `${selector}: touch target`);
    }
  }
  await page.screenshot({ path: path.join(output, `${label}-agent.png`) });
  const headerY = (await geometry(page, "#feedAgentFilterTitle")).y;
  await page.locator("#feedAgentFilterOptions").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const last = page.locator("#feedAgentFilterOptions label").last();
  const lastBox = await last.boundingBox();
  assert.ok(lastBox.y + lastBox.height <= list.y + list.height + 1, "last option must be reachable inside list");
  assert.equal((await geometry(page, "#feedAgentFilterTitle")).y, headerY, "header remains outside scroller");
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => scrollY), before, "list end must not scroll background");
  await page.screenshot({ path: path.join(output, `${label}-last-option.png`) });
  await page.locator("#feedAgentFilterSearch").fill("codex");
  const codex = page.locator('input[data-feed-filter-option="agent"][value="codex"]');
  await codex.locator("..").click();
  assert.ok(await codex.isChecked());
  assert.ok(new URL(page.url()).searchParams.getAll("feedAgent").includes("codex"));
  await panel.locator("[data-feed-filter-close]").click();
  assert.equal(await panel.isVisible(), false);
  assert.ok(await trigger.evaluate((el) => el === document.activeElement));
  await trigger.click();
  await page.locator("#feedAgentFilterSearch").fill("no-such-agent-zzzz");
  await page.locator("#feedAgentFilterEmpty").waitFor({ state: "visible" });
  await fits(page, "#feedAgentFilterPanel");
  await page.screenshot({ path: path.join(output, `${label}-empty.png`) });
  await page.keyboard.press("Escape");
  assert.equal(await panel.isVisible(), false);
  assert.ok(await trigger.evaluate((el) => el === document.activeElement));
  await trigger.click();
  await page.locator("#feedAgentFilterSearch").fill("");
  await panel.locator("[data-feed-filter-clear]").click();
  assert.equal(new URL(page.url()).searchParams.has("feedAgent"), false);
  await page.locator("#feedSignalFilter").click();
  await fits(page, "#feedSignalFilterPanel");
  const signal = page.locator('#feedSignalFilterOptions input').first();
  await page.waitForFunction(() => document.activeElement === document.querySelector('#feedSignalFilterOptions input'));
  await page.keyboard.press("Space");
  assert.ok(await signal.isChecked());
  await page.screenshot({ path: path.join(output, `${label}-signal.png`) });
  await page.locator("#feedSignalFilterPanel [data-feed-filter-close]").click();
  await trigger.click();
  await page.mouse.click(4, 4);
  assert.equal(await panel.isVisible(), false, "outside click dismisses filter");
  await noOverflow(page);
  return { panel: box, list, search };
}

async function searches(page, label, touch) {
  const cases = [
    ["/capabilities.html", ".research-search input", ".research-search"],
    ["/capabilities.html?study=code-mode", ".research-search:visible input", ".research-search:visible"],
    ["/mechanisms.html?view=flows", ".collection-search input", ".collection-search"],
    ["/mechanisms.html?view=failures", ".collection-search input", ".collection-search"],
    ["/mechanisms.html?view=changes", ".collection-search input", ".collection-search"],
  ];
  for (const [route, input, wrapper] of cases) {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    if (route.includes("?study=")) {
      await page.locator("#researchArchive > summary").click();
    }
    const field = page.locator(input).first();
    await field.waitFor({ state: "visible" });
    await field.focus();
    const box = await geometry(page, input);
    const focus = await geometry(page, wrapper);
    assert.equal(focus.outline, "solid", `${route}: visible focus`);
    assert.ok(focus.outlineWidth >= 2);
    if (touch) { assert.ok(box.font >= 16); assert.ok(focus.height >= 44); }
    await field.fill("codex");
    await noOverflow(page);
    const state = route.includes("mechanisms") ? `collection-${new URL(route, base).searchParams.get("view")}` : route.includes("?") ? "detail" : "catalog";
    await page.screenshot({ path: path.join(output, `${label}-${state}.png`) });
    await page.emulateMedia({ forcedColors: "active" });
    const forced = await geometry(page, wrapper);
    assert.equal(forced.outline, "solid");
    assert.ok(forced.outlineWidth >= 2);
    await page.emulateMedia({ forcedColors: "none" });
  }
  await page.goto(`${base}/?mode=compare&agent=codex`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#rightVersion").options.length > 0);
  if (touch) {
    for (const selector of ["#leftVersion", "#rightVersion", "#agentSwitch"]) {
      const box = await geometry(page, selector);
      assert.ok(box.font >= 16 && box.height >= 44, `${selector}: touch field`);
    }
  }
  await noOverflow(page);
  await page.screenshot({ path: path.join(output, `${label}-compare.png`), fullPage: true });
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height, touch] of sizes) {
      for (const mode of ["light", "dark"]) {
        for (const api of ["native", "fallback", "source-ignored"]) {
          const label = `${width}-${height}-${mode}-${api}`;
          if (process.env.FILTER_CONTROL_CASES && !process.env.FILTER_CONTROL_CASES.split(",").includes(label)) continue;
          const result = { label, issues: [] };
          const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: width < 500, colorScheme: mode, reducedMotion: "reduce" });
          await context.addInitScript(({ mode, api }) => {
            try { localStorage.setItem("agentlab.theme.v1", JSON.stringify({ preset: "ink", mode })); } catch {}
            if (api === "fallback") {
              HTMLElement.prototype.showPopover = undefined;
              HTMLElement.prototype.hidePopover = undefined;
            } else if (api === "source-ignored") {
              const show = HTMLElement.prototype.showPopover;
              HTMLElement.prototype.showPopover = function () { return show.call(this); };
            }
          }, { mode, api });
          const page = await context.newPage();
          page.setDefaultTimeout(12000);
          page.on("pageerror", (error) => result.issues.push(error.message));
          page.on("response", (response) => { if (response.status() >= 400) result.issues.push(`${response.status()} ${response.url()}`); });
          page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") result.issues.push(`${request.failure()?.errorText} ${request.url()}`); });
          try {
            result.feed = await feed(page, label, touch, api);
            if (api === "native" && height >= 700) await searches(page, label, touch);
          } catch (error) {
            result.issues.push(error.stack);
            await page.screenshot({ path: path.join(output, `${label}-failed.png`) }).catch(() => {});
          }
          report.cases.push(result);
          if (result.issues.length) report.errors.push({ label, issues: result.issues });
          await fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
          await context.close();
          console.log(`${label}: ${result.issues.length ? "FAIL" : "PASS"}`);
          if (result.issues.length) console.log(result.issues.join("\n"));
        }
      }
    }
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  }
  console.log(`${report.cases.length} control cases, ${report.errors.length} failures`);
  if (report.errors.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
