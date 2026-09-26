# Code Review Standards

_Requirements for accurate, constructive reviews that prioritize material risk and produce actionable feedback._

## Dependent Standards

Relationships below explain the selection owned by [WORKFLOW.md](../../directions/WORKFLOW.md).

- General Coding Principles (standard:universal) - Defines the implementation baseline and is the canonical authority for suppression policy, including `GEN-SAFE-01`.

## What's Stricter Here

This standard enforces requirements beyond common review practice:

| Standard Practice | Our Stricter Requirement |
|---|---|
| Reviewer discretion on blockers | **Only demonstrated approved-requirement or applicable-standard violations, or evidenced highly likely defects in supported production use, qualify; confirmed rule violations block unless their owning standard permits an exception** |
| Informal suppression review | **Every suppression is checked against canonical `GEN-SAFE-01` approval and root-cause requirements** |
| Unstructured feedback | **Every blocker cites its governing requirement or rule, applicability evidence, concrete impact, and disposition** |
| Evidence means runtime failure | **Minimum sufficient solutions and consistency with comparable work remain standards; structural evidence can establish their violation** |
| Uncertainty suppresses feedback | **Specific speculation may be explicitly non-blocking; it never becomes required work or an approval cap** |
| Equal attention to all comments | **Correctness and security take priority over performance, maintainability, testing, and style** |
| Fresh review restarts discussion | **Settled findings reopen only with new invalidating evidence; review stops when required checks pass and evidenced defects are resolved** |

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

If exception note is missing, submission is rejected. Exceptions to dependency rules follow the owning standard's policy.

## Rule Groups

- `CRV-CORR-*`: Correctness, security, and suppression enforcement.
- `CRV-PRIO-*`: Review depth and impact-based prioritization.
- `CRV-FDBK-*`: Constructive, actionable feedback and collaboration.
