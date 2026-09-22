# Toggle

Use this for a native on/off setting where the thumb can overshoot and settle while the track changes on its own clock. JavaScript adds directional animation only after a real change, preventing an unwanted return animation on page load.

[Complete code example](examples/transitions/controls/toggle.md).

Check that the off thumb does not animate on mount. Toggle with pointer and Space: the thumb must overshoot in the correct direction, settle at the native checked position, and update the live status. Reverse it before settlement to verify the previous timer cannot remove the new animation. Reduced motion must retain the native switch and track state without the bounce. Cleanup must cancel settlement and leave the checkbox functional without scripted motion.
