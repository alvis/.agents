# Checkpoint owned work

The main agent registers a runtime session after acquiring its work lease, before material work. Use the exact session ID supplied by the runtime (the SessionStart context renders it as JSON); a lease label or process ID is not a substitute. This is an internal lifecycle protocol, not a user confirmation gate.

Use the documented invocations below or the scripts' `--help` output as the interface. Read their source only when that interface is unavailable or implementation debugging requires it.

```bash
"$ESSENTIAL_ROOT/scripts/state-checkpoint.ts" track \
  --work-dir "$WORK_DIR" --token "$LEASE_TOKEN" --session "$SESSION_ID"
```

Registration alone creates no pending obligation. It preserves a resumed session's unfinished checkpoint. The record lives in `state/checkpoints/<session-sha256>.json` under the resolved work directory and is written only through the lease-verified state writer. No owned stream means no registration and no `.state/` write.

## Record material changes

After a successful material source or external action, decision, task transition, or newly accepted result, mark its persistence obligation before continuing:

```bash
"$ESSENTIAL_ROOT/scripts/state-checkpoint.ts" dirty \
  --work-dir "$WORK_DIR" --token "$LEASE_TOKEN" --session "$SESSION_ID" \
  --reason "$MATERIAL_CHANGE" --event-id "$EVENT_ID"
```

Use the action/result identity for `EVENT_ID`; an immediate duplicate handback does not advance the generation. Read-only operations, failed actions, no-op edits, and unchanged observations create no obligation. `state-write` automatically advances registered ownership when canonical work bytes change, including journal or table writes. It excludes artifact receipts, lease heartbeats, and checkpoint bookkeeping. Domain owners must explicitly record source/external actions and decision-only changes: filesystem hooks cannot discover an unreported semantic decision.

Append the event to `state/journal.md`, reconcile affected tables, and refresh the owned stream's overview row when its derived values changed. Preserve other streams' overview rows. Subagents return material results immediately to the main agent; they never receive the lease or write a checkpoint.

## Acknowledge the checkpoint

Read the record's current `generation`. Once the journal, affected tables, and overview cover that generation, acknowledge it with any additional reconciled work-relative table paths:

```bash
"$ESSENTIAL_ROOT/scripts/state-checkpoint.ts" complete \
  --work-dir "$WORK_DIR" --token "$LEASE_TOKEN" --session "$SESSION_ID" \
  --generation "$GENERATION" [--file "$AFFECTED_TABLE" ...]
```

The helper rejects a moved generation, missing required files, an unchanged journal event file, or a missing/ambiguous owned row in the overview's `Streams` table. For a segmented journal, the newest numbered segment carries events; the index need not change. Plain and backticked Work IDs follow the overview template. The receipt binds the journal index and event file, root state, recorded affected files, and owned overview row. The main agent remains responsible for their semantic agreement; file hashes cannot judge prose. Other streams' overview edits do not reopen this checkpoint. Automatic recording preserves the originating `state-write` lease duration. Complete before releasing the lease; release never discards pending recovery evidence.

## Stop recovery

`stop-first` allows Stop when this session has no registered owned work, no pending material generation, or an acknowledgement already covers it. A pending checkpoint requests one repair per applicable turn. The retry key uses the exact runtime session plus turn ID, or the UserPromptSubmit nonce when Stop omits a turn ID. Without either turn signal, suppression covers that pending episode. Further repair writes cannot create a retry loop, and `stop_hook_active` continuations never block again.

The hook reads work records but writes only disposable temporary suppression markers, after successful feedback emission. Malformed input and unidentifiable ownership never invent a work stream. Invalid stored evidence emits a diagnostic without a repair claim. Grok's stable Stop consumption remains unverified; OpenCode V1 exposes this as advisory context without a synthetic turn. [The compatibility matrix](../../../COMPATIBILITY.md) owns harness support claims.
