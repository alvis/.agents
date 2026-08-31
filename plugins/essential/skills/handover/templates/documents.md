# Typed handover documents

The generated schema from `scripts/state-model-v1.schema.ts` is the field and
requiredness authority. Use these shapes only to place handover-owned entities.

## Stream root

`state.mdc` declares `schema: essential.state/v1`, `kind: stream`, its immutable
work ref and ID, then links state detail through typed `state.source` blocks.
It links `goal.mdc` only when `charterStatus` is not `absent`; an absent-charter
bootstrap has no charter document or source link. Pending specification fields
may exist inside a present charter. The stream entity owns phase, revisions,
task registry, continuation, records, review, submission, and completion.

## Continuation

Store current focus, handback point, next owner, next action, source anchor, and
fast relative document paths in the stream's continuation entity. Do not copy
history, charter text, evidence bodies, or decision rationale into it.

## Project root

`overview.mdc` declares `kind: project`, owns project identity, goal,
requirements, and update time, and links every live stream plus
`environment.mdc` and `traps.mdc`. Its stream summaries are derived from linked
validated roots. Specification locators remain in each charter.

## Working detail

`state/working.mdc` is a linked child owned by the work ref. It carries typed
current-focus and handback entities only. The stream root remains the complete
registry.

Every graph is staged and validated before the lease-protected transaction.
Children are committed before `state.mdc`; `overview.mdc` is the final project
commit point.
