# Spinning counter

Implement this for an infrequent milestone represented by a short ASCII integer. Send localized, signed, decimal, or currency values through [number pop-in](directions/transitions/text/number-pop-in.md) unless normalization happens outside the reel.

## Implement and adapt

1. Validate before building DOM. The example removes non-ASCII digits, keeps six, and falls back to zero. Six digits across four rendered cycles limit the clone to 240 cells and the last stagger to 200ms.
2. Keep `output` as the single polite live value and the reel as an `aria-hidden` clone. Do not expose intermediate cells. Set final strings with `textContent`; localized digits need deliberate semantic formatting and reel mapping.
3. Merge the utilities after [the shared motion tokens](assets/transitions/motion.css). Build one column per digit and insert all columns before measuring. Use two frames: first read live cell height, then apply transforms so the initial state paints.
4. Target three full cycles plus the final digit. Compute settlement from current `--motion-duration-slow` plus the actual last column delay so JavaScript follows CSS overrides.
5. Store latest `pendingValue`. Before every spin, preference change, or cleanup, cancel queued frames and the timer. Settlement collapses to static text and announces the value once.
6. A live reduced-motion change commits `pendingValue` immediately. Cleanup aborts listeners, removes the media-query listener, cancels work, and leaves static text.

## Verify

Test zero, leading-zero policy, one and six digits, rejected non-digits, 240-cell bound, measured height, computed delay, rapid spins, reduced motion before frames and settlement, one announcement, and cleanup/remount without stale work.

## Complete example

```html
<section data-demo="spinning-counter" class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--reel-cell:3rem] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-1">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Team score</span>
    <output data-counter-output aria-live="polite" class="sr-only">128</output>
    <span data-reel aria-hidden="true" class="inline-flex h-(--reel-cell) items-start overflow-hidden font-mono text-4xl font-semibold leading-(--reel-cell) tabular-nums">128</span>
  </div>
  <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <label class="grid gap-2 text-sm font-medium" for="spinning-counter-value">
      Next score
      <input id="spinning-counter-value" data-counter-input inputmode="numeric" pattern="[0-9]*" maxlength="6" value="256" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:ring-offset-zinc-950">
    </label>
    <button data-spin type="button" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Spin counter</button>
  </div>
</section>
```
```css
@utility text-reel-column {
  width: 1ch;
  height: var(--reel-cell);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%);
}

@utility text-reel-strip {
  display: flex;
  flex-direction: column;
  transition-property: transform;
  transition-duration: var(--motion-duration-slow);
  transition-delay: calc(var(--reel-index, 0) * 40ms);
  transition-timing-function: var(--ease-motion-enter);
  will-change: transform;

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 0ms;
    transition-delay: 0ms;
  }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const input = root.querySelector("[data-counter-input]");
  const output = root.querySelector("[data-counter-output]");
  const reel = root.querySelector("[data-reel]");
  const spinButton = root.querySelector("[data-spin]");
  const reelCycles = 3;
  const reelStaggerMs = 40;
  let animationFrames = [];
  let settleTimer;
  let pendingValue = output.textContent;

  function readDurationMs(name, fallbackMs) {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return fallbackMs;
    return value.endsWith("s") && !value.endsWith("ms") ? amount * 1000 : amount;
  }

  function cancelMotion() {
    animationFrames.forEach((frame) => window.cancelAnimationFrame(frame));
    animationFrames = [];
    window.clearTimeout(settleTimer);
    settleTimer = undefined;
  }

  function renderStatic(value) {
    cancelMotion();
    reel.textContent = value;
    output.textContent = value;
  }

  function buildReels(value) {
    const fragment = document.createDocumentFragment();
    const strips = [];

    Array.from(value).forEach((character, columnIndex) => {
      const column = document.createElement("span");
      const strip = document.createElement("span");
      column.className = "text-reel-column block";
      strip.className = "text-reel-strip";
      strip.style.setProperty("--reel-index", String(columnIndex));

      for (let cycle = 0; cycle <= reelCycles; cycle += 1) {
        for (let digit = 0; digit <= 9; digit += 1) {
          const cell = document.createElement("span");
          cell.className = "flex h-(--reel-cell) items-center justify-center";
          cell.textContent = String(digit);
          strip.appendChild(cell);
        }
      }

      column.appendChild(strip);
      fragment.appendChild(column);
      strips.push({ strip, targetDigit: Number(character) });
    });

    reel.replaceChildren(fragment);
    return strips;
  }

  function spin() {
    const value = input.value.replace(/\D/g, "").slice(0, 6) || "0";
    pendingValue = value;
    cancelMotion();

    if (motionQuery.matches) {
      renderStatic(value);
      return;
    }

    const strips = buildReels(value);
    const firstFrame = window.requestAnimationFrame(() => {
      const cellHeightPx = reel.getBoundingClientRect().height;
      const secondFrame = window.requestAnimationFrame(() => {
        strips.forEach(({ strip, targetDigit }) => {
          const targetIndex = reelCycles * 10 + targetDigit;
          strip.style.transform = `translateY(${-targetIndex * cellHeightPx}px)`;
        });
      });
      animationFrames.push(secondFrame);
    });
    animationFrames.push(firstFrame);

    const lastDelayMs = Math.max(0, strips.length - 1) * reelStaggerMs;
    settleTimer = window.setTimeout(() => {
      renderStatic(pendingValue);
    }, readDurationMs("--motion-duration-slow", 400) + lastDelayMs);
  }

  function handleMotionChange(event) {
    if (event.matches) renderStatic(pendingValue);
  }

  spinButton.addEventListener("click", spin, { signal: controller.signal });
  motionQuery.addEventListener("change", handleMotionChange);
  renderStatic(output.textContent);

  return function cleanup() {
    controller.abort();
    motionQuery.removeEventListener("change", handleMotionChange);
    renderStatic(output.textContent);
  };
}
```
