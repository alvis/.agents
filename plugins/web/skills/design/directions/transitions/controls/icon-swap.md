# Icon swap

Use this for two mutually exclusive icons that occupy one stable slot, such as play and pause or sun and moon. Both icons stay in the accessibility tree only through the button's changing name; the SVGs are decorative.

[Complete code example](examples/transitions/controls/icon-swap.md).

Check the initial play icon, activate the button by pointer and keyboard, and confirm the pause icon settles into the same slot. Reverse it rapidly to verify the browser interpolates from the current visual state. With reduced motion enabled, the icon changes immediately without blur or scale. After cleanup, activation must no longer change `aria-pressed`.
