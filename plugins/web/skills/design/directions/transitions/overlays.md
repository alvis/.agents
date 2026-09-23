# Overlay transitions

1. Inspect the existing trigger and layered surface; record their semantic relationship, requested open and closed states, visual phase states, focus owner, dismissal rules, interruption behavior, reduced-motion result, and teardown result.
2. Choose one recipe and open only that direction:
   - Choose [menu dropdown](directions/transitions/overlays/menu-dropdown.md) for a separate action surface anchored to its trigger.
   - Choose [modal](directions/transitions/overlays/modal.md) for a centered decision that blocks the page.
   - Choose [tooltip](directions/transitions/overlays/tooltip.md) for a non-interactive text hint shared by nearby controls.
   - Choose [plus-menu morph](directions/transitions/overlays/plus-menu-morph.md) when the trigger and menu are one expanding visual object; choose the dropdown when they remain distinct.
3. Complete the Tailwind CSS 4.3 compatibility and setup gates in [Transition design](directions/transition.md), then merge [motion.css](assets/transitions/motion.css) once into the consumer stylesheet after Tailwind.
4. Treat each embedded HTML or CSS fence as state styling and semantic structure, not a complete interaction. Have the future implementer map the recipe's framework-neutral runtime contract to the consumer's existing accessible primitive and state owner without copying executable JavaScript, TypeScript, or JSX from this skill.
5. Preserve semantic state separately from visual phase state. Runtime work must make the newest request win, prevent an interrupted exit from hiding a reopened surface, respond to a reduced-motion preference change while active, and release every owned listener, observer, scheduled frame, and completion deadline during teardown.
6. Run the selected recipe's acceptance checks against the integrated render. Also exercise a 320px viewport, opening during exit, closing during entry, replay, keyboard-only use, a reduced-motion preference change while active, teardown while open and while exiting, and console output.
