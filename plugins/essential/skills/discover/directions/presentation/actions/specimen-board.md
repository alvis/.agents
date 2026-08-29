# Specimen board direction

Use this direction when the clearest way to reason about a product surface is to
show a concrete mockup of it in the subject's own brand, then teach and critique
it in place. It fits a redesign, a competitor teardown, or a "here is what I
think you mean" specimen the user can react to. The board should let the user
inspect a realistic interface, follow the author's numbered explanations, and
see the honest trade-offs before deciding.

## Structural fidelity

1. Frame the mockup in browser chrome. Wrap it in `discovery-artifact-frame`
   with `data-browser-frame`, a `discovery-artifact-bar`, and a
   `.discovery-artifact-url` so the specimen reads as a real page.
2. Render the specimen inside a scoped `[data-specimen]` container that
   re-points the `--ui-*` tokens to the subject product's real palette. This is
   the one place a hex literal may appear in an action page, and only inside
   `[data-specimen]`. Reuse the house component classes; they render
   brand-tinted.
3. Teach the specimen with author annotation pins. Place a
   `.discovery-pin-layer` `[data-annotation-pins]` as a sibling overlay outside
   `[data-specimen]` so its house tokens survive the brand re-point, add three
   or more numbered `.discovery-pin` buttons positioned by `--pin-x`/`--pin-y`,
   and pair each with a `.discovery-pin-note`. These author pins are distinct
   from the user's Add-note mechanism.
4. Mark the evidentiary weight of claims with provenance pills. Use inline
   `.discovery-provenance` `[data-provenance]` pills in prose and at least one
   table of `tr[data-provenance]` rows, wired from the evidence ledger.
5. State the honest trade-offs. Include a `.discovery-tradeoffs`
   `[data-tradeoffs-honestly]` block with visible wins, costs, and fails-when
   groups. Flag any illustrative filler with `data-fabricated` and a
   `.discovery-invented-tag` `[data-invented-tag]` marker.
6. Carry the full shared shell: masthead, annotatable sections, one folded
   generated prompt, and board navigation. Give the board root a stable
   `data-board-id` and link the hub with a session-relative href.

## Interaction instructions

- Annotate the specimen framing, the pin explanations, the provenance table,
  the trade-offs block, and the generated-prompt section.
- Keep the specimen legible without JavaScript; pins, pills, and the trade-offs
  block all render from author-provided markup before scripts run.
- Do not manufacture a decision. A specimen board is often explanatory; offer
  optional follow-up requests when no choice is genuinely enabled.
- Keep the pin layer and browser-frame chrome on house tokens; only the
  specimen interior carries the brand palette.
- Regenerate the one prompt when any answer or annotation changes.

The board is a direction sample, not a fixed schema. Change the specimen, the
pin count, and the surrounding evidence to fit the actual product under review.
