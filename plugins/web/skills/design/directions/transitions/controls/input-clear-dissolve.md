# Input clear dissolve

## Implement and adapt

1. Keep the labeled native search input as the value and focus owner. Before clearing, snapshot its exact current value into an `aria-hidden` mirror, then route the empty value through the consumer's existing value owner and keep focus on the input without scrolling.
2. Preserve three independent visual layers: the text mirror falls, blurs, and fades; the placeholder enters from above; and an `aria-hidden` glow layer follows measured word positions. Do not replace the mirror with the already-cleared input or expose any clone to assistive technology.
3. Build glow geometry from the input's computed font, inline padding, and field width. Measure whitespace-preserving text segments with an offscreen canvas context, place one radial gradient at each non-whitespace segment's center, and keep this dynamic background inline while Tailwind and the recipe CSS own static layout and state styles.
4. The HTML below renders a populated field with inactive transient layers. It requires the runtime behavior that follows; the clear button is not functional from static markup alone.

## Runtime behavior

1. Derive clear-button disabled state and `data-empty` from the authoritative value after every value change. Route a clear through the existing controlled-state setter; for a plain uncontrolled input, assign the empty value and dispatch one bubbling `input` event. Never keep a second durable value.
2. Reject a clear while one is already active or when the value is empty. Otherwise snapshot the value into the mirror, compute the glow background, update the authoritative value to empty, focus the input with scroll prevention, set `data-clearing="true"`, disable the button, and schedule one completion deadline from the computed `--motion-duration-slow` value.
3. Treat a user value change during playback as an interruption: invalidate the deadline, clear mirror text and the glow background, set `data-clearing="false"`, recompute `data-empty` and button availability, and preserve the new value. Use an operation generation so an older deadline cannot finalize a newer clear.
4. Prevent a primary pointer press on the clear button from transferring focus away from the input; do not suppress keyboard activation. If the consumer's button primitive already preserves focus, reuse its behavior.
5. When reduced motion is already active, perform the same semantic clear and focus update without setting `data-clearing` or scheduling a deadline. Subscribe to preference changes; if reduction becomes active during playback, invalidate the deadline and finalize the empty state immediately.
6. Finalization, interruption, and teardown share one reset operation: cancel the deadline, clear transient content and inline glow geometry, set `data-clearing="false"`, and derive `data-empty` and disabled state from the current authoritative value. Teardown also removes owned listeners and the preference subscription; it never changes the current input value.

## Verify

Edit the initial value, clear by pointer and keyboard, and confirm the authoritative value becomes empty while focus remains in the input. Type during playback, clear several new multiword values, resize the field before another clear, switch reduced motion mid-run, and tear down mid-run. Confirm no deadline survives, each glow follows its word, the placeholder is readable, and the input remains editable and correctly named.

```html
<section class="grid min-h-48 place-items-center rounded-2xl bg-slate-950 p-8 text-white">
  <div class="w-full max-w-md">
    <label for="dissolve-search" class="mb-2 block text-sm font-medium text-slate-300">Search projects</label>
    <div data-clearing="false" data-empty="false" class="control-clear-field relative overflow-hidden rounded-xl border border-white/15 bg-white/10 shadow-inner focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-400/20">
      <input id="dissolve-search" type="search" value="Motion design systems" autocomplete="off" class="control-clear-input relative z-10 h-12 w-full appearance-none bg-transparent px-4 pr-12 text-base text-white outline-none [&::-webkit-search-cancel-button]:hidden"/>
      <span aria-hidden="true" class="control-clear-mirror pointer-events-none absolute inset-0 z-20 flex items-center overflow-hidden whitespace-pre px-4 pr-12 text-base opacity-0"></span>
      <span aria-hidden="true" class="control-clear-placeholder pointer-events-none absolute inset-0 z-0 flex items-center px-4 pr-12 text-base text-slate-400 opacity-0">Search projects</span>
      <span aria-hidden="true" class="control-clear-glow pointer-events-none absolute inset-x-0 bottom-0 z-30 h-7 opacity-0 mix-blend-screen"></span>
      <button type="button" aria-label="Clear search" class="absolute right-2 top-1/2 z-40 grid size-8 min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full text-slate-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-0">
        <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4 fill-none stroke-current" stroke-linecap="round" stroke-width="1.75"><path d="m6 6 8 8m0-8-8 8"/></svg>
      </button>
    </div>
  </div>
</section>
```

```css
@keyframes control-clear-mirror {
  from { opacity: 1; filter: blur(0); transform: translateY(0); }
  to { opacity: 0; filter: blur(3px); transform: translateY(14px); }
}

@keyframes control-clear-placeholder {
  from { opacity: 0; filter: blur(2px); transform: translateY(-12px); }
  to { opacity: 1; filter: blur(0); transform: translateY(0); }
}

@keyframes control-clear-glow {
  0%, 100% { opacity: 0; }
  22% { opacity: 0.8; }
}

@layer components {
  .control-clear-field[data-clearing="true"] .control-clear-input { color: transparent; }
  .control-clear-field[data-clearing="true"] .control-clear-mirror { animation: control-clear-mirror var(--motion-duration-slow) var(--ease-motion-enter) both; }
  .control-clear-field[data-clearing="true"] .control-clear-placeholder { animation: control-clear-placeholder var(--motion-duration-slow) var(--ease-motion-enter) both; }
  .control-clear-field[data-clearing="true"] .control-clear-glow { animation: control-clear-glow var(--motion-duration-slow) var(--ease-motion-enter) both; }
  .control-clear-field[data-empty="true"]:not([data-clearing="true"]) .control-clear-placeholder { opacity: 1; }

  @media (prefers-reduced-motion: reduce) {
    .control-clear-field[data-clearing="true"] .control-clear-mirror,
    .control-clear-field[data-clearing="true"] .control-clear-placeholder,
    .control-clear-field[data-clearing="true"] .control-clear-glow { animation: none; }
  }
}
```
