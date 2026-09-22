# Checkbox check

Use this for a native checkbox whose visual treatment should sequence the box fill before a drawn checkmark. The native input retains form behavior, checked state, keyboard activation, and accessible naming.

[Complete code example](examples/transitions/controls/checkbox-check.md).

Check the empty initial box, then toggle it by clicking the label and by pressing Space on the focused input. The box must fill and the check path must draw to completion; unchecking during the draw must reverse from its current position. Reduced motion must show the final checked state immediately. Confirm form submission and the accessibility tree still expose a native named checkbox.
