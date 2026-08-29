# Blind spots direction

Use this direction when the request itself is the problem: short enough to
sound complete, and silent on the decisions somebody will have to make anyway.
The page should answer “what did this leave open?”, “which of the readings did
you mean?”, and “what should the request have said?” without rewriting the
user's intent for them.

This is the direction that inverts the reply. Every other action generates a
prompt about the work; this one generates the prompt the user should have sent
in the first place, assembled from their own answers. Write the reply template
as that prompt — addressed to the implementer, not to the reader — so copying
it out is the deliverable rather than a summary of one.

## Suggested composition

1. Quote the request verbatim, as a code block, with nothing softened.
2. Count what is measurable about the gap in the masthead: words in the
   prompt against decisions it leaves open, or the surfaces it silently
   touches.
3. List what the request omits as observations the user ticks, each naming
   where it was found in the code and what it costs to leave open. Ticking is
   the user telling you which gaps are real, so mark the block
   `data-response-kind="follow-up"` — it is not a decision about the work.
4. Offer the readings the request will bear as one decision, tagged and
   recommended, so the ambiguity resolves into a choice rather than a debate.
5. Set the better prompt beside the original as a code pair, with the added
   sentences selected and annotated: what each one adds, and the guess it
   removes.
6. Ask for the part only the user can write — the acceptance line, the
   deadline, the constraint nobody else can know — and leave it a free note.

A table comparing “what the second prompt adds” against “the guess it removes”
carries more than prose here, because the cost of an omission is the argument.
Keep the observations concrete enough to be checkable: a file path and a read
line beat a category.

## Interaction instructions

- Never tell the user their request was bad. The page shows what a reader has
  to invent to start, and lets the user close each gap or dismiss it.
- Every observation needs a source badge and a real path. An unsourced gap is
  a guess about a guess.
- Treat a recommended reading as unresolved until the user picks one.
- Regenerate the prompt on every tick, choice, and note, so the reply is
  always the current request rather than the original one.
- Phrase the reply as a request to an implementer, and close it with an
  invitation to correct single lines rather than the whole thing.
- Keep the original request and the improved one both readable without
  JavaScript.

The representative example uses “add search to the docs site” because a
six-word request with an existing search surface, five published versions, and
no index build step leaves exactly the kind of gap that reads as complete. It
is a direction sample only. A blind-spots page for a different request should
find its own omissions in that request's own code, not reproduce these.
