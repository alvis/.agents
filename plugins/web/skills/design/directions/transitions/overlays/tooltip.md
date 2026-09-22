# Tooltip

Use this recipe when several compact controls share one non-interactive hint bubble. The bubble waits 80ms before appearing to ignore brief pointer fly-bys, then moves and resizes between neighboring triggers without replacing the accessible names already on those controls. Import `assets/transitions/motion.css` after Tailwind, then pass the rendered section to `mount(root)`.

Use the complete [tooltip code example](examples/transitions/overlays/tooltip.md).

## Focused check

The initial state keeps the shared tooltip visually and semantically hidden while every icon button retains its own accessible name. Hover or focus a trigger and confirm the bubble appears above it after the brief intent delay. Move directly across the row and confirm one bubble travels and resizes to the new label. Leave the toolbar with the pointer, move keyboard focus away, or press Escape and confirm the final state hides the tooltip immediately. Toggle reduced motion while the bubble is moving and confirm the CSS media query removes the active transition. Resize the toolbar, replay hover and focus visits, then call the cleanup function and confirm the observer and listeners no longer update the bubble.
