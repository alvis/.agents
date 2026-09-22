# Card tilt

## Implement and adapt

1. Preserve the native anchor as the flat hit target and focus owner. Transform only its inner card; keep text, destination, DOM order, and link activation usable when JavaScript, hover, or motion is absent.
2. On mouse `pointermove`, store client coordinates and queue at most one animation frame. In that frame, measure `getBoundingClientRect()` on the untransformed anchor, normalize each axis to `0..1`, clamp it, and map distance from center to the supplied ±7-degree rotation. Do not measure the rotating child because its changing bounds cause edge flicker.
3. Write rotation through `--tilt-x` and `--tilt-y`, and map the same normalized coordinates to glare percentages. Keep perspective and three-dimensional depth on the card, make glare pointer-inert and `aria-hidden`, and adapt the angle, perspective, and translated depth as one restrained system.
4. Ignore touch and pen movement; the link keeps native tap, Enter, focus, and navigation behavior. Reset on pointer leave and blur so keyboard focus never requires or preserves a tilt.
5. Cancel the queued frame before reset, zero both angles, and hide glare. Repeated pointer events update the stored coordinates rather than queueing parallel draws. Cleanup must abort listeners, cancel the frame, and restore the flat state and hidden glare.
6. Keep the CSS reduced-motion transforms and live media-query reset. A preference change during tracking must cancel the frame and flatten immediately while leaving the link focused and actionable.

## Verify

Move a mouse through the center, corners, and every boundary; confirm rotation and glare remain continuous and return flat on leave. Tab to and activate the link, test touch without tilt, change reduced motion during tracking, and unmount with a frame queued. Profile the rendered card for stable outer geometry and confirm no pointer flicker, focus loss, layout shift, or console error.

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
