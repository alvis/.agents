# State mode

Use this mode when the unknown is where work already in flight actually stands,
and the local state tree is the only honest source for it.

1. Resolve the target repository's `.state` root. The tree it must contain is
   `works/<id>/state.md`; a directory without one is not a state tree and the
   mode says so rather than rendering an empty board.
2. Read every workstream under `works/` and nothing else. Archived streams live
   under `.state/archive/` and are excluded by their location alone — the read
   never enumerates that path, so no name match, flag, or filter can be got
   wrong. A stream whose phase is `completed` is still shown while its
   `Updated` timestamp is within three days of the run, because work finished
   but not yet archived is still what someone needs to see.
3. Take each stream's phase, owner, next action, and marked task table as
   written. The phase is spelled `Phase:` in some streams and
   `Lifecycle status:` in others; read both, and where a key repeats take the
   first occurrence, which is the one a reader sees at the top of the file.
4. Roll the task marks up per stream: `!` or a `blocked` status is a blocker,
   `✓`/`done` is finished, everything else is in flight. A mark and a status
   that disagree count as blocked, since the cheaper mistake is showing a task
   that is fine.
5. Order the board by what a reader has to act on: blockers and their
   `unblock:` action first, then a lane per stream, then how far each stream has
   got, then what changed most recently. Nothing on this board asks the reader a
   question — it is a report, and it carries no reply.
6. Say on the board what was hard to read: which streams used which phase key,
   which table rows did not have the canonical nine columns, and which streams
   were set aside and why. A board that refuses to open because one workstream
   spelled a header differently is useless exactly when it is needed, so a
   data-quality fact is drawn, never raised as a refusal.

Complete with the live streams, the blockers and their named unblock actions,
the streams set aside with the reason for each, and the reading problems the
tree presented.

Use the **project state** direction in [presentation](presentation.md). The
board is generated from the tree rather than written by hand — `state-board.ts`
reads `.state` and emits the board data, `render-page.ts` renders it — so the
work in this mode is reading the tree correctly and saying what it could not
read, not authoring sections.
