# Review architecture decision records

Read this when checking durable architecture decision record (ADR) integrity or inspecting decision history.

## Check integrity

1. Compare effective records and the architecture index against [authoring](adr-authoring.md): placement, filename/heading identity, standalone content, status, placeholders, index completeness, and table structure.
2. Compare archived records against [supersession](adr-supersession.md): archive placement, preserved historical body, header fields and order, distinct existing successor targets, later identities, optional metadata agreement, and change-summary completeness. Apply the [identity rules](adr-authoring.md#place-and-identify-the-record) to their retained headings and filenames.
3. Compare edits to active accepted records with their previous versions under [the clarification boundary](adr-authoring.md#clarify-an-accepted-record).

The structural doctor reports each violation with a proposed repair. Follow [doctor](../skills/doctor/SKILL.md) for investigation and its explicit user-approved repair workflow; structural checks do not establish that prose preserves meaning.

## Read history

Scan each domain's archive at the [supersession path](adr-supersession.md) when history is needed. If a current ADR is known, inspect only archived files whose `Superseded by` header links to that ADR. This keeps unrelated historical choices out of the current decision context.
