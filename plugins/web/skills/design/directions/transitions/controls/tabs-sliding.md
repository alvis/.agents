# Tabs sliding

Use this for a small tab set or segmented view switcher. A measured pill preserves spatial continuity between labels of different widths while the native tab state and panels remain authoritative.

[Complete code example](examples/transitions/controls/tabs-sliding.md).

Check that the pill starts under Plan without an entrance animation. Select every tab by pointer and with Arrow keys, Home, and End; the matching panel alone must remain exposed. Resize while each label is active and reverse selection rapidly to verify fresh geometry and uninterrupted interpolation. Reduced motion must snap the pill. Cleanup must disconnect measurement and prevent further selection changes.
