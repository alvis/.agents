# Overlay transitions

Choose an overlay recipe by the relationship between its trigger and surface, then load only that direction. Use [menu dropdown](directions/transitions/overlays/menu-dropdown.md) for an anchored action surface, [modal](directions/transitions/overlays/modal.md) for a blocking centered decision, [tooltip](directions/transitions/overlays/tooltip.md) for a non-interactive hover or focus hint, and [plus-menu morph](directions/transitions/overlays/plus-menu-morph.md) when the trigger visually becomes the menu container.

## Setup

These recipes require Tailwind CSS 4.3 or newer. Import `assets/transitions/motion.css` once after Tailwind so the duration and easing utilities resolve, copy the selected example markup into the consumer, and call its `mount(root)` with the rendered `section[data-demo]`. Keep each returned cleanup function and call it before removing or replacing that section.

| Recipe | Surface relationship | Setup difference |
| --- | --- | --- |
| Menu dropdown | Separate surface anchored to a trigger | Preserve `aria-haspopup="menu"`, roving arrow-key behavior, outside dismissal, and the origin that matches placement. |
| Modal | Blocking surface centered over the page | Keep the native `dialog`; `showModal()` supplies the top layer and focus containment while the recipe owns animated dismissal and focus restoration. |
| Tooltip | One non-interactive hint shared by nearby controls | Give every trigger its own accessible name, keep tooltip content text-only, and retain the recipe-specific 80ms intent-delay theme token. |
| Plus-menu morph | Trigger and expanding surface are one visual object | Reserve the open footprint, pin the trigger to the growth corner, and keep containment so size animation does not invalidate surrounding layout. |

Do not use a tooltip for links, buttons, form fields, or other interactive content; use a menu or non-modal popover pattern instead. Do not use a menu when the user must resolve a blocking decision before returning to the page; use the modal. Prefer the dropdown over the morph when the opened surface remains visually distinct from its trigger.

## Acceptance

- The initial, active, closing, and final hidden states are distinguishable without relying on a `transitionend` event.
- Rapid reversal cannot let an older timer or animation frame overwrite the current state.
- Escape, outside-pointer dismissal, keyboard traversal, and focus restoration match the selected overlay semantics.
- Hidden content is both semantically hidden and inert where it contains controls; visual clones, if added by a consumer, are `aria-hidden`.
- Reduced-motion changes take effect while the example is running, and a close already in progress reaches its meaningful final state immediately.
- The returned cleanup aborts listeners, cancels timers and animation frames, disconnects observers, and leaves no open top-layer or focus-trapping surface.
- Motion lists each animated property explicitly and uses shared duration and easing tokens with statically discoverable Tailwind classes.
- The result remains usable at 320px viewport width, preserves 44px targets and visible focus styles, and avoids unexpected page layout movement.
