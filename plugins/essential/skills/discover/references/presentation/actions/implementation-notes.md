# Implementation notes direction

Use this direction when a change is built and someone else has to understand it
before they can merge it. The page is the account the author owes the merger:
what was built against what was planned, every departure with the reasoning
behind it, the code where the decisions actually live, and a quiz on the
non-obvious behaviours a reader of the diff alone would get wrong.

It is not the [build journal](build-journal.md), which it closely resembles.
The journal is written while the build is still moving and asks the *author's
reviewer* to triage each divergence — accept as shipped, or reopen — and closes
on a verdict about the work. Implementation notes are written when the work is
done and ask the *merger* to prove comprehension; the questions are about what
the reader understood, not about what the author should do. When both are
wanted, journal the build during it and write the notes at the end; do not fold
the merger's quiz into the author's triage, because the two ask opposite
questions of the same deviation.

## Entry conditions

Reached from the [implementation](../../implementation.md) mode. It needs a
plan the work was measured against and a revision range the work covers. An
account written from the diff alone silently reports every decision as
intended, which is the failure this direction exists to prevent.

## Suggested composition

1. Open with what shipped and what it cost: a short summary and counters for
   entries, deviations, and the judgements still owed.
2. Walk the build in order, classifying each moment as plan-confirmed,
   discovery, deviation, or todo. The confirmations and discoveries are what
   give the deviations their scale; a log of deviations alone reads as a build
   that went wrong.
3. Expand each deviation into what the plan said against what the code
   revealed, then the choice made and why it was the conservative one, and what
   would trigger revisiting it. A deviation with no account of its reasoning is
   an unreviewed decision wearing a label.
4. Show the code that carries the decisions as a before/after pair, with the
   passages a reader would otherwise skim past selected and annotated.
5. Say what folds back into the plan: which deviations become its new text,
   which stay as recorded exceptions, and what the next owner inherits. This is
   where a free note belongs — the author's read of what is still unsettled.
6. Close with the merge quiz.

## The quiz

Each question is one non-obvious behaviour the change introduces, phrased so
that someone who read the diff and not the reasoning would answer it wrongly.
Every question names the section that explains it, and a wrong answer sends the
reader back to that passage rather than to the answer. There are exactly two
terminal states: cleared to merge, or not yet, with each miss linked to its
section.

- A quiz option is never marked as recommended. A recommendation would print
  the correct answer into the generated reply and colour a wrong answer as a
  deliberate change; the correctness lives on the option and is read only by
  the scoring runtime.
- Exactly one option per question is correct, and the section a question points
  at must exist on the board. Both are refusals, because a quiz that scores
  nothing or links nowhere is worse than no quiz.
- The gate states progress before anything is answered, so the reader knows how
  many questions stand between them and the merge.

## Interaction instructions

- Make every section annotatable, including the timeline, each deviation, the
  code pair, and the fold-back.
- The reply carries the reader's answers and notes. It does not restate the
  correct answers — the reader's own misses are the finding, and reprinting the
  key would let the quiz be passed by copying the reply.
- Scoring is live: the gate updates on every answer, and its misses list is the
  reader's route back into the board.
- Keep the log, the deviations, and the code pair readable without JavaScript.
  Only the scoring needs the runtime, and an unscored board still teaches.
