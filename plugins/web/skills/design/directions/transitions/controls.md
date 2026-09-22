# Control transitions

Follow [Transition design](directions/transition.md) for the Tailwind version gate, approval boundary, shared asset, and implementation ownership. Load [motion.css](assets/transitions/motion.css) once, then select only the recipe whose mechanism matches the control's state change.

| State change | Recipe | Mechanism |
| --- | --- | --- |
| Replace one icon in a fixed slot | [Icon swap](directions/transitions/controls/icon-swap.md) | stacked decorative SVGs driven by one pressed state |
| Show proximity in a compact row | [Avatar group hover](directions/transitions/controls/avatar-group-hover.md) | index-distance lift with asymmetric return easing |
| Preserve selection position across labels | [Tabs sliding](directions/transitions/controls/tabs-sliding.md) | measured pill width and translation |
| Hand clearing text to an empty state | [Input clear dissolve](directions/transitions/controls/input-clear-dissolve.md) | value snapshot, canvas measurement, and cancellable RAF |
| Give a visual destination pointer depth | [Card tilt](directions/transitions/controls/card-tilt.md) | flat hit-area geometry driving a transformed child |
| Reveal content of unknown height | [Accordion](directions/transitions/controls/accordion.md) | grid-track interpolation with explicit disclosure finalization |
| Celebrate entry into a favorite state | [Like button](directions/transitions/controls/like-button.md) | pressed state, wrapper pop, and replayable radial particles |
| Reinforce an inline destination | [Learn more hover](directions/transitions/controls/learn-more-hover.md) | direction-aware icon translation and arm rotation |
| Sequence a checked state | [Checkbox check](directions/transitions/controls/checkbox-check.md) | native checkbox state driving fill and stroke draw |
| Add settlement to on/off state | [Toggle](directions/transitions/controls/toggle.md) | native switch state plus directional overshoot keyframes |

## Adapt the selected recipe

1. Copy every fence from the selected direction. Merge its optional CSS after the shared asset, keep Tailwind classes literal, and adapt the HTML to the consumer's existing semantic control without replacing its state owner.
2. Preserve the recipe's division of responsibility: native elements own keyboard and focus behavior, application state owns durable selection or value, CSS maps that state to visuals, and JavaScript performs only the documented measurement, replay, or finalization work.
3. Integrate `mount(root)` after the section exists and retain its cleanup. Mount once; abort listeners, disconnect observers, cancel frames and timers, remove transient classes and inline properties, and restore a meaningful static state before unmount or remount.
4. Keep measurements on stationary geometry. Recompute resize-dependent values where directed, transform only visual children, and cancel stale work before every reversal or replay so an older callback cannot overwrite the latest state.
5. Preserve every CSS `motion-reduce` branch and JavaScript media-query listener. A live change to reduced motion must stop active scripted motion and expose the same meaningful state without moving focus or changing reading order.

## Verify the adapted control

Compile the selected fences under the proven Tailwind version, inspect the rendered control, and exercise its initial, action, final, reverse, rapid-interruption, replay, and cleanup paths. Run its documented pointer and keyboard inputs, inspect focus visibility and accessible state, resize every measured control, change reduced motion before and during activity, and confirm the console stays clear. Do not accept hidden focusable content, decorative layers in the accessibility tree, generic transition-property sets, stale timers or frames, or a final state that depends on `transitionend`.
