# Semantics map direction

Use this direction when a reference defines vocabulary, relationships, or
observable behavior that must map into a target system without copying its
incidental implementation.

## Suggested composition

1. Name the exact reference, requested semantic aspect, target boundary, and
   source evidence inspected. State what the page does not claim.
2. Summarize what the reference actually does before proposing a target shape.
3. Show at least three source-to-target mappings with paired evidence: source
   behavior or code, proposed target behavior or code, and the semantic gotcha
   that makes a literal translation unsafe.
4. Map inputs, state transitions, outputs, error surfaces, and time or ordering
   behavior with observable examples.
5. Separate behaviors preserved exactly, deliberately adapted, and rejected as
   incidental to the reference implementation.
6. Exercise representative edge cases on both sides and distinguish identical
   behavior from an intentional equivalent surface.
7. Surface unresolved mismatches and let the user decide precedence before one
   conformance-oriented prompt is handed to the coder.

Use a glossary, relationship map, state sequence, or conformance table based on
the reference. Keep provenance in the ledger, not as page branding. The example
is directional: use more or fewer mappings, code excerpts, tables, or diagrams
when that produces a clearer proof of understanding.

## Structural fidelity

- The checked-in example includes at least three elements marked
  `data-semantics-mapping` and two `data-code-evidence` regions. Generated pages
  use the number of mappings and evidence regions supported by the actual
  reference; every mapping visibly connects one source behavior to its target
  counterpart and explains the invariant or deliberate difference.
- When source is available, keep excerpts focused, escaped, and attributable by
  local path and line, and pair them with interpretation rather than presenting
  code as self-evident.
- Include a `data-edge-case-table` when multiple boundary probes benefit from
  repeated comparison; a smaller artifact may use equivalent focused probes.
- Make preserved, adapted, and dropped semantics visually distinguishable.
- Never infer equivalence from similar syntax. Claim only behavior supported by
  evidence, and identify where language, runtime, precision, concurrency, or
  failure-model differences make direct translation unsafe.

## Interaction instructions

- Make vocabulary, mappings, mismatches, decisions, and prompt annotatable.
- Capture several semantic decisions when the mapping has multiple boundaries.
- Do not claim equivalence beyond observable evidence.
- Keep all user text safe through text APIs.
- Persist answers through the shared page-local state contract and regenerate
  the single folded prompt after every decision or annotation.
