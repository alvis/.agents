---
name: doctor
description: Check local MDC state and durable ADR integrity, diagnose legacy Markdown state, and perform user-approved migration or receipt-based restore. Use for .state/ health checks, before resuming old work, after suspected corruption or drift, or when cutting legacy state over to MDC; this skill repairs records, never the work itself.
requirements:
  intelligence: medium
argument-hint: "[work-id] [--strict] [--migrate-state=mdc-v1 --backup-dir=<absolute-directory> | --restore-state=<migration-receipt>]"
---

# Doctor

Diagnose centralized `.state/` work memory and durable ADR integrity. Ordinary Doctor is read-only. Only explicit `--migrate-state=mdc-v1` and `--restore-state` modes may change state, after their inventory-bound approval gates.

## Boundaries

- Use for structural diagnosis, explicit Markdown-to-MDC migration, receipt-based restore, and user-approved ADR repair. Do not implement, review, or resume the work itself; `essential:takeover` owns resumption.
- Runtime readers and writers never migrate or repair Markdown. Only this skill's explicit migration mode may cut legacy state over to MDC.
- Migration requires the exact `mdc-v1` target, an existing external absolute backup directory, and explicit approval of the script's diagnosed inventory.
- Preserve journal events, tombstones, completed status, superseded decisions, and unrecognized files. Never reinterpret or delete them by guesswork.
- Present every ADR repair for explicit approval. Surface prose-integrity questions instead of silently rewriting meaning.

## State gate

Read Essential's injected `state.md`, its state-format sibling, `truth.md`, and `lease.md`. Run the resolver read-only to obtain `state_root`, `durable_root`, and any selected `work_dir`. On `requires_ignore` or `work_id_required`, report the resolver result and stop.

## Workflow

Select exactly one mode. `--migrate-state` and `--restore-state` are mutually exclusive; `--strict` applies only to ordinary diagnosis. Reject migration without the exact value `mdc-v1`, migration without `--backup-dir`, restore with `[work-id]`, or any unrecognized combination without running a write command.

### Ordinary diagnosis

1. With `[work-id]`, invoke `<skill-root>/scripts/state-doctor --json --work-dir <work_dir> --repository-root <durable_root>`. Without it, use `--state-dir <state_root>/.state --repository-root <durable_root>`. Pass `--strict` only when supplied. A missing `.state/` or ADR tree is a clean report.
2. Treat `migration_required` as diagnosis, not an ordinary repair. Report the legacy scope and offer a separate `--migrate-state=mdc-v1` invocation. Never read or rewrite legacy Markdown in ordinary mode.
3. Group MDC findings by stream as defects or informational observations. Read Essential's `adr.md` for ADR findings; effective ADRs are direct children of `decisions/`, archived ADRs are direct children of `decisions/superseded/`, and the architecture index lists effective ADRs only.
4. For each MDC defect and ADR finding, state the exact repair, preserved history, and untouched paths. Ask which repairs to approve. Informational observations need no action; prose meaning requires a user decision.
5. Apply approved MDC repairs through the lease-protected MDC write protocol. A live foreign lease stops that stream; an expired foreign lease requires explicit takeover. Apply approved ADR repair without changing historical bodies or successor ADRs.
6. Re-run ordinary Doctor over the repaired scope. Require approved findings to be gone and return every created or materially rewritten path in `generated_files`.

### Markdown-to-MDC migration

Resolve `scripts/migrate-state.ts` from this skill root. Do not reproduce its parsing, parity, transaction, or rollback logic.

1. Diagnose without approval:

   ```text
   bun <skill-root>/scripts/migrate-state.ts --state-root=<state_root>/.state --backup-dir=<absolute-directory> [--work-id=<work-id>]
   ```

   The backup directory must already exist, be outside the repository, and have no symlink-mediated path. Omitting `[work-id]` inventories live and archived streams.
2. Require JSON `status: "approval_required"`. Present the complete `inventory` and ask for explicit approval. `nothing_to_migrate` is a clean no-op. `invalid`, malformed JSON, a nonzero exit, or any other status stops without retrying with approval.
3. After approval, run the same command once with `--approve`. The script acquires applicable leases, verifies the unchanged legacy snapshot, creates the hashed external backup and receipt, stages and compares the MDC model, publishes linked documents before roots and `overview.mdc` last, runs structural Doctor, removes legacy Markdown only after success, and rolls back on failure.
4. Accept only `status: "migrated"`. Return the receipt path and inventory. On failure, report the structured errors and leave the restored legacy graph authoritative; never repair a partial graph by hand.

### Receipt restore

1. Diagnose the regular receipt file without approval:

   ```text
   bun <skill-root>/scripts/migrate-state.ts --restore-state=<migration-receipt>
   ```

2. Require JSON `status: "approval_required"`. Present the receipt path and complete inventory, then ask for explicit approval. `invalid`, malformed JSON, a nonzero exit, or any other status stops without writing.
3. After approval, run the same command with `--approve=<returned-approval-digest>`. The digest binds approval to the diagnosed receipt; never reuse it after receipt bytes change. The script verifies receipt metadata and every backup size and hash before acquiring applicable leases or replacing state.
4. Accept only `status: "restored"`. Re-run ordinary structural Doctor and require `migration_required`, proving that the restored Markdown tree is intact legacy state. Report failure without deleting the MDC graph or editing the receipt by hand.

## Verification

- Ordinary diagnosis changed no state.
- No migration or restore write ran before inventory-bound approval.
- Migration returned an external receipt, passed structural Doctor, and left no authoritative Markdown/MDC mixture.
- Restore used the unchanged receipt's digest, verified backup hashes, and returned `migration_required` legacy classification.
- Every applied repair traces to approval, preserves history, and passes the post-operation Doctor run.

## Completion

Report the selected mode, scope, finding counts or migration inventory, approval decision, receipt when present, operation result, deliberately unresolved findings with reasons, post-operation Doctor result, and `generated_files`.
