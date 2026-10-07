const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function noOverflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow`);
}

async function visit(page, id) {
  await page.evaluate((hash) => { location.hash = hash; }, id);
  await page.locator(`#${id}`).waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-node]:visible").count(), 1, id);
  await noOverflow(page, id);
}

async function verifyMobileTree(page, output, prefix) {
  const toggle = page.locator("#cmTreeToggle");
  const backdrop = page.locator("#cmTreeBackdrop");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.equal(await backdrop.isVisible(), true);
  assert.ok(await page.locator("#cmTree").evaluate((tree) => tree.contains(document.activeElement)));
  await page.waitForFunction(() => document.getElementById("cmTree").getBoundingClientRect().left >= 0);
  assert.ok(await page.locator("#cmTree").evaluate((tree) => {
    const box = tree.getBoundingClientRect();
    return tree.contains(document.elementFromPoint(box.left + box.width / 2, box.top + 40));
  }), "mobile tree is visible above its backdrop");
  await noOverflow(page, "mobile tree");
  await page.screenshot({ path: path.join(output, `${prefix}-navigation.png`), animations: "disabled" });

  for (const [edge, key, expected] of [["last", "Tab", "first"], ["first", "Shift+Tab", "last"]]) {
    await page.locator("#cmTree").evaluate((tree, side) => {
      const items = [...tree.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter((item) => item.getClientRects().length && getComputedStyle(item).visibility !== "hidden");
      items[side === "first" ? 0 : items.length - 1].focus();
    }, edge);
    await page.keyboard.press(key);
    assert.ok(await page.locator("#cmTree").evaluate((tree, side) => {
      const items = [...tree.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter((item) => item.getClientRects().length && getComputedStyle(item).visibility !== "hidden");
      return document.activeElement === items[side === "first" ? 0 : items.length - 1];
    }, expected), `navigation traps ${key}`);
  }

  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await backdrop.isVisible(), false);
  assert.ok(await toggle.evaluate((node) => node === document.activeElement));
  await toggle.click();
  await page.locator("#cmTreeClose").click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.ok(await toggle.evaluate((node) => node === document.activeElement));
  await toggle.click();
  const box = await backdrop.boundingBox();
  await backdrop.click({ position: { x: box.width - 4, y: box.height / 2 } });
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");

  await toggle.click();
  await page.locator('#cmTreeNav a[href="#implementations"]').click();
  await page.locator("#implementations").waitFor({ state: "visible" });
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await backdrop.isVisible(), false);
  assert.ok(await page.locator("#implementations").evaluate((node) => node.contains(document.activeElement)));
}

async function verifyDiagram(page, id, output, prefix) {
  await visit(page, id);
  const diagram = page.locator(`#${id} .cm-diagram`);
  const tabs = diagram.locator('.cm-diagram-tabs [role="tab"]');
  const count = await tabs.count();
  assert.ok(count >= 3, `${id}: stages`);
  const heights = [];
  const checkActive = async (index) => {
    assert.equal(await tabs.nth(index).getAttribute("aria-selected"), "true", `${id}: active stage ${index}`);
    assert.equal(await diagram.locator('.cm-diagram-tabs [aria-selected="true"]').count(), 1);
    assert.equal(await diagram.locator(".cm-diagram-panel:visible").count(), 1);
    const controls = await tabs.nth(index).getAttribute("aria-controls");
    assert.equal(await page.locator(`#${controls}`).isVisible(), true);
    heights.push((await diagram.boundingBox()).height);
    await noOverflow(page, `${id} stage ${index}`);
  };
  for (let index = 0; index < count; index += 1) {
    await tabs.nth(index).click();
    await checkActive(index);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, `${id}: diagram changes height across stages (${heights.join(", ")})`);
  await page.keyboard.press("Home");
  await checkActive(0);
  await page.keyboard.press("ArrowRight");
  await checkActive(1);
  await page.keyboard.press("ArrowLeft");
  await checkActive(0);
  await page.keyboard.press("End");
  await checkActive(count - 1);
  await page.keyboard.press("ArrowRight");
  await checkActive(0);
  await diagram.locator("[data-diagram-next]").click();
  await checkActive(1);
  await page.screenshot({ path: path.join(output, `${prefix}-${id}.png`) });
  return { id, stages: count, height: heights[0], keyboard: "passed", stableLayout: "passed" };
}

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4398";
  const output = process.argv[3] || "/private/tmp/agentlab-code-mode-ui";
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height, colorScheme] of [[1440, 1000, "light"], [390, 844, "light"], [320, 740, "light"], [390, 844, "dark"]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme });
      const prefix = `${width}-${colorScheme}`;
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/capabilities/code-mode.html`, { waitUntil: "networkidle" });
      assert.equal(await page.locator("[data-node]").count(), 23);
      assert.equal(await page.locator("[data-node]:visible").count(), 1);
      assert.equal(await page.locator("details, summary").count(), 0);
      assert.equal(await page.locator('agentlab-navigation [aria-haspopup], agentlab-navigation [aria-expanded], .mode-switch-menu, .mode-switch-menu-chevron').count(), 0);
      assert.equal(await page.locator('agentlab-navigation a[href="/capabilities.html"]').count(), 1);
      assert.equal(await page.locator("#overview").isVisible(), true);
      await page.locator(".brand img").evaluate((image) => image.decode());
      await noOverflow(page, "overview");
      await page.screenshot({ path: path.join(output, `${prefix}-top.png`) });
      const exampleHeight = (await page.locator(".cm-example").boundingBox()).height;
      await page.locator("#programTab").click();
      assert.equal(await page.locator("#programExample").isVisible(), true);
      assert.ok(Math.abs((await page.locator(".cm-example").boundingBox()).height - exampleHeight) <= 1, "overview example stays the same height");
      await page.keyboard.press("ArrowLeft");
      assert.equal(await page.locator("#directExample").isVisible(), true);

      if (width <= 680) await verifyMobileTree(page, output, prefix);
      else {
        assert.equal(await page.locator("#cmTreeToggle").isVisible(), false);
        await page.locator('#cmTreeNav a[href="#implementations"]').click();
      }
      await page.locator("#implementations").waitFor({ state: "visible" });
      await page.locator('#implementations a[href="#codex"]').click();
      await page.locator("#codex").waitFor({ state: "visible" });
      assert.equal(await page.locator("#cmParentLink").getAttribute("href"), "#implementations");
      const trigger = page.locator('#codex [data-evidence-trigger][data-evidence~="CM-05"]').first();
      await trigger.click();
      await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
      assert.match(await page.locator("#articleEvidenceContent").textContent(), /V8/);
      await page.screenshot({ path: path.join(output, `${prefix}-evidence.png`) });
      await page.keyboard.press("Escape");
      await page.locator('#articleEvidence[aria-hidden="true"]').waitFor();
      assert.ok(await trigger.evaluate((node) => node === document.activeElement));

      const ids = await page.locator("[data-node]").evaluateAll((nodes) => nodes.map((node) => node.id));
      for (const [index, id] of ids.entries()) {
        await visit(page, id);
        assert.equal(await page.locator(`#cmTreeNav a[href="#${id}"]`).getAttribute("aria-current"), "page");
        if (index > 0) assert.equal(await page.locator("#cmPrevLink").getAttribute("href"), `#${ids[index - 1]}`, `${id}: previous`);
        else assert.ok(await page.locator("#cmPrevLink").evaluate((link) => link.hidden || link.getAttribute("aria-disabled") === "true"));
        if (index < ids.length - 1) assert.equal(await page.locator("#cmNextLink").getAttribute("href"), `#${ids[index + 1]}`, `${id}: next`);
        else assert.ok(await page.locator("#cmNextLink").evaluate((link) => link.hidden || link.getAttribute("aria-disabled") === "true"));
      }
      const diagrams = [];
      for (const id of ["execution", "codex", "sandbox", "state"]) diagrams.push(await verifyDiagram(page, id, output, prefix));
      await visit(page, "sources");
      await visit(page, "sandbox");
      await page.goBack();
      await page.locator("#sources").waitFor({ state: "visible" });
      await page.goForward();
      await page.locator("#sandbox").waitFor({ state: "visible" });
      assert.deepEqual(errors, []);
      results.push({ width, colorScheme, nodes: ids.length, diagrams, errors, drawer: "passed", history: "passed", navigation: "passed" });
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${base}/capabilities.html?study=code-mode`, { waitUntil: "networkidle" });
    await page.locator("#researchLegacyLink").waitFor({ state: "visible" });
    assert.equal(await page.locator("#researchLegacyLink").getAttribute("href"), "/capabilities/code-mode.html");
    await page.goto(`${base}/capabilities/code-mode.html?evidence=CM-03`, { waitUntil: "networkidle" });
    await page.locator('#articleEvidence:not([aria-hidden="true"])').waitFor();
    assert.match(await page.locator("#articleEvidenceContent").textContent(), /CM-03|store/);
    await page.goto(`${base}/capabilities/code-mode.html#training`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#training").isVisible(), true);
    assert.equal(await page.locator("[data-node]:visible").count(), 1);
    await page.goto(`${base}/capabilities/code-mode.html#%bad`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#overview").isVisible(), true);
    await page.close();
    const noJs = await browser.newPage({ javaScriptEnabled: false });
    await noJs.goto(`${base}/capabilities/code-mode.html`);
    assert.equal(await noJs.locator("[data-node]:visible").count(), 23);
    assert.equal(await noJs.locator("details, summary").count(), 0);
    await noJs.close();
    await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ base, results, researchEntry: "passed", deepLink: "passed", noJs: "passed" }, null, 2));
    console.log(JSON.stringify({ base, viewports: results.length, researchEntry: "passed", deepLink: "passed", noJs: "passed" }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
