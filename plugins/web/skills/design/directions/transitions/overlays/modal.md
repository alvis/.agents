# Modal

1. Complete [Transition design](directions/transition.md), then merge [motion.css](assets/transitions/motion.css) after Tailwind CSS or map its tokens to equivalent project-owned tokens.
2. Adapt an existing native `dialog` when available. Preserve `aria-labelledby`, `aria-describedby`, explicit action labels, and the initial `autofocus` target; runtime must call `showModal()` so the platform supplies the top layer, modal focus containment, and inert background.
3. Keep modal state separate from visual phase. `dialog.open` records top-layer membership, while `data-state` records `closed`, `open`, or `closing` for the panel and backdrop Tailwind variants.
4. Animate the panel's `opacity` and `scale` and the backdrop's `opacity` with explicit property lists and shared tokens. Keep the responsive width clamp so the dialog fits a 320px viewport.
5. Preserve native Escape semantics by intercepting the `cancel` event only to run the visual exit. Dismiss from labeled actions or a direct backdrop press, ignore presses inside the panel, and restore focus to the connected opener only after close completes.
6. Use the runtime contract below for top-layer ordering, interrupted exits, live reduced motion, and teardown. The static markup supplies the closed styles and semantics; it does not call `showModal()`, animate dismissal, apply an action, restore focus, or clean itself up.

## Markup and state styling

```html
<section class="grid min-h-72 place-items-center gap-4 rounded-3xl bg-slate-100 p-8 text-center text-slate-950">
  <div>
    <h2 class="text-xl font-semibold tracking-tight">Draft workspace</h2>
    <p class="mt-1 text-sm text-slate-600">Review this draft before leaving the workspace.</p>
  </div>
  <button id="discard-dialog-trigger" type="button" aria-haspopup="dialog" aria-controls="discard-dialog" class="min-h-11 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white outline-2 outline-offset-2 outline-transparent hover:bg-blue-600 focus-visible:outline-blue-700 active:scale-[0.98] motion-reduce:active:scale-100">Review discard</button>
  <dialog id="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-description" data-state="closed" class="fixed left-1/2 top-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 scale-[0.96] rounded-3xl border border-slate-200 bg-white p-0 text-slate-950 opacity-0 shadow-2xl shadow-slate-950/20 outline-none transition-[opacity,scale] duration-(--motion-duration-normal) ease-motion-enter backdrop:bg-slate-950/45 backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-(--motion-duration-normal) data-[state=open]:scale-100 data-[state=open]:opacity-100 data-[state=open]:backdrop:opacity-100 data-[state=closing]:duration-(--motion-duration-fast) data-[state=closing]:ease-motion-exit data-[state=closing]:backdrop:duration-(--motion-duration-fast) motion-reduce:scale-100 motion-reduce:data-[state=closed]:scale-100 motion-reduce:data-[state=closing]:scale-100 motion-reduce:transition-none motion-reduce:backdrop:transition-none">
    <div class="p-6 text-left">
      <h3 id="discard-title" class="text-xl font-semibold tracking-tight">Discard this draft?</h3>
      <p id="discard-description" class="mt-2 text-sm leading-6 text-slate-600">Your unsaved changes will be removed from this workspace.</p>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" value="cancel" autofocus class="min-h-11 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold outline-2 outline-offset-2 outline-transparent hover:bg-slate-100 focus-visible:outline-blue-700">Keep editing</button>
        <button type="button" value="discard" class="min-h-11 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white outline-2 outline-offset-2 outline-transparent hover:bg-red-600 focus-visible:outline-red-700">Discard draft</button>
      </div>
    </div>
  </dialog>
</section>
```

## Runtime behavior contract

- On activation, record the connected opener, invalidate pending close work, call `showModal()` when the dialog is not open, and keep `data-state="closed"` until the panel and backdrop's closed styles are computed and committed. After a rendering opportunity or the framework's equivalent style-commit boundary, set `data-state="open"`. Let the native dialog focus its `autofocus` target.
- When reopening during `closing`, keep the dialog in the top layer, invalidate the pending close completion, and set `data-state="open"` directly so opacity, scale, and backdrop opacity reverse from their current interpolated values. Guard every completion with a monotonically increasing operation token, framework transition identity, or equivalent newest-request check.
- On Escape, prevent the `cancel` event's immediate close and request the animated close. Also request close from either labeled action and when the dialog itself is the direct pointer event target; presses whose target is inside the panel do nothing.
- On a close request, keep `dialog.open` true and set `data-state="closing"`. After the panel and backdrop exit transitions finish, set `data-state="closed"`, call `close()` with the selected return value, and restore the connected opener; use target-and-property-filtered completion signals with a deadline derived from computed transition delays and durations, so top-layer removal never depends only on `transitionend`.
- Dispatch application effects such as discarding the draft from the selected action, independently of animation completion. An interrupted visual exit must not repeat or roll back the application action.
- Observe `prefers-reduced-motion` while mounted. If it becomes `reduce` during entry, settle at `open`; if it becomes `reduce` during exit, complete the guarded `close()` and focus restoration immediately. CSS removes panel and backdrop transitions, while runtime still updates top-layer and focus state.
- Normalize any externally initiated native `close` event to `data-state="closed"`, cancel obsolete completion work, and restore focus only when this dialog still owns the recorded focus-return transaction.
- On framework unmount, replacement, remount, or hot reload, unsubscribe owned handlers and the media-query observer, cancel scheduled renders and completion deadlines, invalidate prior operation tokens, close an open dialog with a teardown return value, set `data-state="closed"`, and restore the connected opener when focus was inside the dialog.

## Acceptance

- Opening uses `showModal()`, places focus on “Keep editing,” prevents page controls from receiving focus, and settles the panel and backdrop at their open styles.
- Both actions, Escape, and a direct backdrop press animate dismissal; an inside-panel press does not; final close removes the top layer and restores the opener.
- Reopen during exit and close during entry; only the newest request may determine top-layer membership, visual state, return value, and focus restoration.
- Enable reduced motion during entry and exit; the dialog settles or closes immediately with matching semantic and visual state.
- Tear down while open and while closing; the top layer, listeners, observer, scheduled render, completion deadline, and owned focus are released.
