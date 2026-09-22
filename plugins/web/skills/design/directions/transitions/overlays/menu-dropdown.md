# Menu dropdown

Use this recipe for a compact action menu anchored to a trigger. Import `assets/transitions/motion.css` after Tailwind, then pass the rendered section to `mount(root)`.

Use the complete [menu dropdown code example](examples/transitions/overlays/menu-dropdown.md).

## Focused check

The initial state is a visible trigger with a hidden, inert menu. Activate the trigger and confirm the menu grows from its top-right corner, `aria-expanded` becomes `true`, and a second activation closes it. Interrupt a close by reopening before 150ms; the stale close must not hide the reopened menu. Use Arrow Down or Arrow Up on the trigger, then cycle with Arrow keys and jump with Home or End. Escape closes and returns focus; Tab closes without trapping focus; an outside pointer press closes without stealing focus. Enable reduced motion while closing and confirm the menu reaches its hidden final state immediately. Call the cleanup function while open and confirm the menu is hidden and later input has no effect.
