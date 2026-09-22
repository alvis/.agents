# Reasoning stream

Implement this as a compact visual preview of continuing activity. Expose the complete transcript or a concise process summary once; do not make each automatic step live.

## Implement and adapt

1. Render one visual source inside the masked `aria-hidden` viewport and one semantic transcript outside it. Announce meaningful phase changes through one separate application status node, never through the looping reel.
2. Keep every visual row at a fixed line height. After mount, clone the source exactly once and measure the live row line height and copy height. For wrapping or variable-height rows, replace fixed-line stepping with measured child offsets.
3. Merge the utilities after [the shared motion tokens](assets/transitions/motion.css). Keep `--reason-lines` a positive whole step. The 840ms hold makes two lines readable before the shared 250ms move; adjust both together and verify readability.
4. Clear hold and wrap timers before restart, preference changes, and cleanup. At the measured copy height, disable transition for the modulo reset, force layout, restore transition, then schedule the next hold.
5. Keep pause and restart controls. Reduced motion clears timers, resets to a meaningful static state, and disables motion-only controls. Adapt the reset row if another state better represents current progress.
6. Cleanup aborts listeners, removes the media-query listener, clears timers, removes the clone, and resets the original. Remounting must not accumulate clones.

## Verify

Confirm one clone, exact step distance, seamless wrap, readable timing, pause/resume/restart, no clipping, no repeated announcements, reduced motion during hold and movement, and cleanup/remount with no surviving timers or clones.

## Complete example

```html
<section data-demo="reasoning-stream" class="grid max-w-lg gap-5 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--reason-fade:1.75rem] [--reason-hold:840ms] [--reason-lines:2] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-1">
    <h2 class="text-base font-semibold">Process activity</h2>
    <p class="sr-only">Reviewing the request. Mapping the constraints. Comparing available patterns. Checking interaction states. Verifying keyboard behavior. Applying motion preferences. Preparing the final result. Completing validation.</p>
  </div>
  <div data-viewport aria-hidden="true" class="reasoning-stream-mask relative h-36 overflow-hidden rounded-xl bg-zinc-100 px-4 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
    <div data-scroll class="reasoning-stream-motion absolute inset-x-4 top-0">
      <div data-copy>
        <p class="h-6 leading-6">Reviewing the request</p>
        <p class="h-6 leading-6">Mapping the constraints</p>
        <p class="h-6 leading-6">Comparing available patterns</p>
        <p class="h-6 leading-6">Checking interaction states</p>
        <p class="h-6 leading-6">Verifying keyboard behavior</p>
        <p class="h-6 leading-6">Applying motion preferences</p>
        <p class="h-6 leading-6">Preparing the final result</p>
        <p class="h-6 leading-6">Completing validation</p>
      </div>
    </div>
  </div>
  <div class="flex flex-wrap gap-3">
    <button data-pause type="button" aria-pressed="false" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950">Pause activity</button>
    <button data-restart type="button" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Restart activity</button>
  </div>
</section>
```
```css
@utility reasoning-stream-mask {
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, black var(--reason-fade), black calc(100% - var(--reason-fade)), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, black var(--reason-fade), black calc(100% - var(--reason-fade)), transparent 100%);
}

@utility reasoning-stream-motion {
  transition-property: transform;
  transition-duration: var(--motion-duration-normal);
  transition-timing-function: var(--ease-motion-enter);

  &[data-reset="true"] {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transform: none !important;
    transition: none;
  }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scroll = root.querySelector("[data-scroll]");
  const sourceCopy = root.querySelector("[data-copy]");
  const pauseButton = root.querySelector("[data-pause]");
  const restartButton = root.querySelector("[data-restart]");
  const visualClone = sourceCopy.cloneNode(true);
  let holdTimer;
  let wrapTimer;
  let offsetPx = 0;
  let isPaused = false;

  visualClone.removeAttribute("data-copy");
  scroll.appendChild(visualClone);

  function readCustomNumber(name, fallback) {
    const value = Number.parseFloat(getComputedStyle(root).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function readDurationMs(name, fallbackMs) {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return fallbackMs;
    return value.endsWith("s") && !value.endsWith("ms") ? amount * 1000 : amount;
  }

  function clearTimers() {
    window.clearTimeout(holdTimer);
    window.clearTimeout(wrapTimer);
    holdTimer = undefined;
    wrapTimer = undefined;
  }

  function resetPosition() {
    offsetPx = 0;
    scroll.dataset.reset = "true";
    scroll.style.transform = "translateY(0)";
    void scroll.offsetWidth;
    scroll.dataset.reset = "false";
  }

  function scheduleStep() {
    if (isPaused || motionQuery.matches) return;
    const holdDurationMs = readDurationMs("--reason-hold", 840);
    holdTimer = window.setTimeout(advance, holdDurationMs);
  }

  function advance() {
    holdTimer = undefined;
    const lineHeightPx = Number.parseFloat(getComputedStyle(sourceCopy.firstElementChild).lineHeight) || 24;
    const stepDistancePx = lineHeightPx * readCustomNumber("--reason-lines", 2);
    const copyHeightPx = sourceCopy.getBoundingClientRect().height;
    offsetPx += stepDistancePx;
    scroll.style.transform = `translateY(${-offsetPx}px)`;

    wrapTimer = window.setTimeout(() => {
      wrapTimer = undefined;
      if (offsetPx >= copyHeightPx) {
        offsetPx %= copyHeightPx;
        scroll.dataset.reset = "true";
        scroll.style.transform = `translateY(${-offsetPx}px)`;
        void scroll.offsetWidth;
        scroll.dataset.reset = "false";
      }
      scheduleStep();
    }, readDurationMs("--motion-duration-normal", 250));
  }

  function renderControls() {
    const isMotionReduced = motionQuery.matches;
    pauseButton.disabled = isMotionReduced;
    restartButton.disabled = isMotionReduced;
    pauseButton.setAttribute("aria-pressed", String(isPaused));
    pauseButton.textContent = isMotionReduced ? "Motion reduced" : isPaused ? "Resume activity" : "Pause activity";
  }

  function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
      window.clearTimeout(holdTimer);
      holdTimer = undefined;
    }
    renderControls();
    if (!isPaused && wrapTimer === undefined) scheduleStep();
  }

  function restart() {
    clearTimers();
    resetPosition();
    scheduleStep();
  }

  function handleMotionChange(event) {
    clearTimers();
    if (event.matches) resetPosition();
    renderControls();
    scheduleStep();
  }

  pauseButton.addEventListener("click", togglePause, { signal: controller.signal });
  restartButton.addEventListener("click", restart, { signal: controller.signal });
  motionQuery.addEventListener("change", handleMotionChange);
  renderControls();
  scheduleStep();

  return function cleanup() {
    controller.abort();
    motionQuery.removeEventListener("change", handleMotionChange);
    clearTimers();
    visualClone.remove();
    resetPosition();
  };
}
```
