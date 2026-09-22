# Card resize

## Implement and adapt

1. Import [motion.css](assets/transitions/motion.css) once after Tailwind CSS, or map its tokens to existing project motion tokens. Keep the `grid-template-rows` and chevron transitions explicit.
2. Keep the native toggle outside the collapsing track so it remains visible and focused. Associate it with the details region through `aria-controls`, and keep the region after the card header in reading order.
3. Wrap the details in a one-row grid whose closed state is `0fr` and open state is `1fr`; retain the inner `overflow-hidden` wrapper so unknown-height content interpolates without a measured pixel height.
4. Make `setOpen` the single state mutation. Synchronize the card and details `data-open` values, `aria-expanded`, `aria-hidden`, `inert`, and the visible button label in the same call.
5. Derive every toggle from the current `data-open` value. Do not add a timer or `transitionend` dependency: CSS can reverse from the rendered track size during rapid activation.
6. Keep `motion-reduce:transition-none` on both animated elements. This recipe schedules no JavaScript motion, so a live preference change settles through CSS while the same semantic open state remains authoritative.
7. Mount only after the card exists, retain the returned cleanup function, and call it before unmount or remount. The `AbortController` owns the click listener; cleanup must not change the last readable state.

## Complete recipe

```html
<section data-demo="card-resize" class="mx-auto grid min-h-72 w-full max-w-xl place-items-center bg-slate-100 p-4 text-slate-950 sm:p-8">
  <article data-card data-open="false" class="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div class="flex items-center gap-4 p-5 sm:p-6">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-indigo-700">Quarterly planning</p>
        <h2 id="card-resize-title" class="mt-1 text-xl font-semibold tracking-tight">Three decisions need review</h2>
      </div>
      <button data-card-toggle type="button" aria-expanded="false" aria-controls="card-resize-details" class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:scale-100">
        <span data-card-label>Show details</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4 transition-transform duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:rotate-180 motion-reduce:transition-none"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"/></svg>
      </button>
    </div>
    <div id="card-resize-details" data-card-details role="region" aria-labelledby="card-resize-title" aria-hidden="true" inert class="grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--motion-duration-normal) ease-motion-enter data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none">
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

```js
/**
 * mounts the card disclosure
 * @param {HTMLElement} root demo section
 * @returns {() => void} cleanup function
 */
function mount(root) {
  const card = root.querySelector("[data-card]");
  const toggleButton = root.querySelector("[data-card-toggle]");
  const details = root.querySelector("[data-card-details]");
  const label = root.querySelector("[data-card-label]");

  if (!card || !toggleButton || !details || !label) return () => {};

  const abortController = new AbortController();

  function setOpen(isOpen) {
    card.setAttribute("data-open", String(isOpen));
    details.setAttribute("data-open", String(isOpen));
    details.setAttribute("aria-hidden", String(!isOpen));
    details.toggleAttribute("inert", !isOpen);
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    label.textContent = isOpen ? "Hide details" : "Show details";
  }

  toggleButton.addEventListener(
    "click",
    () => setOpen(card.getAttribute("data-open") !== "true"),
    { signal: abortController.signal },
  );
  setOpen(false);

  return () => abortController.abort();
}
```

## Verify

| State | Acceptance check |
| --- | --- |
| Initial | Details occupy no visible track space, are `inert` and `aria-hidden`, and the button says “Show details.” |
| Open and focus | Activation expands to the content's natural height, updates every semantic state, and leaves focus on the toggle. |
| Reverse and replay | Repeated activation reverses from the rendered size without a timeout, clipped content, or stale label. |
| Reduced motion | Switching the preference in either state removes both transitions immediately while preserving the selected open or closed state. |
| Responsive layout | Long details and labels fit without horizontal overflow; following content moves only as the disclosed card grows. |
| Cleanup | After calling cleanup, activation no longer changes state and the final visible state remains readable. |
