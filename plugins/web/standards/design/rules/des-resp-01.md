# DES-RESP-01: Responsive Coverage

## Intent

Layout adapts across the product's supported width range without horizontal page scroll, and content reflows rather than scales (WCAG 2.2 SC 1.4.10: no two-dimensional scrolling at 320 CSS px width, the 1280 px viewport at 400% zoom). Breakpoints come from where the content's composition breaks, not from a fixed device list. Critical information appears first at every width. This rule owns the viewport coverage contract; a project's stricter declared commitments (named devices, widths, or input methods) add to it.

## Fix

- Declare the supported range and input methods; when none are declared, cover 320 CSS px through a wide desktop
- Place breakpoints where content breaks; record each with its reason
- Verify the narrowest supported width, each breakpoint and the widths either side of it, a common desktop width, and any content-driven intermediate width where navigation, tables, or media change
- Use CSS Grid or Flexbox with responsive layouts; avoid fixed widths that break narrow viewports
- Images scale with `max-width: 100%; height: auto`
- Add `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Order content by task priority at each width, not by desktop order

## Code Superpowers

- Check `@media` and container-query definitions — flag a supported range with no narrow adaptation
- Check min-width/max-width on containers
- Verify `meta viewport` tag present
- Look for fixed-width declarations that could cause overflow
- Exercise realistic content extremes (long names, translations, empty and large data) at the narrowest width

## Common Mistakes

1. Fixed-width elements (tables, images) breaking narrow layouts
2. Content cut off or overflowing at narrow viewports
3. Missing viewport meta tag
4. Desktop-first content ordering that buries critical info on small screens
5. Testing only named device widths and missing the composition break between them

## Edge Cases

- Complex data tables may scroll horizontally inside a labelled region with a visible scroll affordance; the page itself must not
- Embedded third-party widgets may not be fully responsive; contain them and report the limitation

## Related

DES-RESP-02, DES-TYPO-02, DES-SPAC-01
