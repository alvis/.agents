# Number pop-in

Implement this for a short formatted value whose final glyphs enter independently. Choose [spinning counter](directions/transitions/text/spinning-counter.md) only when rolling through intermediate digits matters.

## Implement and adapt

1. Format and validate the value upstream. Keep `output` as the single polite live value and the glyph container as an `aria-hidden` clone; update both from the same accepted value.
2. Segment the clone into grapheme clusters, create one child per cluster, assign a zero-based `--digit-index`, and replace the clone in one render. A simple character iterator is sufficient only for the stated numeric-formatting character set.
3. Copy the Tailwind CSS 4.3 `@utility` block after [the shared motion tokens](assets/transitions/motion.css). The 12-character cap bounds the last 40ms stagger to 440ms; with the 400ms entrance, settlement stays within 840ms. Recalculate the cap when either timing changes.
4. Replay by replacing the visual children from the latest accepted value; replacing them restarts their CSS animations without a completion timer. Update the semantic output once per accepted value, even if the same visual value is replayed.
5. Let the reduced-motion media rule reveal every current glyph without animation; this recipe needs no preference listener. On cleanup, cancel any queued render and leave the clone as complete plain text.

## Markup

The sample starts settled. The application replaces the visual text with indexed spans when it accepts a new value.

```html
<section class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-1">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Current balance</span>
    <output id="balance-value" aria-live="polite" class="sr-only">$1,249.30</output>
    <span aria-hidden="true" class="inline-flex min-h-12 items-baseline overflow-hidden font-mono text-4xl font-semibold tracking-tight tabular-nums">$1,249.30</span>
  </div>
  <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <label class="grid gap-2 text-sm font-medium" for="next-balance">
      Next value
      <input id="next-balance" inputmode="decimal" maxlength="12" value="$1,314.80" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:ring-offset-zinc-950">
    </label>
    <button type="button" aria-controls="balance-value" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950">Show value</button>
  </div>
</section>
```

Use this shape for generated visual children; the `aria-hidden` parent keeps them out of the accessibility tree.

```html
<span aria-hidden="true" class="inline-flex min-h-12 items-baseline overflow-hidden font-mono text-4xl font-semibold tracking-tight tabular-nums">
  <span class="animate-number-pop-in inline-block [--digit-index:0]">$</span>
  <span class="animate-number-pop-in inline-block [--digit-index:1]">1</span>
  <span class="animate-number-pop-in inline-block [--digit-index:2]">,</span>
</span>
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

## Runtime behavior

The application must validate and format the next value, fall back to `0` only when that is the product rule, and reject or truncate values beyond the 12-cluster bound before rendering. On acceptance, it must update the live `output` once and replace the ignored clone with indexed text nodes or spans. The CSS handles a live reduced-motion change by removing animation while leaving every glyph in its complete base state. Lifecycle cleanup must invalidate any queued render and retain the current accepted value in both representations.

## Verify

Test signs, separators, decimals, spaces, empty-value policy, the 12-cluster cap, grapheme-safe adaptation, one announcement, calculated stagger, rapid replay, reduced motion mid-entrance, cleanup/remount, baseline alignment, and no layout shift.
