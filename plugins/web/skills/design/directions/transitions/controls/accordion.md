# Accordion

## Implement and adapt

1. Keep a native button inside the disclosure heading and give it `aria-controls` for the panel. Treat one open boolean as authoritative; mirror it to `aria-expanded`, `aria-hidden`, and `data-open`, and keep the panel `hidden` and `inert` whenever the closed state has finalized.
2. Preserve the two-layer motion. Animate the outer grid from `0fr` to `1fr` so unknown content height needs no measurement, keep the inner wrapper at `min-height: 0` with overflow clipped, and use opacity and filter only as subordinate feedback. Flip the decorative chevron from the same `data-open` state.
3. Retain the native button's Enter and Space behavior and visible focus. Do not move focus when content opens. If focus is inside the panel when the product closes it, move focus to the disclosure button before making the panel inert.
4. The HTML below renders the finalized closed state. It requires the runtime behavior that follows; static attribute changes alone do not provide interruption-safe hiding or teardown.

## Runtime behavior

1. Render every durable open-state change from the application's single boolean. Opening must invalidate any pending close deadline and opening frame, remove `hidden` and `inert`, set `aria-hidden="false"`, then set `data-open="true"` on the next paint so a closed frame exists to interpolate from.
2. Closing must invalidate the opening frame and older close deadline, move focus when required, set `inert`, `aria-hidden="true"`, and `data-open="false"` immediately, then set `hidden` after the computed grid transition duration and delay. Parse comma-separated computed time values in either `ms` or `s`; use the longest paired duration-plus-delay and a generation token rather than depending on `transitionend`.
3. Reopening before the deadline must invalidate the older generation before exposing the panel, so the stale close cannot hide current content. Repeated requests for the current state do nothing.
4. When reduced motion is already active, open or finalize closed in the same update without scheduling a motion frame or deadline. Subscribe to preference changes; if reduction becomes active while closing, invalidate the deadline and hide immediately, and if it becomes active while opening, expose the open final state immediately.
5. On teardown, remove owned subscriptions, invalidate the frame and deadline, and render `hidden`, `inert`, ARIA, and `data-open` from the latest durable boolean. No scheduled callback may survive teardown.

## Verify

Open with pointer, Enter, and Space; follow the panel link; close and reopen before the close duration ends; and confirm only the final request wins. Change reduced motion during open and close, tear down during either direction, and inspect that no closed descendant remains focusable. Compile the literal classes under Tailwind CSS 4.3+ and confirm the grid track, filter, scale, and focus styles render without console errors.

```html
<section class="grid min-h-64 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <div data-open="false" class="group w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <h3>
      <button id="transition-accordion-trigger" type="button" aria-expanded="false" aria-controls="transition-accordion-panel" class="flex min-h-11 w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold outline-none ring-inset ring-sky-500 focus-visible:ring-2">
        What changes when motion is reduced?
        <svg aria-hidden="true" viewBox="0 0 16 16" class="size-5 shrink-0 transition-[scale] duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:-scale-y-100 motion-reduce:transition-none"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
      </button>
    </h3>
    <div id="transition-accordion-panel" role="region" aria-labelledby="transition-accordion-trigger" aria-hidden="true" class="grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none" hidden inert>
      <div class="min-h-0 overflow-hidden opacity-0 blur-[2px] transition-[opacity,filter] duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:opacity-100 group-data-[open=true]:blur-none motion-reduce:transition-none">
        <div class="border-t border-slate-200 px-5 py-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:text-slate-300">The disclosure still opens, closes, exposes its content, and updates its accessible state. Only interpolation is removed. <a href="#motion-preferences" class="font-medium text-sky-700 underline outline-none focus-visible:ring-2 dark:text-sky-300">Review motion preferences</a>.</div>
      </div>
    </div>
  </div>
</section>
```
