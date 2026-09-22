# Texts reveal

```html
<section data-demo="texts-reveal" class="grid max-w-lg gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div data-message class="grid gap-2" aria-live="polite">
    <h2 class="text-reveal-line text-2xl font-semibold tracking-tight [--line-index:0]">Your workspace is ready</h2>
    <p class="text-reveal-line max-w-prose text-base leading-7 text-zinc-600 [--line-index:1] dark:text-zinc-400">Invite collaborators now, or continue on your own and add them later.</p>
  </div>
  <div class="flex flex-wrap gap-3">
    <button data-show type="button" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Replay reveal</button>
    <button data-hide type="button" class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Hide message</button>
  </div>
</section>
```
```css
@keyframes texts-reveal-enter {
  from {
    opacity: 0;
    filter: blur(3px);
    transform: translateY(0.75rem);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

@keyframes texts-reveal-exit {
  to { opacity: 0; }
}

@utility text-reveal-line {
  animation: texts-reveal-enter var(--motion-duration-slow) var(--ease-motion-enter) both;
  animation-delay: calc(var(--line-index, 0) * 40ms);

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}

@utility animate-texts-reveal-exit {
  animation: texts-reveal-exit var(--motion-duration-fast) var(--ease-motion-exit) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const message = root.querySelector("[data-message]");
  const lines = message.querySelectorAll(".text-reveal-line");
  const showButton = root.querySelector("[data-show]");
  const hideButton = root.querySelector("[data-hide]");
  let hideTimer;
  let isShown = true;

  function readDurationMs(name, fallbackMs) {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return fallbackMs;
    return value.endsWith("s") && !value.endsWith("ms") ? amount * 1000 : amount;
  }

  function clearHideTimer() {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  function showMessage() {
    clearHideTimer();
    isShown = true;
    message.hidden = false;
    message.classList.remove("animate-texts-reveal-exit");
    lines.forEach((line) => line.classList.remove("text-reveal-line"));
    void message.offsetWidth;
    lines.forEach((line) => line.classList.add("text-reveal-line"));
  }

  function hideMessage() {
    clearHideTimer();
    isShown = false;

    if (motionQuery.matches) {
      message.hidden = true;
      return;
    }

    message.classList.add("animate-texts-reveal-exit");
    hideTimer = window.setTimeout(() => {
      message.hidden = true;
      message.classList.remove("animate-texts-reveal-exit");
      hideTimer = undefined;
    }, readDurationMs("--motion-duration-fast", 150));
  }

  function handleMotionChange(event) {
    if (!event.matches) return;
    clearHideTimer();
    message.classList.remove("animate-texts-reveal-exit");
    message.hidden = !isShown;
  }

  showButton.addEventListener("click", showMessage, { signal: controller.signal });
  hideButton.addEventListener("click", hideMessage, { signal: controller.signal });
  motionQuery.addEventListener("change", handleMotionChange);

  return function cleanup() {
    controller.abort();
    motionQuery.removeEventListener("change", handleMotionChange);
    clearHideTimer();
    message.classList.remove("animate-texts-reveal-exit");
  };
}
```
