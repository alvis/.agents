# Card tilt

## Implement and adapt

1. Preserve the native anchor as the flat hit target and focus owner. Transform only its inner card; keep text, destination, DOM order, and link activation usable when the enhancement, hover, or motion is absent.
2. Measure `getBoundingClientRect()` on the untransformed anchor, normalize each pointer axis to `0..1`, clamp it, and map distance from center to the supplied ±7-degree rotation. Never measure the rotating child because its changing bounds cause edge flicker.
3. Write rotation through `--tilt-x` and `--tilt-y`, and map the same normalized coordinates to `--glare-x` and `--glare-y`. Keep perspective and three-dimensional depth on the card, make glare pointer-inert and `aria-hidden`, and adapt the angle, perspective, and translated depth as one restrained system.
4. The HTML below renders a flat, fully usable destination. It requires the runtime behavior that follows for pointer-relative depth.

## Runtime behavior

1. On mouse `pointermove`, store the latest client coordinates and queue at most one render callback for the next paint. Repeated pointer events replace the stored coordinates rather than queueing parallel work.
2. In that callback, stop if reduced motion is active; otherwise measure the anchor, clamp each normalized axis, set `--tilt-x` to `(0.5 − vertical) × 14deg`, set `--tilt-y` to `(horizontal − 0.5) × 14deg`, set the glare coordinates to the corresponding percentages, and render `data-tilted="true"`.
3. Ignore touch and pen movement. Reset on pointer leave and blur by invalidating the queued callback, setting `data-tilted="false"`, and removing all four custom properties; keyboard focus must never require or preserve a tilt.
4. Subscribe to live reduced-motion changes and reset immediately while leaving the link focused and actionable.
5. On teardown, remove owned listeners and the preference subscription, invalidate the queued callback, and perform the same flat-state reset. No render callback may write after teardown.

## Verify

Move a mouse through the center, corners, and every boundary; confirm rotation and glare remain continuous and return flat on leave. Tab to and activate the link, test touch without tilt, change reduced motion during tracking, and tear down with a callback queued. Profile the rendered card for stable outer geometry and confirm no pointer flicker, focus loss, layout shift, or console error.

```html
<section class="grid min-h-96 place-items-center rounded-2xl bg-slate-950 p-8 text-white">
  <a href="#featured-release" data-tilted="false" class="group block w-full max-w-sm rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-sky-400/60">
    <article class="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-violet-600 via-indigo-700 to-slate-950 p-7 shadow-2xl transition-[transform] duration-(--motion-duration-slow) ease-motion-enter [transform:perspective(900px)_rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))] [transform-style:preserve-3d] motion-reduce:transform-none motion-reduce:transition-none">
      <div class="relative z-10 grid min-h-64 content-between [transform:translateZ(28px)] motion-reduce:transform-none">
        <span class="w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest">Featured release</span>
        <div><h3 class="text-3xl font-semibold">Spatial controls</h3><p class="mt-2 max-w-xs text-sm leading-6 text-indigo-100">Pointer light and depth reinforce the card boundary while the destination stays a normal link.</p></div>
      </div>
      <span aria-hidden="true" class="control-tilt-glare pointer-events-none absolute inset-0 opacity-0 transition-[opacity] duration-(--motion-duration-normal) ease-motion-enter group-data-[tilted=true]:opacity-80 motion-reduce:hidden"></span>
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
