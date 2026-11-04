# TST-MOCK-13: Remove Test-Double Prefixes from Value Names

## Intent

Name test values and helpers by their domain role. Remove leading test-double prefixes such as `mock`, `mocked`, `stub`, and `fake` entirely instead of replacing them with another test-double prefix. Occurrences elsewhere in a symbol name are allowed; factory function names such as `createMockClient` are permitted and encouraged. `Mock` is permitted and encouraged for type and interface names, such as `MockClient` and `MockRepository`.

## Fix

| Existing value name | Semantic name |
|---|---|
| `mockClient` | `client` |
| `mockedClient` | `client` |
| `stubClient` | `client` |
| `fakeClient` | `client` |

Renaming `mockClient` to `stubClient` or `fakeClient` still violates the rule. Keep the remaining domain name and its normal casing.

```typescript
const client = { send: vi.fn() } satisfies Partial<Client>;
```

## Edge Cases

- Apply the rule to test-double labels, not unrelated domain words that happen to share their spelling.
- Framework APIs such as `vi.mock`, `vi.stubGlobal`, and `client.send.mock.calls` retain their API-defined names.
- The `Mock` type/interface naming allowance does not permit synthetic mock-only contracts; keep doubles based on real types under [TST-MOCK-06](tst-mock-06.md).
- Remove existing test-double value prefixes before adding new behavior.

## Related

[TST-MOCK-01](tst-mock-01.md), [TST-MOCK-02](tst-mock-02.md), [TST-MOCK-03](tst-mock-03.md)
