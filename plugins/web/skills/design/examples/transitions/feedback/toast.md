# Toast

Use this pattern for a brief, non-blocking confirmation with an optional direct dismissal. Keep critical errors and required decisions in the page flow instead of an auto-dismissing surface.

Import `assets/transitions/motion.css` once before using this recipe.

```html
<section data-demo="toast" class="relative flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50 p-6 text-neutral-950">
  <button type="button" data-show class="min-h-11 rounded-full bg-neutral-950 px-5 text-sm font-medium text-white transition-[background-color,scale] duration-(--motion-duration-fast) ease-motion-enter hover:bg-neutral-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 motion-reduce:transition-none motion-reduce:active:scale-100">Show save confirmation</button>
  <div data-toast data-open="false" role="status" aria-live="polite" aria-hidden="true" class="absolute inset-x-4 bottom-4 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg transition-[opacity,translate,scale,filter] duration-(--motion-duration-normal) ease-motion-enter data-[open=false]:pointer-events-none data-[open=false]:translate-y-4 data-[open=false]:scale-[0.97] data-[open=false]:opacity-0 data-[open=false]:blur-[2px] data-[open=true]:duration-(--motion-duration-slow) motion-reduce:translate-none motion-reduce:scale-100 motion-reduce:blur-none motion-reduce:transition-none">
    <span aria-hidden="true" class="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="m5 10 3 3 7-7" /></svg>
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium">Project saved</p>
      <p class="text-sm text-neutral-600">Your latest changes are available.</p>
    </div>
    <button type="button" data-close aria-label="Dismiss save confirmation" class="grid size-11 shrink-0 place-items-center rounded-full text-neutral-500 transition-colors duration-(--motion-duration-fast) hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4"><path stroke-linecap="round" d="m5 5 10 10M15 5 5 15" /></svg>
    </button>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const showButton = root.querySelector("[data-show]");
  const toast = root.querySelector("[data-toast]");
  const closeButton = root.querySelector("[data-close]");
  const displayTime = 5000;
  let dismissTimer = 0;
  let deadline = 0;
  let remaining = displayTime;
  let pointerInside = false;
  let focusInside = false;

  const clearDismissal = () => {
    clearTimeout(dismissTimer);
    dismissTimer = 0;
  };

  const close = () => {
    clearDismissal();
    remaining = displayTime;
    pointerInside = false;
    focusInside = false;
    toast.dataset.open = "false";
    toast.setAttribute("aria-hidden", "true");
  };

  const scheduleDismissal = () => {
    clearDismissal();
    deadline = Date.now() + remaining;
    dismissTimer = setTimeout(close, remaining);
  };

  const open = () => {
    clearDismissal();
    toast.dataset.open = "false";
    toast.setAttribute("aria-hidden", "true");
    void toast.offsetWidth;
    toast.dataset.open = "true";
    toast.setAttribute("aria-hidden", "false");
    remaining = displayTime;
    scheduleDismissal();
  };

  const pauseDismissal = () => {
    if (toast.dataset.open !== "true" || !dismissTimer) return;
    remaining = Math.max(0, deadline - Date.now());
    clearDismissal();
  };

  const resumeDismissal = () => {
    if (toast.dataset.open === "true" && !dismissTimer && !pointerInside && !focusInside) scheduleDismissal();
  };

  showButton.addEventListener("click", open, { signal: controller.signal });
  closeButton.addEventListener("click", () => {
    showButton.focus();
    close();
  }, { signal: controller.signal });
  toast.addEventListener("pointerenter", () => {
    pointerInside = true;
    pauseDismissal();
  }, { signal: controller.signal });
  toast.addEventListener("pointerleave", () => {
    pointerInside = false;
    resumeDismissal();
  }, { signal: controller.signal });
  toast.addEventListener("focusin", () => {
    focusInside = true;
    pauseDismissal();
  }, { signal: controller.signal });
  toast.addEventListener("focusout", (event) => {
    if (toast.contains(event.relatedTarget)) return;
    focusInside = false;
    resumeDismissal();
  }, { signal: controller.signal });

  return () => {
    close();
    controller.abort();
  };
}
```

The five-second display window gives readers time to find and use the dismissal control. Show the toast repeatedly, hover it, and focus its close button to confirm each action replaces the prior timer and pauses auto-dismissal; turn reduced motion on while it is visible and confirm only the movement disappears. Cleanup must cancel dismissal and every listener.
