# Card resize

Use this pattern when one card reveals its own secondary content. The grid track supports unknown content height while the native button keeps state and focus stable.

Animate a contained grid track; keep controls outside the collapsing track and make closed content inert.

Import [`motion.css`](assets/transitions/motion.css) after Tailwind CSS 4.3+.

[Complete code example](examples/transitions/layout/card-resize.md).

## Check

| Stage | Expected result |
| --- | --- |
| Initial | Details are collapsed, inert, and hidden from the accessibility tree; the button says “Show details.” |
| Action | Activating the button expands the grid track and updates the label and `aria-expanded` without moving focus. |
| Reverse and replay | Repeated activation reverses cleanly from the current size with no timeout or stale state. |
| Reduced motion | The same open or closed state appears immediately with no track or chevron transition. |
| Cleanup | Calling the returned function removes the click listener; later activation no longer changes state. |
