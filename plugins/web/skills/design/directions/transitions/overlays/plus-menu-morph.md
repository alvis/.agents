# Plus-menu morph

Use this recipe when a floating add control should become the action surface itself. The contained box expands from its fixed bottom-right corner while the same trigger rotates from plus to close; use the dropdown recipe when the menu is a separate popover. Import `assets/transitions/motion.css` after Tailwind, then pass the rendered section to `mount(root)`.

Use the complete [plus-menu morph code example](examples/transitions/overlays/plus-menu-morph.md).

## Focused check

The initial state is a single circular plus control with hidden, inert menu content. Activate it and confirm the contained surface grows up and left, the plus rotates into a close mark, and the menu becomes available. Activate again during either direction to confirm the latest state wins and no stale timeout hides an open menu. Arrow Down opens and focuses the first item; Arrow keys, Home, and End move within the menu; Escape returns focus to the trigger; Tab and an outside pointer press close without trapping focus. Enable reduced motion during an exit and confirm the compact final state appears immediately. Call the cleanup function while open and confirm the surface, ARIA state, timer, frame, and listeners all reset.
