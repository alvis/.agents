# Spinning counter

Use this recipe when a score, total, or milestone should roll through digits before landing. Every numeric column is an independent clipped reel; choose [number pop-in](examples/transitions/text/number-pop-in.md) for a quieter update that enters only the final glyphs.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then include the recipe CSS below. The six-digit input cap bounds the visual clone at 240 reel cells and the final column delay at 200ms; format currencies or decimals outside this ceremonial pattern.

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

## Checks

- Initial: `128` is visible as plain tabular text and exposed as one semantic value; mount does not spin it.
- Action: **Spin counter** creates one clipped four-cycle reel per digit, staggers columns by 40ms and lands on the sanitized target.
- Final: the reels collapse back to plain text and the live `output` announces the complete number once.
- Replay and cleanup: rapid spins cancel queued frames and the settle timer before building the latest reels; cleanup cancels the same work and restores static text.
- Reduced motion: enabling the live preference during a spin immediately replaces every reel with its intended final digit.
- Accessibility: all intermediate digits sit inside one `aria-hidden` visual clone, the named button has a 44px target and visible focus, and only digits accepted by the bounded input reach the counter.
