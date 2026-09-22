# Card tilt

Use this for a visual card that should feel physical under a precise pointer. Track geometry on a flat outer link, rotate only its inner surface, and keep navigation, focus, and content fully usable when the effect is absent.

```html
<section data-demo="card-tilt" class="grid min-h-96 place-items-center rounded-2xl bg-slate-950 p-8 text-white">
  <a href="#featured-release" data-tilt class="block w-full max-w-sm rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-sky-400/60">
    <article data-tilt-card class="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-violet-600 via-indigo-700 to-slate-950 p-7 shadow-2xl transition-[transform] duration-(--motion-duration-slow) ease-motion-enter [transform:perspective(900px)_rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))] [transform-style:preserve-3d] motion-reduce:transform-none motion-reduce:transition-none">
      <div class="relative z-10 grid min-h-64 content-between [transform:translateZ(28px)] motion-reduce:transform-none">
        <span class="w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest">Featured release</span>
        <div><h3 class="text-3xl font-semibold">Spatial controls</h3><p class="mt-2 max-w-xs text-sm leading-6 text-indigo-100">Pointer light and depth reinforce the card boundary while the destination stays a normal link.</p></div>
      </div>
      <span aria-hidden="true" class="control-tilt-glare pointer-events-none absolute inset-0 opacity-0 transition-[opacity] duration-(--motion-duration-normal) ease-motion-enter motion-reduce:hidden" data-tilt-glare></span>
    </article>
  </a>
</section>
```

```css
@utility control-tilt-glare {
  background:
    radial-gradient(circle 100px at var(--glare-x, 50%) var(--glare-y, 50%), rgb(255 255 255 / 0.5), transparent 70%),
    radial-gradient(circle 240px at var(--glare-x, 50%) var(--glare-y, 50%), rgb(125 211 252 / 0.24), transparent 75%);
  mix-blend-mode: screen;
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const hitArea = root.querySelector("[data-tilt]");
  const card = root.querySelector("[data-tilt-card]");
  const glare = root.querySelector("[data-tilt-glare]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let animationFrameId = 0;
  let pointerX = 0;
  let pointerY = 0;

  function resetTilt() {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    glare.style.opacity = "0";
  }

  function drawTilt() {
    animationFrameId = 0;
    if (reducedMotion.matches) {
      resetTilt();
      return;
    }
    const bounds = hitArea.getBoundingClientRect();
    const horizontal = Math.min(1, Math.max(0, (pointerX - bounds.left) / bounds.width));
    const vertical = Math.min(1, Math.max(0, (pointerY - bounds.top) / bounds.height));
    card.style.setProperty("--tilt-x", `${((0.5 - vertical) * 14).toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${((horizontal - 0.5) * 14).toFixed(2)}deg`);
    glare.style.setProperty("--glare-x", `${(horizontal * 100).toFixed(1)}%`);
    glare.style.setProperty("--glare-y", `${(vertical * 100).toFixed(1)}%`);
    glare.style.opacity = "0.8";
  }

  hitArea.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!animationFrameId) animationFrameId = requestAnimationFrame(drawTilt);
  }, { signal: controller.signal });
  hitArea.addEventListener("pointerleave", resetTilt, { signal: controller.signal });
  hitArea.addEventListener("blur", resetTilt, { signal: controller.signal });
  reducedMotion.addEventListener("change", resetTilt, { signal: controller.signal });

  return () => {
    controller.abort();
    resetTilt();
  };
}
```

Check the flat initial card, move a mouse across every edge, and confirm rotation and glare follow the pointer without boundary flicker. Leaving must ease the surface back to flat. Tab to the link and activate it to verify the keyboard path and focus ring require no tilt. Enable reduced motion during pointer tracking to flatten immediately. Cleanup must cancel the queued RAF, remove listeners, and reset the surface.
