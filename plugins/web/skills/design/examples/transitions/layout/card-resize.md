# Card resize

Use this pattern when one card reveals its own secondary content. The grid track supports unknown content height while the native button keeps state and focus stable.

Import [`motion.css`](assets/transitions/motion.css) after Tailwind CSS 4.3+.

## HTML

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

## JavaScript

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

## Check

| Stage | Expected result |
| --- | --- |
| Initial | Details are collapsed, inert, and hidden from the accessibility tree; the button says “Show details.” |
| Action | Activating the button expands the grid track and updates the label and `aria-expanded` without moving focus. |
| Reverse and replay | Repeated activation reverses cleanly from the current size with no timeout or stale state. |
| Reduced motion | The same open or closed state appears immediately with no track or chevron transition. |
| Cleanup | Calling the returned function removes the click listener; later activation no longer changes state. |
