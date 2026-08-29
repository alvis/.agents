# Guided interview direction

Use this direction when several coupled questions need shared context and the
user holds material intent or preferences that are not yet explicit.

## Suggested composition

1. Open with the decision boundary, the evidence already known, and an impact
   map that explains why the first question is architecturally load-bearing.
2. Present at least four realistic interview steps ordered by the blast radius
   of their answers: architecture and data contracts before operational policy,
   user experience, or polish. Each step carries its own evidence, concrete
   options, recommendation, deferral consequence, and downstream dependency.
3. Reveal context progressively. A later step should explain which earlier
   answer it depends on instead of repeating a flat questionnaire; independent
   low-impact questions may be grouped only when that reduces cognitive load.
4. Keep prior answers reviewable and editable. Show how each confirmed answer
   changes the emerging contract rather than merely marking a form complete.
5. End with one decision synthesis that separates confirmed intent, untouched
   recommendations, deferred questions, and the implementation consequences of
   the combined answers.
6. Stop when remaining questions cannot change architecture, scope, data
   contracts, user-visible behavior, or the next owner.

The page supplements the conversation. It must not hide the highest-impact
question inside a long form. The example's number of steps, option count, and
components are directional: add, remove, split, or combine them to fit the
actual interview while preserving impact order and synthesis fidelity.

## Structural fidelity

- Render questions as consequential decision surfaces, not short generic cards.
- The checked-in example includes at least four elements marked
  `data-interview-step`; their visible order follows architectural impact, not
  implementation chronology. A generated page uses however many material
  steps the real interview needs rather than padding to this demonstration
  count.
- Include one `data-decision-synthesis` surface when answers are coupled, so
  their joint effect is inspectable before the generated prompt is copied.
- Use realistic domain evidence, failure consequences, and dependency cues so
  a user can recognize intent without already knowing the ideal terminology.
- Keep the full interaction usable when JavaScript is unavailable; progressive
  enhancement may focus or reveal steps, but must not make their context vanish.

## Interaction instructions

- Annotate context and every question group.
- Support multiple independent decisions and free-form notes.
- Never treat a preselected recommendation as an answer until touched.
- Regenerate one reply prompt after every answer or saved note.
- Persist answers through the shared page-local state contract and keep every
  changed answer reflected in the single folded prompt.
