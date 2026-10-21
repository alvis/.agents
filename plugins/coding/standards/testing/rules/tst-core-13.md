# TST-CORE-13: No Checked-In-Content Tests

## Intent

Tests must not mirror a checkout's committed state: those assertions create a second source of truth that fails on legitimate edits without proving behavior.

This rule applies to every checked-in artifact, including manifests, configuration, documentation, hook payloads, templates, inventories, fixtures used as expected output, and generated projections committed to the repository. Exported in-code constants and static data belong to [TST-CORE-12](tst-core-12.md).

<IMPORTANT>
Never assert these properties of a checked-in artifact:

- existence or absence;
- path or directory layout;
- file, field, entry, or identifier inventories and exact counts;
- bytes, hashes, sizes, text, literals, substrings, headings, or prose;
- parity with another checked-in artifact or preservation of a committed projection, snapshot, or golden output;
- schema validity, uniqueness, ordering, referential integrity, bounds, or any other systematic property of the checked-in artifact itself.

Do not recreate a removed repository-content gate under another test name, snapshot, fixture, or CI-only assertion.
</IMPORTANT>

## Allowed Boundary

A checked-in artifact may be supplied as input to an actual consumer or generator. Assertions must be restricted to the behavior or freshly produced result; they must not restate which checked-in file exists, where it lives, or what literal content it contains.

Generated results created in memory or a temporary directory may be checked for schema, required fields, unique identities, ordering, referential integrity, count consistency, round-trip behavior, and deterministic generation. Missing, malformed, or stale input scenarios must likewise be created in a temporary workspace and exercised through the real consumer or generator.

Checked-in fixtures remain valid inputs to executed behavior. Expected-output mirrors are not valid oracles: derive structural expectations from the runtime result, schema, or consumer contract instead of comparing complete wording with a checked-in file.

Reading a repository file inside a test is only compliant when that value is passed into the executed consumer or generator and every assertion targets the resulting behavior or output structure.

## Fix

1. Delete assertions over checked-in existence, layout, bytes, literals, or parity; remove orphaned helpers and expected files.
2. If a consumer exists, exercise it through a supported public entrypoint with explicit input and assert the observable result.
3. If a generator exists, write into memory or a temporary directory and assert result structure, deterministic generation, or stale/missing-output behavior against that freshly generated result.
4. If no consumer or generator behavior exists, deletion is the complete fix. Do not invent another repository-content property to retain the gate.

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

- A temporary workspace may deliberately omit or corrupt a file when absence or malformed input is the scenario supplied to the consumer.
- Two implementations may receive the same generated input and have their results compared; this is runtime parity, not checked-in-file parity.
- Coverage contribution cannot redeem a repository-content assertion. Replace it with consumer or generator coverage, or delete it.

## Related

[TST-CORE-04](tst-core-04.md), [TST-CORE-12](tst-core-12.md), [TST-CORE-14](tst-core-14.md), [TST-COVR-04](tst-covr-04.md)
