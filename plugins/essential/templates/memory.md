# Agent Memory Template

Use this schema for every agent memory at `<state-root>/memories/<agent-name>/MEMORY.md`. `<state-root>` is the `state_root` the handover names, else the one the workspace resolver in [state.md](../references/state.md) reports; when the resolver reports no state root, keep no memory. The owning agent creates the file lazily and is its only writer, under the exception in [state-systems.md](../references/state-systems.md#access-boundary); never seed empty memory files.

## Template Instructions — Remove After Initialization

This section instructs the agent that initializes the memory file. Apply these rules, then remove this entire section from the instantiated `<state-root>/memories/<agent-name>/MEMORY.md`:

1. Store only durable, repository-specific knowledge that will improve a future task for this role.
2. Repository source, authoritative specifications, and current runtime evidence always override memory.
3. Give every entry evidence and a `Last verified` date.
4. When evidence contradicts an active entry, replace the active claim and move the superseded claim to `archive/YYYY-MM.md` with the reason it changed.
5. Keep the primary file at or below 150 lines and 20KB. Before either threshold, consolidate duplicates, move detailed material only to `topics/<stable-area>/<specific-subject>.md`, and archive obsolete history. Use lowercase kebab-case names for a durable repository area and concept that remain recognizable out of context. Extend an existing subject file instead of creating one per task. Never use task IDs, dates, counters, transient states, result counts, or conclusion sentences as path components. Keep topic files below `topics/`, never beside `MEMORY.md`.
6. Never store secrets, credentials, personal data, raw task logs, transient status, or unresolved sensitive exploit details.

## Current Facts

### <fact>

- Evidence: `<path, command, specification, issue, or result>`
- Last verified: `YYYY-MM-DD`
- Applies to: `<scope>`
- Fact: <concise current claim>

## Reusable Lessons

### <lesson>

- Evidence: `<path, command, experiment, or result>`
- Last verified: `YYYY-MM-DD`
- Lesson: <what to repeat or avoid, and why>

## Watchpoints

### <risk or drift signal>

- Evidence: `<path, issue, failure signature, or result>`
- Last verified: `YYYY-MM-DD`
- Watch for: <condition and the action it should trigger>

## Topic Index

- [`topics/<stable-area>/<specific-subject>.md`](topics/<stable-area>/<specific-subject>.md) — <one-line summary of the durable detail>

## Archive Index

- [`archive/YYYY-MM.md`](archive/YYYY-MM.md) — <superseded claims and why they changed>
