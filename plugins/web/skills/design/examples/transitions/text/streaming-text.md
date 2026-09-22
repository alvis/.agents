# Streaming text

```html
<section data-demo="streaming-text" class="grid max-w-xl gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--stream-gap:60ms] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-2">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Response preview</span>
    <p data-stream-output aria-live="polite" class="sr-only">A clear transition keeps the response readable while each new word settles into place.</p>
    <p data-stream-visual aria-hidden="true" class="min-h-24 whitespace-pre-wrap text-lg leading-8">A clear transition keeps the response readable while each new word settles into place.</p>
  </div>
  <label class="grid gap-2 text-sm font-medium" for="streaming-text-value">
    Response text
    <textarea id="streaming-text-value" data-stream-input maxlength="240" rows="3" class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base leading-6 text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:ring-offset-zinc-950">Motion can clarify what just changed without interrupting the reader or delaying the final answer.</textarea>
  </label>
  <div class="flex flex-wrap gap-3">
    <button data-stream type="button" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Stream response</button>
    <button data-complete type="button" disabled class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Show complete response</button>
  </div>
</section>
```
```css
@utility streaming-word {
  opacity: 0;
  filter: blur(1px);
  transition-property: opacity, filter;
  transition-duration: var(--motion-duration-slow);
  transition-timing-function: var(--ease-motion-enter);

  &[data-visible="true"] {
    opacity: 1;
    filter: blur(0);
  }

  @media (prefers-reduced-motion: reduce) {
    opacity: 1;
    filter: none;
    transition: none;
  }
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const input = root.querySelector("[data-stream-input]");
  const output = root.querySelector("[data-stream-output]");
  const visual = root.querySelector("[data-stream-visual]");
  const streamButton = root.querySelector("[data-stream]");
  const completeButton = root.querySelector("[data-complete]");
  let revealTimer;
  let startFrame;
  let wordSpans = [];

  function cancelSequence() {
    window.clearTimeout(revealTimer);
    window.cancelAnimationFrame(startFrame);
    revealTimer = undefined;
    startFrame = undefined;
  }

  function readDurationMs(name, fallbackMs) {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return fallbackMs;
    return value.endsWith("s") && !value.endsWith("ms") ? amount * 1000 : amount;
  }

  function buildWords(value, areVisible) {
    const fragment = document.createDocumentFragment();
    const parts = value.match(/\S+|\s+/g) || [];
    const nextWordSpans = [];

    parts.forEach((part) => {
      if (/^\s+$/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        return;
      }

      const word = document.createElement("span");
      word.className = "streaming-word inline";
      word.dataset.visible = String(areVisible);
      word.textContent = part;
      fragment.appendChild(word);
      nextWordSpans.push(word);
    });

    visual.replaceChildren(fragment);
    wordSpans = nextWordSpans;
  }

  function revealWord(index) {
    if (index >= wordSpans.length) {
      revealTimer = undefined;
      completeButton.disabled = true;
      return;
    }

    wordSpans[index].dataset.visible = "true";
    const gapDurationMs = readDurationMs("--stream-gap", 60);
    revealTimer = window.setTimeout(() => revealWord(index + 1), gapDurationMs);
  }

  function showCompleteResponse() {
    cancelSequence();
    wordSpans.forEach((word) => { word.dataset.visible = "true"; });
    completeButton.disabled = true;
  }

  function streamText() {
    const value = input.value.trim() || "No response yet.";
    cancelSequence();
    output.textContent = value;

    if (motionQuery.matches) {
      buildWords(value, true);
      completeButton.disabled = true;
      return;
    }

    buildWords(value, false);
    completeButton.disabled = wordSpans.length === 0;
    void visual.offsetWidth;
    startFrame = window.requestAnimationFrame(() => revealWord(0));
  }

  function handleMotionChange(event) {
    if (!event.matches) return;
    showCompleteResponse();
  }

  streamButton.addEventListener("click", streamText, { signal: controller.signal });
  completeButton.addEventListener("click", showCompleteResponse, { signal: controller.signal });
  motionQuery.addEventListener("change", handleMotionChange);
  buildWords(output.textContent, true);

  return function cleanup() {
    controller.abort();
    motionQuery.removeEventListener("change", handleMotionChange);
    showCompleteResponse();
    buildWords(output.textContent, true);
  };
}
```
