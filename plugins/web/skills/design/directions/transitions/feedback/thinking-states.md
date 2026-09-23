# Thinking states

## Implement

1. Change text only when each label maps to a real processing stage; otherwise render one static loading message. Keep `aria-busy="true"` on the process and put the changing label in an atomic polite status region.
2. Import the [shared motion asset](assets/transitions/motion.css) once and add the shimmer keyframes beside it. Keep the line readable at every phase; the CSS reduced-motion state removes translation, blur, transition, and shimmer.
3. Keep announced stage changes at least two seconds apart so the polite live region does not chatter. Coalesce faster progress events to the newest real stage; never fabricate progress by cycling labels on elapsed time.
4. For an animated swap, mark exit, wait the computed fast duration, update both text content and `data-text`, mark enter, then settle at idle after the next rendered frame. A newer progress event, pause, or preference change must replace every pending phase.
5. Expose a native pause checkbox because shimmer and animated stage swaps are automatic. Use Tailwind `peer-checked` state to settle the line and pause shimmer without a separate runtime-owned pause flag; the checkbox's checked state preserves the user's choice independently of reduced motion.

## Runtime requirements

The embedded HTML shows one active stage and a native CSS pause; it does not invent or advance stages. The owning runtime must subscribe to authoritative task progress, preserve event order, ignore stale events from replaced tasks, coalesce announcements to the newest stage within the two-second reading window, and drive `data-phase` through `exit`, `enter`, and `idle`. It must update visible text and `data-text` together. When the pause checkbox is checked or reduced motion is active, real stage changes still replace and announce the text but remain at `data-phase="idle"`; a change into either condition cancels any pending visual phase and settles the current line. Do not change the checkbox when the motion preference changes: when reduction clears, animation resumes only if the user's checkbox remains unchecked. Completion must replace the label and set `aria-busy="false"`. Teardown must unsubscribe and cancel pending work while leaving a static readable line.

## Verify

Send every real stage in order, check and uncheck pause during the reading window and an animated swap, then enable and disable reduced motion in both checkbox states. The live region must settle without chatter, paused or reduced-motion states must continue reporting progress without animation, and clearing reduced motion must preserve the user's checked choice. After teardown, pending phases and stale progress events must not update the static line.

## State markup and Tailwind styling

```html
<section aria-busy="true" class="flex min-h-64 flex-col items-center justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-8 text-neutral-950">
  <input id="thinking-state-motion" type="checkbox" class="peer sr-only" />
  <div class="space-y-2 text-center peer-checked:[&_[data-phase]]:translate-none peer-checked:[&_[data-phase]]:opacity-100 peer-checked:[&_[data-phase]]:blur-none peer-checked:[&_[data-phase]]:transition-none peer-checked:[&_[data-phase]]:before:[animation-play-state:paused]">
    <p class="text-sm font-medium text-neutral-950">Preparing your workspace</p>
    <p role="status" aria-live="polite" aria-atomic="true" class="h-6 overflow-hidden text-sm">
      <span data-phase="idle" data-text="Reviewing project files" class="relative inline-block text-neutral-500 transition-[opacity,translate,filter] duration-(--motion-duration-fast) ease-in-out data-[phase=enter]:translate-y-2 data-[phase=enter]:opacity-0 data-[phase=enter]:blur-[2px] data-[phase=exit]:-translate-y-2 data-[phase=exit]:opacity-0 data-[phase=exit]:blur-[2px] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(90deg,transparent_35%,rgb(23_23_23)_50%,transparent_65%)] before:bg-[length:300%_100%] before:bg-clip-text before:text-transparent before:content-[attr(data-text)] before:[animation:feedback-thinking-shimmer_2s_linear_infinite] motion-reduce:translate-none motion-reduce:transition-none motion-reduce:before:animate-none motion-reduce:before:content-none">Reviewing project files</span>
    </p>
  </div>
  <label for="thinking-state-motion" class="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium transition-colors duration-(--motion-duration-fast) hover:bg-neutral-50 peer-checked:border-neutral-950 peer-checked:bg-neutral-950 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neutral-950">Pause animation</label>
</section>
```

```css
@keyframes feedback-thinking-shimmer {
  from { background-position: 100% 0; }
  to { background-position: 0 0; }
}
```
