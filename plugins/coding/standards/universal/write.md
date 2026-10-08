# Universal: Compliant Code Patterns

## Key Principles

- Fix root causes, never suppress diagnostics without explicit user approval
- Keep functions/modules focused on one clear purpose (single responsibility)
- Eliminate duplication by consolidating semantically identical logic
- Wrappers must add concrete value; validation counts only at a trust boundary or for a condition supported execution realistically invalidates independently
- Build the happy path; handle only failures that realistically occur, and accept finding none
- Match established architecture and style patterns in the codebase
- Profile before optimizing; choose data structures that avoid predictable bottlenecks
- Use American English spelling in symbols, filenames, and comments

## Core Rules Summary

### Safety (GEN-SAFE)

- **GEN-SAFE-01**: No suppression comments (`@ts-ignore`, `eslint-disable`, etc.) without explicit user approval and a root-cause note. (→ TYP-CORE-04)
- **GEN-SAFE-02**: Fix the root defect, not symptoms. No silent catches, blanket retries, or noop fallbacks.
- **GEN-SAFE-03**: Validate genuine trust-boundary inputs; remove closed first-party producer postcondition rechecks only after tracing provenance and citing the exact producer test.
- **GEN-SAFE-04**: Handle external availability, attacker-timed races, irreversible loss, and races that meet the [occurrence bar](rules/gen-safe-04.md); nothing merely possible.

### Design (GEN-DESN)

- **GEN-DESN-01**: Keep functions/modules focused on one clear purpose with coherent boundaries. (→ FUNC-ARCH-01)
- **GEN-DESN-02**: Consolidate duplicated logic into shared utilities when behavior is semantically identical.
- **GEN-DESN-03**: A wrapper must add concrete value: boundary validation, policy enforcement, transformation, caching, telemetry, retries, or error normalization. (→ FUNC-ARCH-03)

### Consistency (GEN-CONS)

- **GEN-CONS-01**: Match established architecture/style before introducing new patterns. One-off changes require explicit migration decision.
- **GEN-CONS-02**: Use American English spelling in symbols, filenames, and comments. (→ TYP-CORE-06)
- **GEN-CONS-03**: Prefer concrete clearer alternatives that preserve supported behavior; apply the [clarity rule](rules/gen-cons-03.md) to unnecessary complexity and terseness alike.
- **GEN-CONS-04**: Prefer declarative defaults (spread, `??`, parameter defaults, destructuring defaults) over conditional overrides.

### Scalability (GEN-SCAL)

- **GEN-SCAL-01**: Use profiling evidence before introducing optimization complexity.
- **GEN-SCAL-02**: Choose data structures and boundaries that avoid predictable bottlenecks.
- **GEN-SCAL-03**: For complex changes, perform a deliberate "what am I missing" pass before finalizing; a risk it surfaces becomes work only after passing `GEN-SAFE-04`.

## Patterns

### Root-Cause Resolution

When diagnostics fail, fix the underlying cause rather than suppressing:

```typescript
// Fix the actual type issue
function processData(input: unknown): User {
  if (!isUser(input)) {
    throw new ValidationError("Invalid user data provided");
  }
  return input;
}
```

### Boundary Validation

Validate and narrow unknown inputs at system boundaries:

```typescript
const parsedConfig = configSchema.parse(rawConfig);
startServer(parsedConfig);
```

Do not repeat that validation after a typed, first-party call. Before adding a guard, name the value's provenance and who can violate the condition during supported execution. Runtime validation is justified for deserialization, user or network input, external SDKs, public plugin implementations, persistence reads, unsafe casts, or mutable, concurrent, and security-sensitive state that realistically changes after a trusted producer returns under `GEN-SAFE-04`. A postcondition of code shipped and tested in the same repository belongs in producer tests even when the type system cannot express it fully; an interface alone does not create a boundary.

### Wrapper Value Test

A wrapper is valid only when it adds concrete value:

| Added Value          | Example                                |
|----------------------|----------------------------------------|
| Caching              | Cache lookup before repository call    |
| Boundary validation  | Schema parse of untrusted input         |
| Error normalization  | Catch and rethrow domain error         |
| Telemetry            | Duration/metric logging around call    |
| Policy enforcement   | Permission check before action         |

### Declarative Defaults

Use built-in default mechanisms instead of conditional overrides:

```typescript
// object defaults with spread
const headers = { 'Content-Type': 'application/json', ...options?.headers };

// nullish coalescing
const timeout = options?.timeout ?? 3000;

// parameter defaults
function connect(port = 3000): void { /* ... */ }

// destructuring defaults
const { retries = 3, backoff = 1000 } = config;
```

### Pattern Matching

Before introducing a new pattern, inspect nearby code and match the established architecture/style.

## Anti-Patterns

- Suppressing diagnostics to unblock without follow-up.
- Architecture drift from ad-hoc local patterns.
- Unnecessary indirection and abstraction layering.
- Defensive guards that only reassert a trusted first-party return type.
- Handling, testing, or requesting fixes for races and edge cases that are possible but not realistic.
- Premature generalization of unproven requirements.
- Replacing declarative defaults with conditional imperative logic.
- Optimizing without profiling evidence.

## Quick Decision Tree

1. If diagnostics fail, fix the cause first (`GEN-SAFE-02`).
2. If considering suppression, stop and get explicit user approval (`GEN-SAFE-01`).
3. If adding abstraction, verify measurable value (`GEN-DESN-03`).
4. If adding or removing runtime validation, apply the provenance, independent-invalidation, and exact-producer-test decision contract (`GEN-SAFE-03`).
5. If adding or requesting failure handling, classify the failure and estimate a race's occurrence first (`GEN-SAFE-04`).
6. If changing style/patterns, align with current architecture (`GEN-CONS-01`).
7. If optimizing, provide profiling evidence (`GEN-SCAL-01`).
8. For complex changes, run "what am I missing" check (`GEN-SCAL-03`).
9. If replacing a declarative default with a conditional, revert to the declarative form (`GEN-CONS-04`).
