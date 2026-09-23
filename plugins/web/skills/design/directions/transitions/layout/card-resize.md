# Card resize

## Implement and adapt

1. Complete [Transition design](directions/transition.md), then import [motion.css](assets/transitions/motion.css) once after Tailwind CSS 4.3 or newer, or map its tokens to existing project motion tokens. Keep the `grid-template-rows` and chevron transitions explicit.
2. Keep the native toggle outside the collapsing track so it remains visible and focused. Associate it with the details region through `aria-controls`, and keep the region after the card header in reading order.
3. Wrap the details in a one-row grid whose closed state is `0fr` and open state is `1fr`; retain the inner `overflow-hidden` wrapper so unknown-height content interpolates without a measured pixel height.
4. Treat one boolean open value as authoritative. Reflect it through the card and details `data-open` values, `aria-expanded`, `aria-hidden`, `inert`, and the visible button label in one state update.
5. Derive every activation from the current authoritative value. Do not add a timer or `transitionend` dependency: CSS reverses from the rendered track size during rapid activation.
6. Keep `motion-reduce:transition-none` on both animated elements. This interaction schedules no runtime motion, so a live preference change settles through CSS while the semantic open value stays unchanged.

## Markup and state styling

The markup below is the closed initial state. Static HTML does not toggle the disclosure; implement the runtime requirements that follow.

```html
<section class="mx-auto grid min-h-72 w-full max-w-xl place-items-center bg-slate-100 p-4 text-slate-950 sm:p-8">
  <article data-open="false" class="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div class="flex items-center gap-4 p-5 sm:p-6">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-indigo-700">Quarterly planning</p>
        <h2 id="card-resize-title" class="mt-1 text-xl font-semibold tracking-tight">Three decisions need review</h2>
      </div>
      <button type="button" aria-expanded="false" aria-controls="card-resize-details" class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:active:scale-100">
        <span>Show details</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4 transition-transform duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:rotate-180 motion-reduce:transition-none"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"/></svg>
      </button>
    </div>
    <div id="card-resize-details" data-open="false" role="region" aria-labelledby="card-resize-title" aria-hidden="true" inert class="grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--motion-duration-normal) ease-motion-enter data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none">
      <div class="overflow-hidden">
        <div class="border-t border-slate-200 px-5 py-5 text-sm leading-6 text-slate-600 sm:px-6">
          <p>Confirm the launch audience, choose the reporting cadence, and assign the final accessibility review.</p>
          <p class="mt-3 font-medium text-slate-900">Review closes Friday at 16:00.</p>
        </div>
      </div>
    </div>
  </article>
</section>
```

## Runtime requirements

1. On activation, invert the authoritative open value and update both `data-open` attributes, the button's `aria-expanded`, the region's `aria-hidden` and `inert`, and the visible “Show details” or “Hide details” label within the same render or commit.
2. Leave focus on the toggle for opening, closing, reversal, and reduced-motion changes. Do not move focus into the region automatically.
3. Bind only the native button activation while the component is active. On teardown, remove that binding or dispose the framework effect; do not rewrite the last coherent visible or semantic state.
4. Do not schedule animation frames, timeouts, observers, or a reduced-motion listener for this recipe. The CSS media variant and authoritative state already cover interruption and live preference changes.

## Verify

| State | Acceptance check |
| --- | --- |
| Initial | Details occupy no visible track space, are `inert` and `aria-hidden`, and the button says “Show details.” |
| Open and focus | Activation expands to the content's natural height, updates every semantic state, and leaves focus on the toggle. |
| Reverse and replay | Repeated activation reverses from the rendered size without a timeout, clipped content, or stale label. |
| Reduced motion | Switching the preference in either state removes both transitions immediately while preserving the selected open or closed state. |
| Responsive layout | Long details and labels fit without horizontal overflow; following content moves only as the disclosed card grows. |
| Teardown | After teardown, stale handlers cannot change state and the final visible state remains readable. |
