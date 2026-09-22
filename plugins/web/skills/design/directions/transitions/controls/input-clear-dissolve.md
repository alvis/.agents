# Input clear dissolve

Use this for a search or filter field where clearing meaningful text deserves a visible handoff to the empty state. A measured mirror falls and blurs, the placeholder enters from above, and word-sized glow streaks dissolve across the baseline.

[Complete code example](examples/transitions/controls/input-clear-dissolve.md).

Check the populated initial field, edit the value, then activate Clear by pointer and keyboard. The exact current text must fall away while per-word streaks peak and the placeholder settles in; focus must remain in the input. Clear repeatedly after entering new text to verify replay, then enable reduced motion during a running frame to force the empty final state. Cleanup must cancel RAF work, clear visual layers, and leave the input usable.
