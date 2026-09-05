---
name: sync-notion
description: Synchronize paired local files and Notion pages in a declared direction, validate opaque transport identity metadata, and coordinate guarded conflict resolution. Own transport and pairing; require an explicitly selected body-author capability before semantic body creation or change.
requirements:
  intelligence: medium
argument-hint: "<validate-metadata|local-to-notion|notion-to-local|two-way-merge> <file-or-ref> [counterpart...] [--transport-profile=<absolute-file>] [--body-author=<plugin:skill>] [--transport-root=<dir>] [--out=<dir>]"
---

# Sync Notion

Own transport, pairing, conflict packets, and post-sync integrity for declared local–Notion pairs. Public modes are `validate-metadata`, `local-to-notion`, `notion-to-local`, and `two-way-merge`; CLI verbs are implementation details.

## Boundaries

- `specification:sync-spec` orchestrates engineering-specification bases, work-local copies, derivation, and revalidation. This skill transports only the exact declared pair/set.
- For state-managed work, use an explicit destination-local transport root or the exact path from a validated destination-local pairing receipt. A portable handover contributes only a logical profile and optional relative suggestion, never a selected root. Never invent a mirror location or filename from a workspace, title, or id.
- Notion transport bodies are opaque here. `specification:mdc` owns the MDC grammar and authors semantic MDC bodies; another body dialect requires the exact capability supplied as `--body-author=<plugin:skill>`. `notion-sync` may update transport metadata but never interprets body grammar.
- `validate-metadata` is read-only, interprets only frontmatter identity keys, and never loads a transport profile, reads `NOTION_TOKEN`, or inspects body syntax.
- A cached mirror is not proof of current Notion state. Every outbound decision compares against a fresh staging pull.
- Only the main agent may advance a canonical mirror, work state, or the external authority. A delegated run may validate, read, or pull into a unique OS-temporary staging directory and returns evidence/proposed bytes; it never performs outbound mutation or writes `.state/**`.

## Inputs

- **Required**: one public mode and at least one local path or Notion ref.
- `validate-metadata` accepts only one or more exact `.mdc` paths. Remote-mode inputs and prerequisites are conditional and live in [directions/execution.md](directions/execution.md).

## Workflow

1. For `validate-metadata`, require one or more regular, non-symlink `.mdc` paths and invoke `scripts/validate-transport-metadata.sh` once for the exact set. Return its identity values or a refusal without changing bytes. Do not interpret indentation, annotations, markers, or any other body syntax; skip the remaining remote workflow.

2. For every remote mode, load [directions/execution.md](directions/execution.md). It owns the remote prerequisites, transport trust, pair/root/lease resolution, fresh staging, B/L/R classification, proposal freezing, set-wide conditional-capability preflight, single guarded mutation, verification, canonical promotion, retry refusal, and recovery. For `two-way-merge`, it conditionally loads [directions/two-way-merge.md](directions/two-way-merge.md).
3. Return every final path created or materially rewritten as `generated_files`. Each writer follows `essential:references/output-manifest.md` for work Markdown it creates or rewrites.

<IMPORTANT>
Only `sync-spec` may complete a specification across work copy, selected mirror, external authority, and immutable receipts. This skill does not promote docs, edit main-agent-owned state, or mark dependents for revalidation.
</IMPORTANT>

## Completion

`validate-metadata` returns only `status`, `mode`, exact `paths`, reported
transport identities/revisions, `bytes_changed: false`, and `unresolved`.
Remote modes follow the verification and report contract in
[directions/execution.md](directions/execution.md).
