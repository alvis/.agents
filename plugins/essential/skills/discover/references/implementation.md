# Implementation mode

Use this mode when a change is built and someone else has to understand what it
departed from before they can merge it.

1. Pin the plan the work was done against and the revision range the work
   covers. Without both there is nothing to compare, and an account of a build
   written from the diff alone silently reports every decision as intended.
2. Walk the work in the order it happened and classify each moment as
   `plan-confirmed` (the plan held), `discovery` (something true was learned
   that the plan did not know), `deviation` (the build went somewhere the plan
   did not say), or `todo` (knowingly left for later). Date each one and name
   the file or command that shows it.
3. For every deviation, write what the plan said and what the code revealed as
   two sides of the same comparison, then the choice actually made and why it
   was the conservative one. Where the choice should be revisited, say what
   would trigger revisiting it. A deviation with no account of its reasoning is
   an unreviewed decision wearing a label.
4. Show the code that changed as before and after, with the passages that carry
   the decision selected and annotated. Select the lines that a reader would
   otherwise skim past, not the ones that are easiest to explain.
5. Close with what folds back into the plan: which deviations become the plan's
   new text, which stay as recorded exceptions, and what the next owner
   inherits.
6. Then quiz what a merger must understand before merging. Each question is one
   non-obvious behaviour this change introduces — the ones that would be got
   wrong by someone who read the diff and not the reasoning. Every question
   names the section that explains it, so a wrong answer sends the reader back
   to the passage they need rather than to the answer. Two terminal states only:
   cleared to merge, or not yet with each miss linked to its section.

Complete with the classified timeline, the deviations and their reasoning, the
annotated before/after, what folds back into the plan, and the quiz with the
behaviour each question protects.

Use the **implementation notes** direction in [presentation](presentation.md).
The quiz is answered on the board and scored live; the reader's own wrong
answers are the finding, so do not restate the correct answers in the reply.
