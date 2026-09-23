# Toggle

## Implement and adapt

1. Keep the native checkbox with `role="switch"` as the authoritative on/off state. Its label owns the accessible name, and descendant-state selectors own the track, thumb, and visible status.
2. Use the spring easing on the thumb's explicit translate transition. Because the browser reverses a transition from its current interpolated value, rapid changes preserve continuity and the easing overshoots toward either destination without transient classes or timers.
3. Keep the resting translations synchronized with track width, thumb size, and inset. The example's 48px track, 20px thumb, and 4px inset leave a 20px checked translation; adapt those four values as one geometry contract.
4. Preserve label click, Tab, Space, form, focus, disabled, and reset behavior from the native checkbox. Do not add click or key handlers, duplicate checked state, or a scripted status mirror.
5. Keep the track and thumb reduced-motion branches. A live preference change snaps the thumb to the native checked destination while track color, focus ring, visible status, and switch semantics remain available. This recipe has no runtime state, scheduled work, or cleanup.

## Verify

Confirm the initial state does not animate, then toggle by label click and Space in both directions. Reverse before settlement, change reduced motion mid-transition, and reset a containing form. Check that the final thumb position and visible status always match checked state, focus remains visible, and the accessibility tree exposes one named switch.

```html
<section class="grid min-h-48 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <label class="group flex min-h-11 cursor-pointer items-center gap-4 rounded-xl p-2">
    <span class="grid gap-0.5">
      <span class="font-semibold">Quiet notifications</span>
      <span aria-hidden="true" class="grid text-sm text-slate-600 dark:text-slate-300">
        <span class="col-start-1 row-start-1 group-has-checked:hidden">Off</span>
        <span class="col-start-1 row-start-1 hidden group-has-checked:block">On</span>
      </span>
    </span>
    <span class="relative ml-auto inline-flex">
      <input type="checkbox" role="switch" class="peer sr-only"/>
      <span aria-hidden="true" class="h-7 w-12 rounded-full bg-slate-300 transition-[background-color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter peer-checked:bg-emerald-500 peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-400/40 motion-reduce:transition-none"></span>
      <span aria-hidden="true" class="pointer-events-none absolute left-1 top-1 size-5 translate-x-0 rounded-full bg-white shadow-sm transition-[translate] duration-(--motion-duration-slow) ease-motion-spring peer-checked:translate-x-5 motion-reduce:transition-none"></span>
    </span>
  </label>
</section>
```
