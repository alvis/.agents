# Menu dropdown

1. Complete [Transition design](directions/transition.md), then merge [motion.css](assets/transitions/motion.css) after Tailwind CSS or map its tokens to equivalent project-owned tokens.
2. Start from the consumer's existing accessible menu primitive. Keep the trigger's `aria-haspopup="menu"`, `aria-controls`, and `aria-expanded`; keep the surface's `role="menu"`, accessible name, and `menuitem` roles; make every ID unique in the rendered page.
3. Keep requested interaction state separate from visual phase. `aria-expanded` records the requested open state, `hidden` plus `inert` plus `aria-hidden` controls semantic exposure, and `data-state` records `closed`, `open`, or `closing` for Tailwind variants.
4. Anchor the surface to the trigger and keep `origin-top-right` for this right-edge placement. Animate only `opacity` and `scale`, list both properties explicitly, and use the shared duration and easing tokens.
5. Preserve menu keyboard behavior and roving focus. Arrow Down and Arrow Up on the trigger open to the first or last item; Arrow keys wrap; Home and End jump; Escape and item activation close and return focus; Tab and outside pointer dismissal close without trapping or stealing focus.
6. Use the runtime contract below for state ordering, interrupted exits, live reduced motion, and teardown. The static markup supplies the initial closed state and its styles; it does not open, dismiss, move focus, or clean itself up.

## Markup and state styling

```html
<section class="grid min-h-72 place-items-center rounded-3xl bg-slate-100 p-8 text-slate-950">
  <div class="relative">
    <button type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="project-actions" class="group inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm outline-2 outline-offset-2 outline-transparent hover:bg-slate-800 focus-visible:outline-blue-600 active:scale-[0.98] motion-reduce:active:scale-100">
      Project actions
      <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4 fill-current transition-[rotate] duration-(--motion-duration-fast) ease-motion-enter group-aria-expanded:rotate-180 motion-reduce:transition-none"><path d="m5.5 7.5 4.5 4 4.5-4 1 1.1-5.5 5-5.5-5 1-1.1Z" /></svg>
    </button>
    <div id="project-actions" role="menu" aria-label="Project actions" aria-hidden="true" data-state="closed" hidden inert class="absolute right-0 top-full z-20 mt-2 w-56 origin-top-right scale-[0.97] rounded-2xl border border-slate-200 bg-white p-1.5 opacity-0 shadow-xl shadow-slate-950/10 outline-none transition-[opacity,scale] duration-(--motion-duration-normal) ease-motion-enter data-[state=open]:scale-100 data-[state=open]:opacity-100 data-[state=closing]:scale-[0.99] data-[state=closing]:duration-(--motion-duration-fast) data-[state=closing]:ease-motion-exit motion-reduce:scale-100 motion-reduce:data-[state=closed]:scale-100 motion-reduce:data-[state=closing]:scale-100 motion-reduce:transition-none">
      <button type="button" role="menuitem" tabindex="0" class="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium outline-none hover:bg-slate-100 focus-visible:bg-blue-50 focus-visible:text-blue-800">Rename project</button>
      <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium outline-none hover:bg-slate-100 focus-visible:bg-blue-50 focus-visible:text-blue-800">Duplicate project</button>
      <button type="button" role="menuitem" tabindex="-1" class="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-red-700 outline-none hover:bg-red-50 focus-visible:bg-red-50">Archive project</button>
    </div>
  </div>
</section>
```

## Runtime behavior contract

- On the first open from `hidden`, invalidate pending close work, remove `hidden` and `inert`, set `aria-hidden="false"` and `aria-expanded="true"`, and keep `data-state="closed"` until its closed opacity and scale are computed and committed. After a rendering opportunity or the framework's equivalent style-commit boundary, set `data-state="open"`. Move focus to the requested endpoint only after exposure; pointer activation may leave focus on the trigger.
- When reopening during `closing`, invalidate the pending close completion and set `data-state="open"` directly so the browser reverses from the current interpolated opacity and scale. A monotonically increasing operation token, framework transition identity, or equivalent guard must prevent any older completion from hiding the reopened menu.
- On close, move focus out of the menu before applying `aria-hidden="true"` or `inert`: Escape and item activation restore the connected trigger first; Tab keeps its native default and closes from the resulting focus departure; outside pointer dismissal lets the pointer destination receive focus and, when focus would otherwise remain in the menu, blurs the active item instead of restoring the trigger. Then set `aria-expanded="false"`, `aria-hidden="true"`, `inert`, and `data-state="closing"`.
- After the surface's opacity and scale transitions finish, set `data-state="closed"` and `hidden`; use a target-and-property-filtered completion signal with a deadline derived from the computed transition delay and duration, so removal never depends only on `transitionend`.
- Maintain exactly one `tabindex="0"` menu item while open. Trigger Arrow Down and Arrow Up open to the first and last items; menu Arrow Down and Arrow Up wrap; Home and End select endpoints; Escape and activation close and restore the connected trigger; Tab and outside pointer dismissal close without trapping or redirecting focus.
- Observe `prefers-reduced-motion` while the component is mounted. If it becomes `reduce` during entry, settle at `open` and perform pending focus; if it becomes `reduce` during exit, finish the guarded close immediately. CSS removes the visual transition, while runtime still completes semantic state.
- On framework unmount, replacement, remount, or hot reload, unsubscribe owned handlers and the media-query observer, cancel scheduled renders and completion deadlines, invalidate prior operation tokens, restore the trigger's closed ARIA state and initial roving tabindex, and leave the menu `data-state="closed"`, `aria-hidden="true"`, `hidden`, and `inert`.

## Acceptance

- Pointer activation opens and closes from the trigger edge without moving surrounding layout; `aria-expanded`, `aria-hidden`, `hidden`, `inert`, and `data-state` agree after each settled state.
- Trigger Arrow Down and Arrow Up, menu Arrow keys, Home, End, Escape, Tab, item activation, and outside pointer dismissal produce the stated focus result.
- Reopen during exit and close during entry; the newest request alone determines final visibility, focus, and attributes, with no flash back to the initial scale.
- Enable reduced motion during entry and exit; each operation reaches its meaningful final semantic state immediately.
- Tear down while open and while closing; later callbacks cannot alter state, and no listener, observer, scheduled render, completion deadline, or focusable hidden item remains.
