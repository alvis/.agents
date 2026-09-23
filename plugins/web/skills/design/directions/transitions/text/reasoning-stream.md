# Reasoning stream

Implement this as a compact visual preview of continuing activity. Expose the complete transcript or a concise process summary once; do not make each automatic step live.

## Implement and adapt

1. Render one visual source inside the masked `aria-hidden` viewport and one semantic transcript outside it. Announce meaningful phase changes through one separate application status node, never through the looping reel.
2. Keep every visual row at a fixed line height. After render, clone the source exactly once and measure the live row line height and source height. For wrapping or variable-height rows, replace fixed-line stepping with measured child offsets.
3. Copy the Tailwind CSS 4.3 utilities after [the shared motion tokens](assets/transitions/motion.css). Keep `--reason-lines` a positive whole step. The 840ms hold makes two lines readable before the shared 250ms move; adjust both together and verify readability.
4. Invalidate hold and wrap work before restart, preference changes, replacement, and cleanup. At the measured source height, set `data-reset="true"`, apply the modulo position without transition, wait for that position to paint, clear reset, and schedule the next hold.
5. Keep pause and restart controls. Pause stops future holds after any in-flight movement settles; restart cancels pending work and resets to the first row. Reduced motion clears scheduled work, resets to a meaningful static position, and disables motion-only controls.
6. On cleanup, unsubscribe from controls and preference changes, cancel scheduled work, remove the clone, clear transient state, and reset the original. Remounting must not accumulate clones.

## Markup and Tailwind CSS

```html
<section class="grid max-w-lg gap-5 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--reason-fade:1.75rem] [--reason-hold:840ms] [--reason-lines:2] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-1">
    <h2 class="text-base font-semibold">Process activity</h2>
    <p class="sr-only">Reviewing the request. Mapping the constraints. Comparing available patterns. Checking interaction states. Verifying keyboard behavior. Applying motion preferences. Preparing the final result. Completing validation.</p>
  </div>
  <p id="process-status" role="status" class="sr-only">Processing is active</p>
  <div id="process-preview" aria-hidden="true" class="reasoning-stream-mask relative h-36 overflow-hidden rounded-xl bg-zinc-100 px-4 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
    <div data-reset="false" class="reasoning-stream-motion absolute inset-x-4 top-0">
      <div>
        <p class="h-6 leading-6">Reviewing the request</p>
        <p class="h-6 leading-6">Mapping the constraints</p>
        <p class="h-6 leading-6">Comparing available patterns</p>
        <p class="h-6 leading-6">Checking interaction states</p>
        <p class="h-6 leading-6">Verifying keyboard behavior</p>
        <p class="h-6 leading-6">Applying motion preferences</p>
        <p class="h-6 leading-6">Preparing the final result</p>
        <p class="h-6 leading-6">Completing validation</p>
      </div>
    </div>
  </div>
  <div class="flex flex-wrap gap-3">
    <button type="button" aria-controls="process-preview process-status" aria-pressed="false" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950">Pause activity</button>
    <button type="button" aria-controls="process-preview" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Restart activity</button>
  </div>
</section>
```

```css
@utility reasoning-stream-mask {
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, black var(--reason-fade), black calc(100% - var(--reason-fade)), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, black var(--reason-fade), black calc(100% - var(--reason-fade)), transparent 100%);
}

@utility reasoning-stream-motion {
  transform: translateY(var(--reason-offset, 0px));
  transition-property: transform;
  transition-duration: var(--motion-duration-normal);
  transition-timing-function: var(--ease-motion-enter);

  &[data-reset="true"] {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transform: none;
    transition: none;
  }
}
```

## Runtime behavior

The application must clone the visual source once, append the clone directly after it, and reject initialization when there is no measurable first row or source height. Each step waits for computed `--reason-hold`, measures the current row height, advances by row height × `--reason-lines`, writes the negative pixel offset to `--reason-offset`, and waits for the transform transition to settle before scheduling another hold. Apply the [shared transition completion contract](directions/transition.md#adapt-the-selected-recipe): accept only the current scroller's `transform` completion, arm a cancellable fallback deadline guarded by the same step identity, and complete immediately when the computed total is zero. Restart, replacement, and teardown cancel both completion paths before resetting. Crossing the source height applies the modulo reset through `data-reset` without animating the jump. A pause request preserves the current settled offset and mirrors state in `aria-pressed` and the button label. A reduced-motion preference change cancels every hold, completion subscription, and fallback deadline, resets the offset, disables both controls, and labels the pause control “Motion reduced”; clearing the preference restores the user's pause choice before scheduling again.

## Verify

Confirm one clone, exact measured step distance, seamless wrap, readable timing, pause and resume, restart, no clipping, no repeated announcements, reduced motion during hold and movement, and cleanup/remount with no surviving work or clones.
