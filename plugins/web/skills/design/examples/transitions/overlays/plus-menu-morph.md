# Plus-menu morph

Use this recipe when a floating add control should become the action surface itself. The contained box expands from its fixed bottom-right corner while the same trigger rotates from plus to close; use the dropdown recipe when the menu is a separate popover. Import `assets/transitions/motion.css` after Tailwind, then pass the rendered section to `mount(root)`.

```html
<section data-demo="plus-menu-morph" class="grid min-h-96 place-items-center rounded-3xl bg-gradient-to-br from-blue-50 to-violet-100 p-6 text-slate-950">
  <div class="relative h-64 w-full max-w-xs">
    <div data-morph data-state="closed" class="group/morph absolute bottom-0 right-0 h-12 w-12 overflow-hidden rounded-full border border-white/70 bg-white shadow-xl shadow-blue-950/15 [contain:layout_paint] transition-[width,height,border-radius] duration-(--motion-duration-normal) ease-motion-exit data-[state=open]:h-56 data-[state=open]:w-64 data-[state=open]:rounded-3xl data-[state=open]:duration-(--motion-duration-slow) data-[state=open]:ease-motion-spring motion-reduce:transition-none">
      <div id="create-menu" role="menu" aria-label="Create" aria-hidden="true" hidden inert class="absolute inset-0 flex translate-x-8 scale-[0.97] flex-col p-4 pb-16 opacity-0 blur-[2px] transition-[opacity,translate,scale,filter] duration-(--motion-duration-normal) ease-motion-exit group-data-[state=open]/morph:translate-x-0 group-data-[state=open]/morph:scale-100 group-data-[state=open]/morph:opacity-100 group-data-[state=open]/morph:blur-none group-data-[state=open]/morph:duration-(--motion-duration-slow) group-data-[state=open]/morph:ease-motion-enter motion-reduce:translate-x-0 motion-reduce:scale-100 motion-reduce:blur-none motion-reduce:group-data-[state=closed]/morph:translate-x-0 motion-reduce:group-data-[state=closed]/morph:scale-100 motion-reduce:group-data-[state=closed]/morph:blur-none motion-reduce:group-data-[state=closing]/morph:translate-x-0 motion-reduce:group-data-[state=closing]/morph:scale-100 motion-reduce:group-data-[state=closing]/morph:blur-none motion-reduce:transition-none">
        <p role="presentation" class="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Create new</p>
        <button type="button" role="menuitem" tabindex="0" class="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-semibold outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:text-blue-800">Blank document</button>
        <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-semibold outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:text-blue-800">Project board</button>
        <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-semibold outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:text-blue-800">Invite workspace</button>
      </div>
      <button type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="create-menu" aria-label="Open create menu" class="absolute bottom-0 right-0 z-10 grid size-12 place-items-center rounded-full bg-blue-700 text-white outline-2 outline-offset-2 outline-transparent hover:bg-blue-600 focus-visible:outline-blue-700 active:scale-[0.96] motion-reduce:active:scale-100">
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-6 fill-none stroke-current stroke-2 transition-[rotate] duration-(--motion-duration-normal) ease-motion-enter group-data-[state=open]/morph:rotate-45 motion-reduce:transition-none"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const morph = root.querySelector("[data-morph]");
  const trigger = root.querySelector('[aria-controls="create-menu"]');
  const menu = root.querySelector("#create-menu");
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
    if (version !== stateVersion || morph.dataset.state !== "closing") return;
    morph.dataset.state = "closed";
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
    morph.dataset.state = "open";
    if (pendingFocusTarget === "first") focusItem(0);
    if (pendingFocusTarget === "last") focusItem(items.length - 1);
    pendingFocusTarget = undefined;
  }

  function openMenu({ focusTarget } = {}) {
    stateVersion += 1;
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    menu.hidden = false;
    menu.inert = false;
    menu.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-label", "Close create menu");
    morph.dataset.state = "closed";
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
    trigger.setAttribute("aria-label", "Open create menu");
    menu.setAttribute("aria-hidden", "true");
    menu.inert = true;
    morph.dataset.state = "closing";
    if (restoreFocus) trigger.focus();
    if (reducedMotion.matches) {
      finishClosed(version);
      return;
    }
    const closeDurationMilliseconds = readDurationMilliseconds("--motion-duration-normal", 250);
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
    else openMenu({ focusTarget: event.detail === 0 ? "first" : undefined });
  }, { signal: controller.signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu({ focusTarget: event.key === "ArrowDown" ? "first" : "last" });
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
    if (!morph.contains(event.target)) closeMenu();
  }, { signal: controller.signal });
  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches) return;
    if (morph.dataset.state === "closing") {
      finishClosed(stateVersion);
      return;
    }
    if (morph.dataset.state === "closed" && trigger.getAttribute("aria-expanded") === "true") {
      cancelAnimationFrame(openFrameId);
      finishOpen();
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    stateVersion += 1;
    morph.dataset.state = "closed";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Open create menu");
    menu.setAttribute("aria-hidden", "true");
    menu.inert = true;
    menu.hidden = true;
    setActiveItem(0);
  };
}
```

## Focused check

The initial state is a single circular plus control with hidden, inert menu content. Activate it and confirm the contained surface grows up and left, the plus rotates into a close mark, and the menu becomes available. Activate again during either direction to confirm the latest state wins and no stale timeout hides an open menu. Arrow Down opens and focuses the first item; Arrow keys, Home, and End move within the menu; Escape returns focus to the trigger; Tab and an outside pointer press close without trapping focus. Enable reduced motion during an exit and confirm the compact final state appears immediately. Call the cleanup function while open and confirm the surface, ARIA state, timer, frame, and listeners all reset.
