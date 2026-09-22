# Success check

```html
<section data-demo="success-check" data-state="idle" class="group flex min-h-64 flex-col items-center justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-8 text-center text-neutral-950">
  <div aria-hidden="true" class="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 opacity-0 group-data-[state=shown]:opacity-100 group-data-[state=shown]:[animation:feedback-success-check_var(--motion-duration-slow)_var(--ease-motion-spring)_both] group-data-[state=shown]:motion-reduce:animate-none">
    <svg viewBox="0 0 48 48" fill="none" class="size-10 overflow-visible">
      <path data-check-path d="M13 25.5 20.5 33 36 17" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="[stroke-dasharray:var(--check-length)] [stroke-dashoffset:var(--check-length)] group-data-[state=shown]:[animation:feedback-success-path_var(--motion-duration-slow)_var(--ease-motion-enter)_both] group-data-[state=shown]:motion-reduce:animate-none group-data-[state=shown]:motion-reduce:[stroke-dashoffset:0]" />
    </svg>
  </div>
  <div class="space-y-1">
    <h2 class="text-lg font-semibold">Changes saved</h2>
    <p data-status role="status" aria-live="polite" class="text-sm text-neutral-600">Your preferences are up to date.</p>
  </div>
  <button type="button" data-replay class="min-h-11 rounded-full bg-neutral-950 px-5 text-sm font-medium text-white transition-[background-color,scale] duration-(--motion-duration-fast) ease-motion-enter hover:bg-neutral-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 motion-reduce:transition-none motion-reduce:active:scale-100">Replay confirmation</button>
</section>
```

```css
@keyframes feedback-success-check {
  from { opacity: 0; transform: translateY(2rem) rotate(45deg); filter: blur(8px); }
  to { opacity: 1; transform: translateY(0) rotate(0); filter: blur(0); }
}

@keyframes feedback-success-path {
  from { stroke-dashoffset: var(--check-length); }
  to { stroke-dashoffset: 0; }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const replay = root.querySelector("[data-replay]");
  const path = root.querySelector("[data-check-path]");
  const status = root.querySelector("[data-status]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;

  const length = Math.ceil(path.getTotalLength());
  path.style.setProperty("--check-length", String(length));

  const finish = () => {
    cancelAnimationFrame(frame);
    root.dataset.state = "shown";
    status.textContent = "Your preferences are up to date.";
  };

  const replayCheck = () => {
    cancelAnimationFrame(frame);
    root.dataset.state = "idle";
    status.textContent = "Saving your preferences.";
    if (motion.matches) {
      finish();
      return;
    }
    void root.offsetWidth;
    frame = requestAnimationFrame(finish);
  };

  const handleMotion = () => {
    if (motion.matches) finish();
  };

  replay.addEventListener("click", replayCheck, { signal: controller.signal });
  motion.addEventListener("change", handleMotion, { signal: controller.signal });
  finish();

  return () => {
    finish();
    controller.abort();
  };
}
```
