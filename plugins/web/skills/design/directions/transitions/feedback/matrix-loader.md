# Matrix loader

## Implement

1. Pair the decorative 4×4 matrix with a real polite status label and keep the matrix `aria-hidden="true"`. The label must explain the work without relying on dot order, opacity, or motion.
2. Build sixteen dots once. Adapt variants by assigning `--delay` values and `data-static` or `data-gap` flags; do not rebuild the DOM when the pattern or rounded option changes.
3. Import the [shared motion asset](assets/transitions/motion.css) once and add the matrix keyframes beside it. Keep the 1.2-second cycle so the small grid reads as a pattern instead of flicker, and preserve the CSS reduced-motion branch that makes every dot static.
4. Provide a visible pause control because animation persists while work is active. Combine user pause and live reduced motion in the root's `data-paused`, then update `aria-pressed`, the control, and status together.
5. Cleanup must mark the root paused and abort listeners. When real work ends, replace `aria-busy="true"` and its loading status outside this demo contract.

## Verify

Exercise every pattern, the rounded option, pause and resume, and a live reduced-motion change. The grid must retain sixteen stable nodes, status must remain meaningful when static, and no animation may continue while paused. After cleanup, controls must no longer change the loader.

## Complete example

```html
<section data-demo="matrix-loader" data-paused="false" aria-busy="true" class="group flex min-h-64 flex-col items-center justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-8 text-neutral-950">
  <div class="flex items-center gap-3">
    <span data-matrix aria-hidden="true" class="grid grid-cols-[repeat(4,0.25rem)] gap-1 text-violet-700 [&>i]:size-1 [&>i]:rounded-full [&>i]:bg-current [&>i]:[animation:feedback-matrix_1200ms_ease-in-out_infinite] [&>i]:[animation-delay:var(--delay)] [&>[data-gap=true]]:invisible [&>[data-static=true]]:animate-none group-data-[paused=true]:[&>i]:[animation-play-state:paused] motion-reduce:[&>i]:animate-none">
      <i></i><i></i><i></i><i></i>
      <i></i><i></i><i></i><i></i>
      <i></i><i></i><i></i><i></i>
      <i></i><i></i><i></i><i></i>
    </span>
    <span data-status role="status" aria-live="polite" class="text-sm text-neutral-600">Loading results with a column scan.</span>
  </div>
  <div class="flex flex-wrap items-end justify-center gap-3">
    <label class="grid gap-1 text-sm font-medium">
      Pattern
      <select data-variant class="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
        <option value="scan">Column scan</option>
        <option value="twinkle">Twinkle</option>
        <option value="orbit">Perimeter orbit</option>
        <option value="pulse">Center pulse</option>
      </select>
    </label>
    <label class="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 px-3 text-sm font-medium">
      <input data-rounded type="checkbox" class="size-4 accent-violet-700" />
      Rounded matrix
    </label>
    <button type="button" data-pause aria-pressed="false" class="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium transition-colors duration-(--motion-duration-fast) hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-50">Pause loader</button>
  </div>
</section>
```

```css
@keyframes feedback-matrix {
  0%, 45%, 100% { opacity: 0.35; transform: scale(0.75); }
  15% { opacity: 1; transform: scale(1); }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const matrix = root.querySelector("[data-matrix]");
  const dots = Array.from(matrix.children);
  const variant = root.querySelector("[data-variant]");
  const rounded = root.querySelector("[data-rounded]");
  const pauseButton = root.querySelector("[data-pause]");
  const status = root.querySelector("[data-status]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const corners = [0, 3, 12, 15];
  const ring = [1, 2, 7, 11, 14, 13, 8, 4];
  const inner = [5, 6, 9, 10];
  const twinkle = [7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4];
  const cycle = 1200;
  let userPaused = false;

  const names = {
    scan: "a column scan",
    twinkle: "a twinkle",
    orbit: "a perimeter orbit",
    pulse: "a center pulse",
  };

  const renderDots = () => {
    dots.forEach((dot, index) => {
      delete dot.dataset.gap;
      delete dot.dataset.static;
      let delay = 0;
      if (variant.value === "scan") delay = (index % 4) * (cycle / 10);
      if (variant.value === "twinkle") delay = twinkle[index] * (cycle / 16);
      if (variant.value === "orbit") {
        const rank = ring.indexOf(index);
        if (rank < 0) dot.dataset.static = "true";
        else delay = rank * (cycle / 8);
      }
      if (variant.value === "pulse") delay = inner.includes(index) ? 0 : cycle * 0.16;
      if (rounded.checked && corners.includes(index)) dot.dataset.gap = "true";
      dot.style.setProperty("--delay", `${Math.round(delay)}ms`);
    });
  };

  const renderPause = () => {
    const paused = userPaused || motion.matches;
    root.dataset.paused = String(paused);
    pauseButton.disabled = motion.matches;
    pauseButton.setAttribute("aria-pressed", String(userPaused));
    pauseButton.textContent = motion.matches ? "Motion reduced" : userPaused ? "Resume loader" : "Pause loader";
    status.textContent = `Loading results with ${names[variant.value]}${paused ? ". Animation paused." : "."}`;
  };

  variant.addEventListener("change", () => {
    renderDots();
    renderPause();
  }, { signal: controller.signal });
  rounded.addEventListener("change", renderDots, { signal: controller.signal });
  pauseButton.addEventListener("click", () => {
    userPaused = !userPaused;
    renderPause();
  }, { signal: controller.signal });
  motion.addEventListener("change", renderPause, { signal: controller.signal });
  renderDots();
  renderPause();

  return () => {
    root.dataset.paused = "true";
    controller.abort();
  };
}
```
