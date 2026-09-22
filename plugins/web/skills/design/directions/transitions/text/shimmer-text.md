# Shimmer text

Implement this for a short status whose end time is unknown. If progress is measurable, expose progress instead of an endless shimmer.

## Implement and adapt

1. Keep one semantic status and one decorative copy. The `role="status"` wrapper contains the screen-reader text once; the shimmering span stays `aria-hidden`. When the status changes, assign the same Unicode string to both nodes with `textContent`.
2. Merge the CSS after [the shared motion tokens](assets/transitions/motion.css). Preserve the solid `--shimmer-base` fallback under the clipped gradient. Tune the two-second loop only if the result remains calm and legible.
3. Keep the pause button for this persistent animation. `renderControl()` remains the single writer for the paused dataset, disabled state, pressed state, and label after user input and every live motion-preference change.
4. Reduced motion removes the gradient, renders readable solid text, and disables the irrelevant pause action with the meaningful label “Motion reduced.” Retain this behavior when the preference changes during animation.
5. Cleanup aborts DOM listeners, removes the media-query listener, and leaves the visual paused. Pause and resume must not allocate timers or duplicate listeners.

## Verify

Confirm one status announcement, an ignored visual copy, readable light/dark text, repeatable pause/resume, a solid live reduced-motion state, and no mutation after cleanup.

## Complete example

```html
<section data-demo="shimmer-text" class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--shimmer-base:var(--color-zinc-500)] [--shimmer-highlight:var(--color-zinc-950)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:[--shimmer-base:var(--color-zinc-400)] dark:[--shimmer-highlight:var(--color-white)]">
  <div role="status" class="min-h-10">
    <span class="sr-only">Planning the next steps</span>
    <span data-shimmer aria-hidden="true" class="animate-shimmer-text inline-block text-2xl font-semibold" data-paused="false">Planning the next steps</span>
  </div>
  <button data-pause type="button" aria-pressed="false" class="min-h-11 justify-self-start rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Pause shimmer</button>
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

  &[data-paused="true"] {
    animation-play-state: paused;
  }

  @media (prefers-reduced-motion: reduce) {
    color: var(--shimmer-base);
    background-image: none;
    -webkit-text-fill-color: currentColor;
    animation: none;
  }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const shimmer = root.querySelector("[data-shimmer]");
  const pauseButton = root.querySelector("[data-pause]");
  let isPaused = false;

  function renderControl() {
    const isMotionReduced = motionQuery.matches;
    shimmer.dataset.paused = String(isPaused || isMotionReduced);
    pauseButton.disabled = isMotionReduced;
    pauseButton.setAttribute("aria-pressed", String(isPaused));
    pauseButton.textContent = isMotionReduced ? "Motion reduced" : isPaused ? "Resume shimmer" : "Pause shimmer";
  }

  function togglePause() {
    isPaused = !isPaused;
    renderControl();
  }

  pauseButton.addEventListener("click", togglePause, { signal: controller.signal });
  motionQuery.addEventListener("change", renderControl);
  renderControl();

  return function cleanup() {
    controller.abort();
    motionQuery.removeEventListener("change", renderControl);
    shimmer.dataset.paused = "true";
  };
}
```
