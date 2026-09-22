# Number pop-in

Use this recipe for a price, balance, score, or other short value whose change deserves a compact entrance. Each glyph enters independently; choose [spinning counter](examples/transitions/text/spinning-counter.md) when the digits must visibly roll through intermediate values.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then include the recipe CSS below. The 12-character input cap keeps the final stagger at or below 440ms and the full entrance below one second. The JavaScript rebuilds only the visual clone; the `output` remains the single semantic value announced to assistive technology.

```html
<section data-demo="number-pop-in" class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-1">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Current balance</span>
    <output data-value-output aria-live="polite" class="sr-only">$1,249.30</output>
    <span data-digits aria-hidden="true" class="inline-flex min-h-12 items-baseline overflow-hidden font-mono text-4xl font-semibold tracking-tight tabular-nums">$1,249.30</span>
  </div>
  <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <label class="grid gap-2 text-sm font-medium" for="number-pop-in-value">
      Next value
      <input id="number-pop-in-value" data-value-input inputmode="decimal" maxlength="12" value="$1,314.80" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:ring-offset-zinc-950">
    </label>
    <button data-replay type="button" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950">Show value</button>
  </div>
</section>
```

```css
@keyframes number-pop-in {
  from {
    opacity: 0;
    filter: blur(2px);
    transform: translateY(0.5rem);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

@utility animate-number-pop-in {
  animation: number-pop-in var(--motion-duration-slow) var(--ease-motion-spring) both;
  animation-delay: calc(var(--digit-index, 0) * 40ms);

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const input = root.querySelector("[data-value-input]");
  const output = root.querySelector("[data-value-output]");
  const digits = root.querySelector("[data-digits]");
  const replayButton = root.querySelector("[data-replay]");

  function renderValue(value, shouldAnimate) {
    const fragment = document.createDocumentFragment();

    Array.from(value).forEach((character, index) => {
      const glyph = document.createElement("span");
      glyph.className = shouldAnimate ? "inline-block animate-number-pop-in" : "inline-block";
      glyph.style.setProperty("--digit-index", String(index));
      glyph.textContent = character === " " ? "\u00a0" : character;
      fragment.appendChild(glyph);
    });

    digits.replaceChildren(fragment);
    output.textContent = value;
  }

  function replay() {
    const value = input.value.trim() || "0";
    renderValue(value, !motionQuery.matches);
  }

  function handleMotionChange(event) {
    if (event.matches) renderValue(output.textContent, false);
  }

  replayButton.addEventListener("click", replay, { signal: controller.signal });
  motionQuery.addEventListener("change", handleMotionChange);
  renderValue(output.textContent, false);

  return function cleanup() {
    controller.abort();
    motionQuery.removeEventListener("change", handleMotionChange);
    digits.replaceChildren(output.textContent);
  };
}
```

## Checks

- Initial: `$1,249.30` is visible and available as one semantic value; no entrance runs during mount.
- Action: entering a value and choosing **Show value** rebuilds one visual glyph per character and staggers their entrance.
- Final: every glyph rests sharp at its baseline and the live `output` announces the complete value once.
- Replay and cleanup: rapid clicks replace the previous glyphs without timers; cleanup removes both listeners and restores plain visual text.
- Reduced motion: changing the live preference during a replay removes the animation immediately and preserves the final value.
- Accessibility: the visual glyph group is hidden from assistive technology, the named button has a 44px target and visible focus, and typed content reaches the DOM through `textContent`.
