# Success check

## Implement

1. Keep the durable result in the heading and polite status text; mark the check graphic decorative so drawing the path never carries the success message by itself.
2. Normalize the check path with native SVG `pathLength="1"`, then use `1` for the dash array and offset. Preserve the reduced-motion dash-offset override so the completed check remains visible when keyframes are disabled.
3. Import the [shared motion asset](assets/transitions/motion.css) once and place the recipe keyframes in the same Tailwind input. Keep both animations finite and tied to `data-state="shown"`.
4. Implement replay as an `idle` state commit followed by a `shown` commit after the browser has rendered the reset state. Replace any pending shown commit before starting a newer replay.

## Runtime requirements

The embedded HTML starts in the durable shown state; its replay button has no behavior until the owning runtime binds it. A replay must announce the in-progress text, commit `data-state="idle"`, wait until that reset is rendered, then commit `data-state="shown"` and restore the durable status. A live reduced-motion change must cancel a pending replay and settle immediately on `shown`. Teardown must remove the binding, cancel pending work, and leave the authoritative success state shown.

## Verify

Replay repeatedly and interrupt an active replay; each run must start from the hidden baseline and finish once. Toggle reduced motion mid-replay and confirm the check and status settle immediately. After teardown, pending replay work and stale actions must not change the shown result.

## State markup and Tailwind styling

```html
<section data-state="shown" class="group flex min-h-64 flex-col items-center justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-8 text-center text-neutral-950">
  <div aria-hidden="true" class="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 opacity-0 group-data-[state=shown]:opacity-100 group-data-[state=shown]:[animation:feedback-success-check_var(--motion-duration-slow)_var(--ease-motion-spring)_both] group-data-[state=shown]:motion-reduce:animate-none">
    <svg viewBox="0 0 48 48" fill="none" class="size-10 overflow-visible">
      <path pathLength="1" d="M13 25.5 20.5 33 36 17" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="[stroke-dasharray:1] [stroke-dashoffset:1] group-data-[state=shown]:[animation:feedback-success-path_var(--motion-duration-slow)_var(--ease-motion-enter)_both] group-data-[state=shown]:motion-reduce:animate-none group-data-[state=shown]:motion-reduce:[stroke-dashoffset:0]" />
    </svg>
  </div>
  <div class="space-y-1">
    <h2 class="text-lg font-semibold">Changes saved</h2>
    <p role="status" aria-live="polite" aria-atomic="true" class="text-sm text-neutral-600">Your preferences are up to date.</p>
  </div>
  <button type="button" class="min-h-11 rounded-full bg-neutral-950 px-5 text-sm font-medium text-white transition-[background-color,scale] duration-(--motion-duration-fast) ease-motion-enter hover:bg-neutral-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 motion-reduce:transition-none motion-reduce:active:scale-100">Replay confirmation</button>
</section>
```

```css
@keyframes feedback-success-check {
  from { opacity: 0; transform: translateY(2rem) rotate(45deg); filter: blur(8px); }
  to { opacity: 1; transform: translateY(0) rotate(0); filter: blur(0); }
}

@keyframes feedback-success-path {
  from { stroke-dashoffset: 1; }
  to { stroke-dashoffset: 0; }
}
```
