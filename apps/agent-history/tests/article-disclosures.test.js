const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const script = fs.readFileSync(path.join(__dirname, "../public/article-disclosures.js"), "utf8");

function mount(hash) {
  class Element {
    constructor(parentElement = null) { this.parentElement = parentElement; this.scrolls = []; }
    scrollIntoView(value) { this.scrolls.push(value.block); }
  }
  class Details extends Element { constructor(parent) { super(parent); this.open = false; } }
  const outside = new Element();
  const outer = new Details(outside);
  const inner = new Details(outer);
  const target = new Element(inner);
  const targets = new Map([["source", target], ["notes", outer], ["intro", outside]]);
  const frames = [];
  const events = new Map();
  const location = { hash };
  vm.runInNewContext(script, {
    location, HTMLDetailsElement: Details,
    document: { getElementById: (id) => targets.get(id) },
    window: { addEventListener: (name, callback) => events.set(name, callback) },
    requestAnimationFrame: (callback) => frames.push(callback),
  });
  return { inner, outer, target, outside, frames,
    flush: () => { while (frames.length) frames.shift()(); },
    navigate: (hash) => { location.hash = hash; events.get("hashchange")(); } };
}

test("article deep links open enclosing notes before scrolling the target", () => {
  const page = mount("#%73ource");
  assert.equal(page.outer.open, true);
  assert.equal(page.inner.open, true);
  assert.deepEqual(page.target.scrolls, []);
  page.flush();
  assert.deepEqual(page.target.scrolls, ["start"]);
});

test("article hash changes support collapsed note roots and leave ordinary sections alone", () => {
  const page = mount("");
  page.navigate("#intro");
  assert.equal(page.frames.length, 0);
  assert.equal(page.outer.open, false);
  page.navigate("#notes");
  assert.equal(page.outer.open, true);
  assert.equal(page.inner.open, false);
  page.flush();
  assert.deepEqual(page.outer.scrolls, ["start"]);
});

test("article hash handling ignores malformed and missing targets", () => {
  const page = mount("#%E0%A4%A");
  assert.doesNotThrow(() => page.navigate("#%"));
  page.navigate("#missing");
  page.navigate("");
  assert.equal(page.frames.length, 0);
  assert.equal(page.outer.open, false);
});
