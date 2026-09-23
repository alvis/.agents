# Texts reveal

Implement this for a short semantic message whose heading and supporting lines enter in sequence and dismiss together. Animate the real elements; no visual clone is needed.

## Implement and adapt

1. Give each semantic line `text-reveal-line` and a zero-based `--line-index`. Preserve heading and paragraph elements and insert dynamic copy as text.
2. Copy the Tailwind CSS 4.3 utilities after [the shared motion tokens](assets/transitions/motion.css). Calculate the last start as highest index × 40ms, then add the slow duration. Limit or regroup lines when that total no longer reads as one entrance.
3. Represent intent separately from phase. Showing removes `hidden`, sets `data-phase="entering"`, and restarts the line animation through the framework's keyed render or a deliberate animation restart. Hiding sets `data-phase="leaving"`; apply `hidden` only after the current exit animation ends.
4. A newer show or hide request invalidates the older completion before changing phase. Keep `aria-live="polite"` only when restoring the production message should announce the complete message as one unit.
5. When reduced motion becomes active, cancel completion work and apply `hidden` from the latest intended visibility immediately. On cleanup, unsubscribe from preference and animation events, invalidate pending work, remove transient phase styling, and preserve the latest intended visible or hidden state.

## Markup and Tailwind CSS

```html
<section class="grid max-w-lg gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div id="workspace-message" data-phase="entering" class="text-reveal-message grid gap-2" aria-live="polite">
    <h2 class="text-reveal-line text-2xl font-semibold tracking-tight [--line-index:0]">Your workspace is ready</h2>
    <p class="text-reveal-line max-w-prose text-base leading-7 text-zinc-600 [--line-index:1] dark:text-zinc-400">Invite collaborators now, or continue on your own and add them later.</p>
  </div>
  <div class="flex flex-wrap gap-3">
    <button type="button" aria-controls="workspace-message" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Replay reveal</button>
    <button type="button" aria-controls="workspace-message" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Hide message</button>
  </div>
</section>
```

```css
@keyframes texts-reveal-enter {
  from {
    opacity: 0;
    filter: blur(3px);
    transform: translateY(0.75rem);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

@keyframes texts-reveal-exit {
  to { opacity: 0; }
}

@utility text-reveal-message {
  &[data-phase="entering"] > .text-reveal-line {
    animation: texts-reveal-enter var(--motion-duration-slow) var(--ease-motion-enter) both;
    animation-delay: calc(var(--line-index, 0) * 40ms);
  }

  &[data-phase="leaving"] {
    animation: texts-reveal-exit var(--motion-duration-fast) var(--ease-motion-exit) both;
  }

  @media (prefers-reduced-motion: reduce) {
    &, & > .text-reveal-line {
      animation: none;
    }
  }
}
```

## Runtime behavior

The application must track intended visibility independently from `data-phase` and guard every completion with the current request identity. A show request cancels pending dismissal, removes `hidden`, and restarts entrance; a hide request cancels pending entrance and starts exit. Only the current exit completion may apply the native `hidden` attribute, which removes the message from layout and the accessibility tree. Because static HTML cannot delay `hidden`, do not claim dismissal is complete until this behavior is wired. If animation completion is unavailable, derive one fallback deadline from the computed fast duration and cancel it on every interruption.

## Verify

Test initial sequence, hide, replay, rapid hide and replay, calculated entrance completion, localized multiline copy, live-region behavior, reduced motion during entrance and dismissal, native removal from layout and the accessibility tree, and cleanup/remount.
