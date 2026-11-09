# Environment Variable: Compliant Code Patterns

Protocol: `essential:directions/standards.md`.

## Key Principles

- Names describe what a credential is, not what its provider calls it.
- `KEY` can be evergreen. `TOKEN` must expire. `SECRET` serves a security operation.
- Translate to provider names only where the provider demands them.
- Credential values live in a secret store; their TTL, rotation, scopes, and owner live in documentation, never in the name.

## Core Rules Summary

### Naming (ENV-NAME)

- **ENV-NAME-01**: Name every variable in `UPPER_SNAKE_CASE`, such as `PORT` or `DATABASE_URL`. Name a credential `<PROVIDER>_<PURPOSE>_<TYPE>`: `PROVIDER` is the external service, protocol, or internal subsystem; `PURPOSE` optionally states the role; `TYPE` is a [taxonomy](#suffix-taxonomy) suffix. No name carries a deployment environment, date, or rotation schedule.
- **ENV-NAME-02**: Choose the credential suffix from the [suffix taxonomy](#suffix-taxonomy) by what the credential does. `SECRET_KEY` is not a generic suffix: use `API_KEY` for a confidential access key, and name the purpose, such as `REQUEST_SIGNING_KEY`, for an access credential presented by signing requests.
- **ENV-NAME-03**: Classify an access credential as [`KEY` or `TOKEN`](rules/env-name-03.md) by whether its type can be issued without an enforced expiry. A `TOKEN` we issue must have issuer-enforced finite expiration.

### Credential Handling (ENV-CRED)

- **ENV-CRED-01**: Keep credential values out of source, example files, and fixtures; load them from the deployment's secret store or untracked environment. `LOG-RISK-01` owns keeping them out of logs and diagnostics.
- **ENV-CRED-02**: Document each new credential variable's lifetime or TTL, rotation, scopes, and owner where the variable is documented under `FST-ENVR-01`, never in its name.

### Boundary (ENV-BOUN)

- **ENV-BOUN-01**: Read canonical names in our code. Map them to provider SDK fields, headers, and parameters at the call site; when a third-party executable requires its own variable names, its launcher translates. Migrate an existing noncanonical name; keep a temporary alias only while callers move, with a recorded removal plan.

## Patterns

### Suffix Taxonomy

| Suffix | Meaning |
|---|---|
| `_KEY` | Access credential, including one presented by signing requests, whose type can be configured to never expire |
| `_TOKEN` | Access credential whose type must enforce finite expiration |
| `_SECRET` | Shared material that grants no access by itself: verification, signing, derivation, or protocol-defined client authentication |
| `_PASSWORD` | Password or passphrase |
| `_PRIVATE_KEY` | Asymmetric private key |
| `_PUBLIC_KEY` | Asymmetric public key |
| `_CERT` | Certificate, usually X.509 |

An access credential grants access to a provider; it takes `KEY` or `TOKEN` even when it is used to sign requests, as the AWS secret access key is. The `KEY` versus `TOKEN` lifetime split never applies to raw key material.

### Canonical Names

| Provider wording | Canonical name |
|---|---|
| Stripe secret key | `STRIPE_API_KEY` |
| Stripe webhook secret | `STRIPE_WEBHOOK_SECRET` |
| GitHub personal access token (type supports no expiry) | `GITHUB_PERSONAL_ACCESS_KEY` |
| GitHub App installation token | `GITHUB_APP_INSTALLATION_TOKEN` |
| AWS secret access key | `AWS_REQUEST_SIGNING_KEY` |

### Integration Boundary

```typescript
const stripe = new Stripe(requireEnv("STRIPE_API_KEY"));

const s3 = new S3Client({
  credentials: {
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("AWS_REQUEST_SIGNING_KEY"),
  },
});
```

The SDK field `secretAccessKey` keeps its provider name; only our variable name is canonical. `AWS_ACCESS_KEY_ID` is an identifier, not a credential, so only `UPPER_SNAKE_CASE` applies to it.

## Anti-Patterns

- Renaming a provider's SDK field, header, or parameter to match our vocabulary.
- Choosing `TOKEN` because one issued credential happens to expire soon.
- One variable per environment, such as `STAGING_STRIPE_API_KEY` beside `PROD_STRIPE_API_KEY`.

## Quick Decision Tree

1. Is the name `UPPER_SNAKE_CASE` with no environment, date, or rotation, and does a credential follow `<PROVIDER>_<PURPOSE>_<TYPE>`? If not, rename (`ENV-NAME-01`).
2. Which taxonomy row matches what the credential does? Use that suffix, whatever the provider calls it (`ENV-NAME-02`).
3. Is it an access credential? Choose `KEY` or `TOKEN` by its type's expiry capability; verify an unknown lifecycle first (`ENV-NAME-03`).
4. Is its value committed anywhere, or its lifetime, rotation, scopes, or owner undocumented? Move the value to the secret store and document the rest (`ENV-CRED-01`, `ENV-CRED-02`).
5. Does a provider demand a different name? Translate at the SDK call or launcher only (`ENV-BOUN-01`).
