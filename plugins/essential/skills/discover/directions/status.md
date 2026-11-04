# Status mode

Use this mode only when the request names it, as `/discover status` does; any other status question is routed to [state](state.md) and its full operations report. It draws a Kanban board. Inside a workstream, each card is one of that stream's tasks and each lane one task status. Otherwise each card is one live workstream and each lane one phase. Every card opens a modal with the whole record behind it: a task's every column, or a stream's state header and the tasks it still owes.

1. Resolve the target repository's `.state` root as [state](state.md) step 1 does. A directory with no `works/` is not a state tree; say so instead of drawing an empty board.
2. Pass the runtime session ID announced at session start as `--session`. The board then draws the stream whose unexpired lease names this session, which is the lease that starting a stream through `essential:directions/establish-work-stream.md` or resuming one through `essential:takeover` acquires. Without `--session`, the reader falls back to `$CLAUDE_SESSION_ID`. Pass `--stream <work-id>` only when the user names a stream; it wins over the lease, and a stream that is not live is refused with the list of live streams instead of being swapped for every stream.
3. Generate the board data, then render it, with both paths in a collision-safe OS temporary directory:

   ```bash
   bun run scripts/render-page/state/cli.ts <.state> --kanban --session <runtime-session-id> [--stream <work-id>] -o <dir>/<timestamped>-status.json
   bun run scripts/render-page/cli.ts <dir>/<timestamped>-status.json -o <dir>/<timestamped>-status.html
   ```

4. Read the rules for which streams appear, how phases and tasks are classified, and what counts as blocked from [state](state.md) steps 2–4; this mode only draws them as lanes. When this session holds leases on more than one stream, or a lease cannot be read, the board shows every stream and says why rather than choosing one.
5. Present the rendered file as [presentation](presentation.md#present-the-board) orders. The board asks nothing and carries no reply; its reading section states the lease and table problems it met.

Complete with the scope drawn and why, the blocked cards with their unblock actions or blockers, and any reading problems the board stated.
