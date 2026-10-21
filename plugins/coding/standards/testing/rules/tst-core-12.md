# TST-CORE-12: Never Test Export Contracts or Static Data

## Intent

Such a test is a second copy of the source: it fails on legitimate edits and proves no behavior.

<IMPORTANT>
Never write a test whose only subject is:

- an export contract: `Object.keys(module)`, `toHaveProperty` on a module, `typeof mod.fn === 'function'`, `toBeDefined()` on an import, export inventories/counts, or barrel/re-export layout and symbol identity;
- exported static data: values, keys, lengths, members, or snapshots of constants, enums, lookup tables, or default configs;
- a static-data function's return value: its result ignores arguments and state.
</IMPORTANT>

## Allowed Boundary

Test consumer behavior driven by the data, `re:` regex matching, schema parsing of valid and invalid inputs, or input-dependent generators. A function whose result depends on arguments, branches, or state is not static data and is tested normally. One fresh-copy-independence test may verify that mutating a returned copy cannot affect another copy; do not inventory its values.

```typescript
// compliant: the runtime schema accepts and rejects values through its parser
expect(archiveOrderSchema.safeParse(validOrder).success).toBe(true);
expect(archiveOrderSchema.safeParse(invalidOrder).success).toBe(false);
```

Shared adapter or conformance suites are valid only when they execute each real implementation through its public surface and assert common behavior. The suite name "contract test" does not permit static-shape assertions.

## Fix

Delete the test and orphaned helpers. Assert the consumer instead.

```typescript
// violations: export contracts and static data mirror the source
expect(Object.keys(api)).toEqual(["run"]);
expect(typeof api.run).toBe("function");
expect(DEFAULT_CONFIG).toEqual({ retries: 3 });
expect(getDefaults()).toMatchSnapshot();

// compliant: explicit input exercises a lookup table's consumer
const shippingRates = { standard: 5, express: 12 } as const;
function calculateShipping(method: keyof typeof shippingRates, parcels: number) {
  return shippingRates[method] * parcels;
}
expect(calculateShipping("express", 2)).toBe(24);
```

## Edge Cases

- `satisfies` and `as const` guard static data beside its declaration.
- Coverage gain never redeems these tests; static-data coverage exemptions belong to [TST-COVR-01](tst-covr-01.md).
- Renaming the test to "contract test" or "snapshot" changes nothing.

## Related

[TST-CORE-04](tst-core-04.md), [TST-CORE-10](tst-core-10.md), [TST-CORE-13](tst-core-13.md), [TST-COVR-01](tst-covr-01.md), [GEN-DESN-04](../../universal/rules/gen-desn-04.md)
