# Environment Variable Standards

_Canonical names for environment variables and the credentials they carry._

## Dependent Standards

Relationships below explain the selection owned by [WORKFLOW.md](../../directions/WORKFLOW.md).

- Naming Standards (standard:naming) - general identifier clarity; this standard owns environment variable names
- Observability Standards (standard:observability) - `LOG-RISK-01` owns keeping credential values out of logs and diagnostics
- File Structure Standards (standard:file-structure) - `FST-ENVR-01` owns the documented example file where `ENV-CRED-02` records each credential's lifecycle

## What's Stricter Here

This standard enforces requirements beyond common configuration practices:

| Standard Practice | Our Stricter Requirement |
|---|---|
| Copy the provider's variable name and wording | **Our grammar wins; provider vocabulary is translated at the integration boundary** |
| `KEY`, `TOKEN`, and `SECRET` used interchangeably | **Suffix follows credential semantics: `KEY` can be evergreen, `TOKEN` must expire, `SECRET` serves a security operation** |
| Environment, date, or rotation hints in names | **Names describe what a credential is, never where or when it is used** |

## Exception Policy

Allowed exceptions only when:

- False positive
- No viable workaround exists now

Required exception note fields:

- `rule_id`
- `reason` (`false_positive` or `no_workaround`)
- `evidence`
- `temporary_mitigation`
- `follow_up_action`

If exception note is missing, submission is rejected.

## Rule Groups

- `ENV-NAME-*`: Variable grammar, credential suffix taxonomy, and `KEY` versus `TOKEN` classification.
- `ENV-CRED-*`: Credential value storage and lifecycle documentation.
- `ENV-BOUN-*`: Translation between canonical names and provider-required names.
