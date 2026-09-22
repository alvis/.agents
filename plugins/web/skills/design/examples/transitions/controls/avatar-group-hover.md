# Avatar group hover

Use this for a compact horizontal row where proximity should reinforce the hovered or focused item. The active avatar rises and grows; neighboring avatars follow with an exponential falloff, then the row returns on a softer spring curve.

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

Check the flat initial row, then hover and keyboard-focus every avatar to verify the active lift, neighbor falloff, stacking, and spring return. Move quickly across the row to confirm no avatar captures stale state. Enabling reduced motion while an avatar is raised must flatten the row immediately. Cleanup must remove interaction and inline transforms.
