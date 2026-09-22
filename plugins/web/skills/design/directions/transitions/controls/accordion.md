# Accordion

Use this for a disclosure whose content height is unknown. A `0fr` to `1fr` grid track animates the panel without measurement while the chevron flips through a flat midpoint; JavaScript owns only disclosure semantics and reliable close finalization.

[Complete code example](examples/transitions/controls/accordion.md).

Check the initial closed state, then open by pointer and keyboard and follow the link inside the panel. Close and reopen rapidly to verify the pending hide cannot win after reversal. Closing must make content inert immediately and hide it after the duration without depending on `transitionend`. Enable reduced motion during a close to verify immediate finalization. Cleanup must cancel every pending frame and timer.
