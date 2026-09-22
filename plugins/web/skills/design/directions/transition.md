# Transition design

Use this workflow for an explicit `transition` input or a natural-language request to design, select, or refine motion for a web interaction. It narrows the parent design workflow to the requested component or state change; it does not require a page-wide redesign, change the approval gate, or transfer production editing from `frontend-implementer`.

## Establish compatibility and intent

1. Inspect the actual consumer before loading a recipe. Accept Tailwind CSS only when the package-manager lockfile, installed package metadata for `tailwindcss`, or an exact consumer dependency pin proves a version of at least 4.3.0; a manifest range or prose claim alone is insufficient. If evidence is missing or older, report the gap and do not apply recipe code or silently install or upgrade Tailwind. A design-only run may still specify motion intent, but it cannot claim recipe compatibility.
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

Read only the selected domain guide and the one or few recipe directions it routes to. Each recipe direction owns its mechanism, adaptation guidance, and acceptance checks; load its linked code example when implementation detail is needed. Treat an explicitly named recipe or pattern as the requested direction, then show its target-state preview and capture sign-off before production edits unless `--quick` applies. When the motion remains open, present materially different targeted variants whose timing, spatial model, or interruption behavior changes the interaction; do not create page-wide direction or area boards for transition-only scope.

`frontend-designer` owns the motion choice and its reproducible contract. Record the trigger, initial and final states, properties, starting duration and easing, interruption and replay behavior, reduced-motion result, focus behavior, responsive constraints, and selected recipe direction. `frontend-implementer` owns every production source edit. `aesthetic-evaluator` independently checks the integrated render against the approved transition and applicable Web design standards.

## Consume the shared asset and code examples

After the version gate passes, read [motion.css](assets/transitions/motion.css). Have the implementer merge its shared CSS-first motion definitions once into an existing stylesheet processed after Tailwind's import; never make the consumer load the installed plugin at runtime. Reuse compatible project-owned motion tokens instead of duplicating them. Keep recipe-specific CSS and keyframes with the selected example.

Files under `directions/transitions/<domain>/` own recipe instructions. Matching files under `examples/transitions/<domain>/` contain only the titled HTML, CSS, and JavaScript example, not a complete production component. Consume the selected example’s fences as follows:

1. Adapt the single `html` section to the target's existing semantic component and keep every Tailwind class statically discoverable.
2. Merge an optional `css` fence into the consumer's Tailwind input after the shared definitions, resolving names against existing tokens.
3. Adapt an optional `js` fence's `mount(root)` behavior to the owning runtime. Invoke it only after the section exists, retain its returned cleanup function, and call cleanup before unmount, replacement, remount, or hot reload. Never mount the same root twice without cleanup.
4. Preserve framework state ownership and existing accessible primitives. Carry over behavior, cancellation, measurement, and cleanup mechanics rather than replacing working application logic with example markup.

## Verify and return

Recipe authors and maintainers only: after changing a recipe, domain guide, shared motion asset, fence contract, or fixture builder, load [Author validation](directions/transitions/validation.md). Ordinary consumers do not load that guide.

Compile the selected classes and CSS under the proven Tailwind version. Exercise the initial, action, final, reverse, rapid-interruption, and replay states; keyboard and focus behavior; a live reduced-motion change; mount and cleanup; responsive containment; and console errors. Confirm reduced motion reaches the final meaningful state, automatic persistent motion has an appropriate control, and no state depends only on `transitionend`. Inspect the integrated render; source review alone is insufficient.

Return the consumer-version evidence, selected domain and recipe, approved transition contract, shared-asset disposition, implementation owner and source paths, compile and interaction results, evaluator verdict, and any unsupported or unresolved behavior.
