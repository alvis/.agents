# Panel reveal

## Implement and adapt

1. Import [motion.css](assets/transitions/motion.css) once after Tailwind CSS, or map its tokens to project motion tokens. Keep `translate`, `opacity`, and `filter` explicit so no unrelated property interpolates.
2. Place the panel after the primary workspace in source order, anchor it inside a `relative` bounded container, and keep the persistent trigger outside the panel. If the surface must trap focus or block the page, select an overlay recipe instead.
3. In the closed style, disable pointer events, offset the panel, lower opacity, and apply the decorative blur. In the open style, restore pointer events and the final position. Preserve responsive insets so the panel does not escape its container.
4. Make `setOpen` synchronize `data-open`, `aria-hidden`, `inert`, `aria-expanded`, and the trigger label. Leave focus on the trigger when it opens; when the internal close button closes it, explicitly return focus to that persistent trigger.
5. Derive trigger reversals from the panel's current `data-open` value. Do not delay state changes for the transition: the browser can reverse translate, opacity, and filter from their rendered values.
6. Keep the reduced-motion utilities that remove interpolation and force the final translate position. This recipe schedules no JavaScript motion, so CSS handles a live preference change while JavaScript continues to own semantic visibility.
7. Mount after all three controls exist, retain the returned cleanup function, and call it before unmount or remount. The shared `AbortController` removes both listeners without forcing the panel open or closed.

## Complete recipe

```html
<section data-demo="panel-reveal" class="mx-auto w-full max-w-4xl bg-slate-100 p-4 text-slate-950 sm:p-8">
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-sm font-medium text-indigo-700">Release workspace</p>
      <h2 class="text-2xl font-semibold tracking-tight">Implementation checklist</h2>
    </div>
    <button data-panel-toggle type="button" aria-expanded="false" aria-controls="panel-reveal-details" class="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:scale-100">Show review panel</button>
  </div>
  <div class="relative min-h-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div class="max-w-xl p-6 sm:p-8">
      <h3 class="text-lg font-semibold">Ready for focused review</h3>
      <p class="mt-2 max-w-prose text-sm leading-6 text-slate-600">The primary workspace stays available while the review panel provides supporting decisions and ownership.</p>
      <ul class="mt-6 grid gap-3 text-sm text-slate-700">
        <li class="rounded-xl bg-slate-50 p-4">Keyboard path confirmed</li>
        <li class="rounded-xl bg-slate-50 p-4">Responsive layout confirmed</li>
        <li class="rounded-xl bg-slate-50 p-4">Motion preference pending</li>
      </ul>
    </div>
    <aside id="panel-reveal-details" data-panel data-open="false" role="region" aria-labelledby="panel-reveal-heading" aria-hidden="true" inert class="pointer-events-none absolute inset-x-3 bottom-3 translate-y-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 opacity-0 blur-sm shadow-xl transition-[translate,opacity,filter] duration-(--motion-duration-slow) ease-motion-enter data-[open=true]:pointer-events-auto data-[open=true]:translate-y-0 data-[open=true]:opacity-100 data-[open=true]:blur-none motion-reduce:translate-y-0 motion-reduce:transition-none sm:inset-x-auto sm:right-3 sm:w-80">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 id="panel-reveal-heading" class="font-semibold text-indigo-950">Review owner</h3>
          <p class="mt-1 text-sm leading-6 text-indigo-900">Morgan reviews keyboard behavior after the responsive pass.</p>
        </div>
        <button data-panel-close type="button" aria-label="Close review panel" class="grid size-11 shrink-0 place-items-center rounded-xl text-indigo-950 outline-none hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-600"><span aria-hidden="true">×</span></button>
      </div>
    </aside>
  </div>
</section>
```

```js
/**
 * mounts the bounded panel
 * @param {HTMLElement} root demo section
 * @returns {() => void} cleanup function
 */
function mount(root) {
  const panel = root.querySelector("[data-panel]");
  const toggleButton = root.querySelector("[data-panel-toggle]");
  const closeButton = root.querySelector("[data-panel-close]");

  if (!panel || !toggleButton || !closeButton) return () => {};

  const abortController = new AbortController();

  function setOpen(isOpen) {
    panel.setAttribute("data-open", String(isOpen));
    panel.setAttribute("aria-hidden", String(!isOpen));
    panel.toggleAttribute("inert", !isOpen);
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    toggleButton.textContent = isOpen ? "Hide review panel" : "Show review panel";
  }

  toggleButton.addEventListener(
    "click",
    () => setOpen(panel.getAttribute("data-open") !== "true"),
    { signal: abortController.signal },
  );
  closeButton.addEventListener("click", () => {
    setOpen(false);
    toggleButton.focus();
  }, { signal: abortController.signal });
  setOpen(false);

  return () => abortController.abort();
}
```

## Verify

| State | Acceptance check |
| --- | --- |
| Initial | The panel is visually absent, `inert`, `aria-hidden`, and pointer-inactive while the workspace remains usable. |
| Open and focus | The trigger reveals the panel, updates its label and semantics, and retains focus; every panel action is reachable by keyboard. |
| Internal close | The close button reverses the state and returns focus to the persistent trigger. |
| Rapid reversal | Repeated trigger activation follows the rendered transform and opacity without a cleanup timer or stale accessibility state. |
| Reduced motion | Switching the preference immediately shows or hides the panel at its final position with no opacity, filter, or translate interpolation. |
| Responsive containment | At narrow and wide widths, the panel stays inside the bounded workspace and does not cover required controls. |
| Cleanup | After cleanup, neither button changes state; the current visible state and focus remain usable. |
