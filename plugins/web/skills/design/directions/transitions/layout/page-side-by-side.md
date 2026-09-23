# Page side-by-side

## Implement and adapt

1. Complete [Transition design](directions/transition.md), then import [motion.css](assets/transitions/motion.css) once after Tailwind CSS 4.3 or newer, or map its tokens to project motion tokens. Keep the track transition limited to `transform`.
2. Keep both peer panels in a two-column grid that is twice the clipped viewport width. Move the track between `translateX(0)` and `translateX(-50%)`; each half then fills the viewport without removing either view from the DOM.
3. Preserve the tab contract: a labeled `tablist`, one `role="tab"` per view, matching `aria-controls` and `aria-labelledby` pairs, and one active tab in the roving `tabindex` order.
4. Treat one selected view identifier as authoritative. Reflect it through the track's `data-view`, each tab's `aria-selected` and `tabindex`, and each panel's `aria-hidden` and `inert` in one state update so only the chosen panel participates in focus and accessibility navigation.
5. Pointer activation selects its view without programmatically moving focus. Left or Home selects the first view; Right or End selects the second, prevents page scrolling for the handled key, and focuses the selected tab.
6. Do not add timers or wait for `transitionend`; changing `data-view` lets rapid selection reverse from the rendered transform. Keep `motion-reduce:transition-none` so a live preference change immediately displays the chosen panel with the same semantic state.

## Markup and state styling

The markup below selects Overview initially. Static HTML does not implement tab activation or roving focus; implement the runtime requirements that follow.

```html
<section class="mx-auto w-full max-w-4xl bg-slate-100 p-4 text-slate-950 sm:p-8">
  <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-indigo-700">Project handoff</p>
      <h2 class="text-2xl font-semibold tracking-tight">Move between peer views</h2>
    </div>
    <div role="tablist" aria-label="Project handoff views" class="inline-flex rounded-xl bg-slate-200 p-1">
      <button id="page-tab-overview" type="button" role="tab" aria-selected="true" aria-controls="page-panel-overview" tabindex="0" class="min-h-11 rounded-lg px-4 text-sm font-semibold outline-none aria-selected:bg-white aria-selected:shadow-sm hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-600 active:bg-slate-100">Overview</button>
      <button id="page-tab-details" type="button" role="tab" aria-selected="false" aria-controls="page-panel-details" tabindex="-1" class="min-h-11 rounded-lg px-4 text-sm font-semibold outline-none aria-selected:bg-white aria-selected:shadow-sm hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-600 active:bg-slate-100">Details</button>
    </div>
  </div>
  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div data-view="overview" class="grid w-[200%] grid-cols-2 [transform:translateX(0)] transition-transform duration-(--motion-duration-normal) ease-motion-enter data-[view=details]:[transform:translateX(-50%)] motion-reduce:transition-none">
      <div id="page-panel-overview" role="tabpanel" aria-labelledby="page-tab-overview" class="min-w-0 p-6 sm:p-8">
        <h3 class="text-xl font-semibold">Overview</h3>
        <p class="mt-2 max-w-prose text-sm leading-6 text-slate-600">The delivery has four implementation slices and one integrated review.</p>
        <dl class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Slices</dt><dd class="mt-1 text-2xl font-semibold">4</dd></div>
          <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Open risks</dt><dd class="mt-1 text-2xl font-semibold">1</dd></div>
          <div class="col-span-2 rounded-xl bg-slate-50 p-4 sm:col-span-1"><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Review</dt><dd class="mt-1 text-sm font-semibold">Friday</dd></div>
        </dl>
      </div>
      <div id="page-panel-details" role="tabpanel" aria-labelledby="page-tab-details" aria-hidden="true" inert class="min-w-0 p-6 sm:p-8">
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

## Runtime requirements

1. Initialize the authoritative selection from application state or the Overview default. On any accepted selection, update the track's `data-view`, both tabs' `aria-selected` and `tabindex`, and both panels' `aria-hidden` and `inert` within one render or commit.
2. Button activation selects the associated view and does not call focus. Browser-native pointer focus behavior may still occur.
3. While focus is in the tablist, Left or Home selects Overview and Right or End selects Details. Prevent the handled key's default scrolling, apply the semantic state update, then focus the selected tab.
4. The newest selection wins immediately during rapid pointer or keyboard input. Do not queue transitions, schedule a completion timer, or gate selection on `transitionend`.
5. Bind tab activation and key handling only while the tab component is active. On teardown, remove the bindings or dispose the framework effect and preserve the last coherent selection; this recipe needs no observer, animation frame, timeout, or reduced-motion subscription.

## Verify

| State | Acceptance check |
| --- | --- |
| Initial | Overview is selected, Details is `inert` and `aria-hidden`, one tab is tabbable, and the track starts at zero. |
| Pointer selection | Either tab displays its panel, updates the tab and panel semantics together, and does not move focus programmatically. |
| Keyboard selection | Left and Home select Overview; Right and End select Details; the selected tab receives focus and the page does not scroll. |
| Rapid reversal | Repeated selection reverses from the current transform without stale timers, a blank viewport, or two accessible panels. |
| Reduced motion | Switching the preference replaces the peer immediately while retaining the same selected tab and focus model. |
| Responsive layout | Both peers fit the clipped viewport at narrow and wide widths without horizontal page overflow. |
| Teardown | After teardown, stale click and key handlers cannot change selection; the last selected panel remains readable and accessible. |
