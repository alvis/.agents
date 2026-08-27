# Work-memory templates

Use the Essential state contract as authoritative. These shapes add
handover-specific content; all timestamps are one real UTC ISO-8601 value.

## `goal.md`

```markdown
# <Work headline> charter

- Work ID: `<work-id>`
- Charter: `<approved|reconstructed|absent>`
- Charter revision: `<n>`
- Updated: `<timestamp>`
- State: [state.md](state.md)

## Goal
## Scope and non-goals

## Success criteria

| ID | Criterion | Acceptance evidence |
|---|---|---|
| `SC-1` | `<criterion>` | `<expected evidence>` |

## Specification notes

- Source kind: `<source-kind>`
- Page ID: `<page-id>`
- Base ID/revision: `<base-id>/<revision>`

## Specification provenance

- Specification: [Exact document](<exact-document-link>)
```

The charter owns goal, scope, success criteria, and specification provenance;
`state.md` links to it and never restates them. `## Specification notes` is
metadata-only: record the source kind, page id, and base-id/revision the
charter was authored against there. The canonical specification stays the
sole authority; `## Specification provenance` contains only exact document
links or its explicit `None` marker.
Record one line per exact specification document, or exactly
`- Specification: None` when the stream has no specification. A newly
bootstrapped stream may temporarily record exactly `- Specification: Pending
user confirmation`, but it must resolve before active execution.
`Charter revision` bumps only on explicit user approval, journaled in
`state/journal.md` and `state/revisions.md`.

## `state.md`

```markdown
# <Work headline>

- Work ID: `<work-id>`
- Phase: `<planned|working|reviewing|completed|archived>`
- Updated: `<timestamp>`
- Charter: [goal.md](goal.md)
- Current focus: [working.md](state/working.md)
- Journal: [journal.md](state/journal.md)
- Plan source: `state.md`
- Plan revision: `<n>`
- State revision: `<n>`
- External anchor: `<task|issue|PR|Notion URL>`

## Status

<Current phase/task roll-up, owner, and exact next action.>

## Tasks

| ID | Mark | Status | Task | Depends on | Required | Acceptance | Owner | Evidence / next action |
|---|---|---|---|---|---|---|---|---|
| `LFE` | `⧗` | `working` | `<summary> [targets: none]` | `-` | `yes` | `<criterion>` | `<owner>` | `<evidence or action>` |
| `LFE01` | `✓` | `done` | `<summary> [targets: src/example.ts]` | `-` | `yes` | `<criterion>` | `<owner>` | `<evidence>` |

## Plan graph
## Context

- Current state: [<brief revision-aware status and next action or blocker>](#status)
- Related decisions:
  - [<directly related summary of at most 19 words>](decisions/<slug>.md)
  - [<another directly related summary of at most 19 words>](decisions/<slug>.md)
- Related recent work:
  - [<directly related summary of at most 19 words>](state/journal.md)
  - [<another directly related summary of at most 19 words>](state/journal.md)

## Current state and file status
## Approved decisions and accepted assumptions
## Outstanding proposals
## Dependencies, blockers, risks, and pivot signals
## Reviews and dispositions
## Evidence and validation
## Durable promotion
## Specification sync and revalidation
## Completion receipt
## Continuation
```

The `## Context` lines follow
[Making plans](../../../references/directions/plan.md). Under each label, keep
one item per directly related record and remove the second example when only one
qualifies. When none qualifies, replace the nested examples with
`- None — no directly related record`.

Add one further metadata line, `- Blocked on: <named blocker>`, only when the
stream is stopped — or `- Blocked on: unknown` when it is stopped and nobody
recorded why. The line is absent from the template because absence is a fact:
it means the stream is not blocked. It is never carried as an empty or
placeholder value, which would claim a blocker that does not exist and cost the
distinction between a healthy stream and a forgotten one
([state-format.md](../../../references/state-format.md)).

The root table contains the complete registry: every three-letter parent and
every `AAA01`-style child exactly once. A resumable `state/*.md` child may mirror
only its parent's existing subset and cannot introduce an ID. Store full IDs in
`Depends on`; parent edges target parents and child edges target siblings.
Every Task cell is exactly `<summary> [targets: <comma-separated paths>|none]`.
Marks and status words use `- planned`, `⧗ working`, `✓ done`, `X failed`,
`! blocked`, or `⊘ cancelled`. Graph notation and diagrams are derived display,
not authority.

`## Outstanding proposals` preserves the proposal inventory across the state
rewrite: every `proposals/` child still awaiting user approval and every approved
proposal not yet implemented, each with its status and child path, so a
same-machine resume reads the outstanding approval/implementation work from
`state.md` without scanning the folder. Omit the section only when no such
proposal exists.

`## Completion receipt` appears once the stream reaches phase `completed` and
holds its applicable landing evidence, promoted durable paths, and each outlives-me item
with the owner that took it; the stream's overview row is generated from it.
Omit it before then.

File substates: completed; `need-draft`; `need-completion`; `need-fixing`;
`need-testing`; `need-linting`; `need-refactoring`; blocked. Record path,
substate, remaining action, evidence, and blocker. Use semantic `state/*.md`
children for genuinely resumable execution detail. Numeric split children are
reserved for a shared file that exceeded its size limit.

The `## Continuation` section persists, on disk, everything a resume needs to
route the next step: `Current task` (full executable task ID or
none), `Next owner` (exact continuation owner), `Next action` (one sentence), and
`Continuation intent` (a capability-level work-type descriptor — for example
`specification-led implementation` or `generic coding implementation` — never a
fixed skill name). A takeover reads these fields straight from `state.md`.

## `overview.md`

The global index beside the centralized `.state/works/`: one table of
every work stream on the machine, so a single read shows all outstanding work
and which checkout each is worked in. Handover upserts only the rows for the
streams it refreshed and preserves every other row byte-for-byte. Follow this template:

```markdown
# State overview

- Updated: `<timestamp>`

## Goal

`<the project's goal, one short paragraph>`

## Requirements

- `<overall requirement the end result must satisfy>`

## Specifications

- `None` or one or more project-level external Markdown entry links

## Awaiting you

| Stream | Question | Waiting since |
|---|---|---|
| `<work-id>` | `<the question, as the user must answer it>` | `<date> (<n>d)` |

## Streams

| Work ID | Phase | Blocked on | Last progress | Headline | Next action | Location | Documentations |
|---|---|---|---|---|---|---|---|
| `<work-id>` | `<planned\|working\|reviewing\|completed>` | `<named blocker\|unknown\|->` | `<date> (<n>d)` | `<one line>` | `<one imperative sentence, ≤200 chars, or ->` | `<absolute checkout path> (<git-worktree\|jj-workspace>)` or `-` | `[<title>](<promoted docs path>)`, `<capability>`, `<capability> (pending-publication)`, or `-` |

## Recently landed

- `<work-id>` — `<one line>` `<merge date>`
```

Every cell's derivation, the `Next action` budget, the `Last progress` rule,
and the sort order live in
[overviews.md](../../../references/overviews.md); this template is only their
shape. Handover fills `Goal` and `Requirements` from user intent when creating
a brand-new overview, or leaves an explicit `-` for the PM to resolve — never
inventing them from stream files — and preserves them byte-for-byte
afterwards, exactly like unrefreshed rows.
When creating or reconciling an absent or empty `Specifications` section, ask
whether an external specification store exists. A none response writes
exactly `- None`; a yes response writes only the supplied project entry links.
If the user says yes but supplies no links, retain a pending marker and the
user question rather than writing `- None`. Never derive this section from the
Streams table or put an exact stream specification there.

## `state/working.md`

```markdown
# Current focus

- Updated: `<timestamp>`
- Status: `<one sentence>`
- Working now: `<one narrow outcome>`
- Handback point: `<exact next action or blocker>`

## Fast paths
- State: [state.md](../state.md)
- Specification: [<exact relative path>](<exact relative path>)
- Source/test: [<relative path>](<relative path>)
- Active decision/design/review/evidence: [<relative path>](<relative path>)
```

Aim at approximately 4,096 bytes by editing, not a gate. Never include the full
plan, history, completed inventory, copied spec, or review findings.

## Lazy work overviews

`proposals.md`, `changes.md`, `decisions.md`, and `design.md` are created with
their first child and then retained until work closes. Each contains purpose,
one headline, canonical status counts, last PM reconciliation timestamp, and a
table of child headline/status/relative path. Never copy child detail.
