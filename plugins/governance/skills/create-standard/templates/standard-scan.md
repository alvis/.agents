# [Standard Title]: Violation Scan

Protocol: `essential:directions/standards.md`.

<!-- INSTRUCTION: This file is the violation detection tier — used during code review and linting -->
<!-- INSTRUCTION: Every item must reference a rule ID from the rule groups defined in meta.md -->
<!-- INSTRUCTION: Keep descriptions concise but specific enough to detect violations unambiguously -->

Any single violation blocks submission by default.
<!-- INSTRUCTION: Put mandatory inputs, runtime/tool prerequisites, and before-mutation checks here so they remain reachable on a clean scan -->
<!-- INSTRUCTION: Link cross-standard checks to canonical rule paths with independent detection triggers; do not infer filename case from the displayed rule ID -->

## Quick Scan

<!-- INSTRUCTION: List every rule as a "DO NOT" statement ending with the rule ID in brackets -->
<!-- INSTRUCTION: Group related rules together (follow the rule group order from meta.md) -->
<!-- INSTRUCTION: Each line should be specific enough that a reviewer can spot the violation in code -->

- DO NOT [violation description for rule 1] [`PFX-GRP1-01`]
- DO NOT [violation description for rule 2] [`PFX-GRP1-02`]
- DO NOT [violation description for rule 3] [`PFX-GRP2-01`]

## Rule Matrix

<!-- INSTRUCTION: One row per rule — keep Bad Examples as short inline code snippets -->
<!-- INSTRUCTION: The Violation column should be a brief noun phrase (not a sentence) -->

| Rule ID | Violation | Bad Examples |
|---|---|---|
| `PFX-GRP1-01` | [Brief violation description] | `[bad code snippet]`; `[another bad snippet]` |
| `PFX-GRP1-02` | [Brief violation description] | `[bad code snippet]` |
| `PFX-GRP2-01` | [Brief violation description] | `[bad code snippet]` |
