# Plus-menu morph

1. Complete [Transition design](directions/transition.md), then merge [motion.css](assets/transitions/motion.css) after Tailwind CSS or map its tokens to equivalent project-owned tokens.
2. Reserve the expanded footprint in the surrounding layout, pin the morph and trigger to the bottom-right growth corner, and retain `contain: layout paint` so width and height animation does not reflow nearby content.
3. Preserve the existing accessible menu primitive: a trigger with `aria-haspopup="menu"`, `aria-controls`, `aria-expanded`, and a state-dependent accessible label; a named `role="menu"`; and roving `menuitem` tabindex values.
4. Keep requested interaction state separate from visual phase. `aria-expanded` records the requested state, `hidden` plus `inert` plus `aria-hidden` controls menu exposure, and the morph container's `data-state` records `closed`, `open`, or `closing` for Tailwind variants.
5. Grow width, height, and border radius from the fixed corner while content reveals through `opacity`, `translate`, and `scale` and the plus rotates. Keep each property list explicit, use shared tokens, and retain the non-animated reduced-motion end states.
6. Preserve menu keyboard and dismissal behavior: trigger Arrow keys open to an endpoint; menu Arrow keys wrap; Home and End jump; Escape and item activation close and restore focus; Tab and outside pointer dismissal close without trapping focus.
7. Use the runtime contract below for state ordering, interrupted exits, live reduced motion, and teardown. The static markup supplies the initial compact state and its styles; it does not open, dismiss, move focus, change the trigger label, or clean itself up.

## Markup and state styling

```html
<section class="grid min-h-96 place-items-center rounded-3xl bg-gradient-to-br from-blue-50 to-violet-100 p-6 text-slate-950">
  <div class="relative h-64 w-full max-w-xs">
    <div id="create-menu-morph" data-state="closed" class="group/morph absolute bottom-0 right-0 h-12 w-12 overflow-hidden rounded-full border border-white/70 bg-white shadow-xl shadow-blue-950/15 [contain:layout_paint] transition-[width,height,border-radius] duration-(--motion-duration-normal) ease-motion-exit data-[state=open]:h-56 data-[state=open]:w-64 data-[state=open]:rounded-3xl data-[state=open]:duration-(--motion-duration-slow) data-[state=open]:ease-motion-spring motion-reduce:transition-none">
      <div id="create-menu" role="menu" aria-label="Create" aria-hidden="true" hidden inert class="absolute inset-0 flex translate-x-8 scale-[0.97] flex-col p-4 pb-16 opacity-0 transition-[opacity,translate,scale] duration-(--motion-duration-normal) ease-motion-exit group-data-[state=open]/morph:translate-x-0 group-data-[state=open]/morph:scale-100 group-data-[state=open]/morph:opacity-100 group-data-[state=open]/morph:duration-(--motion-duration-slow) group-data-[state=open]/morph:ease-motion-enter motion-reduce:translate-x-0 motion-reduce:scale-100 motion-reduce:group-data-[state=closed]/morph:translate-x-0 motion-reduce:group-data-[state=closed]/morph:scale-100 motion-reduce:group-data-[state=closing]/morph:translate-x-0 motion-reduce:group-data-[state=closing]/morph:scale-100 motion-reduce:transition-none">
        <p role="presentation" class="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Create new</p>
        <button type="button" role="menuitem" tabindex="0" class="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-semibold outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:text-blue-800">Blank document</button>
        <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-semibold outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:text-blue-800">Project board</button>
        <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-semibold outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:text-blue-800">Invite workspace</button>
      </div>
      <button type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="create-menu" aria-label="Open create menu" class="absolute bottom-0 right-0 z-10 grid size-12 place-items-center rounded-full bg-blue-700 text-white outline-2 outline-offset-2 outline-transparent hover:bg-blue-600 focus-visible:outline-blue-700 active:scale-[0.96] motion-reduce:active:scale-100">
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-6 fill-none stroke-current stroke-2 transition-[rotate] duration-(--motion-duration-normal) ease-motion-enter group-data-[state=open]/morph:rotate-45 motion-reduce:transition-none"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  </div>
</section>
```

## Runtime behavior contract

- On the first open from `hidden`, invalidate pending close work, remove `hidden` and `inert`, set `aria-hidden="false"` and `aria-expanded="true"`, change the trigger label to “Close create menu,” and keep the morph at `data-state="closed"` until its compact shape and hidden-content styles are computed and committed. After a rendering opportunity or the framework's equivalent style-commit boundary, set `data-state="open"`. Move focus to the requested endpoint only after exposure; pointer activation may leave focus on the trigger.
- When reopening during `closing`, invalidate the pending close completion and set `data-state="open"` directly so size, radius, content, and icon transitions reverse from their current interpolated values. A monotonically increasing operation token, framework transition identity, or equivalent guard must prevent an older completion from hiding a reopened menu or restoring the wrong label.
- On close, move focus out of the menu before applying `aria-hidden="true"` or `inert`: Escape and item activation restore the connected trigger first; Tab keeps its native default and closes from the resulting focus departure; outside pointer dismissal lets the pointer destination receive focus and, when focus would otherwise remain in the menu, blurs the active item instead of restoring the trigger. Then set `aria-expanded="false"`, restore the “Open create menu” label, set `aria-hidden="true"`, `inert`, and `data-state="closing"`.
- After the longest relevant morph and content exit transition finishes, set `data-state="closed"` and `hidden`; use target-and-property-filtered completion signals with a deadline derived from the computed transition delays and durations, so hiding never depends only on `transitionend`.
- Maintain exactly one `tabindex="0"` menu item while open. Trigger Arrow Down and Arrow Up open to the first and last items; menu Arrow Down and Arrow Up wrap; Home and End select endpoints; Escape and activation close and restore the connected trigger; Tab and outside pointer dismissal close without trapping or redirecting focus.
- Observe `prefers-reduced-motion` while mounted. If it becomes `reduce` during entry, settle at `open` and perform pending focus; if it becomes `reduce` during exit, finish the guarded close immediately. CSS removes every visual transition, while runtime still completes visibility, labeling, and focus state.
- On framework unmount, replacement, remount, or hot reload, unsubscribe owned handlers and the media-query observer, cancel scheduled renders and completion deadlines, invalidate prior operation tokens, restore the trigger's closed label and ARIA state plus the initial roving tabindex, and leave the morph `data-state="closed"` with the menu `aria-hidden="true"`, `hidden`, and `inert`.

## Acceptance

- Profile the width and height transition in the delivered consumer against its performance budget. If layout work misses that budget, simplify the morph to transform and opacity or another measured alternative before approval.
- Opening grows up and left inside the reserved footprint, rotates the plus to a close mark, exposes the menu, updates the trigger label, and causes no surrounding layout shift.
- Trigger and menu keyboard commands, item activation, Escape, Tab, and outside pointer dismissal produce the stated focus and dismissal behavior.
- Reopen during exit and close during entry; only the newest request may determine visibility, shape, labels, ARIA state, and focus.
- Enable reduced motion during a transition and confirm the expanded or compact final state appears immediately without residual transform.
- Tear down while open and while closing; no listener, observer, scheduled render, completion deadline, focusable hidden item, stale label, or expanded surface remains.
