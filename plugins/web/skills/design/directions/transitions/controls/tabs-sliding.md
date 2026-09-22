# Tabs sliding

## Implement and adapt

1. Keep the application's selected tab as authoritative. Mirror it to `aria-selected`, roving `tabIndex`, and exactly one exposed `tabpanel`; preserve stable `id`, `aria-controls`, and `aria-labelledby` pairs instead of deriving selection from the pill position.
2. Place one `aria-hidden` pill inside the stationary tablist. Measure the selected tab's `offsetWidth` and `offsetLeft`, then write pill width and `translateX`; do not measure the moving pill or a transformed child.
3. Position the initial pill with transitions temporarily disabled, restore its transition on the next animation frame, and use a `ResizeObserver` on the tablist to repeat the non-animated measurement when its size changes. If the consumer changes labels or fonts without resizing the tablist, explicitly call the same measurement after those updates; observing only the tablist cannot detect every tab geometry change. Normal selection changes animate from the browser's current width and transform.
4. Preserve the native tab pattern: click selects without forcing focus; ArrowLeft and ArrowRight wrap and focus the new tab; Home and End select the boundary tab; Tab enters and leaves the roving set normally. Adapt directional keys for vertical or RTL tablists if the consumer changes orientation or reading direction.
5. Cancel the pending transition-restore frame before replacing it. Cleanup must abort handlers, disconnect the observer, and cancel that frame; the owning application retains selection and panel state.
6. Keep the pill's reduced-motion transition branch. A live preference change snaps subsequent computed geometry while ARIA, focus, and panel visibility remain driven by selection.

## Verify

Select every tab by click, Arrow keys, Home, and End; confirm focus, pill position, and the sole visible panel agree. Resize at every selection, change labels or fonts if the consumer permits it, reverse rapidly, switch reduced motion during travel, and clean up with a frame pending. Confirm the first render has no entrance motion, the pill never owns semantics, and no hidden panel enters focus order.

```html
<section data-demo="tabs-sliding" class="grid min-h-56 place-items-center gap-6 rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <div class="grid gap-5">
    <div role="tablist" aria-label="Workspace view" class="relative inline-flex gap-1 rounded-full bg-slate-200 p-1 dark:bg-slate-800" data-tablist>
      <span aria-hidden="true" data-tab-pill class="pointer-events-none absolute left-0 top-1 h-9 w-0 rounded-full bg-white shadow-sm transition-[transform,width] duration-(--motion-duration-normal) ease-motion-enter motion-reduce:transition-none dark:bg-slate-700"></span>
      <button type="button" role="tab" id="tab-plan" aria-controls="panel-plan" aria-selected="true" tabindex="0" class="relative z-10 h-9 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Plan</button>
      <button type="button" role="tab" id="tab-debug" aria-controls="panel-debug" aria-selected="false" tabindex="-1" class="relative z-10 h-9 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Debug</button>
      <button type="button" role="tab" id="tab-ask" aria-controls="panel-ask" aria-selected="false" tabindex="-1" class="relative z-10 h-9 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Ask a question</button>
    </div>
    <div id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" class="rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-slate-800">Outline the next milestone.</div>
    <div id="panel-debug" role="tabpanel" aria-labelledby="tab-debug" class="rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-slate-800" hidden>Inspect the failing behavior.</div>
    <div id="panel-ask" role="tabpanel" aria-labelledby="tab-ask" class="rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-slate-800" hidden>Collect the missing decision.</div>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const tablist = root.querySelector("[data-tablist]");
  const pill = root.querySelector("[data-tab-pill]");
  const tabs = [...tablist.querySelectorAll("[role=tab]")];
  const observer = new ResizeObserver(() => positionPill(getSelectedTab(), false));
  let frameId = 0;

  function getSelectedTab() {
    return tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];
  }

  function positionPill(tab, shouldAnimate) {
    if (!shouldAnimate) pill.style.transition = "none";
    pill.style.width = `${tab.offsetWidth}px`;
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    if (!shouldAnimate) {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => pill.style.removeProperty("transition"));
    }
  }

  function selectTab(tab, shouldFocus) {
    tabs.forEach((candidate) => {
      const isSelected = candidate === tab;
      candidate.setAttribute("aria-selected", String(isSelected));
      candidate.tabIndex = isSelected ? 0 : -1;
      root.querySelector(`#${candidate.getAttribute("aria-controls")}`).hidden = !isSelected;
    });
    positionPill(tab, true);
    if (shouldFocus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab, false), { signal: controller.signal });
    tab.addEventListener("keydown", (event) => {
      const keyOffsets = { ArrowLeft: -1, ArrowRight: 1 };
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        selectTab(tabs[event.key === "Home" ? 0 : tabs.length - 1], true);
      } else if (event.key in keyOffsets) {
        event.preventDefault();
        const nextIndex = (index + keyOffsets[event.key] + tabs.length) % tabs.length;
        selectTab(tabs[nextIndex], true);
      }
    }, { signal: controller.signal });
  });
  observer.observe(tablist);
  positionPill(getSelectedTab(), false);

  return () => {
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frameId);
  };
}
```
