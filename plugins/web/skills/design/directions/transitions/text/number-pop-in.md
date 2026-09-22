# Number pop-in

Implement this for a short formatted value whose final glyphs enter independently. Choose [spinning counter](directions/transitions/text/spinning-counter.md) only when rolling through intermediate digits matters.

## Implement and adapt

1. Format and validate upstream. Keep `output` as the single polite live value and the glyph container as an `aria-hidden` clone. Write both with `textContent`.
2. Build the clone in a `DocumentFragment`, assign numeric `--digit-index`, and replace children once. `Array.from` fits bounded numeric formatting characters. For arbitrary text, use `Intl.Segmenter` or the consumer's grapheme utility so emoji and combining marks stay intact.
3. Merge the utility after [the shared motion tokens](assets/transitions/motion.css). Keep class names literal. The 12-character cap bounds the last 40ms stagger to 440ms; with the 400ms entrance, settlement is within 840ms. Recalculate the cap when timing changes.
4. Replay by rebuilding the latest value. Replacing nodes cancels old CSS animations without a timer. Update the semantic output once per accepted value.
5. A live reduced-motion change rebuilds the current value without animation. Cleanup aborts listeners, removes the media-query listener, and replaces the clone with plain current text.

## Verify

Test signs, separators, decimals, spaces, empty fallback, cap, grapheme-safe adaptation, one announcement, calculated stagger, rapid replay, reduced motion mid-entrance, cleanup/remount, baseline alignment, and no layout shift.

## Complete example

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
