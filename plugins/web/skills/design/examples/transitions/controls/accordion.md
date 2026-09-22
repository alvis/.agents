# Accordion

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
