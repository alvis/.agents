# Avatar group hover

## Implement and adapt

1. Keep each avatar a native named button. Let hover and focus own only a transient active index; do not turn this decorative proximity response into selection state or change DOM order.
2. For every active index, compute each avatar's integer distance from it. Apply the lift as `-10 * 0.45^distance`, scale only the active avatar to `1.08`, and derive z-index from inverse distance so nearer avatars paint above farther neighbors. Adapt those constants together if the target size or overlap changes.
3. Apply transforms directly to the avatar buttons while the group remains stationary. Use the enter easing while approaching the active shape and the spring easing only while resetting, so fast pointer travel always interpolates from the browser's current transform.
4. Share the same activation path between `pointerenter` and native `focus`. Reset on group `pointerleave`, and on `focusout` only when `relatedTarget` has left the group; Tab therefore exposes the same feedback without trapping or moving focus.
5. On every active change, overwrite all transforms and stacking values so no stale neighbor state survives. Cleanup must abort every listener and remove inline transform, z-index, and timing-function values.
6. Subscribe to live reduced-motion changes and reset immediately. While reduced motion is active, keep buttons, names, focus rings, and overlap intact while applying no lift or scale.

## Verify

Hover quickly from first to last, leave and re-enter the row, then Tab through every avatar and Shift+Tab out. Confirm falloff is symmetric by index, the active item paints on top, focus stays visible, and no button captures stale transform state. Enable reduced motion while raised and run cleanup while focused; the row must flatten without changing focus or activation.

```html
<section data-demo="avatar-group-hover" class="grid min-h-48 place-items-center rounded-2xl bg-slate-950 p-8 text-white">
  <div aria-label="Project collaborators" class="flex -space-x-3" data-avatar-group>
    <button type="button" data-avatar aria-label="Open profile for Amina" class="relative size-14 rounded-full border-2 border-slate-950 bg-fuchsia-500 text-sm font-semibold shadow-lg outline-none transition-[transform] duration-(--motion-duration-normal) ease-motion-enter focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">AM</button>
    <button type="button" data-avatar aria-label="Open profile for Bo" class="relative size-14 rounded-full border-2 border-slate-950 bg-amber-400 text-sm font-semibold text-slate-950 shadow-lg outline-none transition-[transform] duration-(--motion-duration-normal) ease-motion-enter focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">BO</button>
    <button type="button" data-avatar aria-label="Open profile for Cora" class="relative size-14 rounded-full border-2 border-slate-950 bg-cyan-400 text-sm font-semibold text-slate-950 shadow-lg outline-none transition-[transform] duration-(--motion-duration-normal) ease-motion-enter focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">CO</button>
    <button type="button" data-avatar aria-label="Open profile for Dev" class="relative size-14 rounded-full border-2 border-slate-950 bg-emerald-400 text-sm font-semibold text-slate-950 shadow-lg outline-none transition-[transform] duration-(--motion-duration-normal) ease-motion-enter focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">DE</button>
    <button type="button" data-avatar aria-label="Open profile for Eli" class="relative size-14 rounded-full border-2 border-slate-950 bg-violet-500 text-sm font-semibold shadow-lg outline-none transition-[transform] duration-(--motion-duration-normal) ease-motion-enter focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transform-none motion-reduce:transition-none">EL</button>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const group = root.querySelector("[data-avatar-group]");
  const avatars = [...group.querySelectorAll("[data-avatar]")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  function setActiveAvatar(activeIndex) {
    avatars.forEach((avatar, index) => {
      const distance = Math.abs(index - activeIndex);
      const lift = -10 * Math.pow(0.45, distance);
      const scale = index === activeIndex ? 1.08 : 1;
      avatar.style.zIndex = String(avatars.length - distance);
      avatar.style.transitionTimingFunction = "var(--ease-motion-enter)";
      avatar.style.transform = reducedMotion.matches ? "none" : `translateY(${lift.toFixed(2)}px) scale(${scale})`;
    });
  }

  function resetAvatars() {
    avatars.forEach((avatar) => {
      avatar.style.zIndex = "";
      avatar.style.transitionTimingFunction = "var(--ease-motion-spring)";
      avatar.style.transform = "none";
    });
  }

  avatars.forEach((avatar, index) => {
    avatar.addEventListener("pointerenter", () => setActiveAvatar(index), { signal: controller.signal });
    avatar.addEventListener("focus", () => setActiveAvatar(index), { signal: controller.signal });
  });
  group.addEventListener("pointerleave", resetAvatars, { signal: controller.signal });
  group.addEventListener("focusout", (event) => {
    if (!group.contains(event.relatedTarget)) resetAvatars();
  }, { signal: controller.signal });
  reducedMotion.addEventListener("change", resetAvatars, { signal: controller.signal });

  return () => {
    controller.abort();
    resetAvatars();
  };
}
```
