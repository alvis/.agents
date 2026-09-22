# Toggle

## Implement and adapt

1. Keep the native checkbox with `role="switch"` as the authoritative on/off state. Its label owns the accessible name, the peer checked selector owns track and resting thumb position, and the live status text mirrors the same checked value.
2. Define separate on and off keyframes whose first frame starts at the opposite resting position, crosses the destination slightly, then settles at the exact peer-state translation. Adapt track width, thumb size, resting translation, and overshoot coordinates together so the final keyframe always matches CSS checked geometry.
3. Run directional motion only from the native `change` event, preventing an entrance animation on mount. Before replay or rapid reversal, clear the settlement timer, remove both animation classes, force one layout read, add the class matching current checked state, and update status text.
4. Preserve label click, Tab, Space, form, focus, and disabled behavior from the native checkbox. Do not add click or key handlers or duplicate checked state in JavaScript; external programmatic changes must dispatch or otherwise enter the same synchronization path.
5. Size the settlement timer from the computed slow-duration token, parsing `ms` and `s`. Cleanup aborts the listener, clears the timer, and removes both transient classes; the peer selector still renders the checkbox's actual resting state.
6. Keep the track transition and thumb animation reduced-motion branches. A live preference change suppresses the keyframes immediately while native checked state, track color, thumb destination, focus ring, and status remain available.

## Verify

Confirm the off state does not animate on mount, then toggle by label click and Space in both directions. Reverse before settlement, change reduced motion mid-bounce, and clean up with the timer pending. Check that the final thumb position always matches checked state, the status is current, focus remains visible, and no animation class survives cleanup. If the consumer supports form reset or programmatic writes, exercise its synchronization path separately because native reset does not dispatch `change`.

```html
<section data-demo="toggle" class="grid min-h-48 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <label class="flex cursor-pointer items-center gap-4 rounded-xl p-2">
    <span class="grid gap-0.5"><span class="font-semibold">Quiet notifications</span><span class="text-sm text-slate-600 dark:text-slate-300" aria-live="polite" data-toggle-status>Off</span></span>
    <span class="relative ml-auto inline-flex">
      <input type="checkbox" role="switch" class="peer sr-only" data-toggle/>
      <span aria-hidden="true" class="h-7 w-12 rounded-full bg-slate-300 transition-[background-color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter peer-checked:bg-emerald-500 peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-400/40 motion-reduce:transition-none"></span>
      <span aria-hidden="true" data-toggle-thumb class="pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-white shadow-sm [transform:translateX(0)] peer-checked:[transform:translateX(20px)] motion-reduce:animate-none"></span>
    </span>
  </label>
</section>
```

```css
@theme static {
  --animate-control-toggle-on: control-toggle-on var(--motion-duration-slow) var(--ease-motion-spring) both;
  --animate-control-toggle-off: control-toggle-off var(--motion-duration-slow) var(--ease-motion-spring) both;
}

@keyframes control-toggle-on {
  0% { transform: translateX(0); }
  58% { transform: translateX(22px); }
  82% { transform: translateX(18px); }
  100% { transform: translateX(20px); }
}

@keyframes control-toggle-off {
  0% { transform: translateX(20px); }
  58% { transform: translateX(-2px); }
  82% { transform: translateX(2px); }
  100% { transform: translateX(0); }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const input = root.querySelector("[data-toggle]");
  const thumb = root.querySelector("[data-toggle-thumb]");
  const status = root.querySelector("[data-toggle-status]");
  let settleTimerId = 0;

  function getDurationMs() {
    const value = getComputedStyle(root).getPropertyValue("--motion-duration-slow").trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return 400;
    if (value.endsWith("ms")) return amount;
    if (value.endsWith("s")) return amount * 1000;
    return 400;
  }

  input.addEventListener("change", () => {
    const animationClass = input.checked ? "animate-control-toggle-on" : "animate-control-toggle-off";
    clearTimeout(settleTimerId);
    thumb.classList.remove("animate-control-toggle-on", "animate-control-toggle-off");
    void thumb.offsetWidth;
    thumb.classList.add(animationClass);
    status.textContent = input.checked ? "On" : "Off";
    settleTimerId = setTimeout(() => thumb.classList.remove(animationClass), getDurationMs());
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    clearTimeout(settleTimerId);
    thumb.classList.remove("animate-control-toggle-on", "animate-control-toggle-off");
  };
}
```
