# Control transitions

Use these recipes when motion clarifies a control's state, target, proximity, or direction. Load assets/transitions/motion.css before copying a recipe and compile its complete fences with Tailwind CSS 4.3 or newer.

## Choose the mechanism

| Need | Recipe | Mechanism |
| --- | --- | --- |
| Replace one icon in a fixed slot | [Icon swap](examples/transitions/controls/icon-swap.md) | stacked SVGs cross scale, blur, and opacity |
| Show proximity in a compact row | [Avatar group hover](examples/transitions/controls/avatar-group-hover.md) | distance-falloff lift with asymmetric return easing |
| Preserve selection position across labels | [Tabs sliding](examples/transitions/controls/tabs-sliding.md) | measured pill width and translation |
| Give clearing text a visible empty-state handoff | [Input clear dissolve](examples/transitions/controls/input-clear-dissolve.md) | RAF text flight with measured word glows |
| Make a visual destination feel spatial | [Card tilt](examples/transitions/controls/card-tilt.md) | flat pointer geometry drives 3D rotation and glare |
| Reveal content of unknown height | [Accordion](examples/transitions/controls/accordion.md) | `0fr` to `1fr` grid track and chevron flip |
| Celebrate a boolean favorite | [Like button](examples/transitions/controls/like-button.md) | fill, wrapper pop, and directional particles |
| Reinforce an inline destination | [Learn more hover](examples/transitions/controls/learn-more-hover.md) | direction-aware shift and chevron-arm spread |
| Sequence a checked state | [Checkbox check](examples/transitions/controls/checkbox-check.md) | native checkbox, box fill, and SVG stroke draw |
| Add physical settlement to on/off state | [Toggle](examples/transitions/controls/toggle.md) | native switch with directional overshoot keyframes |

## Setup differences

Icon swap, avatar hover, tabs, input clear, card tilt, accordion, like, and toggle include a scoped `mount(root)` because state, measurement, drawing, or replay needs JavaScript. Preserve the returned cleanup and mount each inserted section once. Learn more and checkbox need no script because native interaction plus CSS owns their complete state.

Card tilt, like, and toggle include recipe-specific CSS-first utilities or keyframes; add that fence beside the shared motion asset. Input clear draws only dynamic gradient geometry inline. Keep every other visual rule in the supplied Tailwind classes, including explicit transition-property lists and reduced-motion variants.

Tabs and card tilt depend on live geometry. Measure the stationary tablist or flat hit target rather than a transforming child, and rerun tab measurement on resize. Input clear owns RAF and canvas measurement; do not replace its mirror with the input's disappearing value or omit frame cancellation.

## Acceptance

- Compile the chosen HTML and CSS fences under Tailwind 4.3 or newer; all class names must be statically discoverable and no recipe may use `transition` or `transition-all` as a generic property set.
- Exercise initial, action, final, rapid reversal, and cleanup states. Resize measured controls and replay one-shot animations before accepting them.
- Use the native link, button, checkbox, switch, and tab semantics supplied by the recipe. Keep names current, preserve focus visibility, and exercise the documented keyboard path.
- Enable reduced motion before interaction and again during active RAF or pointer motion. The meaningful state must remain visible and JavaScript motion must stop immediately.
- Confirm visual clones stay `aria-hidden`, closed accordion content becomes inert, and no hidden panel or decorative layer enters focus order.
