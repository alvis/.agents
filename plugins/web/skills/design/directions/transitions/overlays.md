# Overlay transitions

1. Inspect the existing trigger and layered surface; record their semantic relationship, open and closed states, focus owner, dismissal rules, interruption behavior, and reduced-motion result.
2. Choose one recipe and open only that direction:
   - Choose [menu dropdown](directions/transitions/overlays/menu-dropdown.md) for a separate action surface anchored to its trigger.
   - Choose [modal](directions/transitions/overlays/modal.md) for a centered decision that blocks the page.
   - Choose [tooltip](directions/transitions/overlays/tooltip.md) for a non-interactive text hint shared by nearby controls.
   - Choose [plus-menu morph](directions/transitions/overlays/plus-menu-morph.md) when the trigger and menu are one expanding visual object; choose the dropdown when they remain distinct.
3. Complete the compatibility and setup gates in [Transition design](directions/transition.md), then merge [motion.css](assets/transitions/motion.css) once into the consumer stylesheet after Tailwind.
4. Adapt the selected recipe to the consumer's existing accessible primitive and framework lifecycle. Preserve semantic state separately from visual phase state, and carry over its cancellation, focus, dismissal, live reduced-motion, and cleanup mechanics.
5. Run the selected recipe's acceptance checks against the integrated render. Also exercise a 320px viewport, rapid reversal, replay, keyboard-only use, a reduced-motion preference change while active, cleanup while open, and console output.
