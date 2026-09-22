# Toggle

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
