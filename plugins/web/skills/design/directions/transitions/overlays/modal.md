# Modal

1. Complete [Transition design](directions/transition.md), merge [motion.css](assets/transitions/motion.css) after Tailwind, and retain the returned cleanup function.
2. Adapt an existing native `dialog` when available. Preserve `aria-labelledby`, `aria-describedby`, explicit action labels, and the initial `autofocus` target; call `showModal()` so the platform supplies the top layer, modal focus containment, and inert background.
3. Separate modal state from visual phase. Treat `dialog.open` as top-layer membership and `data-state` as `closed`, `open`, or `closing`. Open the dialog before scheduling the frame that sets `open`; keep it in the top layer through the exit and call `dialog.close()` only after the closing duration.
4. Animate the panel's `opacity` and `scale` and the backdrop's `opacity` with explicit property lists and shared tokens. Keep the responsive width clamp so the dialog fits a 320px viewport.
5. Intercept the native `cancel` event to animate Escape dismissal. Dismiss from labeled actions or a direct backdrop press, ignore clicks inside the panel, and restore focus to the connected opener only after close completes.
6. Clear the previous timeout and frame and increment `stateVersion` before each transition; `finishClosed` must reject stale versions. If reduced motion becomes active during entry or exit, cancel the frame or timer and settle immediately.
7. Keep application effects, such as committing the destructive action, separate from animation completion. Cleanup must abort listeners, clear pending work, invalidate stale callbacks, remove any open dialog from the top layer, and restore focus when the dialog owned it.

## Complete recipe

```html
<section data-demo="modal" class="grid min-h-72 place-items-center gap-4 rounded-3xl bg-slate-100 p-8 text-center text-slate-950">
  <div>
    <h2 class="text-xl font-semibold tracking-tight">Draft workspace</h2>
    <p data-result role="status" class="mt-1 text-sm text-slate-600">Draft is unchanged.</p>
  </div>
  <button type="button" data-open-modal class="min-h-11 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white outline-2 outline-offset-2 outline-transparent hover:bg-blue-600 focus-visible:outline-blue-700 active:scale-[0.98] motion-reduce:active:scale-100">Review discard</button>
  <dialog id="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-description" data-state="closed" class="fixed left-1/2 top-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 scale-[0.96] rounded-3xl border border-slate-200 bg-white p-0 text-slate-950 opacity-0 shadow-2xl shadow-slate-950/20 outline-none transition-[opacity,scale] duration-(--motion-duration-normal) ease-motion-enter backdrop:bg-slate-950/45 backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-(--motion-duration-normal) data-[state=open]:scale-100 data-[state=open]:opacity-100 data-[state=open]:backdrop:opacity-100 data-[state=closing]:duration-(--motion-duration-fast) data-[state=closing]:ease-motion-exit data-[state=closing]:backdrop:duration-(--motion-duration-fast) motion-reduce:scale-100 motion-reduce:data-[state=closed]:scale-100 motion-reduce:data-[state=closing]:scale-100 motion-reduce:transition-none motion-reduce:backdrop:transition-none">
    <div class="p-6 text-left">
      <h3 id="discard-title" class="text-xl font-semibold tracking-tight">Discard this draft?</h3>
      <p id="discard-description" class="mt-2 text-sm leading-6 text-slate-600">Your unsaved changes will be removed from this workspace.</p>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" data-dialog-action="cancel" autofocus class="min-h-11 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold outline-2 outline-offset-2 outline-transparent hover:bg-slate-100 focus-visible:outline-blue-700">Keep editing</button>
        <button type="button" data-dialog-action="discard" class="min-h-11 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white outline-2 outline-offset-2 outline-transparent hover:bg-red-600 focus-visible:outline-red-700">Discard draft</button>
      </div>
    </div>
  </dialog>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const openButton = root.querySelector("[data-open-modal]");
  const dialog = root.querySelector("#discard-dialog");
  const result = root.querySelector("[data-result]");
  let closeTimerId;
  let openFrameId;
  let pendingReturnValue = "cancel";
  let returnFocus = openButton;
  let stateVersion = 0;

  function readDurationMilliseconds(propertyName, fallbackMilliseconds) {
    const tokenValue = getComputedStyle(root).getPropertyValue(propertyName).trim();
    const tokenMatch = tokenValue.match(/^(-?\d*\.?\d+)(ms|s)$/);
    if (!tokenMatch) return fallbackMilliseconds;
    const numericValue = Number(tokenMatch[1]);
    const milliseconds = tokenMatch[2] === "ms" ? numericValue : numericValue * 1000;
    return Math.max(0, milliseconds);
  }

  function finishClosed(version, returnValue) {
    if (version !== stateVersion || dialog.dataset.state !== "closing") return;
    dialog.dataset.state = "closed";
    dialog.close(returnValue);
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  function openModal(event) {
    stateVersion += 1;
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    returnFocus = event.currentTarget;
    if (!dialog.open) dialog.showModal();
    dialog.dataset.state = "closed";
    if (reducedMotion.matches) {
      dialog.dataset.state = "open";
      return;
    }
    openFrameId = requestAnimationFrame(() => {
      if (dialog.open) dialog.dataset.state = "open";
    });
  }

  function closeModal(returnValue = "cancel") {
    if (!dialog.open || dialog.dataset.state === "closing") return;
    stateVersion += 1;
    const version = stateVersion;
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    pendingReturnValue = returnValue;
    dialog.dataset.state = "closing";
    if (reducedMotion.matches) {
      finishClosed(version, returnValue);
      return;
    }
    const closeDurationMilliseconds = readDurationMilliseconds("--motion-duration-fast", 150);
    closeTimerId = window.setTimeout(() => finishClosed(version, returnValue), closeDurationMilliseconds);
  }

  openButton.addEventListener("click", openModal, { signal: controller.signal });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModal();
  }, { signal: controller.signal });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeModal();
  }, { signal: controller.signal });
  dialog.addEventListener("click", (event) => {
    const action = event.target.closest("[data-dialog-action]")?.dataset.dialogAction;
    if (!action) return;
    if (action === "discard") result.textContent = "Draft discarded.";
    closeModal(action);
  }, { signal: controller.signal });
  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches) return;
    if (dialog.dataset.state === "closing") {
      finishClosed(stateVersion, pendingReturnValue);
      return;
    }
    if (dialog.open && dialog.dataset.state === "closed") {
      cancelAnimationFrame(openFrameId);
      dialog.dataset.state = "open";
    }
  }, { signal: controller.signal });

  return () => {
    const ownedFocus = dialog.open || dialog.contains(document.activeElement);
    controller.abort();
    window.clearTimeout(closeTimerId);
    cancelAnimationFrame(openFrameId);
    stateVersion += 1;
    dialog.dataset.state = "closed";
    if (dialog.open) dialog.close("cleanup");
    if (ownedFocus && returnFocus?.isConnected) returnFocus.focus();
  };
}
```

## Acceptance

- Opening calls `showModal()`, places autofocus on “Keep editing,” prevents page controls from receiving focus, and settles the panel and backdrop at their open styles.
- Both actions, Escape, and a direct backdrop press animate dismissal; an inside-panel press does not; final close removes the top layer and restores the opener.
- Reopen after a completed close and confirm entry starts from the closed scale with no stale close callback.
- Enable reduced motion during entry and exit and confirm the dialog settles or closes immediately.
- Run cleanup while open and while closing; the top layer, timer, frame, listeners, and owned focus are released.
