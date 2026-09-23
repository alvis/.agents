# Banner stacking

## Implement and adapt

1. Complete [Transition design](directions/transition.md), then import [motion.css](assets/transitions/motion.css) once after Tailwind CSS 4.3 or newer and merge the embedded component layer after it. Keep the banner transition limited to `transform`, `opacity`, and `filter`.
2. Preserve the list and polite live-region semantics. Give every dismiss control a notice-specific accessible name, keep “Show all” as the persistent keyboard path, and treat pointer expansion as an enhancement of the same expanded state.
3. Keep the queue newest-first and expose at most three notices because the supplied collapsed geometry provides three distinct readable depth levels. If the product needs more, retune and verify the scale, opacity, blur, z-index, and stage height together.
4. Treat the queue, pinned-open value, pointer-within value, and focus-within value as application state. Derive `data-expanded` from the three expansion inputs and derive each banner's depth, visual custom properties, `aria-hidden`, and `inert` from the queue and expanded state.
5. Measure rendered banner heights for the expanded layout. Coalesce resize, content, queue, and expansion invalidations into one scheduled rendering frame; observe both the stack and every banner because wrapping can change their heights independently.
6. Remove a banner from the logical queue before starting its visual exit. Restore focus to the next available dismiss control or Add button when the removed banner contained focus, then remove the exiting node after cancellable completion based on the computed slow duration. Do not depend exclusively on `transitionend`.
7. Keep `motion-reduce:transition-none` on every banner. A live reduced-motion change must also cancel pending entry frames and removal waits, remove exiting nodes, set survivors to their settled state, and recompute final geometry immediately.
8. On teardown, unregister actions and pointer/focus handlers, remove the media-query subscription, cancel scheduled layout and removal work, disconnect size observation, and settle pending nodes so no callback can mutate an inactive component.

## Markup and state styling

The markup below shows one settled notice in the collapsed initial state. Static HTML does not add, dismiss, expand, measure, announce, or clean up notices; the consumer must render the queue and implement the runtime requirements that follow.

```html
<section class="mx-auto w-full max-w-3xl bg-slate-100 p-4 text-slate-950 sm:p-8">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-indigo-700">Notification queue</p>
      <h2 class="text-2xl font-semibold tracking-tight">Recent activity</h2>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:active:scale-100">Add notification</button>
      <button type="button" aria-expanded="false" aria-controls="banner-stack-list" class="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold outline-none hover:border-indigo-400 hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-600 active:bg-slate-100">Show all</button>
    </div>
  </div>
  <div class="relative mt-8 min-h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <p class="max-w-md text-sm leading-6 text-slate-600">Add notices to test arrival, depth changes, overflow removal, keyboard expansion, and interruption.</p>
    <div id="banner-stack-list" data-expanded="false" role="list" aria-label="Recent notifications" style="--stack-height: 5rem" class="banner-stack relative mt-6">
      <article data-depth="0" data-state="idle" role="listitem" style="--banner-y: 0px; --banner-expanded-y: 0px; --banner-scale: 1; --banner-opacity: 1; --banner-blur: 0px; --banner-z: 10" class="banner-stack-item absolute inset-x-0 top-0 flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg transition-[transform,opacity,filter] duration-(--motion-duration-slow) ease-motion-enter motion-reduce:transition-none">
        <span aria-hidden="true" class="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">✓</span>
        <p class="min-w-0 flex-1 text-sm font-medium">Layout review is ready.</p>
        <button type="button" aria-label="Dismiss Layout review is ready" class="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 outline-none hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-600 active:bg-slate-200"><span aria-hidden="true">×</span></button>
      </article>
    </div>
  </div>
  <p class="sr-only" aria-live="polite" aria-atomic="true"></p>
</section>
```

```css
@layer components {
  .banner-stack {
    height: var(--stack-height, 5rem);
  }

  .banner-stack-item {
    z-index: var(--banner-z, 1);
    opacity: var(--banner-opacity, 1);
    filter: blur(var(--banner-blur, 0px));
    transform: translateY(var(--banner-y, 0px)) scale(var(--banner-scale, 1));
  }

  .banner-stack[data-expanded="true"] .banner-stack-item {
    opacity: 1;
    filter: blur(0);
    transform: translateY(var(--banner-expanded-y, 0px)) scale(1);
  }

  .banner-stack-item[data-state="entering"] {
    opacity: 0;
    filter: blur(2px);
    transform: translateY(3.75rem) scale(0.97);
  }

  .banner-stack-item[data-state="exiting"] {
    opacity: 0;
    filter: blur(2px);
    transform: translateY(-2.25rem) scale(0.94);
  }
}
```

## Runtime requirements

1. Render every notice from application data with a stable identity and the article structure above; set visible text as text rather than HTML. Initialize new notices with `data-state="entering"`, then change only that notice to `idle` on the next rendered frame so the entry can interpolate. Under reduced motion, render it directly as `idle`.
2. After rendering, compute each notice's cumulative expanded offset using the preceding rendered heights plus an 8px gap from the spacing grid. For collapsed depth, use 12px vertical steps, scale steps of 0.06, opacity steps of 0.28, blur steps of 1px, and descending z-index; these values keep all three permitted levels distinguishable without making the oldest level dominant. Write the results to the shown custom properties and set `--stack-height` to the active expanded or collapsed extent.
3. While collapsed, set `aria-hidden="true"` and `inert` on every notice except depth zero. While expanded, remove those restrictions from every settled notice in DOM queue order; an exiting notice remains hidden and inert.
4. Set expansion when the user pins “Show all,” when the pointer is within the stage, or when focus is within the stack. The toggle controls only the pinned value, updates `aria-expanded` and its “Show all” or “Collapse” label, and remains the keyboard path when pointer hover is unavailable. If collapse would make the focused notice unavailable, move focus to the toggle before applying `inert`.
5. Adding a fourth notice starts removal of the oldest because three is the supplied geometry limit. Adding any notice updates the polite live region once with that notice's complete message; keep the region quiet at initialization.
6. Dismissal and overflow removal update the logical queue immediately, mark the departing node `exiting`, recompute survivors, and make the departing node hidden and inert. Any delayed physical removal must be cancellable, use the computed `--motion-duration-slow`, and have a non-event fallback so an interrupted or suppressed transition cannot strand a node.
7. Coalesce geometry work to at most one rendering frame. A size observer or framework equivalent invalidates geometry when the stack or any notice resizes; stop observing a notice when its physical node is removed.
8. Subscribe to live `prefers-reduced-motion` changes only because this recipe has scheduled entry and removal work. When reduction becomes active, cancel that work, physically remove exiting nodes, settle survivors, and run one final geometry pass.
9. On teardown, cancel the coalesced frame and removal waits before disconnecting observation and handlers. Physically remove pending exit nodes or hand them back to the framework's normal unmount, and prevent every retained callback from writing later.

## Verify

| State | Acceptance check |
| --- | --- |
| Initial | One readable banner is exposed, older depths are absent, and the live region is quiet. |
| Add and overflow | Each addition is announced, enters at depth zero, and a fourth notice removes the oldest after a cancellable exit. |
| Expand and collapse | Pointer entry, focus within, or “Show all” spreads measured banners; collapse makes only the newest available and moves focus to the toggle when needed. |
| Dismiss and replay | Dismissing any available banner restores focus safely, reflows the queue, and does not prevent later entries from animating. |
| Reduced motion | Enabling reduced motion during entry or exit removes interpolation, completes every pending removal, and settles final measured positions immediately. |
| Resize and content change | Wrapped or resized banners recompute spread offsets and stage height through one scheduled frame without stale geometry. |
| Teardown | Teardown removes handlers, cancels scheduled layout, disconnects observation, clears removal work, settles pending nodes, and prevents later mutation. |
