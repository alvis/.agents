# Essential state model v1

The executable authority for `essential.state/v1` is
[`state-model-v1.schema.ts`](../scripts/state-model-v1.schema.ts). Its exported
`STATE_MODEL_V1_SCHEMA` defines the accepted JSON domain document, and
`state-model-v1.schema.json` is the generated, freshness-checked projection.
Do not copy interfaces or field constraints into prose references.

## Reader vocabulary

- A project document contains project identity, linked streams, environment
  claims, and traps.
- A stream document contains one stream and its project reference. Project
  knowledge collections are empty at this root.
- A charter defines the goal, requirements, boundary, success criteria,
  specification provenance, and workspace anchors.
- Tasks form a parent-and-dependency graph. Status records history; optional
  validity records whether completed evidence is still current.
- Events are append-only state transitions. Revisions record approved plan or
  charter changes.
- Records carry proposal, change, decision, or design provenance and
  supersession relationships.
- Reviews contain canonical review areas and findings. Submission and
  completion carry landing and promotion evidence.

## Derivation contract

MDC annotations use the schema field names and decode into the same domain
objects accepted from JSON. The shared codec validates both inputs against the
executable schema before applying graph ownership, reference, and lifecycle
invariants. Raw MDC AST JSON is not a domain document.

Schema changes begin in `state-model-v1.schema.ts`, regenerate the JSON
projection, and update codec fixtures that prove equivalent MDC and JSON
normalization. Prose changes explain vocabulary only; they never introduce a
field, enum, cardinality, or default.
