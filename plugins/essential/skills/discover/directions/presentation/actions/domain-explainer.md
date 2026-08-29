# Domain explainer direction

This is the approved golden action. Its example establishes the shared shell
and interaction contract for every presentation action; its domain-specific
content and component count are still only directional.

Use this direction when the user cannot act or ask a precise follow-up until an
unfamiliar process, vocabulary, or cause-and-effect chain becomes concrete.
The page should answer “what happens?”, “why does it matter?”, and “what can I
do next?” without becoming a textbook.

## Suggested composition

1. State the decision, task, or next question the explanation enables.
2. Give a compact mental model before detailed terminology.
3. Show the mechanism as a sequence, relationship, or before/after state.
4. Let the user manipulate one representative variable when cause and effect
   is easier to learn by doing than by reading.
5. Surface the failure boundary and the reversible escape hatch.
6. Place the smallest material user decision beside the relevant explanation
   only when the explanation genuinely enables a choice.
7. When no decision is needed, offer optional follow-up actions such as another
   example, a deeper failure-path walkthrough, or a comparison.
8. End with the single generated prompt for the LLM coder.

Use progressive disclosure for secondary definitions. A context rail, sequence,
decision fieldset, failure map, and glossary often work well, but none is
required. For a linear mechanism, a numbered sequence can be clearer than a
diagram. For a relational mechanism, use a labelled map or table instead.

The explanation must be concrete enough to teach transferable vocabulary and
judgment. Use a realistic scenario, at least one complete mechanism with
meaningful states or stages, domain terms paired with usage examples, and a
visible payoff showing what the user can now specify. When a simulation is
appropriate, its controls must visibly change the modeled outcome; a decorative
slider or static illustration is not evidence of understanding.

## Interaction instructions

- Make every explanatory region annotatable, including the overview, mechanism,
  caveats, decision area, and generated-prompt section.
- Treat a preselected recommendation as unresolved until the user interacts.
- Do not manufacture a decision merely to make the page interactive. Mark
  optional requests with `data-response-kind="follow-up"`; follow-up-only pages
  should generate an explanation request rather than an implementation order.
- Regenerate the one prompt when any answer or annotation changes.
- Phrase the prompt as implementation feedback to the LLM coder, not as a
  generic summary or a prompt for another explainer.
- Keep the full explanation readable without JavaScript.

The representative example uses a staged database migration because it has a
clear causal sequence, reversible checkpoints, a traffic rehearsal, and a
meaningful rollout choice. It is a direction sample only. Future explainers
should change density, components, order, and visualization to fit their actual
domain; they should not mechanically reproduce its sequence or simulator.
