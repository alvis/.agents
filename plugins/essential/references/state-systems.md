# Project state systems

Read this before using project documentation, work state, or an external
specification authority. Every target project has two required state systems
and may configure a third:

| System | Presence | Carries | Authoritative layout |
| --- | --- | --- | --- |
| Version-controlled documentation | Required | Durable project knowledge under root `README.md` and `docs/` | [durable-documentation.md](durable-documentation.md) |
| Local work state | Required when work needs persistence; created lazily | Ignored operational memory and revision-bound external-specification copies under `.state/` | [work-memory-topology.md](work-memory-topology.md) |
| External specification authority | Optional | Canonical requirements in a system such as Notion | The external system's stable URL and revision model |

## Access boundary

<project-state-system-access read="all-agents" write="main-agent" protected="README.md,docs/**,.state/**,external-specification" />

All agents may read every configured system. Only the main agent may write
root `README.md`, `docs/**`, `.state/**`, or an external specification
authority. A subagent may still write assigned production source and tests
outside those systems; for state-system changes it returns findings, proposed
content, evidence, and reconciliation deltas to the main agent.

The main agent alone holds the work-stream lease. A lease is a concurrency
guard for that writer, never authority that can be delegated to a subagent.
Reviewers return area reports; the main agent writes `reviews/*.md` and
reconciles `review.md`.

## Specification selection

`goal.md` is the sole work-stream inventory for specification anchors. Its `## Specification provenance` records the source kind, canonical reference, accepted revision or base, optional local materialization, matching receipt, and last verification. `state.md` records sync status and links to the charter; it never restates those anchors.

| Source kind | Canonical authority | Work-local `spec/` | Freshness gate |
| --- | --- | --- | --- |
| `external` | Stable external URL and accepted external revision | Optional; usable only with a matching receipt | Initial materialization, missing or mismatched evidence, pre-review, and completion or publication |
| `repo` | Explicit repository source path and accepted repository revision | Optional approved working copy; no generated documentation area | Re-read the source when its revision or content evidence changes |
| `inline` | Approved inline content and its content identity | Required approved working copy for the active stream | Re-read the approved candidate when its identity changes |
| `none` | No specification configured | Not used | Not applicable |
| `pending` | Unresolved until the user selects an authority | Not used | Resolve before specification work |

When an external authority is configured:

1. Its canonical URL is the contract reference.
2. `spec/` is the optional readable local materialization.
3. `artifacts/spec-sync/bases/<base-id>/` and
   `artifacts/spec-sync/materializations/<base-id>.json` prove which external
   bytes and revision the materialization represents.
4. Agents read that local copy when its receipt matches the accepted base in
   `goal.md`. The main agent refreshes it at initial materialization, when the
   evidence is absent or mismatched, before review, and at completion or
   publication—not on every build read or dispatch.
5. Version-controlled documents and PRs cite only the canonical external URL for an external source, never `.state`, a mirror, an absolute local path, or `file://`.
6. Specification content and provenance for an active stream stay in `.state/`; the version-controlled `docs/` tree contains durable project guidance only.

Without an external authority, a repository source remains at its explicit source path and an inline source remains in the approved work-local copy. Ordinary links among tracked documents remain valid.

`spec/` is specification content, `artifacts/spec-sync/` is transport evidence,
and `changes/<slug>.md` records implemented work and departures. None is a
substitute for another, and no `spec-derivations/` directory exists.
