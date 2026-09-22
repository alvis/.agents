# Text states swap

Use this recipe when a compact label changes between discrete states, such as “Saving” and “Saved”. The outgoing value lifts away before the next value settles into the same footprint; choose [streaming text](examples/transitions/text/streaming-text.md) when content accumulates instead of replacing one state.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then include the recipe CSS below. The animated label is hidden from assistive technology so the complete state is announced once through the live `output`.

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

## Checks

- Initial: “Ready to save” occupies the stable label footprint without running an entrance.
- Action: either button sends the current label upward, then brings the selected state from below.
- Final: the visual label is sharp and stationary and the complete state is announced once.
- Replay and cleanup: clicking states rapidly cancels the earlier timer and commits only the latest choice; cleanup cancels the timer and removes all listeners.
- Reduced motion: enabling the preference during the exit immediately commits the pending state; later state changes replace text without animation.
- Accessibility: the animated label is an `aria-hidden` visual clone, buttons have distinct verb-first names and visible focus, and text is assigned with `textContent`.
