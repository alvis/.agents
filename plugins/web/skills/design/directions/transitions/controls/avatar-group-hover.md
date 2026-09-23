# Avatar group hover

## Implement and adapt

1. Keep each avatar a native named button. Let hover and focus own only a transient active index; do not turn this decorative proximity response into selection state or change DOM order.
2. For every active index, compute each avatar's integer distance from it. Apply the lift as `-10 × 0.45^distance` pixels, scale only the active avatar to `1.08`, and derive z-index from inverse distance so nearer avatars paint above farther neighbors. Adapt those constants together if the target size or overlap changes.
3. Apply transforms directly to the avatar buttons while the group remains stationary. Use the enter easing while approaching the active shape and the spring easing only while resetting, so fast pointer travel interpolates from the browser's current transform.
4. The HTML below renders the flat state and exposes custom-property inputs for the enhancement. It requires the runtime behavior that follows to calculate proximity.

## Runtime behavior

1. Share one active-index update path between mouse `pointerenter` and native `focus`. For every button, write `--avatar-lift`, `--avatar-scale`, `--avatar-layer`, and `--avatar-ease` from the distance formula, and set `data-active="true"` only on the active button.
2. Reset on group `pointerleave`, and on `focusout` only when the next focused element is outside the group. Reset must set every transform input to its flat value, switch `--avatar-ease` to the spring token for the return, restore normal stacking, and set every `data-active` to false.
3. Ignore touch and pen hover synthesis. Native activation remains available for every pointer type, while Tab and Shift+Tab expose the same transient proximity response without moving or trapping focus.
4. Subscribe to live reduced-motion changes and reset immediately. While reduction is active, do not write lift or scale values on hover or focus; retain the buttons, names, focus rings, and overlap.
5. On teardown, remove owned listeners and the preference subscription, then remove every owned custom property and restore `data-active="false"`. No transient stacking value may remain.

## Verify

Hover quickly from first to last, leave and re-enter the row, then Tab through every avatar and Shift+Tab out. Confirm falloff is symmetric by index, the active item paints on top, focus stays visible, and no button retains stale transform state. Enable reduced motion while raised and tear down while focused; the row must flatten without changing focus or activation.

```html
<section class="grid min-h-48 place-items-center rounded-2xl bg-slate-950 p-8 text-white">
  <div role="group" aria-label="Project collaborators" class="flex -space-x-3">
    <button type="button" data-active="false" aria-label="Open profile for Amina" class="relative size-14 rounded-full border-2 border-slate-950 bg-fuchsia-500 text-sm font-semibold shadow-lg outline-none [transform:translateY(var(--avatar-lift,0px))_scale(var(--avatar-scale,1))] [z-index:var(--avatar-layer,auto)] [transition-timing-function:var(--avatar-ease,var(--ease-motion-enter))] transition-[transform] duration-(--motion-duration-normal) focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">AM</button>
    <button type="button" data-active="false" aria-label="Open profile for Bo" class="relative size-14 rounded-full border-2 border-slate-950 bg-amber-400 text-sm font-semibold text-slate-950 shadow-lg outline-none [transform:translateY(var(--avatar-lift,0px))_scale(var(--avatar-scale,1))] [z-index:var(--avatar-layer,auto)] [transition-timing-function:var(--avatar-ease,var(--ease-motion-enter))] transition-[transform] duration-(--motion-duration-normal) focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">BO</button>
    <button type="button" data-active="false" aria-label="Open profile for Cora" class="relative size-14 rounded-full border-2 border-slate-950 bg-cyan-400 text-sm font-semibold text-slate-950 shadow-lg outline-none [transform:translateY(var(--avatar-lift,0px))_scale(var(--avatar-scale,1))] [z-index:var(--avatar-layer,auto)] [transition-timing-function:var(--avatar-ease,var(--ease-motion-enter))] transition-[transform] duration-(--motion-duration-normal) focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">CO</button>
    <button type="button" data-active="false" aria-label="Open profile for Dev" class="relative size-14 rounded-full border-2 border-slate-950 bg-emerald-400 text-sm font-semibold text-slate-950 shadow-lg outline-none [transform:translateY(var(--avatar-lift,0px))_scale(var(--avatar-scale,1))] [z-index:var(--avatar-layer,auto)] [transition-timing-function:var(--avatar-ease,var(--ease-motion-enter))] transition-[transform] duration-(--motion-duration-normal) focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">DE</button>
    <button type="button" data-active="false" aria-label="Open profile for Eli" class="relative size-14 rounded-full border-2 border-slate-950 bg-violet-500 text-sm font-semibold shadow-lg outline-none [transform:translateY(var(--avatar-lift,0px))_scale(var(--avatar-scale,1))] [z-index:var(--avatar-layer,auto)] [transition-timing-function:var(--avatar-ease,var(--ease-motion-enter))] transition-[transform] duration-(--motion-duration-normal) focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">EL</button>
  </div>
</section>
```
