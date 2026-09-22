# Menu dropdown

1. Complete [Transition design](directions/transition.md), merge [motion.css](assets/transitions/motion.css) after Tailwind, and keep the returned cleanup function in the consumer lifecycle.
2. Start from the consumer's existing accessible menu primitive. Keep the trigger's `aria-haspopup="menu"`, `aria-controls`, and `aria-expanded`; keep the surface's `role="menu"`, accessible name, and `menuitem` roles; make every ID unique in the rendered page.
3. Separate interaction state from animation state. Treat `aria-expanded` as the requested open state, `hidden` plus `inert` plus `aria-hidden` as semantic exposure, and `data-state` as the CSS phase. On open, expose the menu before a frame changes `data-state` to `open`; on close, make it inert immediately, animate `closing`, then apply `hidden`.
4. Anchor the surface to the trigger and set `origin-top-right` to match the demonstrated right-edge placement. Animate only `opacity` and `scale`, list both properties explicitly, and use the shared duration and easing tokens.
5. Preserve roving focus. Arrow Down and Arrow Up on the trigger open to the first or last item; Arrow keys wrap; Home and End jump; Escape and item activation close and return focus; Tab and outside pointer dismissal close without trapping or stealing focus.
6. Cancel the prior timeout and animation frame on every direction change. Increment `stateVersion` and require the captured version before hiding so a stale close cannot overwrite a reopen. When reduced motion becomes active, finish the pending open or close immediately.
7. Adapt `mount(root)` to the owning framework without weakening the state machine. Cleanup must abort listeners, clear the timeout, cancel the frame, invalidate pending work, reset ARIA and roving tabindex, and leave the menu hidden and inert.

## Complete recipe

```html
<section data-demo="menu-dropdown" class="grid min-h-72 place-items-center rounded-3xl bg-slate-100 p-8 text-slate-950">
  <div class="relative">
    <button type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="project-actions" class="group inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm outline-2 outline-offset-2 outline-transparent hover:bg-slate-800 focus-visible:outline-blue-600 active:scale-[0.98] motion-reduce:active:scale-100">
      Project actions
      <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4 fill-current transition-[rotate] duration-(--motion-duration-fast) ease-motion-enter group-aria-expanded:rotate-180 motion-reduce:transition-none"><path d="m5.5 7.5 4.5 4 4.5-4 1 1.1-5.5 5-5.5-5 1-1.1Z" /></svg>
    </button>
    <div id="project-actions" role="menu" aria-label="Project actions" aria-hidden="true" data-state="closed" hidden inert class="absolute right-0 top-full z-20 mt-2 w-56 origin-top-right scale-[0.97] rounded-2xl border border-slate-200 bg-white p-1.5 opacity-0 shadow-xl shadow-slate-950/10 outline-none transition-[opacity,scale] duration-(--motion-duration-normal) ease-motion-enter data-[state=open]:scale-100 data-[state=open]:opacity-100 data-[state=closing]:scale-[0.99] data-[state=closing]:duration-(--motion-duration-fast) data-[state=closing]:ease-motion-exit motion-reduce:scale-100 motion-reduce:data-[state=closed]:scale-100 motion-reduce:data-[state=closing]:scale-100 motion-reduce:transition-none">
      <button type="button" role="menuitem" tabindex="0" class="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium outline-none hover:bg-slate-100 focus-visible:bg-blue-50 focus-visible:text-blue-800">Rename project</button>
      <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium outline-none hover:bg-slate-100 focus-visible:bg-blue-50 focus-visible:text-blue-800">Duplicate project</button>
      <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-red-700 outline-none hover:bg-red-50 focus-visible:bg-red-50">Archive project</button>
    </div>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const trigger = root.querySelector('[aria-controls="project-actions"]');
  const menu = root.querySelector("#project-actions");
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  let closeTimerId;
  let openFrameId;
  let pendingFocusTarget;
  let stateVersion = 0;

  function readDurationMilliseconds(propertyName, fallbackMilliseconds) {
    const tokenValue = getComputedStyle(root).getPropertyValue(propertyName).trim();
    const tokenMatch = tokenValue.match(/^(-?\d*\.?\d+)(ms|s)$/);
    if (!tokenMatch) return fallbackMilliseconds;
    const numericValue = Number(tokenMatch[1]);
    const milliseconds = tokenMatch[2] === "ms" ? numericValue : numericValue * 1000;
    return Math.max(0, milliseconds);
  }

  function finishClosed(version) {
    if (version !== stateVersion || menu.dataset.state !== "closing") return;
    menu.dataset.state = "closed";
    menu.hidden = true;
  }

  function setActiveItem(itemIndex) {
    items.forEach((item, index) => {
      item.tabIndex = index === itemIndex ? 0 : -1;
    });
  }

  function focusItem(itemIndex) {
    setActiveItem(itemIndex);
    items[itemIndex]?.focus();
  }

  function finishOpen() {
    if (trigger.getAttribute("aria-expanded") !== "true") return;
    menu.dataset.state = "open";
    if (pendingFocusTarget === "first") focusItem(0);
    if (pendingFocusTarget === "last") focusItem(items.length - 1);
    pendingFocusTarget = undefined;
  }

  function openMenu(focusTarget) {
    stateVersion += 1;
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    menu.hidden = false;
    menu.inert = false;
    menu.setAttribute("aria-hidden", "false");
    menu.dataset.state = "closed";
    trigger.setAttribute("aria-expanded", "true");
    setActiveItem(0);
    pendingFocusTarget = focusTarget;
    if (reducedMotion.matches) {
      finishOpen();
      return;
    }
    openFrameId = requestAnimationFrame(finishOpen);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (trigger.getAttribute("aria-expanded") === "false") return;
    stateVersion += 1;
    const version = stateVersion;
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    trigger.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-hidden", "true");
    menu.inert = true;
    menu.dataset.state = "closing";
    if (restoreFocus) trigger.focus();
    if (reducedMotion.matches) {
      finishClosed(version);
      return;
    }
    const closeDurationMilliseconds = readDurationMilliseconds("--motion-duration-fast", 150);
    closeTimerId = window.setTimeout(() => finishClosed(version), closeDurationMilliseconds);
  }

  function moveMenuFocus(event) {
    const currentIndex = items.indexOf(document.activeElement);
    const lastIndex = items.length - 1;
    let nextIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? lastIndex : (currentIndex - 1 + items.length) % items.length;
    else return;
    event.preventDefault();
    focusItem(nextIndex);
  }

  trigger.addEventListener("click", (event) => {
    if (trigger.getAttribute("aria-expanded") === "true") closeMenu();
    else openMenu(event.detail === 0 ? "first" : undefined);
  }, { signal: controller.signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu(event.key === "ArrowDown" ? "first" : "last");
  }, { signal: controller.signal });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    moveMenuFocus(event);
  }, { signal: controller.signal });
  menu.addEventListener("click", (event) => {
    if (!event.target.closest('[role="menuitem"]')) return;
    closeMenu({ restoreFocus: true });
  }, { signal: controller.signal });
  document.addEventListener("pointerdown", (event) => {
    if (!trigger.contains(event.target) && !menu.contains(event.target)) closeMenu();
  }, { signal: controller.signal });
  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches) return;
    if (menu.dataset.state === "closing") {
      finishClosed(stateVersion);
      return;
    }
    if (menu.dataset.state === "closed" && trigger.getAttribute("aria-expanded") === "true") {
      cancelAnimationFrame(openFrameId);
      finishOpen();
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    stateVersion += 1;
    trigger.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-hidden", "true");
    menu.dataset.state = "closed";
    menu.inert = true;
    menu.hidden = true;
    setActiveItem(0);
  };
}
```

## Acceptance

- Pointer activation opens and closes from the trigger edge without moving surrounding layout; `aria-expanded`, `aria-hidden`, `hidden`, `inert`, and `data-state` agree after each settled state.
- Trigger Arrow Down and Arrow Up, menu Arrow keys, Home, End, Escape, Tab, item activation, and outside pointer dismissal produce the stated focus result.
- Reopen during the 150ms close and confirm the stale timer never hides the reopened menu.
- Enable reduced motion during opening and closing; each operation reaches its meaningful final state immediately.
- Run cleanup while open and while closing; later input has no effect and no timer, frame, listener, or focusable hidden item remains.
