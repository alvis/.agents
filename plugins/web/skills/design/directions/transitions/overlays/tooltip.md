# Tooltip

1. Complete [Transition design](directions/transition.md), then merge [motion.css](assets/transitions/motion.css) after Tailwind CSS or map its tokens to equivalent project-owned tokens.
2. Keep every trigger as its existing keyboard-focusable control with its own accessible name. Point each `aria-describedby` to one shared text-only `role="tooltip"`; move links, buttons, fields, or other interactive content into a menu or popover.
3. Keep semantic and visual state separate. The active trigger determines the current text and placement, `aria-hidden` controls assistive exposure, and `data-state` on the group drives the Tailwind reveal variants.
4. Measure the active trigger against the group, measure the rendered text width, clamp the centered offset within the group, and write only `--tooltip-width` and `--tooltip-x`. Explicit `translate` and `width` transitions move the shared outer bubble while the inner bubble animates `opacity` and `scale` after the intent delay.
5. Show on pointer entry and focus. Hide after pointer leave only when focus is outside, after focus leaves the group, or on Escape; keep normal Tab order and never move focus into the tooltip.
6. Use the runtime contract below for geometry, rapid target changes, live reduced motion, and teardown. The static markup supplies the initial closed state and styles; it does not select a trigger, copy tooltip text, measure placement, or subscribe to lifecycle events.

## Markup and state styling

```html
<section class="grid min-h-72 place-items-center rounded-3xl bg-slate-950 p-8 text-white">
  <div id="project-toolbar" data-state="closed" class="group/tooltip relative inline-flex gap-1 rounded-2xl border border-white/10 bg-white/10 p-1.5 shadow-xl">
    <button type="button" aria-label="Copy project link" aria-describedby="toolbar-tooltip" data-tooltip="Copy link" class="grid size-11 place-items-center rounded-xl text-slate-300 outline-2 outline-offset-2 outline-transparent hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-blue-400 active:scale-[0.96] motion-reduce:active:scale-100">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2"><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.14-1.14" /></svg>
    </button>
    <button type="button" aria-label="Share this project" aria-describedby="toolbar-tooltip" data-tooltip="Share project" class="grid size-11 place-items-center rounded-xl text-slate-300 outline-2 outline-offset-2 outline-transparent hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-blue-400 active:scale-[0.96] motion-reduce:active:scale-100">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
    </button>
    <button type="button" aria-label="Open project settings" aria-describedby="toolbar-tooltip" data-tooltip="Open settings" class="grid size-11 place-items-center rounded-xl text-slate-300 outline-2 outline-offset-2 outline-transparent hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-blue-400 active:scale-[0.96] motion-reduce:active:scale-100">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.08A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.08A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.08A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06-.06A1.7 1.7 0 0 0 19.4 9c.18.37.47.7.83.93.34.22.74.34 1.15.35H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg>
    </button>
    <span id="toolbar-tooltip" role="tooltip" aria-hidden="true" class="pointer-events-none absolute bottom-[calc(100%+0.75rem)] left-0 box-border overflow-hidden [translate:var(--tooltip-x)_0] [width:var(--tooltip-width)] transition-[translate,width] duration-(--motion-duration-fast) ease-motion-enter motion-reduce:transition-none">
      <span id="toolbar-tooltip-text" class="block origin-bottom scale-[0.98] whitespace-nowrap rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 opacity-0 shadow-xl transition-[opacity,scale] delay-0 duration-(--motion-duration-fast) ease-motion-enter group-data-[state=open]/tooltip:scale-100 group-data-[state=open]/tooltip:opacity-100 group-data-[state=open]/tooltip:delay-(--motion-delay-tooltip) motion-reduce:scale-100 motion-reduce:group-data-[state=closed]/tooltip:scale-100 motion-reduce:delay-0 motion-reduce:transition-none"></span>
    </span>
  </div>
</section>
```

```css
@theme static {
  --motion-delay-tooltip: 80ms;
}
```

## Runtime behavior contract

- Treat the buttons with `aria-describedby="toolbar-tooltip"` as triggers. On pointer entry or focus, synchronously make the newest trigger active, assign its `data-tooltip` value as plain text in `#toolbar-tooltip-text`, never parse or interpolate that value as HTML, and set `aria-hidden="false"` before measuring.
- Measure the group box, active trigger box, and rendered text width. Use the smaller of the text width and group width for `--tooltip-width`; center it on the trigger, clamp `--tooltip-x` from zero through `group width − tooltip width`, write both properties, then set the group's `data-state="open"`.
- A move to another trigger replaces the active trigger, text, and geometry synchronously; no delayed callback may restore an older target. CSS owns the 80ms reveal delay, so runtime does not need an intent timer.
- On pointer leave, close only when focus is outside the group. On focus departure, close only when the related focus target is outside the group. Escape closes without moving focus. Closing clears the active trigger, sets the group to `data-state="closed"`, and sets the tooltip to `aria-hidden="true"`.
- Recompute placement for the active trigger whenever a `ResizeObserver` reports group or trigger geometry changes. If the consumer cannot provide `ResizeObserver`, recompute from its equivalent layout notification and document that substitution.
- The `motion-reduce` classes remove the reveal delay and all tooltip transitions as soon as the media query changes; because runtime has no motion-dependent completion, no scripting branch is required for preference changes.
- On framework unmount, replacement, remount, or hot reload, unsubscribe owned pointer, focus, and keyboard handlers, disconnect the geometry observer, clear the active trigger, restore `data-state="closed"` and `aria-hidden="true"`, and remove `--tooltip-width` and `--tooltip-x`.

## Acceptance

- Each icon control keeps a distinct usable accessible name and a 44px target while the shared tooltip stays text-only, pointer-transparent, and out of the Tab order.
- Pointer and focus reveal the correct label; rapid movement across triggers updates one bubble to the newest text, bounded width, and clamped position.
- A tooltip value that looks like markup renders literally as text and creates no element, attribute, event handler, or other interpreted HTML.
- Pointer leave with no focused child, focus departure, and Escape hide the tooltip; moving the pointer away while a child retains focus does not.
- Resize the group or active trigger while visible and confirm placement is recomputed. Enable reduced motion before and during reveal and confirm transition and delay disappear immediately.
- Tear down while visible; the observer and listeners stop, `aria-hidden` is true, visual state is closed, and measurement properties are removed.
