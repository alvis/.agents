# Concept primer direction

Use this direction when one concept, not a whole domain, is what stands between
the user and a request they can make. The page should answer “what is this
made of?”, “what do I call each part?”, and “what does it feel like when it is
wrong?”, and should end with the user able to say the thing out loud to a
professional.

It is narrower than the [domain explainer](domain-explainer.md) on purpose. An
explainer makes an unfamiliar mechanism concrete so a decision can be taken; a
primer teaches one transferable idea so a request can be phrased. When the user
needs both, explain the domain and link the primer, rather than widening the
primer until it becomes a textbook.

## Suggested composition

1. Reduce the concept to the smallest number of decisions it actually is —
   four is usually enough — as ordered steps the reader can hold at once.
2. Build a vocabulary ladder: each term with a plain definition and, in the
   same breath, the sentence a professional would say. The phrasing example is
   the payload; the definition only makes it usable.
3. Set “instead of” against “say” in a table, so the vague phrasing the user
   arrived with maps onto the precise one they are leaving with.
4. Give them one demonstration to feel it — the same thing twice, with only
   the taught variable changed, and controls that move that variable. Feeling
   the difference is what makes the vocabulary stick.
5. Offer a quality checklist for judging the real thing, and a confidence
   scale so the user can tell you whether the primer worked.
6. Close with two complete example prompts, written in the taught vocabulary,
   that an implementer could act on without a meeting.

The demonstration uses the existing embed block: packed HTML in a `srcdoc`
frame, sandboxed without same-origin. Keep it small enough to read in one
screen and honest about `prefers-reduced-motion` or any other accessibility
axis the concept touches — a primer that teaches a technique while ignoring who
it excludes has taught the wrong lesson.

## Interaction instructions

- Every phrasing example must be a sentence the user can copy verbatim into a
  request. Fragments and paraphrases fail this direction.
- The controlled variable must visibly change the outcome. A demo that looks
  the same at both extremes disproves the concept it is teaching.
- Keep the checklist about the artefact, not about the reader's comprehension;
  the confidence scale is where comprehension is asked about.
- Ask the user to name one thing in their own product they will apply this to,
  and leave it a free note — the primer is only worth the transfer.
- Regenerate the prompt on every tick, rating, and note.
- Keep the mental model, the vocabulary, and the example prompts readable
  without JavaScript; only the demonstration may require it.

The representative example teaches easing and duration because it is one idea,
it has a vocabulary people reach for and misuse, and the difference between a
right and a wrong curve is visible in half a second side by side. It is a
direction sample only. A primer on a different concept should find its own
smallest demonstration rather than adapting this one.
