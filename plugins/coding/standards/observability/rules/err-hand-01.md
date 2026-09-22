# ERR-HAND-01: Reuse Existing Error Types

## Intent

Reuse the narrowest existing error whose semantics match the failure, every selected language standard, and the project's established error-handling contract. Apply required failure representations, inheritance constraints, boundary mappings, and catch behavior first; within those contracts, evaluate language and runtime built-ins, then errors already shipped by the codebase or an installed core/error library. Do not add a dependency merely to satisfy this reuse lookup.

## Fix

### Honor the selected failure contract

Selected language standards decide whether a failure is thrown, returned as a typed result, or constrained to a domain-rooted hierarchy. The project's existing error strategy also decides which types its middleware, boundary mappings, and catch sites recognize under `GEN-CONS-01`. The reuse order below selects the error type inside those contracts; it never overrides them. A bare built-in is not semantically appropriate when, for example, a Python domain error must inherit from the project's domain base or a project's `ValidationError` drives HTTP status mapping. An expected recoverable TypeScript failure keeps its typed result even when its error payload reuses a built-in or shipped class.

### Reuse a matching built-in

```typescript
if (!Number.isInteger(limit) || limit < 1) {
  throw new RangeError("limit must be a positive integer");
}
```

### Reuse an already-shipped error

```typescript
import { RecordNotFoundError } from "@example/core-errors";

if (!workspace) {
  throw new RecordNotFoundError("workspace not found", {
    code: "WORKSPACE_NOT_FOUND",
  });
}
```

Search project exports and installed dependencies for a related core/error library before defining a type. When the selected error contract accepts a machine-readable `code` or `reason`, supply the value that identifies this failure. When wrapping another failure, treat a candidate as suitable only if its existing contract can preserve the cause chain required by `ERR-HAND-03`; do not attach an unsupported property. When no discriminator is supported, use a specific contextual message.

A dependency independently required by a selected language contract is governed by that language rule, not justified by this reuse path. If the dependency is absent and the current task forbids dependency changes, report that no compliant option exists in scope and ask whether to expand the scope; do not install it silently.

### No suitable error exists

<IMPORTANT>
Ask the user to choose between these options as the error type or typed-result payload permitted by the selected language and project contracts:

- creating a new custom error class, translated to the language's equivalent named error type when classes do not exist; or
- using generic `Error`, translated to the target language's idiomatic generic error or failure value, with the reason embedded in its diagnostic message. The literal `Error` type names the TypeScript and JavaScript form; do not substitute a similarly named but semantically different type in another language.

Stop until the user answers. Check every selected standard and established project contract before presenting the choices: if `ERR-HAND-02` requires a specific domain error, or a language rule forbids the generic fallback, exception-only flow, or a proposed inheritance shape, explain that conflict and omit the noncompliant choice. For a Rust library under `RST-ERRH-01`, offer adding a variant to an existing typed error, or defining a `thiserror` error type only when `thiserror` is already installed or a separate dependency change is permitted. Record the answer in a durable reviewable location such as the PR discussion or an accepted decision record, and cite that evidence in the implementation or review. Never silently invent a custom type, select the generic fallback, or use a fallback choice to bypass the required failure representation, project handling, or cause chain.
</IMPORTANT>

## Edge Cases

- Relevance is semantic and architectural: do not reuse an unrelated type merely because it shares an `Error` base, and do not choose a built-in that bypasses established boundary mappings or catch behavior.
- A built-in is relevant only when it also satisfies the selected language's required failure representation and hierarchy; a Python domain leaf may multiply inherit from its domain root and a built-in when the Python standard permits it.
- An installed core/error library is one already declared by the target project and already responsible for errors in the affected domain or architectural layer.
- A supported `code`, `reason`, or cause is part of the reused error's existing contract; do not add an ad hoc property at the throw site.
- Generic `Error` means the target language's idiomatic generic error or failure value, not necessarily a type literally named `Error`; it is a user-selected fallback only where every selected standard, including `ERR-HAND-02`, and the established project contract permit it and durable approval evidence is linked.
- In languages without error classes, the custom-error option means the idiomatic named error type required by selected standards; for a Rust library, prefer a variant on an existing typed error, and offer a new `thiserror` type only when its dependency is already installed or separately permitted.
- When a selected standard requires a typed failure contract, the reuse and fallback sequence selects its error payload rather than replacing the contract with a throw.
- When existing code bypasses a suitable error or omits its supported discriminator, correct that violation before adding new behavior.

## Related

ERR-HAND-02, ERR-HAND-03, GEN-CONS-01
