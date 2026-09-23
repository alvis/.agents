# Transition recipe author validation

Load this guide only when authoring or verifying shipped transition recipes, domain guides, the shared motion asset, or their markup/CSS contract. Consumer selection and implementation do not need it.

## Review the authored contract

For each changed recipe, confirm that its domain guide still selects it and that the recipe contains Tailwind `html` fences for its initial and any generated markup, optional `css` fences only when utilities cannot express the behavior clearly, precise framework behavior prose, and acceptance checks. Recipes do not ship executable JavaScript fences or a generic lifecycle API.

Prefer native elements, HTML state, and CSS selectors. When the interaction cannot be expressed with CSS alone, require the recipe prose to name:

- inputs and events;
- framework-owned output states and the classes, data attributes, ARIA values, visibility, and inertness each state renders;
- measurement timing and recomputation triggers, when geometry is required;
- focus ordering and keyboard behavior;
- cancellation and replacement rules for timers, frames, observers, and asynchronous completion;
- the meaningful reduced-motion result, including a preference change during motion; and
- teardown obligations for temporary work.

Check that every Tailwind class is a complete, statically discoverable string; shared definitions come from [motion.css](assets/transitions/motion.css); transition properties are explicit; decorative copies are hidden from assistive technology; and content removed visually is also removed from interaction at the stated point.

## Build and exercise a representative consumer

Use Tailwind CSS 4.3.0 or newer, proven by a lockfile, installed package metadata, or an exact dependency pin. A disposable consumer may compile the recipe's markup and CSS and expose its static and native-CSS states for inspection. That evidence proves class discovery, CSS generation, responsive containment, and native or CSS-only behavior; it does not prove framework state, interruption, focus, asynchronous work, or teardown.

To claim framework behavior, integrate the recipe through a representative consumer's owning framework and run its normal Tailwind build, formatter, typecheck, focused tests, and browser path. Exercise the initial, action, final, reverse, rapid-interruption, and replay states; keyboard and focus behavior; responsive containment at supported breakpoints; a live reduced-motion change; cleanup during framework teardown when temporary work exists; and console errors. Confirm stale asynchronous completion cannot overwrite newer state and that reduced motion reaches the final meaningful state without waiting for `transitionend`.

Record the consumer path and Tailwind version evidence, changed recipes, build commands and results, exercised states and viewports, reduced-motion result, cleanup result when applicable, browser context, and unresolved behavior. Label isolated markup/CSS evidence separately from framework runtime evidence, and do not carry behavior claims from the removed recipe scripts forward. Re-run the affected build and browser checks after any change to recipe markup, CSS, shared motion definitions, framework behavior requirements, or acceptance checks.
