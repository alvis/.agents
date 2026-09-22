# Page side-by-side

## Implement and adapt

1. Import [motion.css](assets/transitions/motion.css) once after Tailwind CSS, or map its tokens to project motion tokens. Keep the track transition limited to `transform`.
2. Keep both peer panels in a two-column grid that is twice the viewport width. Move the track between `0%` and `-50%`; each half then fills the same clipped viewport without removing either view from the DOM.
3. Preserve the tab contract: a labeled `tablist`, one `role="tab"` per view, matching `aria-controls` and `aria-labelledby` pairs, and one active tab in the roving `tabindex` order.
4. Make `activatePage` the only selection mutation. Update the track shift, `aria-selected`, roving `tabindex`, `aria-hidden`, and `inert` together so only the chosen panel participates in focus and accessibility navigation.
5. Keep click selection from moving focus. For Left or Home select the first view; for Right or End select the second, prevent the default scroll behavior, and focus the selected tab.
6. Do not add timers or wait for `transitionend`; changing the custom property lets rapid selection reverse from the rendered transform. Keep `motion-reduce:transition-none` so a live preference change immediately displays the chosen panel with the same semantic state.
7. Mount after the track, two tabs, and two panels exist. Retain cleanup and call it before unmount or remount; aborting the shared controller removes every click and key listener while leaving the selected panel readable.

## Complete recipe

```html
<section data-demo="page-side-by-side" class="mx-auto w-full max-w-4xl bg-slate-100 p-4 text-slate-950 sm:p-8">
  <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-indigo-700">Project handoff</p>
      <h2 class="text-2xl font-semibold tracking-tight">Move between peer views</h2>
    </div>
    <div role="tablist" aria-label="Project handoff views" class="inline-flex rounded-xl bg-slate-200 p-1">
      <button id="page-tab-overview" data-page-tab="0" type="button" role="tab" aria-selected="true" aria-controls="page-panel-overview" tabindex="0" class="min-h-11 rounded-lg px-4 text-sm font-semibold outline-none aria-selected:bg-white aria-selected:shadow-sm hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-600">Overview</button>
      <button id="page-tab-details" data-page-tab="1" type="button" role="tab" aria-selected="false" aria-controls="page-panel-details" tabindex="-1" class="min-h-11 rounded-lg px-4 text-sm font-semibold outline-none aria-selected:bg-white aria-selected:shadow-sm hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-600">Details</button>
    </div>
  </div>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div data-page-track class="grid w-[200%] grid-cols-2 [transform:translateX(var(--page-shift,0%))] transition-transform duration-(--motion-duration-normal) ease-motion-enter motion-reduce:transition-none">
      <div id="page-panel-overview" data-page-panel="0" role="tabpanel" aria-labelledby="page-tab-overview" class="min-w-0 p-6 sm:p-8">
        <h3 class="text-xl font-semibold">Overview</h3>
        <p class="mt-2 max-w-prose text-sm leading-6 text-slate-600">The delivery has four implementation slices and one integrated review.</p>
        <dl class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Slices</dt><dd class="mt-1 text-2xl font-semibold">4</dd></div>
          <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Open risks</dt><dd class="mt-1 text-2xl font-semibold">1</dd></div>
          <div class="col-span-2 rounded-xl bg-slate-50 p-4 sm:col-span-1"><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Review</dt><dd class="mt-1 text-sm font-semibold">Friday</dd></div>
        </dl>
      </div>
      <div id="page-panel-details" data-page-panel="1" role="tabpanel" aria-labelledby="page-tab-details" aria-hidden="true" inert class="min-w-0 p-6 sm:p-8">
        <h3 class="text-xl font-semibold">Delivery details</h3>
        <ol class="mt-4 grid gap-3 text-sm text-slate-700">
          <li class="rounded-xl border border-slate-200 p-4"><strong class="block text-slate-950">1. Build</strong>Complete the four owned interaction recipes.</li>
          <li class="rounded-xl border border-slate-200 p-4"><strong class="block text-slate-950">2. Verify</strong>Exercise keyboard, resize, replay, and reduced motion.</li>
          <li class="rounded-xl border border-slate-200 p-4"><strong class="block text-slate-950">3. Review</strong>Bind the integrated verdict to the delivered files.</li>
        </ol>
      </div>
    </div>
  </div>
</section>
```

```js
/**
 * mounts the peer-page navigator
 * @param {HTMLElement} root demo section
 * @returns {() => void} cleanup function
 */
function mount(root) {
  const track = root.querySelector("[data-page-track]");
  const tabs = [...root.querySelectorAll("[data-page-tab]")];
  const panels = [...root.querySelectorAll("[data-page-panel]")];

  if (!track || tabs.length !== 2 || panels.length !== 2) return () => {};

  const abortController = new AbortController();

  function activatePage(pageIndex, shouldFocus) {
    track.style.setProperty("--page-shift", pageIndex === 0 ? "0%" : "-50%");
    tabs.forEach((tab, index) => {
      const isActive = index === pageIndex;
      tab.setAttribute("aria-selected", String(isActive));
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
      if (isActive && shouldFocus) tab.focus();
    });
    panels.forEach((panel, index) => {
      const isActive = index === pageIndex;
      panel.setAttribute("aria-hidden", String(!isActive));
      panel.toggleAttribute("inert", !isActive);
    });
  }

  tabs.forEach((tab, tabIndex) => {
    tab.addEventListener("click", () => activatePage(tabIndex, false), { signal: abortController.signal });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home" || event.key === "ArrowLeft" ? 0 : 1;
      activatePage(nextIndex, true);
    }, { signal: abortController.signal });
  });
  activatePage(0, false);

  return () => abortController.abort();
}
```

## Verify

| State | Acceptance check |
| --- | --- |
| Initial | Overview is selected, Details is `inert` and `aria-hidden`, one tab is tabbable, and the track starts at zero. |
| Pointer selection | Either tab displays its panel, updates the tab and panel semantics together, and does not move focus unexpectedly. |
| Keyboard selection | Left and Home select Overview; Right and End select Details; the selected tab receives focus and the page does not scroll. |
| Rapid reversal | Repeated selection reverses from the current transform without stale timers, a blank viewport, or two accessible panels. |
| Reduced motion | Switching the preference replaces the peer immediately while retaining the same selected tab and focus model. |
| Responsive layout | Both peers fit the clipped viewport at narrow and wide widths without horizontal page overflow. |
| Cleanup | After cleanup, click and key input no longer change selection; the last selected panel remains readable and accessible. |
