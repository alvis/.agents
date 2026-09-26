# Architecture decision records

Read this when creating, accepting, superseding, indexing, or reviewing an architecture decision record (ADR). It is the contract for durable ADRs; work-local `decisions/` children keep their separate lifecycle.

## Paths and authority

- Effective ADRs live directly under `docs/architecture/decisions/<domain>/`, where `<domain>` is exactly one lowercase kebab-case segment.
- Archived ADRs live directly under `docs/architecture/decisions/superseded/<domain>/`; `superseded` is reserved for the archive directory and cannot be a domain name.
- ADR filenames and headings use the matching unpadded positive number from [naming.md](naming.md); moving an ADR never renumbers it.
- `docs/architecture/README.md` is the index. It lists every effective ADR (with its `decisions/<domain>/` path) and no archived ADR.

The ADR explains why a choice was accepted. The architecture document explains the current structure. Neither copies the other.

Follow the shared [durable documentation reader contract](durable-documentation.md#terminology-and-migration). In Motivation, show a concrete situation the team would face without the decision: who needs to do what, and what would fail or become difficult. In Context, explain only the existing system facts, terms, and constraints needed to understand why that problem arises; leave the failure story in Motivation and the chosen approach in Decision. State the choice in plain English before its precise rules, then explain its benefits and costs. The [ADR template](../templates/docs/adr.md) supplies the prompts.

An active accepted ADR may be clarified in place when the edit changes only wording, definitions, or examples. Compare the diff with the prior version: the choice, rationale, alternatives, consequences, and technical guarantees must retain their meaning. Git history records the clarification; no new ADR metadata is needed. A substantive change follows the supersession process below. An archived ADR's historical body is never clarified in place.

## Superseding an ADR

When a later ADR changes an accepted choice, whether partially or completely:

1. Create the new ADR as an effective record. It must stand on its own and must not mention the old ADR or explain what changed from it.
2. Move the old file to `decisions/superseded/<domain>/` without changing its body; keep it in the old ADR's domain.
3. Prepend this header to the moved file, filling every field and keeping the original body below it:

   ```markdown
   > **Status:** Superseded
   >
   > **Superseded by:** [ADR-<n> — <title>](../../<successor-domain>/adr-<n>-<slug>.md)
   >
   > **What changed:** <State whether the change is partial or complete and summarize the changed choice.>
   ```

   Every successor uses `../../<successor-domain>/adr-<n>-<slug>.md`, including successors in the same domain. When several ADRs replace the choice, list their links on the same `Superseded by` line, separated by commas. Optionally include `> superseded-by: adr-<n>[, adr-<n>...]` in this prepended header; its unique identities must match the linked successors exactly.

4. Update `docs/architecture/README.md` so its ADR table contains only the effective ADRs directly under `decisions/<domain>/`; remove the moved path.

Do not edit the old ADR into the new decision. The archive header is the only permitted addition to its historical body.

## Reading history

Scan each domain's `decisions/superseded/<domain>/` when the history is needed. If a current ADR is known, inspect only archived files whose `Superseded by` header links to that ADR. This keeps unrelated historical choices out of the current decision context.

## Integrity contract

Every ADR file has exactly one domain segment under `decisions/`: an effective ADR is `decisions/<domain>/adr-<n>-<decision-slug>.md`, and an archived ADR is `decisions/superseded/<domain>/adr-<n>-<decision-slug>.md`; no other depth or domain-first archive ordering is valid. The domain is lowercase kebab-case and is not `superseded`. The filename uses `adr-<n>-<decision-slug>.md` and matches its first visible canonical `# ADR-<n>: <title>` heading; `<n>` is a positive integer without leading zeros. An effective ADR must not contain supersession metadata or explicit replacement/predecessor language, links into `superseded/`, contradictory status declarations, or unresolved template placeholders; ordinary Markdown autolinks and inline HTML are not placeholders. An archived ADR must retain its original heading and substantive decision body below the prepended header, not just status metadata. The required header fields appear in order with exactly one `Status: Superseded`, one `Superseded by` field containing one or more distinct successor links, and one change-summary field. Every successor link must target an existing effective ADR in any domain with a later numeric identity. Optional `superseded-by` metadata appears at most once in the prepended header and lists exactly the linked successor identities. The non-empty change summary must explicitly state whether the change is partial or complete. The ADR index table must be a valid Markdown table whose delimiter row has the same number of columns as its header, include a `Status` column, and mark every effective ADR `Accepted`. The doctor reports each violation with a proposed repair; the doctor skill always offers the user an explicit, approved fix during investigation.
