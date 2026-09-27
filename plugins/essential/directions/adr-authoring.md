# Author an architecture decision record

Read this when creating, accepting, clarifying, or indexing a durable architecture decision record (ADR). Work-local `decisions/` children keep their separate lifecycle. For a changed accepted choice, follow [supersession](adr-supersession.md); for integrity checks or history, follow [review](adr-review.md).

## Place and identify the record

Store effective ADRs directly under `docs/architecture/decisions/<domain>/`, where `<domain>` is exactly one lowercase kebab-case segment and cannot be `superseded`. Follow [naming.md](../references/naming.md) for the filename and matching first visible canonical heading. Moving an ADR never renumbers it.

## Explain the choice

The ADR explains why a choice was accepted. The architecture document explains the current structure. Neither copies the other.

Follow the shared [durable documentation reader contract](../references/durable-documentation.md#terminology-and-migration). In Motivation, show a concrete situation the team would face without the decision: who needs to do what, and what would fail or become difficult. In Context, explain only the existing system facts, terms, and constraints needed to understand why that problem arises; leave the failure story in Motivation and the chosen approach in Decision. State the choice in plain English before its precise rules, then explain its benefits and costs. The [ADR template](../templates/docs/adr.md) supplies the prompts.

Before accepting an effective ADR, remove unresolved template placeholders and contradictory status declarations. Ordinary Markdown autolinks and inline HTML are not placeholders. An effective ADR must stand on its own: it contains no supersession metadata, explicit replacement/predecessor language, or links into `superseded/`.

## Clarify an accepted record

An active accepted ADR may be clarified in place when the edit changes only wording, definitions, or examples. Compare the diff with the prior version: the choice, rationale, alternatives, consequences, and technical guarantees must retain their meaning. Git history records the clarification; no new ADR metadata is needed. A substantive change follows [supersession](adr-supersession.md), which also owns historical-body preservation.

## Maintain the index

`docs/architecture/README.md` is the index. List every effective ADR with its `decisions/<domain>/` path and no archived ADR. Use a valid Markdown table whose delimiter row has the same number of columns as its header, include a `Status` column, and mark every effective ADR `Accepted`.
