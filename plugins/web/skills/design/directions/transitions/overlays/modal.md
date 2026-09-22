# Modal

Use this recipe for a centered decision that blocks the rest of the page. The native `dialog` supplies top-layer placement, focus containment, and platform dismissal semantics; the transition only decorates its open and close states. Import `assets/transitions/motion.css` after Tailwind, then pass the rendered section to `mount(root)`.

Use the complete [modal code example](examples/transitions/overlays/modal.md).

## Focused check

The initial state shows the page action while the dialog is outside the top layer. Open it and confirm the backdrop fades in, the panel scales to rest, autofocus lands on “Keep editing,” and page controls cannot receive focus. Close with either action, Escape, or a backdrop press; the final state removes the dialog from the top layer and restores focus to the opener. Reopen immediately after a close completes to confirm replay starts from the resting closed scale. Switch reduced motion on during an exit and confirm the dialog closes immediately rather than waiting for a transition event. Call the cleanup function while open and confirm the top layer, timers, frame, and listeners are cleared.
