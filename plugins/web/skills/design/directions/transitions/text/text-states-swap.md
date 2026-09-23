# Text states swap

Implement this for one compact label replacing another in the same footprint. Accumulating prose belongs to [streaming text](directions/transitions/text/streaming-text.md).

## Implement and adapt

1. Keep the semantic `output` as the single polite live value and the animated span as an `aria-hidden` clone. Assign complete Unicode strings to both; no character segmentation is needed because the label moves as one unit.
2. Reserve height for the longest expected localized label. Copy the Tailwind CSS 4.3 utility after [the shared motion tokens](assets/transitions/motion.css), retaining the fast token for this frequent state change.
3. Represent the visual phase with `data-phase="idle"`, `exiting`, or `entering`. Store the latest requested label separately from the committed label and invalidate every older completion callback when a new request arrives.
4. On a request, restart `exiting` through a keyed render or equivalent animation reset. When that animation ends for the current request, commit the latest label to the semantic and visual nodes once, then enter `entering`; return to `idle` when entrance ends. A request during either phase starts a new exit toward the newest pending label.
5. When reduced motion becomes active, cancel phase completion work, commit the latest pending label immediately, and return to `idle`. On cleanup, unsubscribe from preference and animation events, invalidate pending work, remove the phase, and synchronize the visual clone from the semantic output.

## Markup and Tailwind CSS

The buttons stand in for real application events; the label text must come from application state rather than a `data-*` payload.

```html
<section class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-2">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Document status</span>
    <output id="document-status" aria-live="polite" class="sr-only">Ready to save</output>
    <span aria-hidden="true" data-phase="idle" class="text-state-swap inline-block min-h-8 text-xl font-semibold">Ready to save</span>
  </div>
  <div class="flex flex-wrap gap-3">
    <button type="button" aria-controls="document-status" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Show saving</button>
    <button type="button" aria-controls="document-status" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Show saved</button>
  </div>
</section>
```

```css
@keyframes text-state-exit {
  to {
    opacity: 0;
    filter: blur(2px);
    transform: translateY(-0.25rem);
  }
}

@keyframes text-state-enter {
  from {
    opacity: 0;
    filter: blur(2px);
    transform: translateY(0.25rem);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

@utility text-state-swap {
  &[data-phase="exiting"] {
    animation: text-state-exit var(--motion-duration-fast) var(--ease-motion-exit) both;
  }

  &[data-phase="entering"] {
    animation: text-state-enter var(--motion-duration-fast) var(--ease-motion-enter) both;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}
```

## Runtime behavior

The application must keep a monotonically increasing request identity or equivalent stale-completion guard. Each request records the newest pending label, cancels completion handling and its deadline for the prior identity, and restarts exit even when the visual is already `exiting`. Only the current identity may commit the pending label, update the live `output`, start entrance, or return to idle. Apply the timing and cancellation rules from the [shared transition completion contract](directions/transition.md#adapt-the-selected-recipe) to each phase: accept only the current visual's expected animation completion, arm a cancellable fallback deadline guarded by the same request identity, and complete the phase immediately when its computed total is zero. Key or replace the visual node when the framework cannot both restart the phase and scope completion to the current node. Reduced motion and teardown must cancel both phase completions and deadlines before synchronously settling to the latest intended label.

## Verify

Exercise every state, repeated and rapidly alternating requests, interruptions during exit and entrance, reduced motion during either phase, Unicode and longest localized labels, one announcement of only the committed state, cleanup/remount, and stable surrounding layout.
