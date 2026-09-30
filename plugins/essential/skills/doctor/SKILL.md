---
name: doctor
description: Diagnose a structural issue observed while reading needed .state/ files, including overview.md, or fulfill an explicit state diagnostic request. Check one affected stream by default; use the state-wide scope for an observed overview issue or explicit global investigation. Propose only repairs needed for the reading, with approval and an owning stream lease.
requirements:
  model: capable
  effort: deliberate
argument-hint: "[work-id] [--strict]"
---

# Doctor

Diagnose an observed problem while reading needed `.state/` work memory, or fulfill an explicit state diagnostic request. The default source tree holds the shared state for every checkout. Diagnosis is mechanical (`state-doctor`); judge any needed repair against the current Essential contracts, never a version token or memory.

## Boundaries

- Use when a needed `.state/` file is damaged, unreadable, or structurally inconsistent, or when the user explicitly requests state diagnosis. Do not implement, review, or resume the work itself (`essential:takeover` owns resumption) and do not touch another source tree's `works/`.
- Diagnosis never mutates anything. Repairs and migrations happen only after explicit user approval, per stream, under that stream's main-agent lease.
- Never rewrite a state file merely because the convention moved on — older formats are valid history and migrate lazily. Repair only the files needed to continue the current reading, even if diagnosis reports other findings. A structure-changing migration remains an explicit user-approved main-agent rewrite under the normal write protocol.
- Never falsify history: journal lines, tombstones, completed marks, and superseded decisions are preserved; migration reshapes structure, not truth. Unrecognized files are reported and preserved, never deleted, renamed, or reinterpreted by guesswork.

## State gate

Before creating or materially rewriting a project artifact, read the absolute `state.md` path injected by Essential; if unavailable, stop artifact writes and report the missing contract. Read its work-state contract sibling and `truth.md` as well — together they define the current canonical topology and file shapes. Run the resolver read-only to locate the active workspace and `.state/`; on `requires_ignore`, report per the contract. On `work_id_required`, identify the affected stream for a stream diagnosis; an observed overview issue or explicit global request may be diagnosed without selecting a stream, but repair still needs an owning stream lease.

## Workflow

1. **Scope.** Resolve the affected work ID, supplied as `[work-id]` or identified by the state reading that revealed the issue, and diagnose only that stream with `--work-dir <work_dir>`. If the affected stream is unknown, identify it before stream diagnosis. Use `--state-dir <state_root>/.state` only when the observed problem is in needed `.state/overview.md`, or for an explicit global or overview investigation; findings in other streams do not expand the repair scope.
2. **Run the doctor.** Invoke `"$ESSENTIAL_ROOT/skills/doctor/scripts/state-doctor" --json` with the selected scope, passing `--strict` through when given. Collect the findings; the doctor is read-only and does not judge prose.
3. **Inspect only what the reading needs.** Compare the affected files with the current contracts' topology and file shapes. The `Written under:` stamp in `state.md` explains format drift but confers no authority: current contracts judge the needed repair. Classify relevant observations:
   - **defect** — broken structure the doctor flagged (dangling dependencies, contradictory statuses, lease conflicts, broken links, an inferred `Location`, a `completed` stream with no applicable landing evidence or with unowned outlives-me debt, a stream with no charter at all, a `state.md` whose phase does not parse);
   - **format drift** — valid but older shapes that would migrate at the next explicit rewrite (a retired lifecycle word, a non-conforming work ID, an overview that still carries environment narrative);
   - **informational** — unrecognized-but-harmless files, or free-form sections the doctor could not parse. A retired lifecycle word is **always** drift and never a defect: the record was true when it was written. If unreadable `state-metadata` blocks the needed reading, repair it and re-run diagnosis before relying on phase-gated checks; a zero result while the phase is unreadable proves nothing.
4. **Propose the needed repair.** Name the specific `.state/` files required to continue reading, the findings that block that reading, the proposed changes, and the history preserved. Report incidental findings without proposing retrospective repairs. For a missing needed stream after state loss, offer recovery from a copy, identify any facts lost since that copy, then resume through `essential:takeover`. Where needed structure has drifted, use the applicable entry in **Structure migration** below. For an overview repair, select the stream whose row is needed, or the current work stream for a global overview section; if neither is identifiable, leave diagnosis read-only until an owner is selected. Ask for explicit user approval of the concrete repair; questions about prose meaning go to the user instead of becoming silent edits.
5. **Repair under the lease.** For every approved repair, including an overview repair, check the selected stream's `lease.json` via `state-lease` — a live foreign lease stops repair with a report; an expired lease is claimed with the explicit `takeover` verb and journaled. Without an owning stream lease, do not write under `.state/`. Apply only the approved changes to files needed for the reading: journal first, preserve recorded history, and follow the contract's write protocol. Release the lease when done.
6. **Confirm.** Re-run the doctor with `--work-dir` for the repaired stream, or `--state-dir` for an approved overview repair. Confirm the blocking findings are gone; report incidental or unresolved findings without expanding repairs. Return every created or materially rewritten path in `generated_files`.

## Structure migration

Use an entry only when its finding blocks the needed reading and the proposed `.state/` file repair has explicit approval. These offers never rewrite what a record already claims about the past.

| `check` | Offer |
|---|---|
| `overview-monolith` | Move environment narrative into `.state/environment.md` and symptom→cause→do-this-instead lines into `.state/traps.md`, creating either when missing. `Goal` and `Requirements` are authored, never derived: carry them byte-for-byte. Drop a preamble paragraph only where the current table contradicts it, and say which. |
| `overview-state-systems` | Rewrite `## State systems` as exactly three presence rows: version-controlled documentation and local operational state are `configured`; external specification authority is `none`, `configured`, or `pending`. Keep every URL and revision anchor in the owning stream's `goal.md`. |
| `overview-legacy-specification` | Before removing a legacy `Spec` or mixed `Links` column, verify each value against its stream charter, preserve exact provenance there, and atomically rewrite the global table with documentation-only `Documentations`. |
| `lifecycle-vocabulary` | Rewrite the field as phase plus a nullable `Blocked on:` line — `initialized`→`planned`, `active`→`working`, `blocked`→`Blocked on: <who or what>` at the phase the stream actually sits in, and `retiring`→`completed` with no retention blocker because archival readiness is derived. Never an unnamed blocker: name it, or write `unknown`. |
| `motion-vocabulary` | Rewrite the retired `- Motion:` line — `running`→drop the line (nothing is blocking the stream), `idle <N>d`→`Blocked on: unknown` (no reason was ever recorded, and inventing one would be false), `waiting: X`→`Blocked on: X`, bare `waiting:`→`Blocked on: unknown`, anything else by hand as the named blocker or `unknown`. Duration is never typed: it derives from `Last progress`. |
| `last-progress` | Derive the value from the last genuine journal `status` event. Where the journal is absent, a stub, or older than what `state.md` records, fall back to `state.md`'s dated lifecycle or landing evidence and mark the cell `(from state.md)` — an unmarked fallback is false freshness in a different costume. |
| `journal-segments` | Resolve the journal to its newest `NN-journal-*.md` segment before reading or appending; `journal.md` is an index there and its tail is not an event. |
| `journal-freshness` | Record the missing transition, or take the marked `state.md` fallback. Never write a `status` line to make a stale stream look fresh. |
| `location` | Record the absolute path plus tree kind, or `-`. An inferred anchor is replaced by `-`, never kept: inferring manufactures a fact the tree never stated. |
| `overview-budget` | Replace the cell with one imperative sentence under 200 characters and move the narrative into the stream's `state/working.md`. |
| `retention` (`warning`) | Once the applicable landing evidence has aged three days, move `works/<id>/` to `.state/archive/<id>/` **first**, then drop the overview row. While the stream sits in `works/` the row is its only index, so dropping it first hides live work; the order is not negotiable. |
| `retention` (`info`) | A completed stream at `Blocked on: <named blocker>` **does not archive**, however old: `archive/` is resolver-skipped, so archiving drops its open question out of `Awaiting you`. Answer the named blocker, or give its answer a carrier that outlives the stream; the stream archives then and not before. `Blocked on: unknown` names no question, so it holds nothing and archives on the ordinary schedule. |
| `state-metadata` | Split `Phase` and any `Blocked on:` onto their own lines, or add `Phase`. The reader is anchored one key per line, so a packed `- Phase: \`x\` · Blocked on: \`y\`` parses as neither — and `retention`, `merge-evidence`, `blocked-on` and `outlives-me` then skip the stream in silence and report a clean zero for it. `Blocked on:` is nullable: absent means not blocked, and is never added to satisfy a shape. |
| `work-id-naming` | **Report only.** A work ID is an identity and is never renamed or reused; the fix is forward-only, on the next stream. |
| `charter-provenance` | Add `Charter: approved \| reconstructed \| absent` to `goal.md`, recording what is true. Mark `approved` only where the user approved it; reconstruct from recorded history otherwise and leave it `reconstructed` until they do. |
| `specification-provenance` | Write the canonical seven-field `goal.md` section: source kind, canonical specification, accepted revision/base, optional local materialization, matching receipt, last verification status, and last verified time. Resolve `pending` before `working`; never infer anchors from the global overview. |
| `merge-evidence` | Preserve this check ID. For coding work, record merged pull request(s) or the observation on the default branch. For non-coding work, record explicit acceptance and a promotion receipt listing every promoted durable path or evidenced `not required`. Without the applicable landing evidence, return the stream to `reviewing`; an author's assertion alone is never evidence. |
| `outlives-me` | Give every item an owner: promote it, open a successor stream, or file it in `.state/backlog.md` as id, one clause, source stream, owner or `unowned`. Filing is a rehoming that survives the row drop, not a deletion. |

Two rules bind every migration above:

- **Journal a migration as `sweep`, never `status`.** A `status` line dates today against a transition made weeks ago and destroys the freshness signal the migration exists to produce.
- **Absent is not empty.** Where a stream has no `state/unresolved.md`, the overview's `Awaiting you` records *no source*, never "no open questions".

## Verification

- Diagnosis ran read-only; nothing changed before user approval.
- Every applied repair traces to an approved finding that blocked the needed reading; unrecognized files were preserved and reported.
- No journal line, tombstone, completed mark, or superseded decision was removed or reworded; migrations were journaled as `sweep` under the stream's lease, and no work ID was renamed.
- The post-repair doctor run confirms the blocking findings are resolved.

## Completion

Report the scope, relevant findings by classification and severity, approval decisions, repaired paths and journal entries, incidental findings left untouched, the post-repair doctor result, and `generated_files`.
