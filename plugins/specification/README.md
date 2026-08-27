# Specification

Specs with real provenance, and the pipeline that turns them into reviewed,
delivered code. Depends on `coding` and `essential`. All spec, architecture,
requirements, and Notion work routes to the `specification-expert` agent via
`references/ROUTING.md`.

## Source authority model

Every workflow distinguishes three kinds of specification source:

- **Reachable `repo:` local source** — authoritative at its exact path; an
  approved work-local copy is content-equivalent, never a second authority.
- **`local-approved:` / `inline-approved:`** — the approved work-local copy
  becomes the active-work authority after content-equivalence verification.
- **Notion-backed** — the canonical Notion spec (via its `.mdc` mirror) is
  authoritative; its revision-bound readable copy and synchronization evidence
  stay under the active work's `.state/`.

Approval always binds to exact content confirmed by direct comparison. For local or inline authority, the active work's `spec/` and `spec/provenance.json` record the approved contract, source kind, content hashes, and outputs. `spec/README.md` is the readable work-local contract and `reference.md` is optional for an intended consumer surface. For Notion authority, `goal.md` owns the canonical URL and accepted base while `spec/` plus `artifacts/spec-sync/` provide the verified work-local copy and receipt. Version-controlled `docs/**` remains durable project guidance, never a specification output.

Specification owns the work-local specification assets it derives:
`skills/spec-code/assets/capability-readme.template.md`,
`skills/spec-code/assets/reference.template.md`, and
`skills/spec-code/assets/provenance.template.json`.

## Skills

| Skill | Use when |
| --- | --- |
| `specification:spec-code` | Authoring, updating, or retrospectively documenting a technical spec; writes approved local or inline content to the active work's `spec/` and keeps Notion-backed materialization under active work state. |
| `specification:mdc` | Reading, editing, and authoring Notion-backed MDC bodies while preserving the grammar, refs, and transport-owned metadata. |
| `specification:plan-code` | Turning an approved spec into an implementation-ready plan: stable task IDs, dependency DAG, acceptance mapping. Plan approval names the exact spec base-id. |
| `specification:implement-code` | Executing an approved work item end to end: dispatches ready tasks to coding skills, enforces spec freshness before each batch, reconciles worker evidence (with `capability_id`), runs review and completion sync. |
| `specification:review-implementation` | The seven-area review (alignment, correctness, security, quality, testing, docs, style); approvals carry the full binding tuple; changed specs or task definitions return `needs_revalidation` — marking stale validity, never flipping done rows. |
| `specification:sync-spec` | Materializing a Notion spec into the work directory and completing approved changes; owns the base/local/remote decision matrix and immutable materialization receipts. |
| `specification:sync-notion` | Raw Notion transport: pairing, guarded conditional writes, per-page leases, conflict packets, and read-only identity-metadata validation. |

## Notion-backed specifications

Treat a synchronized specification as three copies:

| Copy | Purpose |
|---|---|
| Base | Immutable content and remote revision from the last verified materialization. |
| Local | The work-local transport copy used by planning, implementation, and review. |
| Remote | A fresh staging pull of the current Notion page immediately before a sync decision. |

Materialize before planning or implementation:

```text
/specification:sync-spec <notion-page-ref> --work-id=<id> --mirror=.state/notion --transport-profile=/absolute/path/to/notion-sync-transport.json --mode=materialize
```

Completion normally runs through `spec-code`/`implement-code`; for advanced
recovery, run exactly one `--mode=complete` stage (`--stage=specification`
after content approval, or `--stage=implementation` after clean review).

The safe decision table:

| Local since base | Notion since base | Required result |
|---|---|---|
| unchanged | unchanged | No content write; record verification. |
| unchanged | transport metadata only | Refresh the base/revision receipt after unit-by-unit identity match; retain approval, plan, code, review. |
| unchanged | verified path/layout change, identities intact | `structural_change` + `next_action: revalidate`; invalidates dependent approval, plan, code, review even when content is equal. |
| changed | unchanged | Review and approve the exact local content, recheck remote revision, then publish and verification-pull. |
| unchanged | semantic change | `remote_only` + `next_action: revalidate`; materialize the remote copy, issue a new base, restart from it. |
| changed | semantic change | Stop with three-copy evidence; resolve through specification completion, then repeat plan/implementation/review against the new base. |
| no trustworthy base | any | Refuse publication; establish a verified baseline first. |

Transport safety: a machine-local, secret-free transport profile pins the
external executable by checksum and proves `conditional_update` /
`conditional_create` independently; without the required capability the write
refuses with `next_action: provide_conditional_transport`. Each run also takes
a per-page lease under the shared transport root — that serializes local
racers, while proven conditional writes remain the real cross-client guard.
Never hand-edit the mirror. This marketplace owns the `specification:mdc` MDC
body grammar: semantic MDC creation or change requires the explicit
`--body-author=specification:mdc` selector through the complete operation
chain. Other body dialects require their own explicitly selected
`--body-author=<plugin:skill>` capability;
byte-preserving materialization may omit the selector.
Generate a starter profile with
`bun run skills/sync-notion/scripts/validate-transport-profile.ts
--print-template` and attach real conformance evidence before use.

When a spec change lands mid-work, the revalidation sweep marks affected
non-done tasks `! blocked`, marks affected done tasks `validity: stale` with
remediation tasks, re-checks the charter's `SC-n` criteria, and journals the
sweep — implementation resumes only after it.
