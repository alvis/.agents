# NAM-CORE-03: Abbreviation Allowlist Only

## Intent

Only allowlisted abbreviations are permitted: `fn`, `params`, `args`, `id`, `url`, `urn`, `uri`, `meta`, `info`, `cwd`, `env`, `config`, `min`, `max`, `ref`. Names must still communicate their purpose in context. All other abbreviations MUST be expanded to full words for readability and consistency.

## Fix

```typescript
// allowed abbreviations
const userId = "user-123";
const requestUrl = buildEndpointUrl(baseUrl, params);
const callbackFn = () => processResult();
const cwd = process.cwd();
const env = process.env;
const config = loadAppConfiguration();
const { min, max } = allowedRange;
const userRef = createReference(userId);
```

### Expanded Names

```typescript
// expanded names instead of abbreviations
const configuration = loadAppConfiguration();   // not cfg
const repository = createUserRepository();       // not repo
const administrator = getAdminUser();            // not admin (not on allowlist)
```

## Edge Cases

- When existing code matches prior violation patterns such as ❌ `const usr = getUser()` or ❌ `gUsr()`, refactor before adding new behavior.
- Domain-standard acronyms like `HTTP`, `API`, `DB` follow casing rules from `NAM-CORE-02` but are not on the abbreviation allowlist -- use full words (`database`, not `db`).

## Related

NAM-CORE-01, NAM-CORE-02, NAM-CORE-04
