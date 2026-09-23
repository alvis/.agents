# Tabs sliding

## Implement and adapt

1. Keep the application's selected tab as authoritative. Mirror it to `aria-selected`, roving `tabindex`, and exactly one exposed `tabpanel`; preserve stable `id`, `aria-controls`, and `aria-labelledby` pairs instead of deriving selection from the pill position.
2. Place one `aria-hidden` pill inside the stationary tablist and keep the tablist inside a bounded horizontal scroller. Measure the selected tab's `offsetWidth` and `offsetLeft`, then write `--tab-pill-width` and `--tab-pill-x`; do not measure the moving pill or a transformed child, and keep pill coordinates local to the tablist rather than the scroll container.
3. Preserve the native tab pattern: click selects without programmatically moving focus; ArrowLeft and ArrowRight wrap and focus the selected tab; Home and End select and focus the boundary tab; Tab enters and leaves the roving set normally. Adapt directional keys for vertical or RTL tablists if the consumer changes orientation or reading direction.
4. The HTML below renders selected tab and panel semantics while keeping the unmeasured pill hidden. It requires the runtime behavior that follows for selection, keyboard behavior, and pill geometry.

## Runtime behavior

1. On initial layout, render `data-pill-measuring="true"`, measure the selected tab, write both pill custom properties, and render `data-pill-ready="true"`. On the next paint, render `data-pill-measuring="false"`; this reveals the initial pill without entrance motion.
2. On selection, update the authoritative state first, then render every tab's `aria-selected` and roving `tabindex`, set `hidden` on every unselected panel, remove it from the selected panel, update pill geometry with transitions enabled, and scroll the selected tab into the nearest visible inline position within the dedicated scroller. Do not shift the page's block position, and never derive semantic selection from pill position.
3. Bind native click and the documented keyboard keys to the same selection operation. Prevent default only for handled navigation keys; focusing caused by keyboard selection must occur after the selected tab becomes the roving `tabindex="0"` target.
4. Observe tablist and scroller size changes. For each remeasurement, invalidate a pending transition-restore callback, render `data-pill-measuring="true"`, update both custom properties, restore selected-tab visibility in the scroller, then clear measuring on the next paint. If labels, fonts, or localization can change without resizing either observed box, call the same measurement operation after those updates.
5. CSS handles live reduced-motion changes and snaps subsequent geometry while ARIA, focus, and panel visibility remain driven by selection. No runtime preference listener is required for the pill.
6. On teardown, remove owned event subscriptions, disconnect every size observation, invalidate the pending callback, remove the two pill custom properties, and restore `data-pill-ready="false"` and `data-pill-measuring="true"`. Preserve the application's current selection, panel state, and native scroll position.

## Verify

Select every tab by click, Arrow keys, Home, and End; confirm focus, pill position, and the sole visible panel agree. At 320px and wider viewports, move between the first and last tabs and confirm the tab row alone scrolls enough to keep selection visible while the pill stays aligned. Resize at every selection, change labels or fonts if the consumer permits it, reverse rapidly, switch reduced motion during travel, and tear down with a callback pending. Confirm the first render has no entrance motion, the pill never owns semantics, and no hidden panel enters focus order.

```html
<section class="grid min-h-56 place-items-center gap-6 rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <div class="grid w-full max-w-full gap-5">
    <div class="max-w-full overflow-x-auto overscroll-x-contain pb-1">
      <div role="tablist" aria-label="Workspace view" data-pill-ready="false" data-pill-measuring="true" class="group relative inline-flex min-w-full w-max gap-1 rounded-full bg-slate-200 p-1 dark:bg-slate-800">
        <span aria-hidden="true" class="pointer-events-none absolute left-0 top-1 h-11 w-(--tab-pill-width) rounded-full bg-white opacity-0 shadow-sm [transform:translateX(var(--tab-pill-x,0px))] transition-[transform,width] duration-(--motion-duration-normal) ease-motion-enter group-data-[pill-ready=true]:opacity-100 group-data-[pill-measuring=true]:transition-none motion-reduce:transition-none dark:bg-slate-700"></span>
        <button type="button" role="tab" id="tab-plan" aria-controls="panel-plan" aria-selected="true" tabindex="0" class="relative z-10 h-11 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Plan</button>
        <button type="button" role="tab" id="tab-debug" aria-controls="panel-debug" aria-selected="false" tabindex="-1" class="relative z-10 h-11 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Debug</button>
        <button type="button" role="tab" id="tab-ask" aria-controls="panel-ask" aria-selected="false" tabindex="-1" class="relative z-10 h-11 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Ask a question</button>
      </div>
    </div>
    <div id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" class="rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-slate-800">Outline the next milestone.</div>
    <div id="panel-debug" role="tabpanel" aria-labelledby="tab-debug" class="rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-slate-800" hidden>Inspect the failing behavior.</div>
    <div id="panel-ask" role="tabpanel" aria-labelledby="tab-ask" class="rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-slate-800" hidden>Collect the missing decision.</div>
  </div>
</section>
```
