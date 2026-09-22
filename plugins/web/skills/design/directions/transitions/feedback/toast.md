# Toast

[Code example](examples/transitions/feedback/toast.md)

Use this pattern for a brief, non-blocking confirmation with an optional direct dismissal. Keep critical errors and required decisions in the page flow instead of an auto-dismissing surface.

Import `assets/transitions/motion.css` once before using this recipe.

The five-second display window gives readers time to find and use the dismissal control. Show the toast repeatedly, hover it, and focus its close button to confirm each action replaces the prior timer and pauses auto-dismissal; turn reduced motion on while it is visible and confirm only the movement disappears. Cleanup must cancel dismissal and every listener.
