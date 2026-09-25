(function () {
  "use strict";
  const root = document.querySelector("[data-sequence]");
  if (root) {
    const steps = [
      { newMessage: false, status: "DRAFT", text: "准备好了，我来发布。", note: "A 的上下文停在 seq 41；草稿还没有发到频道。" },
      { newMessage: true, status: "STALE CONTEXT", text: "准备好了，我来发布。", note: "人类补充了 seq 42。A 的草稿仍然依据旧上下文。" },
      { newMessage: true, status: "HELD · NOT SENT", text: "准备好了，我来发布。", note: "发送检查发现未见消息：暂缓投递，把新上下文交回 Agent 决定。" },
    ];
    let index = 0;
    const previous = root.querySelector("[data-previous]");
    const next = root.querySelector("[data-next]");
    function render() {
      const step = steps[index];
      root.querySelector("[data-new-message]").hidden = !step.newMessage;
      root.querySelector("[data-draft-status]").textContent = step.status;
      root.querySelector("[data-draft-text]").textContent = step.text;
      root.querySelector("[data-sequence-note]").textContent = step.note;
      root.querySelector("output").textContent = `${index + 1}/3`;
      previous.disabled = index === 0;
      next.disabled = index === steps.length - 1;
    }
    previous.addEventListener("click", () => { index = Math.max(0, index - 1); render(); });
    next.addEventListener("click", () => { index = Math.min(steps.length - 1, index + 1); render(); });
    render();
  }
  const outlineLinks = [...document.querySelectorAll(".blog-outline ol a")];
  const sections = [...document.querySelectorAll("[data-blog-section]")];
  function updateOutline() {
    const active = [...sections].reverse().find((s) => s.getBoundingClientRect().top <= 140) || sections[0];
    for (const link of outlineLinks) {
      if (link.hash === `#${active?.id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  let queued = false;
  window.addEventListener("scroll", () => {
    if (!queued) { queued = true; requestAnimationFrame(() => { updateOutline(); queued = false; }); }
  }, { passive: true });
  updateOutline();
  window.lucide?.createIcons();
})();
