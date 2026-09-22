# Modal

Use this recipe for a centered decision that blocks the rest of the page. The native `dialog` supplies top-layer placement, focus containment, and platform dismissal semantics; the transition only decorates its open and close states. Import `assets/transitions/motion.css` after Tailwind, then pass the rendered section to `mount(root)`.

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

## Focused check

The initial state shows the page action while the dialog is outside the top layer. Open it and confirm the backdrop fades in, the panel scales to rest, autofocus lands on “Keep editing,” and page controls cannot receive focus. Close with either action, Escape, or a backdrop press; the final state removes the dialog from the top layer and restores focus to the opener. Reopen immediately after a close completes to confirm replay starts from the resting closed scale. Switch reduced motion on during an exit and confirm the dialog closes immediately rather than waiting for a transition event. Call the cleanup function while open and confirm the top layer, timers, frame, and listeners are cleared.
