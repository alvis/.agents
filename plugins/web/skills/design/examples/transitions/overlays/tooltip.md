# Tooltip

Use this recipe when several compact controls share one non-interactive hint bubble. The bubble waits 80ms before appearing to ignore brief pointer fly-bys, then moves and resizes between neighboring triggers without replacing the accessible names already on those controls. Import `assets/transitions/motion.css` after Tailwind, then pass the rendered section to `mount(root)`.

```html
<section data-demo="tooltip" class="grid min-h-72 place-items-center rounded-3xl bg-slate-950 p-8 text-white">
  <div data-tooltip-group data-state="closed" class="group/tooltip relative inline-flex gap-1 rounded-2xl border border-white/10 bg-white/10 p-1.5 shadow-xl">
    <button type="button" aria-label="Copy link" aria-describedby="toolbar-tooltip" data-tooltip="Copy link" class="grid size-11 place-items-center rounded-xl text-slate-300 outline-2 outline-offset-2 outline-transparent hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-blue-400 active:scale-[0.96] motion-reduce:active:scale-100">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2"><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.14-1.14" /></svg>
    </button>
    <button type="button" aria-label="Share project" aria-describedby="toolbar-tooltip" data-tooltip="Share project" class="grid size-11 place-items-center rounded-xl text-slate-300 outline-2 outline-offset-2 outline-transparent hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-blue-400 active:scale-[0.96] motion-reduce:active:scale-100">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
    </button>
    <button type="button" aria-label="Open settings" aria-describedby="toolbar-tooltip" data-tooltip="Open settings" class="grid size-11 place-items-center rounded-xl text-slate-300 outline-2 outline-offset-2 outline-transparent hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-blue-400 active:scale-[0.96] motion-reduce:active:scale-100">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.08A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.08A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.08A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.18.37.47.7.83.93.34.22.74.34 1.15.35H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg>
    </button>
    <span id="toolbar-tooltip" role="tooltip" aria-hidden="true" data-state="closed" class="absolute bottom-[calc(100%+0.75rem)] left-0 box-border overflow-hidden [translate:var(--tooltip-x)_0] [width:var(--tooltip-width)] transition-[translate,width] duration-(--motion-duration-fast) ease-motion-enter motion-reduce:transition-none">
      <span data-tooltip-text class="block origin-bottom scale-[0.98] whitespace-nowrap rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 opacity-0 shadow-xl transition-[opacity,scale] delay-0 duration-(--motion-duration-fast) ease-motion-enter group-data-[state=open]/tooltip:scale-100 group-data-[state=open]/tooltip:opacity-100 group-data-[state=open]/tooltip:delay-(--motion-delay-tooltip) motion-reduce:scale-100 motion-reduce:group-data-[state=closed]/tooltip:scale-100 motion-reduce:delay-0 motion-reduce:transition-none"></span>
    </span>
  </div>
</section>
```

```css
@theme static {
  --motion-delay-tooltip: 80ms;
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const group = root.querySelector("[data-tooltip-group]");
  const tooltip = root.querySelector("#toolbar-tooltip");
  const tooltipText = root.querySelector("[data-tooltip-text]");
  const triggers = [...root.querySelectorAll("[data-tooltip]")];
  let activeTrigger;

  function hideTooltip() {
    activeTrigger = undefined;
    group.dataset.state = "closed";
    tooltip.dataset.state = "closed";
    tooltip.setAttribute("aria-hidden", "true");
  }

  function placeTooltip(trigger) {
    activeTrigger = trigger;
    tooltipText.textContent = trigger.dataset.tooltip ?? "";
    const groupBox = group.getBoundingClientRect();
    const triggerBox = trigger.getBoundingClientRect();
    const tooltipWidth = Math.ceil(tooltipText.scrollWidth);
    const centeredOffset = triggerBox.left - groupBox.left + (triggerBox.width - tooltipWidth) / 2;
    const tooltipOffset = Math.max(0, Math.min(centeredOffset, groupBox.width - tooltipWidth));
    tooltip.style.setProperty("--tooltip-width", `${tooltipWidth}px`);
    tooltip.style.setProperty("--tooltip-x", `${tooltipOffset}px`);
    group.dataset.state = "open";
    tooltip.dataset.state = "open";
    tooltip.setAttribute("aria-hidden", "false");
  }

  const resizeObserver = new ResizeObserver(() => {
    if (activeTrigger) placeTooltip(activeTrigger);
  });
  resizeObserver.observe(group);

  for (const trigger of triggers) {
    trigger.addEventListener("pointerenter", () => placeTooltip(trigger), { signal: controller.signal });
    trigger.addEventListener("focus", () => placeTooltip(trigger), { signal: controller.signal });
  }
  group.addEventListener("pointerleave", () => {
    if (!group.contains(document.activeElement)) hideTooltip();
  }, { signal: controller.signal });
  group.addEventListener("focusout", (event) => {
    if (!group.contains(event.relatedTarget)) hideTooltip();
  }, { signal: controller.signal });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTooltip();
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    resizeObserver.disconnect();
    hideTooltip();
    tooltip.style.removeProperty("--tooltip-width");
    tooltip.style.removeProperty("--tooltip-x");
  };
}
```

## Focused check

The initial state keeps the shared tooltip visually and semantically hidden while every icon button retains its own accessible name. Hover or focus a trigger and confirm the bubble appears above it after the brief intent delay. Move directly across the row and confirm one bubble travels and resizes to the new label. Leave the toolbar with the pointer, move keyboard focus away, or press Escape and confirm the final state hides the tooltip immediately. Toggle reduced motion while the bubble is moving and confirm the CSS media query removes the active transition. Resize the toolbar, replay hover and focus visits, then call the cleanup function and confirm the observer and listeners no longer update the bubble.
