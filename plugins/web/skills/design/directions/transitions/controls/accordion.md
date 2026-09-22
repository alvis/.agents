# Accordion

## Implement and adapt

1. Keep a native button inside the disclosure heading and give it `aria-controls` for the panel. Treat one open boolean as authoritative; mirror it to `aria-expanded`, `aria-hidden`, and `data-open`, and keep the panel `hidden` and `inert` whenever the closed state has finalized.
2. Preserve the two-layer motion. Animate the outer grid from `0fr` to `1fr` so unknown content height needs no measurement, keep the inner wrapper at `min-height: 0` with overflow clipped, and use opacity and filter only as subordinate feedback. Flip the decorative chevron from the same `data-open` state.
3. On open, cancel a pending close, remove `hidden` and `inert`, update ARIA, then set `data-open=true` in the next frame so the browser has a closed frame to interpolate from. On close, make the panel inert immediately, set the closed visual state, and hide it after the computed duration; parse both `ms` and `s` tokens and do not depend on `transitionend`.
4. Retain the native button's Enter and Space behavior and visible focus. Do not move focus when content opens. If focus can be inside the panel when the product closes it, move focus to the disclosure button before making the panel inert.
5. Before every reversal, clear the close timer and open frame so an older close cannot hide a reopened panel. The cleanup must abort listeners, cancel both handles, restore closed ARIA and data state, and leave the panel hidden and inert.
6. Keep the CSS reduced-motion branch and the live media-query listener. If reduced motion becomes active during close, finalize `hidden` immediately; opening still exposes the same content and accessible state.

## Verify

Open with pointer, Enter, and Space; follow the panel link; close and reopen before the close duration ends; and confirm only the final request wins. Change reduced motion during close, run cleanup during open and close, and inspect that no closed descendant remains focusable. Compile the literal classes and confirm the grid track, filter, scale, and focus styles render without console errors.

```html
<section data-demo="accordion" class="grid min-h-64 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <div data-accordion data-open="false" class="group w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <h3>
      <button type="button" aria-expanded="false" aria-controls="transition-accordion-panel" class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold outline-none ring-inset ring-sky-500 focus-visible:ring-2">
        What changes when motion is reduced?
        <svg aria-hidden="true" viewBox="0 0 16 16" class="size-5 shrink-0 transition-[scale] duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:-scale-y-100 motion-reduce:transition-none"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
      </button>
    </h3>
    <div id="transition-accordion-panel" data-panel role="region" aria-hidden="true" class="grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none" hidden inert>
      <div class="min-h-0 overflow-hidden opacity-0 blur-[2px] transition-[opacity,filter] duration-(--motion-duration-normal) ease-motion-enter group-data-[open=true]:opacity-100 group-data-[open=true]:blur-none motion-reduce:transition-none">
        <div class="border-t border-slate-200 px-5 py-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:text-slate-300">The disclosure still opens, closes, exposes its content, and updates its accessible state. Only interpolation is removed. <a href="#motion-preferences" class="font-medium text-sky-700 underline outline-none focus-visible:ring-2 dark:text-sky-300">Review motion preferences</a>.</div>
      </div>
    </div>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const accordion = root.querySelector("[data-accordion]");
  const button = accordion.querySelector("button");
  const panel = accordion.querySelector("[data-panel]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let closeTimerId = 0;
  let openFrameId = 0;

  function getDurationMs() {
    const value = getComputedStyle(root).getPropertyValue("--motion-duration-normal").trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return 250;
    if (value.endsWith("ms")) return amount;
    if (value.endsWith("s")) return amount * 1000;
    return 250;
  }

  function finishClosedState() {
    clearTimeout(closeTimerId);
    closeTimerId = 0;
    if (accordion.dataset.open === "false") panel.hidden = true;
  }

  function setOpen(isOpen) {
    clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    button.setAttribute("aria-expanded", String(isOpen));
    panel.setAttribute("aria-hidden", String(!isOpen));
    panel.inert = !isOpen;
    if (isOpen) {
      panel.hidden = false;
      openFrameId = requestAnimationFrame(() => accordion.dataset.open = "true");
    } else {
      accordion.dataset.open = "false";
      if (reducedMotion.matches) finishClosedState();
      else closeTimerId = setTimeout(finishClosedState, getDurationMs());
    }
  }

  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"), { signal: controller.signal });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches && accordion.dataset.open === "false") finishClosedState();
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    accordion.dataset.open = "false";
    button.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
    panel.inert = true;
    panel.hidden = true;
  };
}
```
