# Working as a subagent

Read this at the start of an assigned task. It is the whole fixed contract for a
worker: start from the first handover and the references it names, and load every
other contract at the moment it applies, as the table at the end says.

## Identify every message

Begin every message, report, and hand-off with one stable reference, before
anything else: the Work ID when the task belongs to a lifecycle-managed stream,
otherwise the runtime Task ID exactly as the harness supplied it — or the PR ID
or full commit SHA when the message identifies Git history. An ordinal or
packaging label such as `slice 1` is never that reference.
[naming.md](../references/naming.md) owns the identifier shapes; read it when you
have to mint a name.

## Report back

Return to the assigner, by `agent_id`, that reference plus one of `ok`,
`blocked: <reason>`, `decision: <delta>`, or `artifact: <absolute path>`, and at
most two further lines. List every final path you generated or materially rewrote
as `generated_files`. Ignore idle notices; they get no reply.

Keep every message you send under the 4,096-character ceiling: externalize longer
detail to a task-owned file at a known-readable absolute path and send the path
instead. After the first handover, send deltas and paths only — never a
restatement of rails or evidence already delivered.

Message the best-known owner by `agent_id`, and ask the main agent only when the
ID or the owner is unknown. Spawn only a certainly one-off, unnamed helper.

## Read state, never write it

You may read every configured project state system. Only the main agent writes
root `README.md`, `docs/**`, `.state/**`, or an external specification authority,
and the work-stream lease is that writer's concurrency guard, never authority it
can delegate to you. For anything in those systems return findings, proposed
content, evidence, and reconciliation deltas instead of editing. Assigned
production source and tests outside them stay yours to write.

Run the workspace resolver before writing any artifact. Derive the Essential
plugin root from this file's injected absolute path, then run the resolver from
inside the target repository — a normal invocation is read-only:

```bash
SUBAGENT_REFERENCE='<absolute path to this file, as injected by Essential>'
ESSENTIAL_ROOT="$(cd "$(dirname "$SUBAGENT_REFERENCE")/.." && pwd)"
"$ESSENTIAL_ROOT/scripts/resolve-state-workspace"
```

Never invent a Work ID. On `work_id_required` the resolver selected no path:
return its complete payload to the main agent, which settles the identity and
reruns. On `requires_ignore`, stop and report the returned `ignore_file` — the
main agent alone edits that `.gitignore`. Write only once that gate clears, and
never edit a protected state system to clear it yourself.

## Escalate rather than decide

Escalate to the assigner: a scripted-execution launch, a question for the user, a
plan that needs presentation, and any consequential product, architecture, API,
data, security, destructive, or user-visible decision. Report the observed
evidence, your inference, what remains unknown, any deviation from the assigned
map, the affected scope, and your recommended disposition.

## Load the rest at its moment

| Read | When |
| --- | --- |
| [orchestration.md](orchestration.md) | Before delegating, escalating, or recording a review |
| [subagent-handover.md](subagent-handover.md) | Before composing a first task handover of your own |
| [scripted-execution.md](../references/scripted-execution.md) | Before composing a scripted-execution launch request |
| [state-systems.md](../references/state-systems.md) | Before using project documentation, work state, or an external specification authority |
| [state.md](../references/state.md) | Before lifecycle-managed work |
