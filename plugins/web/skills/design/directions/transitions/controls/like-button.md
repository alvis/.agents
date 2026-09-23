# Like button

## Implement and adapt

1. Keep one native toggle button and one authoritative favorite boolean. Derive `aria-pressed`, the visible label, heart fill, and burst decision from that state; keep the accessible name stable so assistive technology announces one toggle whose pressed state changes.
2. Apply scale animation to the HTML wrapper around the SVG so the heart remains sharp. Keep the zero-sized particle field pointer-inert and `aria-hidden`; the recipe CSS defines deterministic vectors, delays, and sizes so runtime code does not generate geometry.
3. Burst only on the transition from unpressed to pressed. Celebration remains visually subordinate to the durable pressed state, and unpressing updates the state and fill without emitting particles.
4. The HTML below renders the unpressed state. It requires the runtime behavior that follows to update favorite state and replay the transient burst.

## Runtime behavior

1. Route native activation into the application's existing favorite-state update, then render `aria-pressed` from that boolean. Do not keep a second local boolean or infer state from fill color.
2. On an unpressed-to-pressed change, invalidate the prior burst deadline, render `data-burst="false"`, force one style recalculation after that reset is committed, then render `data-burst="true"`. Schedule its removal from the computed `--control-like-burst-duration`, whose 684ms value equals the longest 84ms particle delay plus the shared 600ms duration.
3. On pressed-to-unpressed changes, invalidate the deadline and render `data-burst="false"`. Rapid toggles must invalidate older generations before starting a newer burst so no stale deadline clears current playback.
4. Subscribe to live reduced-motion changes. While reduction is active, update the favorite state without setting `data-burst`; if it becomes active during a burst, invalidate the deadline and clear the transient state immediately.
5. On teardown, remove owned activation and preference subscriptions, invalidate the burst deadline, and render `data-burst="false"` while leaving `aria-pressed` synchronized with the application's latest boolean.

## Verify

Favorite and unfavorite by pointer, Enter, and Space; confirm particles run once only when entering the pressed state. Toggle faster than 684ms and replay after settlement. Change reduced motion during a burst, tear down with its deadline pending, and inspect that the button remains stably named, pressed state remains correct, particles are hidden from assistive technology, and no transient state survives cleanup.

```html
<section class="grid min-h-48 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <button type="button" aria-pressed="false" aria-label="Favorite" data-burst="false" class="group relative inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 font-semibold shadow-sm outline-none hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-rose-400/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
    <span class="relative grid size-6 place-items-center group-aria-pressed:animate-control-like-pop motion-reduce:group-aria-pressed:animate-none">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-6 overflow-visible fill-transparent stroke-current transition-[fill,color] duration-(--motion-duration-fast) ease-motion-enter group-aria-pressed:fill-rose-500 group-aria-pressed:text-rose-500 motion-reduce:transition-none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
      <span aria-hidden="true" class="control-like-particles pointer-events-none absolute left-1/2 top-1/2 size-0 text-rose-500">
        <span class="control-like-particle"></span><span class="control-like-particle"></span><span class="control-like-particle"></span><span class="control-like-particle"></span><span class="control-like-particle"></span><span class="control-like-particle"></span><span class="control-like-particle"></span><span class="control-like-particle"></span>
      </span>
    </span>
    <span class="group-aria-pressed:hidden">Favorite</span>
    <span class="hidden group-aria-pressed:inline">Favorited</span>
  </button>
</section>
```

```css
@theme static {
  --animate-control-like-pop: control-like-pop var(--motion-duration-slow) var(--ease-motion-spring);
}

@keyframes control-like-pop {
  0% { transform: scale(1); }
  35% { transform: scale(0.78); }
  70% { transform: scale(1.16); }
  100% { transform: scale(1); }
}

@keyframes control-like-particle {
  0% { opacity: 0; transform: translate(0, 0) scale(0.35); }
  22% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--particle-x), var(--particle-y)) scale(0.65); }
}

@utility control-like-particles {
  --control-like-burst-duration: 684ms;
}

@utility control-like-particle {
  position: absolute;
  width: var(--particle-size, 3px);
  height: var(--particle-size, 3px);
  margin: calc(var(--particle-size, 3px) / -2);
  border-radius: 9999px;
  background: currentColor;
  animation: control-like-particle 600ms ease-out var(--particle-delay, 0ms) both;
  animation-play-state: paused;
}

@layer components {
  .control-like-particle:nth-child(1) { --particle-x: 0px; --particle-y: -18px; --particle-delay: 0ms; --particle-size: 2.5px; }
  .control-like-particle:nth-child(2) { --particle-x: 15.6px; --particle-y: -15.6px; --particle-delay: 12ms; --particle-size: 3.5px; }
  .control-like-particle:nth-child(3) { --particle-x: 26px; --particle-y: 0px; --particle-delay: 24ms; --particle-size: 2.5px; }
  .control-like-particle:nth-child(4) { --particle-x: 12.7px; --particle-y: 12.7px; --particle-delay: 36ms; --particle-size: 3.5px; }
  .control-like-particle:nth-child(5) { --particle-x: 0px; --particle-y: 22px; --particle-delay: 48ms; --particle-size: 2.5px; }
  .control-like-particle:nth-child(6) { --particle-x: -18.4px; --particle-y: 18.4px; --particle-delay: 60ms; --particle-size: 3.5px; }
  .control-like-particle:nth-child(7) { --particle-x: -18px; --particle-y: 0px; --particle-delay: 72ms; --particle-size: 2.5px; }
  .control-like-particle:nth-child(8) { --particle-x: -15.6px; --particle-y: -15.6px; --particle-delay: 84ms; --particle-size: 3.5px; }
  .group[data-burst="true"] .control-like-particle { animation-play-state: running; }

  @media (prefers-reduced-motion: reduce) {
    .control-like-particle { animation: none; }
  }
}
```
