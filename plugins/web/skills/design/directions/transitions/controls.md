# Control transitions

Follow [Transition design](directions/transition.md) for the Tailwind CSS 4.3+ version gate, approval boundary, shared asset, and implementation ownership. Load [motion.css](assets/transitions/motion.css) once, then select only the recipe whose mechanism matches the control's state change.

| State change | Recipe | Mechanism |
| --- | --- | --- |
| Replace one icon in a fixed slot | [Icon swap](directions/transitions/controls/icon-swap.md) | stacked decorative SVGs driven by one pressed state |
| Show proximity in a compact row | [Avatar group hover](directions/transitions/controls/avatar-group-hover.md) | index-distance lift with asymmetric return easing |
| Preserve selection position across labels | [Tabs sliding](directions/transitions/controls/tabs-sliding.md) | measured pill width and translation |
| Hand clearing text to an empty state | [Input clear dissolve](directions/transitions/controls/input-clear-dissolve.md) | value snapshot, measured word glow, and cancellable playback |
| Give a visual destination pointer depth | [Card tilt](directions/transitions/controls/card-tilt.md) | flat hit-area geometry driving a transformed child |
| Reveal content of unknown height | [Accordion](directions/transitions/controls/accordion.md) | grid-track interpolation with explicit disclosure finalization |
| Celebrate entry into a favorite state | [Like button](directions/transitions/controls/like-button.md) | pressed state, wrapper pop, and replayable radial particles |
| Reinforce an inline destination | [Learn more hover](directions/transitions/controls/learn-more-hover.md) | direction-aware icon translation and arm rotation |
| Sequence a checked state | [Checkbox check](directions/transitions/controls/checkbox-check.md) | native checkbox state driving fill and stroke draw |
| Add settlement to on/off state | [Toggle](directions/transitions/controls/toggle.md) | native switch state with an overshooting transform transition |

## Adapt the selected recipe

1. Copy the recipe's `html` fence and optional `css` fence. Merge its CSS after the shared asset, keep Tailwind classes literal, and adapt the HTML to the consumer's existing semantic control without replacing its state owner.
2. Treat embedded HTML as a state rendering, not proof of complete behavior. When a recipe has a Runtime behavior section, the implementer must bind that contract to the consumer's framework or application lifecycle before claiming the interaction works.
3. Preserve the division of responsibility: native elements own keyboard and focus behavior, application state owns durable selection or value, CSS maps state attributes and native pseudo-classes to visuals, and runtime code performs only the documented measurement, replay, scheduling, or finalization work.
4. Keep measurements on stationary geometry. Recompute resize-dependent values where directed, transform only visual children, and invalidate stale scheduled work before every reversal or replay so an older callback cannot overwrite the latest state.
5. On teardown, remove owned listeners or subscriptions, disconnect observers, cancel scheduled frames and deadlines, clear transient attributes and inline custom properties, and leave the control in the latest meaningful durable state. A CSS-only recipe says explicitly when no runtime cleanup exists.
6. Preserve every CSS `motion-reduce` branch. For runtime-enhanced recipes, subscribe to live preference changes and immediately cancel active motion while exposing the same semantic final state without moving focus or changing reading order.

## Verify the adapted control

Compile the selected HTML and CSS under a proven Tailwind CSS 4.3 or later installation, inspect the rendered control, and exercise its initial, action, final, reverse, rapid-interruption, replay, and teardown paths. Run its documented pointer and keyboard inputs, inspect focus visibility and accessible state, resize every measured control, change reduced motion before and during activity, and confirm the console stays clear. Do not accept hidden focusable content, decorative layers in the accessibility tree, broad transition-property sets, stale scheduled work, or a final state that depends only on a transition or animation completion event.
