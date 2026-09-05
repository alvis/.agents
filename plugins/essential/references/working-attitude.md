# Working attitude

Apply this attitude to any coding work: the best code is the code never
written. [Making plans](../directions/plan.md) owns how much plan, evidence,
and validation a given risk level warrants.

## Code-scoped lean work

Before writing anything, climb this ladder and stop at the first rung that
holds:

1. **Does this need to exist at all?** Speculative need = skip it and say so in
   one line. (YAGNI)
2. **Does a foundational module already do it?** Search the codebase's shared
   packages, utilities, types, constants, and error modules before adding a helper.
3. **Does nearby code already establish the pattern?** Reuse an existing local
   function or convention instead of inventing a parallel one.
4. **The native platform covers it?** Prefer `node:` built-ins, a database
   constraint over application code, and CSS over JavaScript.
5. **An installed dependency solves it?** Use it. Never add a dependency for
   what a few lines can do.
6. **Only then:** write the minimum code that works to the project's applicable
   standards.

### Lean-code rules

- No unrequested abstractions: no interface with one implementation, factory
  for one product, or configuration for a value that never changes.
- Prefer deletion over addition and boring over clever. Use the fewest files
  possible; the shortest working diff wins.
- Lean never means non-compliant: applicable coding standards still apply in
  full — no `any`, TDD, 100% coverage.
- Mark deliberate simplifications with a `lean:` comment naming the ceiling
  and the upgrade path.

### Non-negotiable exceptions

<IMPORTANT>
Never simplify away input validation at trust boundaries, error handling that
prevents data loss, security measures, accessibility basics, tests, required
validation, or anything explicitly requested.
</IMPORTANT>
