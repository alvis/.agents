# Transition design

Design the requested component's state change, capture its motion contract, and hand the approved behavior to `frontend-implementer`. Keep the parent skill's approval and evaluation gates; expand into page design only when the request also changes the surrounding surface.

## Establish compatibility and intent

1. Inspect the actual consumer before loading a recipe. Accept Tailwind CSS only when the package-manager lockfile, installed `tailwindcss` package metadata, or an exact consumer dependency pin proves version 4.3.0 or newer; a manifest range or prose claim is insufficient. If evidence is missing or older, report the gap and do not apply recipe markup or CSS or silently install or upgrade Tailwind. A design-only run may still specify motion intent, but it cannot claim recipe compatibility.
2. Identify the element, initial state, triggering action, final state, reverse or interruption behavior, focus and reading-order requirements, and the state change or spatial relationship the motion explains. Preserve the target's existing components, tokens, and interaction semantics.
3. Select the smallest matching domain and load only its guide. Load multiple guides only when the requested interaction genuinely spans their responsibilities.

| Domain | Use when | Guide |
| --- | --- | --- |
| Layout | A page region changes size, position, stacking, or spatial relationship. | [Layout](directions/transitions/layout.md) |
| Overlays | A menu, dialog, tooltip, or morphing layered control enters or leaves. | [Overlays](directions/transitions/overlays.md) |
| Feedback | Loading, progress, success, error, notification, or processing state changes. | [Feedback](directions/transitions/feedback.md) |
| Controls | A button, input, tab, toggle, checkbox, accordion, or direct manipulation state changes. | [Controls](directions/transitions/controls.md) |
| Text | Text, labels, numbers, counters, or streamed content changes over time. | [Text](directions/transitions/text.md) |

## Choose and approve the behavior

Read the selected domain guide, choose the required recipe, then load only that recipe's task guide. Each recipe supplies Tailwind markup, optional CSS, behavioral requirements, and acceptance checks. Treat an explicitly named recipe or pattern as the requested direction, then show its target-state preview and capture sign-off before production edits unless `--quick` applies. When the motion remains open, present materially different targeted variants whose timing, spatial model, or interruption behavior changes the interaction; do not create page-wide direction or area boards for transition-only scope.

`frontend-designer` owns the motion choice and its reproducible contract. Record the trigger, initial and final states, properties, starting duration and easing, interruption and replay behavior, reduced-motion result, focus behavior, responsive constraints, and selected recipe direction. `frontend-implementer` owns every production source edit. `aesthetic-evaluator` independently checks the integrated render against the approved transition and applicable Web design standards.

## Adapt the selected recipe

After the version gate passes, read [motion.css](assets/transitions/motion.css). Have the implementer merge its shared motion definitions once into an existing stylesheet processed after Tailwind's import; never make the consumer load the installed plugin at runtime. Reuse compatible project-owned motion tokens instead of duplicating them. Merge recipe-specific CSS and keyframes from the selected task guide alongside those shared definitions.

Prefer native HTML state and CSS selectors when they implement the approved behavior. When state, measurements, focus, timers, observers, or asynchronous work require framework code, treat the recipe's prose as the behavior contract and implement it with the consumer's framework rather than adding a generic script entry point:

1. Adapt the recipe's `html` fence to the target's existing semantic component. Keep Tailwind classes as complete, statically discoverable strings and preserve its state attributes, accessibility relationships, and source order.
2. Merge an optional `css` fence into the consumer's Tailwind input after the shared definitions, resolving names against existing tokens. Keep transition properties explicit and retain every reduced-motion rule.
3. Map each named input or event to framework-owned state and render the documented classes, data attributes, ARIA values, visibility, and inertness for every output state. Existing accessible primitives remain the source of keyboard, focus, dismissal, and overlay semantics.
4. Where the recipe requires measurements, read them at the documented point, expose only the required values through framework state or CSS custom properties, and recompute them on the documented resize or content changes. Do not let layout reads and writes interleave accidentally.
5. Preserve the documented ordering for state updates, focus changes, cancellation, and replacement. Cancel timers, animation frames, observers, and pending completions when state is replaced or the component leaves the tree; a stale completion must not overwrite newer state. When framework behavior waits for a CSS transition to finish, accept completion events only from the documented target and property. Derive any fallback deadline from the maximum relevant computed transition delay plus duration, normalize seconds and milliseconds before comparing values, and complete immediately when that total is zero.
6. Render the recipe's meaningful final state immediately when reduced motion is active, including when the preference changes during motion. Keep semantic content and focus usable throughout; hide decorative copies from assistive technology and remove closed content from interaction at the documented point.

## Verify and return

Recipe authors and maintainers load [Author validation](directions/transitions/validation.md) after changing a recipe, domain guide, shared motion asset, or markup/CSS contract. Ordinary consumers do not load that guide.

Run the consumer's normal Tailwind build under the proven version. In its normal browser test or preview path, exercise the initial, action, final, reverse, rapid-interruption, and replay states; keyboard and focus behavior; a live reduced-motion change; framework teardown when the recipe creates temporary work; responsive containment; and console errors. Confirm reduced motion reaches the final meaningful state, automatic persistent motion has an appropriate control, and no state depends only on `transitionend`. Inspect the integrated render; source review alone is insufficient.

Return the consumer-version evidence, selected domain and recipe, approved transition contract, shared-asset disposition, implementation owner and source paths, build and interaction results, evaluator verdict, and any unsupported or unresolved behavior.
