# Shimmer text

Use this recipe for a short in-progress label whose activity continues for an unknown duration. The traveling highlight keeps the base text readable; use a determinate progress indicator when progress can be measured.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then use the complete [code example](examples/transitions/text/shimmer-text.md), including its recipe CSS. Keep the pause control because this animation repeats until the underlying task finishes.

## Checks

- Initial: the highlight crosses the readable “Planning the next steps” label while the semantic status exists once.
- Action: **Pause shimmer** freezes the current frame and becomes **Resume shimmer**; resuming continues the same loop.
- Final: when the application replaces this status, remove the section or update both text nodes together so visual and semantic copy agree.
- Replay and cleanup: pause and resume can repeat without creating timers; cleanup removes listeners and leaves the shimmer paused.
- Reduced motion: enabling the live preference removes the gradient animation, restores a solid readable color and disables the pause control.
- Accessibility: the animated layer is hidden from assistive technology, the status is announced as one phrase and the 44px control reports its pressed state.
