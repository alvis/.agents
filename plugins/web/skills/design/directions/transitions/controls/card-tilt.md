# Card tilt

Use this for a visual card that should feel physical under a precise pointer. Track geometry on a flat outer link, rotate only its inner surface, and keep navigation, focus, and content fully usable when the effect is absent.

[Complete code example](examples/transitions/controls/card-tilt.md).

Check the flat initial card, move a mouse across every edge, and confirm rotation and glare follow the pointer without boundary flicker. Leaving must ease the surface back to flat. Tab to the link and activate it to verify the keyboard path and focus ring require no tilt. Enable reduced motion during pointer tracking to flatten immediately. Cleanup must cancel the queued RAF, remove listeners, and reset the surface.
