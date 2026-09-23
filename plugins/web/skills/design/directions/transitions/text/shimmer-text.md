# Shimmer text

Implement this for a short status whose end time is unknown. If progress is measurable, expose progress instead of an endless shimmer.

## Implement and adapt

1. Keep one semantic status and one decorative copy. The `role="status"` wrapper contains the screen-reader text once; the shimmering span stays `aria-hidden`. Update both from the same Unicode string.
2. Copy the Tailwind CSS 4.3 utility after [the shared motion tokens](assets/transitions/motion.css). Preserve the solid `--shimmer-base` fallback under the clipped gradient. Change the two-second loop only when the result remains calm and legible.
3. Use a native checkbox for pause state. Its checked state persists without scripting, the label keeps a stable accessible name, and `peer-checked` pauses the decorative animation.
4. Reduced motion removes the gradient, renders readable solid text, and hides both the motion-only checkbox and its label. The browser applies this live without an application preference listener.
5. Updating the status text still requires the application to set the semantic and decorative strings from the same state. No runtime work is required for pause, resume, reduced motion, or cleanup.

## Markup and Tailwind CSS

```html
<section class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--shimmer-base:var(--color-zinc-500)] [--shimmer-highlight:var(--color-zinc-950)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:[--shimmer-base:var(--color-zinc-400)] dark:[--shimmer-highlight:var(--color-white)]">
  <span id="planning-status" role="status" class="sr-only">Planning the next steps</span>
  <input id="pause-planning-shimmer" type="checkbox" class="peer sr-only motion-reduce:hidden">
  <span aria-hidden="true" class="animate-shimmer-text inline-block min-h-10 text-2xl font-semibold peer-checked:[animation-play-state:paused]">Planning the next steps</span>
  <label for="pause-planning-shimmer" class="min-h-11 cursor-pointer justify-self-start rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2 motion-reduce:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:peer-focus-visible:ring-offset-zinc-950">Pause shimmer</label>
</section>
```

```css
@keyframes shimmer-text {
  from { background-position: 100% 0; }
  to { background-position: 0 0; }
}

@utility animate-shimmer-text {
  color: transparent;
  background-image: linear-gradient(90deg, var(--shimmer-base) 0%, var(--shimmer-base) 35%, var(--shimmer-highlight) 50%, var(--shimmer-base) 65%, var(--shimmer-base) 100%);
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer-text 2s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    color: var(--shimmer-base);
    background-image: none;
    -webkit-text-fill-color: currentColor;
    animation: none;
  }
}
```

## Runtime behavior

The native checkbox and Tailwind variants own pause and reduced-motion behavior; do not replace them with a scripted button. When application status changes, update the `role="status"` text and the ignored decorative copy together. Keep the checkbox mounted across status updates so a user's pause choice is retained.

## Verify

Confirm one status announcement, an ignored visual copy, readable light and dark text, keyboard and pointer pause toggling, retained checked state across live preference changes, a hidden motion-only control and solid text under reduced motion, and no runtime listener requirement.
