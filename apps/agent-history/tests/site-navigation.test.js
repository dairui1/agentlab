const assert = require("node:assert/strict");
const test = require("node:test");
const { define, researchItems } = require("../public/site-navigation.js");

function mount(current = "auto", search = "") {
  const documentListeners = new Map();
  const document = {
    activeElement: null,
    createElement: (tag) => new Element(tag),
    addEventListener: (type, handler) => documentListeners.set(type, handler),
    removeEventListener: (type, handler) => {
      if (documentListeners.get(type) === handler) documentListeners.delete(type);
    },
  };
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = new Map();
      this.dataset = {};
      this.listeners = new Map();
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key); }
    hasAttribute(key) { return this.attributes.has(key); }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    querySelectorAll(tag) {
      return this.children.flatMap((child) => [
        ...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag),
      ]);
    }
    querySelector(tag) { return this.querySelectorAll(tag)[0]; }
    contains(target) { return this === target || this.children.some((child) => child.contains(target)); }
    focus() { document.activeElement = this; }
    dispatch(type, values = {}) {
      const event = { preventDefault() { this.defaultPrevented = true; }, ...values };
      this.listeners.get(type)?.(event);
      return event;
    }
  }
  let Navigation;
  define({
    document, HTMLElement: Element, location: { href: `https://example.test/capabilities.html${search}` },
    customElements: { get: () => undefined, define: (_, component) => { Navigation = component; } },
  });
  const navigation = new Navigation();
  navigation.setAttribute("current", current);
  navigation.connectedCallback();
  const menuContainer = navigation.children[0].children.at(-1);
  const [trigger, menu] = menuContainer.children;
  return { navigation, document, documentListeners, menuContainer, trigger, menu, links: menu.children };
}

test("research navigation retains all destinations and marks the catalog current", () => {
  const { trigger, links } = mount();
  assert.equal(trigger.dataset.current, "true");
  assert.equal(links[0].href, "/capabilities.html");
  assert.equal(links[0].getAttribute("aria-current"), "page");
  assert.deepEqual(links.map((link) => link.href), researchItems.map((item) => item.href));
  const goal = mount("auto", "?study=goal-mode");
  assert.equal(goal.links.find((link) => link.href.includes("?study=goal-mode")).getAttribute("aria-current"), "page");
});

test("research menu supports arrow navigation, wraparound, Home, End, and Escape", () => {
  const { trigger, menu, links, document } = mount();
  trigger.dispatch("keydown", { key: "ArrowDown" });
  assert.equal(menu.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(document.activeElement, links[0]);
  for (const [key, expected] of [["ArrowUp", links.at(-1)], ["ArrowDown", links[0]], ["End", links.at(-1)], ["Home", links[0]]]) {
    assert.equal(menu.dispatch("keydown", { key }).defaultPrevented, true);
    assert.equal(document.activeElement, expected);
  }
  menu.dispatch("keydown", { key: "Escape" });
  assert.equal(menu.hidden, true);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, trigger);
});

test("research menu closes on outside click or focus leaving, and cleans up listeners", () => {
  const { navigation, menuContainer, trigger, menu, links, documentListeners } = mount();
  trigger.dispatch("click");
  menuContainer.dispatch("focusout", { relatedTarget: links[0] });
  assert.equal(menu.hidden, false);
  menuContainer.dispatch("focusout", { relatedTarget: null });
  assert.equal(menu.hidden, true);
  trigger.dispatch("click");
  documentListeners.get("click")({ target: null });
  assert.equal(menu.hidden, true);
  navigation.disconnectedCallback();
  assert.equal(documentListeners.size, 0);
});
