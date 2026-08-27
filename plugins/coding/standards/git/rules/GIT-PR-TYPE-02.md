# GIT-PR-TYPE-02: Keep Public Contract with Implementation

## Severity

error

## Intent

Public types, interfaces, signatures, schemas, exports, generated declaration
surfaces, and feature prerequisite scaffolding ship atomically with the first
runtime or type-level implementation that fulfills or consumes them. Publishing
shape alone creates a contract with no behavior and forces later work to
complete the same feature.

This atomic feature surface is compliant regardless of diff size. A larger size
zone may require stronger review evidence, but size cannot force contract and
implementation into separate PRs or stack entries.

## Scan

Inspect the PR and its stack semantically. Report the rule when externally
consumed shape or feature prerequisite scaffolding is published while the first
behavior that fulfills or consumes it is deferred to another PR. Inferable
internal types are ordinary implementation detail and do not create a separate
contract concern.

## Fix

Move the public shape or feature prerequisite scaffolding into the same
domain-coherent change as its first implementation and behavior tests. If the
combined change is large, improve its review evidence or split independently
shippable behavior without separating a contract from the behavior that makes
it useful.

For example, add `ArchiveOrderInput`, `ArchiveReason`, and `archiveOrder()` in
one change, with tests that exercise `archiveOrder()` through its supported
public entrypoint.

## Edge Cases

- Documentation-only corrections may update an already-shipped contract
  description without changing implementation.
- A public type utility or other declaration that is itself the complete
  type-level implementation may ship without a runtime consumer, including
  when it is added to an otherwise mixed runtime package. Validate it with the
  configured typecheck or type-test command, or with type diagnostics and
  affected-consumer builds. A runtime test framework is not a prerequisite,
  and exact declaration-shape tests remain prohibited by `TST-CORE-10`.
- Standalone project initialization is a complete deliverable when the scaffold
  itself is the requested runnable or buildable baseline. It is not a valid
  exception when it prepares a known feature whose behavior is deferred.
- Database migrations, data backfills, and configuration-format upgrades remain
  governed by `GIT-PR-TYPE-03` because rollout and rollback concerns may require
  separation from consumer logic.
- Generated contract output stays with the implementing feature when coupled
  and is marked under `GIT-PR-TYPE-05`.

## Related

GIT-PR-SIZE-01, GIT-PR-TYPE-03, GIT-PR-TYPE-04, GIT-PR-TYPE-05
