# Environment Variable: Violation Scan

Protocol: `essential:directions/standards.md`.

Any single violation blocks submission by default. Scan every environment variable name that the change adds, renames, or reads; a noncanonical name the change only touches in passing is reported for migration under `ENV-BOUN-01`.

Before classifying an access credential whose lifecycle you do not know, verify from the provider's documentation whether its type can be issued without an enforced expiry; never guess `KEY` or `TOKEN` (`ENV-NAME-03`).

## Quick Scan

- DO NOT name a variable outside `UPPER_SNAKE_CASE`, name a credential outside `<PROVIDER>_<PURPOSE>_<TYPE>`, or encode a deployment environment, date, or rotation schedule in any name [`ENV-NAME-01`]
- DO NOT pick a credential suffix from the provider's wording instead of the [suffix taxonomy](write.md#suffix-taxonomy), or use `SECRET_KEY` as a generic suffix [`ENV-NAME-02`]
- DO NOT classify an access credential as `KEY` or `TOKEN` by its issued expiry or provider label instead of its type's expiry capability, or issue a `TOKEN` without enforced expiry [`ENV-NAME-03`]
- DO NOT commit a credential value to source, an example file, or a fixture [`ENV-CRED-01`]
- DO NOT add a credential variable without documenting its lifetime or TTL, rotation, scopes, and owner [`ENV-CRED-02`]
- DO NOT read a noncanonical provider-required variable name inside our code instead of translating the canonical name at the SDK call or launcher, or keep a migration alias without a removal plan [`ENV-BOUN-01`]

## Rule Matrix

| Rule ID | Violation | Bad Examples |
|---|---|---|
| `ENV-NAME-01` | Casing, credential grammar, or encoded environment/date/rotation | `stripeApiKey`; `PROD_STRIPE_API_KEY`; `GITHUB_TOKEN_2026` |
| `ENV-NAME-02` | Suffix copied from provider wording | `STRIPE_SECRET_KEY`; `AWS_SECRET_ACCESS_KEY` |
| `ENV-NAME-03` | `KEY`/`TOKEN` chosen by issued expiry or provider label | `OPENAI_API_TOKEN` for a key that can be evergreen; `GITHUB_APP_INSTALLATION_KEY` |
| `ENV-CRED-01` | Credential value committed | `STRIPE_API_KEY=sk_live_...` in `.env.example` |
| `ENV-CRED-02` | Credential lifecycle undocumented | new `GITHUB_APP_INSTALLATION_TOKEN` with no TTL, scopes, or owner noted |
| `ENV-BOUN-01` | Provider name propagated past the integration boundary | `requireEnv("AWS_SECRET_ACCESS_KEY")` in app code |
