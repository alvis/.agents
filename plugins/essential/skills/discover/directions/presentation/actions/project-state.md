# Project state direction

Use this direction when the question is where work already in flight stands.
The page is an operations view of the local state tree: what is blocked and who
has to move it, what every workstream still owes, how far each has got, and
what changed most recently. It answers "what is the state of things right
now", which is the one question a hand-written status update is always
slightly wrong about.

It is the only direction whose data is not authored. `render-page/state/cli.ts` reads
`.state` and writes the board data; `scripts/render-page/cli.ts` renders it. That is a
constraint on what the direction can promise: whatever the tree does not say,
the board cannot show, and the honest response to a gap is to draw it rather
than to fill it in.

## Entry conditions

Reached from the [state](../../state.md) mode. Build it against a real `.state`
tree with real workstreams; a board rendered from a fixture tells the reader
about the fixture. A tree with no `works/` directory is not a state tree, and
the mode stops there rather than rendering an empty board.

## Suggested composition

1. Put blockers first, each one naming its stream, the task, what is stuck, the
   owner, and the `unblock:` action recorded against it. When nothing is
   blocked, say so plainly — an empty section reads as a missing section.
2. Give each live stream a group holding only its unfinished tasks, and let
   both open: the stream for how it was read, and each task for every column
   the table recorded against it. A row that shows an owner and a status but
   cannot be opened sends the reader back to the tree for the rest, which is
   the trip the board exists to save. A stream whose tasks are all done says
   that instead of showing an empty group.
3. Show how far each stream has got as a progress reading, and who owns each
   one. A stream with no tasks recorded has no meaningful proportion and is
   left out of the reading rather than shown at zero.
4. Order the recent activity by when each stream was last updated, so the top
   of the rail is where work is actually happening.
5. Close with how the tree read: one row per stream with the phase key it used,
   its phase, its timestamp and its task count, then a note for each thing that
   was hard to read.

## Structural fidelity

- Archived streams are excluded by location. The read enumerates `works/` and
  nothing else, so there is no name to match and no flag to get wrong. A stream
  whose phase is `completed` stays visible while its `Updated` timestamp is
  within three days, because work finished but not yet archived is still what
  someone needs to see.
- The masthead carries live stream count, open tasks, blocked count, and the
  time the tree was read. A state board without its read time is undated
  evidence.
- Data-quality problems are drawn on the board, never raised as refusals: which
  streams spelled the phase key `Phase:` and which `Lifecycle status:`, which
  table rows did not have the canonical nine columns, and which streams were
  set aside with the reason for each. A board that refuses to open because one
  workstream used a different header is useless exactly when it is needed.
- A mark and a status that disagree count the task as blocked. The cheaper
  mistake is showing a task that turns out to be fine.

## Interaction instructions

- This board asks nothing and carries no reply. It is a report, and its drawer
  shows no unanswered count and no copy control — the reader's next move is in
  the state tree, not in a generated prompt.
- Every section stays annotatable, so a reader can still mark a row that looks
  wrong; the annotation is feedback on the reading, not an answer.
- Keep it readable without JavaScript. Nothing on this board depends on the
  runtime to convey its state, disclosure included: the groups and rows open
  through native `details`, which print open and are already disclosures to a
  screen reader.
