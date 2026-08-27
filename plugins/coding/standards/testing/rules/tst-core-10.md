# TST-CORE-10: No Static Declaration-Shape or Checked-In-Content Pinning

## Intent

Tests protect observable runtime behavior or exactly these compiler-observable
type behaviors: generic inference, generic-parameter default application when
a representative consumer omits that type argument, constraint enforcement,
representative contextual typing supplied by public callback parameters, representative
assignability or substitutability, representative consumer-call overload
resolution, representative control-flow narrowing through public type
predicates, assertion functions, or discriminated unions, and conditional,
mapped, indexed-access, `keyof`-driven, or template-literal type transformations
exercised through representative consumer inputs and outputs. They do not mirror
a declaration's exact inventory or a checkout's committed state: those
assertions create a second source of truth that fails on legitimate edits
without proving behavior.

The allowed compiler-observable tests are generic inference, generic-parameter
default application when a representative consumer omits that type argument,
constraint enforcement, representative contextual typing supplied by public
callback parameters, representative assignability or substitutability, representative
consumer-call overload resolution, representative control-flow narrowing
through public type predicates, assertion functions, or discriminated unions,
and conditional, mapped, indexed-access, `keyof`-driven, or template-literal
type transformations exercised through representative consumer inputs and
outputs. Exact declaration
shape means a mirrored list of
members, signatures, exports, schema fields, or re-export layout. A declaration's
existence alone never requires a test; diagnostics and affected-consumer builds
cover ordinary static compatibility.

This rule applies to every checked-in artifact, including source constants,
manifests, configuration, documentation, hook payloads, templates, inventories,
fixtures used as expected output, and generated projections committed to the
repository.

<IMPORTANT>
Never pin an exact declaration inventory in a test:

- an exact type or interface member inventory;
- an exact generic-parameter or default inventory;
- an exact function signature or overload inventory;
- an export or symbol inventory;
- a schema declaration's field inventory;
- barrel or re-export layout and symbol identity;

Never assert these properties of a checked-in artifact:

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

A runtime implementation may be exercised through a supported public
entrypoint. Assertions target returned values, state changes, emitted effects,
errors, protocol messages, or fresh generated-result structure. Endpoint
validation exercised through the endpoint is behavior; enumerating the
endpoint schema's declared fields is static declaration shape.

A compiler-observable test may use `expectTypeOf`, compile fixtures, or the
project's approved type-test mechanism only to protect:

- generic inference;
- generic-parameter default application when a representative consumer omits
  that type argument;
- constraint enforcement;
- representative contextual typing supplied by a public callback parameter;
- representative assignability or substitutability;
- representative consumer-call overload resolution;
- representative control-flow narrowing after a public type predicate or
  assertion function is called, or within a public discriminated-union consumer
  branch; or
- a conditional, mapped, indexed-access, `keyof`-driven, or template-literal
  type transformation exercised through representative consumer inputs and
  outputs.

No other type-test subject is permitted by this rule. An exact expected type is
valid only when it is the computed or supplied outcome of generic inference or
generic-parameter default application when a representative consumer omits
that type argument, representative contextual typing inside a public callback
call,
representative consumer-call overload resolution, control-flow narrowing after
a public type predicate or assertion function is called or within a public
discriminated-union consumer branch, or a conditional, mapped,
indexed-access, `keyof`-driven, or template-literal type transformation
exercised through representative consumer inputs and outputs, not a copy of a
standalone declaration. A representative call may assert its contextually
supplied, resolved, or narrowed type; an inventory of callback parameters,
overloads, predicate signatures, assertion signatures, or other signatures
remains static declaration shape.

A checked-in artifact may be supplied as input to an actual consumer or
generator. Assertions must be restricted to the behavior or freshly produced
result; they must not restate which checked-in file exists, where it lives, or
what literal content it contains.

Generated results created in memory or a temporary directory may be checked for
schema, required fields, unique identities, ordering, referential integrity,
count consistency, round-trip behavior, and deterministic generation. Missing,
malformed, or stale input scenarios must likewise be created in a temporary
workspace and exercised through the real consumer or generator.

Shared adapter or conformance suites are valid only when they execute each real
implementation through its public surface and assert common behavior. The suite
name "contract test" does not permit static-shape assertions.

Checked-in fixtures remain valid inputs to executed behavior. Expected-output
mirrors are not valid oracles: derive structural expectations from the runtime
result, schema, or consumer contract instead of comparing complete wording with
a checked-in file.

## Decision Test

Ask what the assertion observes:

- **Generic inference, generic-parameter default application when a
  representative consumer omits that type argument, constraint enforcement,
  representative contextual typing supplied by a public callback parameter,
  representative assignability or
  substitutability, representative consumer-call overload resolution,
  representative control-flow narrowing after a public type predicate or
  assertion function is called or within a public discriminated-union consumer
  branch, or a conditional, mapped, indexed-access,
  `keyof`-driven, or template-literal type transformation through
  representative consumer inputs and outputs** —
  keep the compiler-observable type test.
- **An exact declaration inventory or module layout** — remove the test; run
  type diagnostics and affected-consumer builds.
- **A declaration merely existing** — do not add a test.
- **Checked-in repository state** — remove it.
- **Behavior produced by an executed consumer** — keep it when the behavior is
  distinct and meaningful.
- **A result produced by an executed generator** — keep structural assertions;
  remove exact wording or parity with a committed projection.

Reading a repository file inside a test is only compliant when that value is
passed into the executed consumer or generator and every assertion targets the
resulting behavior or output structure.

## Fix

1. Delete assertions that mirror exact member, signature, export, schema-field,
   or barrel inventories, plus assertions over checked-in existence, layout,
   bytes, literals, or parity; remove orphaned helpers and expected files.
2. Preserve or rewrite type tests only for generic inference,
   generic-parameter default application when a representative consumer omits
   that type argument, constraint enforcement, representative contextual
   typing supplied by a public callback parameter, representative assignability
   or substitutability,
   representative consumer-call overload resolution, representative
   control-flow narrowing after a public type predicate or assertion function is
   called or within a public discriminated-union consumer branch, and
   conditional, mapped, indexed-access, `keyof`-driven, or template-literal type
   transformations exercised through representative consumer inputs and
   outputs. Do not add tests solely because a declaration
   exists.
3. Run type diagnostics and affected-consumer builds for changed static public
   declarations.
4. If a consumer exists, exercise it through a supported public entrypoint with
   explicit input and assert the observable result.
5. If a generator exists, write into memory or a temporary directory and assert
   result structure, deterministic generation, or stale/missing-output behavior
   against that freshly generated result.
6. If no runtime behavior, generic inference, generic-parameter default
   application when a representative consumer omits that type argument,
   constraint enforcement, representative contextual typing supplied by a
   public callback parameter,
   representative assignability or substitutability, representative
   consumer-call overload resolution, representative control-flow narrowing
   after a public type predicate or assertion function is called or within a
   public discriminated-union consumer branch, or conditional,
   mapped, indexed-access, `keyof`-driven, or template-literal type
   transformation exercised through representative consumer inputs and outputs
   exists, deletion is the complete fix. Do not invent another repository-content
   property to retain the gate.

```typescript
// violation: the checkout is the assertion subject
expect(existsSync(join(repositoryRoot, ".gitignore"))).toBe(true);
expect(readFileSync(skillPath, "utf8")).toContain("required prose");

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

// compliant: the runtime schema accepts and rejects values through its parser
expect(archiveOrderSchema.safeParse(validOrder).success).toBe(true);
expect(archiveOrderSchema.safeParse(invalidOrder).success).toBe(false);

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
- `satisfies` and `as const` may encode source constraints beside declarations;
  type tests remain limited to generic inference, generic-parameter default
  application when a representative consumer omits that type argument,
  constraint enforcement, representative contextual typing supplied by public
  callback parameters,
  representative assignability or substitutability, representative
  consumer-call overload resolution, representative control-flow narrowing
  after a public type predicate or assertion function is called or within a
  public discriminated-union consumer branch, and conditional, mapped,
  indexed-access, `keyof`-driven, or template-literal type transformations
  exercised through representative consumer inputs and outputs.
- `ty:` is the canonical suite prefix for these compiler-observable type
  behaviors; its suffix is only the exercised symbol name, with scenarios in
  nested suites or test names. It does not imply that every type or interface
  needs a suite.
- Exact inferred, defaulted, contextually supplied, overload-resolved, narrowed,
  or transformed-output assertions are compliant when inference,
  generic-parameter default application caused by a representative consumer
  omitting that type argument, representative
  public callback use, representative call resolution, control-flow narrowing
  after a representative predicate/assertion call or discriminated-union
  branch, or computation is the tested behavior; copying a standalone
  declaration or enumerating generic parameters or defaults, callback
  parameters, overloads, predicate signatures, or assertion signatures is not.
- A runtime schema parser may be tested by parsing valid and invalid values;
  assertions over the schema's declared field inventory are forbidden.
- A shared conformance suite may execute multiple real adapters and assert the
  same results or effects; a suite that only checks their signatures is
  forbidden.
- Coverage contribution cannot redeem a repository-content assertion. Replace
  it with consumer or generator coverage, or accept the uncovered static data.
- Barrel re-export identity assertions test checked-in module layout and must be
  removed.

## Related

TST-CORE-04, TST-CORE-05, TST-CORE-07, TST-COVR-04, GEN-DESN-04
