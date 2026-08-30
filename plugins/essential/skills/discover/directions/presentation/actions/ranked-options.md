# Ranked options direction

Use this direction when a viable set or several experiential directions need
recommendation-aware comparison before the next owner converges. This includes
technical approaches, product directions, information architectures, and
visual or interaction directions the user can recognize more easily than they
can describe. The page should let the user experience the consequential
differences, not merely scan option names.

## Structural fidelity

1. Restate one invariant outcome, the hard constraints, and the evidence used
   to rank the options.
2. Present three to five materially different options using the same realistic
   scenario, inputs, and operating conditions. Repeated facts make the option,
   rather than the dataset, the variable under review.
3. Give every option a complete, inspectable artifact frame. Show the actual
   task, information hierarchy, representative state, distinguishing traits,
   and at least one credible pressure case. For technical options, include the
   mechanism, owner, and rollback path. For visual or interaction directions,
   render the same content and state at the same viewport while varying
   hierarchy, density, composition, controls, or interaction model. A title,
   moodboard swatch, or paragraph does not qualify as an option frame.
4. Vary the composition to reveal each mechanism honestly: for example, a flow
   may suit a compatibility boundary, a routing console may suit parallel
   infrastructure, and an ownership board may suit distributed migration. Do
   not force every option into the same generic card.
5. Keep repeated comparison fields available after the frames so the user can
   check cost, reversibility, overlap, ownership, and failure behavior without
   reconstructing them from prose.
6. Add an option-local reaction to every frame. Let the user keep the whole
   direction, steal a named trait, or reject it, then make one explicit final
   selection or shortlist. Preserve rejected options and their reasons.
7. Route the selected option, retained strengths from alternatives, concerns,
   annotations, and unresolved ranking assumptions through one prompt.

The rank communicates current evidence, not user approval. Recommended inputs
may start selected, but remain unresolved until touched.

## Direction-decision acceptance

A direction page succeeds only when the user can answer all three questions
without translating prose into an imagined interface:

1. Which complete direction should anchor the next iteration?
2. Which named traits from the other directions should survive?
3. Which directions or traits should be rejected, and why?

Declare one shared scenario ID on the page and repeat it on every direction
frame. Give every frame a stable direction ID, a unique composition name, at
least two visible named traits, and local keep/steal/reject controls. The final
selection choices must map one-to-one to the rendered direction IDs. These are
semantic hooks for validation and prompt synthesis, not styling APIs.

After a technical comparison, route the result to `essential:decide`. After a
visual or interaction direction comparison, route the chosen direction and
retained traits to `web:design`; the discovery page does not replace the
production design workflow.

### Visual-direction worked mapping

For a review-queue direction exercise, hold one realistic queue, selected item,
comment thread, status set, and viewport constant. One frame might be a dense
operations console with a metric strip and inline triage; another a guided queue
with one-task focus and progressive context; another a document-led review with
anchored comments and a change rail; another a spatial dependency canvas with
relationship previews and a detail inspector. Render enough of each frame to
complete the same representative task. Let the user keep a whole direction,
steal a named trait such as the metric strip or anchored comments, reject a
direction with a section note, and finally choose the anchor for the next
iteration. The resulting prompt must preserve all of those signals separately.

## Directional, not prescriptive

The checked-in example demonstrates the minimum semantic depth expected from a
high-fidelity comparison. It is not a fixed page schema. Add or remove frames,
tables, diagrams, code, states, or controls to give the actual options the best
review UX. Prefer fewer rich options over many shallow summaries.

## Interaction instructions

- Annotate the outcome, every option frame, the comparison, final selection,
  and prompt.
- Give each option a stable reaction question such as keep, keep a strength,
  or reject; do not hide all reactions in one generic form at the end.
- Use radios for one final direction and checkboxes only when several options or
  traits may legitimately survive together.
- Distinguish untouched ranking from explicit confirmation or override.
- Keep exactly one folded, live prompt for replying to the LLM coder.
