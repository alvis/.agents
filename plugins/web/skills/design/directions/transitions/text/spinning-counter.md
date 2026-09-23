# Spinning counter

Implement this for an infrequent milestone represented by a short ASCII integer. Send localized, signed, decimal, or currency values through [number pop-in](directions/transitions/text/number-pop-in.md) unless normalization happens outside the reel.

## Implement and adapt

1. Validate before building the visual clone. Accept at most six ASCII digits and define the product's leading-zero and empty-input policies. Six digits across four rendered cycles limit the clone to 240 cells and the last stagger to 200ms.
2. Keep `output` as the single polite live value and the reel as an `aria-hidden` clone. Never expose intermediate cells. Localized digits require deliberate semantic formatting and a separately tested reel mapping.
3. Copy the Tailwind CSS 4.3 utilities after [the shared motion tokens](assets/transitions/motion.css). Build one column per digit and render all columns before measuring an actual cell height. Each strip records its zero-based `--reel-index` and a pixel `--reel-target-offset` derived from the measured cell.
4. Render three full cycles plus the final digit. Start each strip at zero, wait until that state has painted, then set `data-spinning="true"`; the CSS moves to the measured target and applies the column stagger.
5. Keep the latest value pending and invalidate older frame and completion work before every spin, preference change, or cleanup. Settle from the last strip's transition completion, collapse the reel to static text, and update the semantic output once.
6. When reduced motion becomes active, commit the latest pending value immediately. On cleanup, unsubscribe from preference and transition events, cancel scheduled paint work, and leave matching static semantic and visual text.

## Markup and Tailwind CSS

The sample starts settled. The application replaces the visual text with measured reel columns only while a spin is active.

```html
<section class="grid max-w-md gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--reel-cell:3rem] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-1">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Team score</span>
    <output id="team-score" aria-live="polite" class="sr-only">128</output>
    <span aria-hidden="true" class="inline-flex h-(--reel-cell) items-start overflow-hidden font-mono text-4xl font-semibold leading-(--reel-cell) tabular-nums">128</span>
  </div>
  <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <label class="grid gap-2 text-sm font-medium" for="next-score">
      Next score
      <input id="next-score" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="256" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:ring-offset-zinc-950">
    </label>
    <button type="button" aria-controls="team-score" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Spin counter</button>
  </div>
</section>
```

Each generated strip uses this state shape; generate the full cell sequence at runtime rather than copying a partial sequence from documentation.

```html
<span class="text-reel-column block">
  <span data-spinning="false" class="text-reel-strip [--reel-index:0] [--reel-target-offset:1440px]">
    <span class="flex h-(--reel-cell) items-center justify-center">0</span>
  </span>
</span>
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
  transform: translateY(0);
  transition-property: transform;
  transition-duration: var(--motion-duration-slow);
  transition-delay: calc(var(--reel-index, 0) * 40ms);
  transition-timing-function: var(--ease-motion-enter);
  will-change: transform;

  &[data-spinning="true"] {
    transform: translateY(calc(-1 * var(--reel-target-offset)));
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 0ms;
    transition-delay: 0ms;
  }
}
```

## Runtime behavior

The application must normalize input to the accepted ASCII integer contract, retain the latest pending value, and build 40 cells per column: digits 0 through 9 repeated four times. After rendering every column, it must measure one live cell, calculate `(30 + targetDigit) × cellHeight` for each target offset, wait for the zero position to paint, and mark the strips spinning. Apply the [shared transition completion contract](directions/transition.md#adapt-the-selected-recipe) across all strips: settle on the current maximum-total strip's `transform` completion or its cancellable fallback deadline, settle immediately when that total is zero, and guard both paths with the same spin identity. Only that current completion may replace the reel with the pending static value and update the live output once. Rapid spins, reduced motion, replacement, and teardown must cancel the deadline and invalidate earlier paint and transition callbacks before they can settle.

## Verify

Test zero, leading-zero policy, one and six digits, rejected non-digits, the 240-cell bound, measured height, actual last-strip completion, rapid spins, reduced motion before paint and settlement, one announcement, and cleanup/remount without stale work.
