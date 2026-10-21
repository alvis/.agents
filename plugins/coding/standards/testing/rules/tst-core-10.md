# TST-CORE-10: Compiler-Observable Type Tests Only

## Intent

Type tests protect only the compiler-observable behaviors listed below. They do not mirror a declaration's exact inventory: those assertions create a second source of truth that fails on legitimate edits without proving behavior. A declaration's existence alone never requires a test; diagnostics and affected-consumer builds cover ordinary static compatibility.

Export contracts and static data: [TST-CORE-12](tst-core-12.md); checked-in content: [TST-CORE-13](tst-core-13.md); incidental output wording: [TST-CORE-14](tst-core-14.md).

<IMPORTANT>
Never pin an exact declaration inventory in a test:

- an exact type or interface member inventory;
- an exact generic-parameter or default inventory;
- an exact function signature or overload inventory;
- a schema declaration's field inventory.
</IMPORTANT>

## Allowed Boundary

A compiler-observable test may use `expectTypeOf`, compile fixtures, or the project's approved type-test mechanism only to protect:

- generic inference;
- generic-parameter default application when a representative consumer omits that type argument;
- constraint enforcement;
- representative contextual typing supplied by a public callback parameter;
- representative assignability or substitutability;
- representative consumer-call overload resolution;
- representative control-flow narrowing after a public type predicate or assertion function is called, or within a public discriminated-union consumer branch; or
- a conditional, mapped, indexed-access, `keyof`-driven, or template-literal type transformation exercised through representative consumer inputs and outputs.

No other type-test subject is permitted by this rule. An exact expected type is valid only when it is the computed or supplied outcome of one of these behaviors, not a copy of a standalone declaration. A representative call may assert its contextually supplied, resolved, or narrowed type; an inventory of callback parameters, overloads, predicate signatures, assertion signatures, or other signatures remains static declaration shape.

## Fix

1. Delete assertions that mirror exact member, generic-parameter/default, signature, or schema-field inventories; remove orphaned helpers.
2. Preserve or rewrite type tests only for the compiler-observable behaviors in Allowed Boundary. Do not add tests solely because a declaration exists.
3. Run type diagnostics and affected-consumer builds for changed static public declarations.

```typescript
// violation: expected type only mirrors the declared member inventory
expectTypeOf<ArchiveOrderInput>().toEqualTypeOf<{
  orderId: string;
  reason: ArchiveReason;
}>();

// compliant: the assertion protects a generic operation's inferred result
const selected = selectFields(
  { orderId: "o1", reason: "duplicate" },
  ["orderId"] as const,
);
expectTypeOf(selected).toEqualTypeOf<{ orderId: string }>();

// compliant: omitting the type argument observes generic-default application
const defaultPage = loadPage();
expectTypeOf(defaultPage).toEqualTypeOf<Page<Order>>();

// compliant: representative public types must remain substitutable
expectTypeOf<ArchiveOrder>().toExtend<Order>();

// compliant: a representative public callback call protects contextual typing
visitOrder((order) => {
  expectTypeOf(order).toEqualTypeOf<Order>();
});

// compliant: a representative consumer call protects overload resolution
const loaded = loadOrder("o1");
expectTypeOf(loaded).toEqualTypeOf<Promise<Order>>();

// compliant: a representative predicate call protects consumer narrowing
const candidate: unknown = loadCandidate();
if (isOrder(candidate)) {
  expectTypeOf(candidate).toEqualTypeOf<Order>();
}

// compliant: a representative assertion call protects consumer narrowing
const asserted: unknown = loadCandidate();
assertOrder(asserted);
expectTypeOf(asserted).toEqualTypeOf<Order>();

// compliant: a representative discriminated-union branch protects narrowing
const result: Result<Order> = loadResult();
if (result.kind === "success") {
  expectTypeOf(result.value).toEqualTypeOf<Order>();
}

// compliant: representative inputs expose a mapped and conditional transformation
expectTypeOf<Serialized<{ at: Date }>>().toEqualTypeOf<{ at: string }>();

// compliant: representative inputs expose an indexed-access transformation
expectTypeOf<ValueOf<{ id: string; count: number }>>().toEqualTypeOf<
  string | number
>();

```

## Edge Cases

- A runtime schema parser may be tested by parsing valid and invalid values (see [TST-CORE-12](tst-core-12.md) for the example); asserting the schema's declared field inventory, including an endpoint schema's fields, is forbidden.
- `satisfies` and `as const` may encode source constraints beside declarations; type tests remain limited to the behaviors in Allowed Boundary.
- `ty:` is the canonical suite prefix for these compiler-observable type behaviors; its suffix is only the exercised symbol name, with scenarios in nested suites or test names. It does not imply that every type or interface needs a suite.
- Exact inferred, defaulted, contextually supplied, overload-resolved, narrowed, or transformed-output assertions are compliant when an Allowed Boundary behavior is the tested behavior; copying a standalone declaration or enumerating generic parameters or defaults, callback parameters, overloads, predicate signatures, or assertion signatures is not.
- A shared conformance suite may execute multiple real adapters and assert the same results or effects; a suite that only checks their signatures is forbidden.

## Related

TST-CORE-04, TST-CORE-05, TST-CORE-07, TST-COVR-04, GEN-DESN-04
