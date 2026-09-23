# Icon swap

## Implement and adapt

1. Keep one native toggle button and one authoritative playback boolean. Derive `aria-pressed` and both icon states from that boolean; keep the accessible name stable so assistive technology announces one toggle whose pressed state changes.
2. Stack both SVGs in the same grid cell so the slot never changes size. Keep each SVG `aria-hidden`, cross opacity, blur, and scale with explicit property lists, and leave the button's stable label as the only announced name.
3. Preserve native click, Enter, Space, and focus behavior. Let CSS interpolate rapid reversals from the browser's current values; do not schedule timers or wait for `transitionend`.
4. The HTML below renders the stopped state. It requires the runtime behavior that follows to update the durable playback state.

## Runtime behavior

1. Route native button activation into the application's existing playback-state update. Render `aria-pressed="true"` exactly when playback is active; do not keep a second local flag or infer state from icon opacity.
2. External playback changes must enter the same render path so the pressed state and visible icon cannot diverge. Repeated updates to the current boolean do nothing.
3. The icon transitions require no scheduled completion work. On teardown, remove the owned activation subscription and leave `aria-pressed` reflecting the application's latest boolean.
4. CSS handles live reduced-motion changes. Exactly one sharp, full-size icon must remain visible immediately without changing playback or focus.

## Verify

Activate by pointer, Enter, and Space, reverse repeatedly before settlement, and confirm the slot never shifts and exactly one icon is visible. Change playback externally, inspect the accessibility tree for one stably named toggle button and no exposed SVGs, change reduced motion mid-swap, then tear down and confirm later activation no longer invokes the removed integration.

```html
<section class="grid min-h-40 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <button type="button" aria-pressed="false" aria-label="Playback" class="group inline-grid size-12 place-items-center rounded-full bg-white shadow-sm outline-none ring-sky-500/50 hover:bg-slate-50 focus-visible:ring-4 dark:bg-slate-800 dark:hover:bg-slate-700">
    <svg aria-hidden="true" viewBox="0 0 24 24" class="[grid-area:1/1] size-5 fill-current opacity-100 blur-none transition-[opacity,filter,scale] duration-(--motion-duration-normal) ease-in-out group-aria-pressed:scale-25 group-aria-pressed:opacity-0 group-aria-pressed:blur-[2px] motion-reduce:transition-none motion-reduce:group-aria-pressed:scale-100 motion-reduce:group-aria-pressed:blur-none"><path d="M8 5v14l11-7z"/></svg>
    <svg aria-hidden="true" viewBox="0 0 24 24" class="[grid-area:1/1] size-5 scale-25 fill-current opacity-0 blur-[2px] transition-[opacity,filter,scale] duration-(--motion-duration-normal) ease-in-out group-aria-pressed:scale-100 group-aria-pressed:opacity-100 group-aria-pressed:blur-none motion-reduce:scale-100 motion-reduce:blur-none motion-reduce:transition-none"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>
  </button>
</section>
```
