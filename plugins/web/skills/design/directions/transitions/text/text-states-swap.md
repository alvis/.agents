# Text states swap

Implement this for one compact label replacing another in the same footprint. Accumulating prose belongs to [streaming text](directions/transitions/text/streaming-text.md).

## Implement and adapt

1. Keep the semantic `output` as the single polite live value and the animated span as an `aria-hidden` clone. Set both with `textContent`; direct string assignment preserves Unicode without splitting graphemes.
2. Reserve height for the longest expected localized label. Merge both utilities after [the shared motion tokens](assets/transitions/motion.css), retaining the fast token for this frequent state change.
3. Store the latest request in `pendingState`. Clear the prior timer, remove stale classes, force layout, and exit. Read `--motion-duration-fast`; after that delay update both nodes from the latest pending value and enter.
4. If reduced motion activates during exit, clear the timer, remove classes, and commit `pendingState` immediately. Future changes replace text without animation.
5. Cleanup aborts listeners, removes the media-query listener, clears the timer, and restores the visual from the semantic output. Framework effects need the same stale-completion guard.

## Verify

Exercise every state, repeated and rapidly alternating requests, reduced motion during exit, Unicode and longest localized labels, one announcement of only the committed state, cleanup/remount, and stable surrounding layout.

## Complete example

```html
<section data-demo="text-states-swap" class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-2">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Document status</span>
    <output data-state-output aria-live="polite" class="sr-only">Ready to save</output>
    <span data-state-visual aria-hidden="true" class="inline-block min-h-8 text-xl font-semibold">Ready to save</span>
  </div>
  <div class="flex flex-wrap gap-3">
    <button data-state="Saving changes" type="button" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Show saving</button>
    <button data-state="Changes saved" type="button" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Show saved</button>
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

@utility animate-text-state-exit {
  animation: text-state-exit var(--motion-duration-fast) var(--ease-motion-exit) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}

@utility animate-text-state-enter {
  animation: text-state-enter var(--motion-duration-fast) var(--ease-motion-enter) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const output = root.querySelector("[data-state-output]");
  const visual = root.querySelector("[data-state-visual]");
  const stateButtons = root.querySelectorAll("[data-state]");
  let exitTimer;
  let pendingState = output.textContent;

  function readDurationMs(name, fallbackMs) {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return fallbackMs;
    return value.endsWith("s") && !value.endsWith("ms") ? amount * 1000 : amount;
  }

  function clearExitTimer() {
    window.clearTimeout(exitTimer);
    exitTimer = undefined;
  }

  function showState(nextState) {
    clearExitTimer();
    pendingState = nextState;
    visual.classList.remove("animate-text-state-enter", "animate-text-state-exit");

    if (motionQuery.matches) {
      visual.textContent = nextState;
      output.textContent = nextState;
      return;
    }

    void visual.offsetWidth;
    visual.classList.add("animate-text-state-exit");
    exitTimer = window.setTimeout(() => {
      visual.textContent = pendingState;
      output.textContent = pendingState;
      visual.classList.remove("animate-text-state-exit");
      void visual.offsetWidth;
      visual.classList.add("animate-text-state-enter");
      exitTimer = undefined;
    }, readDurationMs("--motion-duration-fast", 150));
  }

  function handleMotionChange(event) {
    if (!event.matches) return;
    clearExitTimer();
    visual.classList.remove("animate-text-state-enter", "animate-text-state-exit");
    visual.textContent = pendingState;
    output.textContent = pendingState;
  }

  stateButtons.forEach((button) => {
    button.addEventListener("click", () => showState(button.dataset.state), { signal: controller.signal });
  });
  motionQuery.addEventListener("change", handleMotionChange);

  return function cleanup() {
    controller.abort();
    motionQuery.removeEventListener("change", handleMotionChange);
    clearExitTimer();
    visual.classList.remove("animate-text-state-enter", "animate-text-state-exit");
    visual.textContent = output.textContent;
  };
}
```
