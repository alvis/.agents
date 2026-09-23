# Layout transitions

Use this guide after the shared [transition workflow](directions/transition.md) proves Tailwind CSS 4.3 or newer and selects layout motion. Choose one recipe, adapt its embedded HTML and Tailwind CSS to the consumer, and implement every stated runtime requirement in the consumer's framework.

## Choose one recipe

1. Trace which region owns the state change and whether the entering content is the same surface, a supporting surface, a peer view, or a bounded queue.
2. Select the narrowest matching row. If the interaction needs modal focus containment, route it to the overlay guide instead. If only text or a control changes, route it to that domain.
3. Open only the selected recipe; each recipe contains its HTML, Tailwind CSS, runtime behavior, lifecycle contract, and checks.

| State relationship | Select when | Recipe |
| --- | --- | --- |
| One surface reveals its own supporting content. | The trigger and details belong to one card and focus should remain on the trigger. | [Card resize](directions/transitions/layout/card-resize.md) |
| A separate supporting surface enters a bounded region. | The page remains usable and the panel is non-modal. | [Panel reveal](directions/transitions/layout/panel-reveal.md) |
| Two peer views share directional continuity. | Overview/detail or equivalent peers remain mounted while one is active. | [Page side-by-side](directions/transitions/layout/page-side-by-side.md) |
| User-triggered notices overlap. | The newest notice stays dominant and older notices need an accessible expanded view. | [Banner stacking](directions/transitions/layout/banner-stacking.md) |

## Adapt the selected recipe

1. Import [motion.css](assets/transitions/motion.css) once after Tailwind CSS, or map its duration and easing tokens to equivalent project-owned tokens. Keep every animated property explicit.
2. Preserve the consumer's semantic elements, source order, state owner, accessible names, and existing focus primitive. Static markup shows the initial state only; implement the recipe's state synchronization, keyboard behavior, interruption rules, and cleanup in the consumer.
3. Keep Tailwind classes literal and statically discoverable. Merge embedded CSS after the shared asset, rename selectors to avoid collisions, and resolve values through existing tokens.
4. Bind interaction handlers only while the owning component is active. On teardown, replacement, remount, or hot reload, unregister handlers, observers, media-query subscriptions, scheduled frames, and timers created for the interaction; preserve the last coherent semantic state.
5. Implement both reduced-motion paths used by the recipe. CSS removes decorative interpolation, while the runtime immediately settles pending state changes and measured geometry when preference changes affect scheduled work.

## Test the integrated transition

1. Compile the selected literal classes and CSS with the proven Tailwind CSS 4.3-or-newer consumer build.
2. Exercise initial, active, reverse, rapid-interruption, replay, resize, and teardown states. Confirm no stale scheduled work, observer, media-query subscription, or handler survives teardown.
3. Switch `prefers-reduced-motion` while motion is active. The same meaningful final state must appear immediately without relying on `transitionend`.
4. Traverse by keyboard before, during, and after the transition. Keep focus and reading order stable, make unavailable content `inert` and hidden from the accessibility tree, and retain a keyboard control for every pointer enhancement.
5. Inspect at 320px and 1440px widths. Allow following content to move only when expansion communicates the state change, and reject horizontal overflow or clipped controls.
6. Profile filter and layout work in the delivered context. Simplify the selected effect when it misses the project's performance budget, then rerun the affected states.
