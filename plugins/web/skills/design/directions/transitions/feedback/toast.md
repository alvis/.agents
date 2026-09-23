# Toast

## Implement

1. Use this pattern only for a transient, non-blocking result. Put the complete result in a polite `role="status"` region, give the close button a specific label, and keep critical errors or required decisions in the page flow.
2. Import the [shared motion asset](assets/transitions/motion.css) once. Preserve the `motion-reduce` utilities; reduced motion removes travel, scale, blur, and transition while the five-second window still gives readers time to find the dismissal control, so runtime preference branching is unnecessary.
3. On every open, replace the prior dismissal, commit the closed state, let the browser render that reset, expose the toast, and start one fresh five-second display window. This makes replay deterministic instead of stacking dismissals.
4. Pause dismissal on pointer or focus entry by storing the remaining time from a deadline. Resume only after both have left; ignore focus moves between descendants.
5. On direct dismissal, return focus to the launch button before closing. Auto-dismissal must never move focus.

## Runtime requirements

The embedded HTML shows the closed state and Tailwind selectors; its buttons and timeout have no behavior until the owning runtime binds them. Opening must invalidate the previous display window, render a closed baseline, then atomically remove `inert`, set `aria-hidden="false"`, and set `data-open="true"` before replacing the nested status content and scheduling dismissal. Pointer entry and focus entry pause the same remaining-time budget; dismissal resumes only when neither remains inside. Direct dismissal restores focus to the launcher before setting `inert`, `aria-hidden="true"`, and `data-open="false"`; automatic dismissal closes without moving focus. Reopening during exit replaces the exit and starts a full window. Teardown must cancel dismissal, remove all bindings, reset pointer and focus tracking, and leave the toast closed and inert.

## Verify

Open repeatedly, then pause and resume with pointer and keyboard focus. Confirm each open replaces the dismissal window, descendant focus moves do not resume it, direct dismissal restores focus, and reduced motion removes movement without removing the result. After teardown, pending dismissal and stale interaction events must not change the closed toast.

## State markup and Tailwind styling

```html
<section class="relative flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50 p-6 text-neutral-950">
  <button type="button" class="min-h-11 rounded-full bg-neutral-950 px-5 text-sm font-medium text-white transition-[background-color,scale] duration-(--motion-duration-fast) ease-motion-enter hover:bg-neutral-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 motion-reduce:transition-none motion-reduce:active:scale-100">Show save confirmation</button>
  <div data-open="false" aria-hidden="true" inert class="absolute inset-x-4 bottom-4 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg transition-[opacity,translate,scale,filter] duration-(--motion-duration-normal) ease-motion-enter data-[open=false]:pointer-events-none data-[open=false]:translate-y-4 data-[open=false]:scale-[0.97] data-[open=false]:opacity-0 data-[open=false]:blur-[2px] data-[open=true]:duration-(--motion-duration-slow) motion-reduce:translate-none motion-reduce:scale-100 motion-reduce:blur-none motion-reduce:transition-none">
    <span aria-hidden="true" class="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="m5 10 3 3 7-7" /></svg>
    </span>
    <div role="status" aria-live="polite" aria-atomic="true" class="min-w-0 flex-1">
      <p class="text-sm font-medium">Project saved</p>
      <p class="text-sm text-neutral-600">Your latest changes are available.</p>
    </div>
    <button type="button" aria-label="Dismiss save confirmation" class="grid size-11 shrink-0 place-items-center rounded-full text-neutral-500 transition-colors duration-(--motion-duration-fast) hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4"><path stroke-linecap="round" d="m5 5 10 10M15 5 5 15" /></svg>
    </button>
  </div>
</section>
```
