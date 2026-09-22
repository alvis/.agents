# Thinking states

Use this pattern when a long-running process can name a few meaningful stages. A changing label is useful only when each label reflects real work; use a single static loading message when the system has no stage information.

Import `assets/transitions/motion.css` once before using this recipe.

```html
<section data-demo="thinking-states" data-paused="false" aria-busy="true" class="group flex min-h-64 flex-col items-center justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-8 text-neutral-950">
  <div class="space-y-2 text-center">
    <p class="text-sm font-medium text-neutral-950">Preparing your workspace</p>
    <p role="status" aria-live="polite" aria-atomic="true" class="h-6 overflow-hidden text-sm">
      <span data-line data-phase="idle" data-text="Reviewing project files" class="relative inline-block text-neutral-500 transition-[opacity,translate,filter] duration-(--motion-duration-fast) ease-in-out data-[phase=enter]:translate-y-2 data-[phase=enter]:opacity-0 data-[phase=enter]:blur-[2px] data-[phase=exit]:-translate-y-2 data-[phase=exit]:opacity-0 data-[phase=exit]:blur-[2px] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(90deg,transparent_35%,rgb(23_23_23)_50%,transparent_65%)] before:bg-[length:300%_100%] before:bg-clip-text before:text-transparent before:content-[attr(data-text)] before:[animation:feedback-thinking-shimmer_2s_linear_infinite] group-data-[paused=true]:translate-none group-data-[paused=true]:opacity-100 group-data-[paused=true]:blur-none group-data-[paused=true]:transition-none group-data-[paused=true]:before:[animation-play-state:paused] motion-reduce:translate-none motion-reduce:transition-none motion-reduce:before:animate-none motion-reduce:before:content-none">Reviewing project files</span>
    </p>
  </div>
  <button type="button" data-pause aria-pressed="false" class="min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium transition-colors duration-(--motion-duration-fast) hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-50">Pause status updates</button>
</section>
```

```css
@keyframes feedback-thinking-shimmer {
  from { background-position: 100% 0; }
  to { background-position: 0 0; }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const line = root.querySelector("[data-line]");
  const pauseButton = root.querySelector("[data-pause]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const states = ["Reviewing project files", "Checking dependencies", "Preparing the preview"];
  const holdTime = 2000;
  let index = 0;
  let userPaused = false;
  let holdTimer = 0;
  let swapTimer = 0;
  let frame = 0;

  const clearCycle = () => {
    clearTimeout(holdTimer);
    clearTimeout(swapTimer);
    cancelAnimationFrame(frame);
    holdTimer = 0;
    swapTimer = 0;
    frame = 0;
  };

  const readFastDuration = () => {
    const value = getComputedStyle(root).getPropertyValue("--motion-duration-fast").trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount)) return 150;
    if (value.endsWith("ms")) return amount;
    if (value.endsWith("s")) return amount * 1000;
    return 150;
  };

  const schedule = () => {
    clearTimeout(holdTimer);
    if (userPaused || motion.matches) return;
    holdTimer = setTimeout(beginSwap, holdTime);
  };

  const beginSwap = () => {
    if (userPaused || motion.matches) return;
    line.dataset.phase = "exit";
    swapTimer = setTimeout(() => {
      index = (index + 1) % states.length;
      line.textContent = states[index];
      line.dataset.text = states[index];
      line.dataset.phase = "enter";
      frame = requestAnimationFrame(() => {
        line.dataset.phase = "idle";
        schedule();
      });
    }, readFastDuration());
  };

  const renderPause = () => {
    const paused = userPaused || motion.matches;
    root.dataset.paused = String(paused);
    pauseButton.disabled = motion.matches;
    pauseButton.setAttribute("aria-pressed", String(userPaused));
    pauseButton.textContent = motion.matches ? "Motion reduced" : userPaused ? "Resume status updates" : "Pause status updates";
    if (paused) {
      clearCycle();
      line.dataset.phase = "idle";
    } else {
      schedule();
    }
  };

  pauseButton.addEventListener("click", () => {
    userPaused = !userPaused;
    renderPause();
  }, { signal: controller.signal });
  motion.addEventListener("change", renderPause, { signal: controller.signal });
  renderPause();

  return () => {
    clearCycle();
    root.dataset.paused = "true";
    line.dataset.phase = "idle";
    controller.abort();
  };
}
```

The two-second hold keeps the narration informative without turning live-region updates into chatter. Let all three states cycle, pause and resume during both a hold and a swap, and enable reduced motion mid-swap; the current text must settle, remain readable, and stop changing. Cleanup must cancel both timers, the frame, and listeners.
