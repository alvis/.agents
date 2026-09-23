# Matrix loader

## Implement

1. Pair the decorative 4×4 matrix with a real polite status label and keep the matrix `aria-hidden="true"`. The label must explain the work without relying on dot order, opacity, or motion.
2. Choose the pattern at design time and encode its delay, static, and gap classes directly on sixteen stable dots. The embedded Tailwind arbitrary properties provide a complete column-scan baseline; use the mapping below for another pattern instead of shipping a pattern picker.
3. Import the [shared motion asset](assets/transitions/motion.css) once and add the matrix keyframes beside it. Keep the 1.2-second cycle so the small grid reads as a pattern instead of flicker, and preserve the CSS reduced-motion branch that makes every dot static.
4. Provide a visible pause control because animation persists while work is active. Use a native checkbox and Tailwind `peer-checked` state to pause the dots without scripting; style its label as the control and expose a focus-visible ring from the visually hidden checkbox.

## Runtime requirements

The embedded HTML renders and pauses the column-scan variant without scripting. The owning runtime is required only to follow real work: completion must atomically set `data-complete="true"`, set `aria-busy="false"`, and replace the loading message so animation stops with the task. If a product requirement changes patterns while loading, retain the same sixteen nodes and apply the selected design-time mapping in one render; an obsolete task must not update a replacement loader. Teardown must unsubscribe from work progress and prevent stale completion updates.

Number dots from 0 to 15 in row-major order. For column scan, use delays `0`, `120`, `240`, and `360` milliseconds by column. For twinkle, assign consecutive 75-millisecond ranks in this dot order: `7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4`. For perimeter orbit, assign consecutive 150-millisecond ranks to `1, 2, 7, 11, 14, 13, 8, 4`; give every other dot `data-static="true" opacity-35 scale-75` so the parent's more-specific static selector removes its animation. For center pulse, use zero delay for `5, 6, 9, 10` and `192ms` for the other dots. A rounded matrix gives dots `0, 3, 12, 15` the `invisible` class.

## Verify

Compile the chosen pattern, then exercise native pause and resume, completion, task replacement, and a live reduced-motion change. The grid must retain sixteen stable nodes, the status must remain meaningful when static, and no animation may continue while checked, reduced, or complete. After teardown, stale work events must not update the loader.

## State markup and Tailwind styling

```html
<section data-complete="false" aria-busy="true" class="group flex min-h-64 flex-col items-center justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-8 text-neutral-950">
  <input id="matrix-loader-motion" type="checkbox" class="peer sr-only" />
  <div class="flex items-center gap-3 peer-checked:[&_i]:[animation-play-state:paused]">
    <span aria-hidden="true" class="grid grid-cols-[repeat(4,0.25rem)] gap-1 text-violet-700 [&>i]:size-1 [&>i]:rounded-full [&>i]:bg-current [&>i]:[animation:feedback-matrix_1200ms_ease-in-out_infinite] [&>i]:[animation-delay:var(--delay)] [&>[data-static=true]]:animate-none group-data-[complete=true]:[&>i]:animate-none motion-reduce:[&>i]:animate-none">
      <i class="[--delay:0ms]"></i><i class="[--delay:120ms]"></i><i class="[--delay:240ms]"></i><i class="[--delay:360ms]"></i>
      <i class="[--delay:0ms]"></i><i class="[--delay:120ms]"></i><i class="[--delay:240ms]"></i><i class="[--delay:360ms]"></i>
      <i class="[--delay:0ms]"></i><i class="[--delay:120ms]"></i><i class="[--delay:240ms]"></i><i class="[--delay:360ms]"></i>
      <i class="[--delay:0ms]"></i><i class="[--delay:120ms]"></i><i class="[--delay:240ms]"></i><i class="[--delay:360ms]"></i>
    </span>
    <span role="status" aria-live="polite" aria-atomic="true" class="text-sm text-neutral-600">Loading results with a column scan.</span>
  </div>
  <label for="matrix-loader-motion" class="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium transition-colors duration-(--motion-duration-fast) hover:bg-neutral-50 peer-checked:border-neutral-950 peer-checked:bg-neutral-950 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neutral-950">Pause animation</label>
</section>
```

```css
@keyframes feedback-matrix {
  0%, 45%, 100% { opacity: 0.35; transform: scale(0.75); }
  15% { opacity: 1; transform: scale(1); }
}
```
