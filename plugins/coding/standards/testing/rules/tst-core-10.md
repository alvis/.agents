# TST-CORE-10: No Tests Over Checked-In Static Content

## Intent

Tests exercise executable behavior. A checked-in repository or plugin artifact
is implementation input, not an assertion subject. Testing its presence, path,
bytes, prose, or agreement with another checked-in file creates a second source
of truth that fails on legitimate edits without proving a consumer works.

This rule applies to every checked-in artifact, including source constants,
manifests, configuration, documentation, hook payloads, templates, inventories,
fixtures used as expected output, and generated projections committed to the
repository.

<IMPORTANT>
Never assert any of these properties directly over a checked-in artifact:

- existence or absence;
- path or directory layout;
- file, field, entry, or identifier inventories and exact counts;
- bytes, hashes, sizes, text, literals, substrings, headings, or prose;
- parity with another checked-in artifact or preservation of a committed
  projection, snapshot, or golden output;
- schema validity, uniqueness, ordering, referential integrity, bounds, or any
  other systematic property of the checked-in artifact itself.

Do not recreate a removed repository-content gate under another test name,
snapshot, fixture, or CI-only assertion.
</IMPORTANT>

## Allowed Boundary

A checked-in artifact may be supplied as input to an actual consumer or
generator. Assertions must be restricted to observable runtime behavior or the
structure of the produced result; they must not restate which checked-in file
exists, where it lives, or what literal content it contains.

Generated results created in memory or a temporary directory may be checked for
schema, required fields, unique identities, ordering, referential integrity,
count consistency, round-trip behavior, and deterministic generation. Missing,
malformed, or stale input scenarios must likewise be created in a temporary
workspace and exercised through the real consumer or generator.

Checked-in fixtures remain valid inputs to executed behavior. Expected-output
mirrors are not valid oracles: derive structural expectations from the runtime
result, schema, or consumer contract instead of comparing complete wording with
a checked-in file.

## Decision Test

Ask what the assertion observes:

- **Checked-in repository state** — remove it.
- **Behavior produced by an executed consumer** — keep it when the behavior is
  distinct and meaningful.
- **A result produced by an executed generator** — keep structural assertions;
  remove exact wording or parity with a committed projection.

Reading a repository file inside a test is only compliant when that value is
passed into the executed consumer or generator and every assertion targets the
resulting behavior or output structure.

## Fix

1. Delete assertions over checked-in existence, absence, layout, inventory,
   bytes, literals, or parity, together with orphaned helpers and expected files.
2. If a consumer exists, exercise it with an explicit input and assert the
   observable result.
3. If a generator exists, write into memory or a temporary directory and assert
   result structure, deterministic generation, or stale/missing-output behavior
   against that freshly generated result.
4. If no executable behavior exists, deletion is the complete fix. Do not
   invent another repository-content property to retain the gate.

```typescript
// violation: the checkout is the assertion subject
expect(existsSync(join(repositoryRoot, ".gitignore"))).toBe(true);
expect(readFileSync(skillPath, "utf8")).toContain("required prose");

// compliant: generated output is the assertion subject
const outputPath = join(temporaryDirectory, "marketplace.json");
await generateMarketplace({ outputPath });
const output = JSON.parse(readFileSync(outputPath, "utf8"));
expect(output.plugins).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ name: expect.any(String) }),
  ]),
);
```

## Edge Cases

- Runtime messages, error envelopes, exit status, and emitted JSON are behavior,
  even when their assertions contain literals.
- A temporary workspace may deliberately omit or corrupt a file when absence or
  malformed input is the scenario supplied to the consumer.
- Two implementations may receive the same generated input and have their
  results compared; this is runtime parity, not checked-in-file parity.
- Type-level checks such as `satisfies` and `as const` belong beside source data,
  never in a test over that checked-in declaration.
- Coverage contribution cannot redeem a repository-content assertion. Replace
  it with consumer or generator coverage, or accept the uncovered static data.
- Barrel re-export identity assertions test checked-in module layout and must be
  removed.

## Related

TST-CORE-04, TST-CORE-05, TST-CORE-07, TST-COVR-04, GEN-DESN-04
