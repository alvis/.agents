# Page side-by-side

Use this pattern for two peer views that benefit from directional continuity. Both views remain mounted, while only the selected view participates in focus and accessibility navigation.

Import [`motion.css`](assets/transitions/motion.css) after Tailwind CSS 4.3+.

## HTML

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

## JavaScript

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

## Check

| Stage | Expected result |
| --- | --- |
| Initial | Overview is selected, Details is inert and `aria-hidden`, and the track starts at zero. |
| Action | Clicking either tab slides the matching page into place and updates tab and panel semantics. |
| Keyboard | Left/Home select Overview; Right/End select Details and move focus to the selected tab. |
| Rapid reversal | Repeated selection reverses the transform from its rendered position with no stale timer. |
| Reduced motion | The chosen page replaces its peer immediately while the same semantic state updates. |
| Cleanup | Calling the returned function removes click and key listeners; the selected page remains readable. |
