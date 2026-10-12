# DES-COLR-01: Palette Discipline

## Intent

Use a small, intentional color palette: one brand accent (a second hue only when a decision needs it), neutrals, and semantic colors. Maximum 12 unique non-neutral colors. Never use color as the sole indicator — always pair with icon, text, or shape for colorblind accessibility.

## Fix

- Define palette slots: brand accent, a neutral ramp, success, warning, error, info
- Use the tier-2 role tokens named under `CSS-MODE-04` (for example `--ui-accent`) for all color values
- Pair every color-coded status with an icon or text label
- Apply semantic colors consistently: red=error, green=success, yellow=warning, blue=info
- Support `prefers-color-scheme` media query when dark mode is applicable

## Code Superpowers

- Extract all color values — flag if >12 unique non-neutral colors
- Check for color-only indicators — elements distinguished solely by `color`/`background-color` without text/icon differentiation
- Verify `prefers-color-scheme` media query presence if dark mode expected
- Count `var(--ui-*)` usage vs hardcoded hex/rgb values

## Common Mistakes

1. Too many accent colors competing for attention (15+ distinct hues)
2. Color as only differentiator for status (inaccessible to colorblind users)
3. Inconsistent semantic color usage across screens (red for warning on one page, yellow on another)
4. Hardcoded color values instead of design tokens

## Edge Cases

- Data visualizations may require >12 colors for distinct series — use a sequential/diverging palette with labels
- Brand guidelines may mandate specific non-standard semantic colors

## Related

DES-COLR-02, DES-CONS-01, DES-A11Y-02
