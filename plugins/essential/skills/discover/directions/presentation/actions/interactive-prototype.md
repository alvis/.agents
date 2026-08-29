# Interactive prototype direction

Use this direction when a disposable interaction is the cheapest way to learn
what behavior, density, or workflow the user prefers.

## Suggested composition

1. State the single unknown being tested.
2. Provide just enough fake or sanitized context to make the interaction real.
3. Render the complete task surface around the interaction rather than an
   isolated control floating in a generic card.
4. Expose the material controls and states, not production wiring.
5. When placement or workflow is unknown, show 2–4 variants against identical
   data so the user can compare behavior rather than content.
6. Explain what each variant or control is testing.
7. Capture preference, rejection reasons, and implementation notes.
8. Return the observed criteria through one generated prompt.

Keep the artifact visibly disposable and avoid backend, migration, or
production-state dependencies. The mock must still behave: primary controls
need visible feedback, variants need enough surrounding UI to reveal occlusion
and density trade-offs, and fake data should be credible for the named product
scenario. Static thumbnails and three differently titled copies of the same
card are not sufficient prototypes.

## Interaction instructions

- Annotate the prototype context, interaction surface, findings, and prompt.
- Support several selected capabilities or constraints.
- Treat reactions as candidate criteria until confirmed.
- Keep compared variants on the same scenario and dataset.
- Include one explicit observation field for behavior that structured controls
  did not anticipate.
- Keep a readable static explanation when JavaScript is unavailable.
