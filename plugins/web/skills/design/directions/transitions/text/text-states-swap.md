# Text states swap

Use this recipe when a compact label changes between discrete states, such as “Saving” and “Saved”. The outgoing value lifts away before the next value settles into the same footprint; choose [streaming text](directions/transitions/text/streaming-text.md) when content accumulates instead of replacing one state.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then use the complete [code example](examples/transitions/text/text-states-swap.md), including its recipe CSS. The animated label is hidden from assistive technology so the complete state is announced once through the live `output`.

## Checks

- Initial: “Ready to save” occupies the stable label footprint without running an entrance.
- Action: either button sends the current label upward, then brings the selected state from below.
- Final: the visual label is sharp and stationary and the complete state is announced once.
- Replay and cleanup: clicking states rapidly cancels the earlier timer and commits only the latest choice; cleanup cancels the timer and removes all listeners.
- Reduced motion: enabling the preference during the exit immediately commits the pending state; later state changes replace text without animation.
- Accessibility: the animated label is an `aria-hidden` visual clone, buttons have distinct verb-first names and visible focus, and text is assigned with `textContent`.
