# Panel reveal

Use this pattern when a supporting surface enters a bounded part of the page without modal behavior. Closed content is inert and the trigger remains in normal reading order.

Move the separate region while preserving the trigger, reading order, and a non-modal path to every action.

Import [`motion.css`](assets/transitions/motion.css) after Tailwind CSS 4.3+.

[Complete code example](examples/transitions/layout/panel-reveal.md).

## Check

| Stage | Expected result |
| --- | --- |
| Initial | The panel is visually absent, inert, and hidden from the accessibility tree while the workspace remains usable. |
| Action | The trigger reveals the panel with translate and opacity, updates its label, and leaves focus on the trigger. |
| Close | The panel close button reverses the state and returns focus to the persistent trigger. |
| Rapid reversal | Repeated trigger activation follows the current rendered state because no cleanup timer gates interaction. |
| Reduced motion | The panel appears or disappears immediately in its final position. |
| Cleanup | Calling the returned function removes both listeners without altering the current visual state. |
